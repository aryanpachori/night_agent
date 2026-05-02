'use strict';

const { getMarketTokenPrice, parseTargetFromQuestion } = require('../price/tokenPrice');
const { getPriceHistory } = require('../price/priceHistory');
const { analyzeMarket, fuseProbability } = require('../price/technicalAnalysis');
const geminiRotation = require('./geminiModelRotation');

// ─── Gemini free-tier friendly pacing ─────────────────────────────────────────
// Free tier is tight (e.g. ~5 RPM, ~20 RPD on 2.5 Flash). Space calls + retry 429s.
let _geminiThrottleChain = Promise.resolve();
let _lastGeminiCallAt    = 0;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function geminiMinIntervalMs() {
  const v = parseInt(process.env.GEMINI_MIN_INTERVAL_MS, 10);
  return Number.isFinite(v) && v >= 0 ? v : 13_000;
}

function geminiMaxRetries() {
  const v = parseInt(process.env.GEMINI_MAX_RETRIES, 10);
  return Number.isFinite(v) && v >= 1 ? Math.min(v, 8) : 3;
}

async function throttleGeminiCall() {
  const minGap = geminiMinIntervalMs();
  _geminiThrottleChain = _geminiThrottleChain.then(async () => {
    const elapsed = Date.now() - _lastGeminiCallAt;
    const wait    = Math.max(0, minGap - elapsed);
    if (wait > 0) await sleep(wait);
    _lastGeminiCallAt = Date.now();
  });
  return _geminiThrottleChain;
}

function isGeminiRateLimitError(err) {
  const msg = String(err?.message || err || '');
  const code = err?.status ?? err?.statusCode ?? err?.code;
  return code === 429 || /429|RESOURCE_EXHAUSTED|quota|rate.?limit|too many requests/i.test(msg);
}

/** Google often embeds `Please retry in 56.7s` in the error body — wait at least that long before retry. */
function parseGeminiRetryAfterMs(err) {
  const msg = String(err?.message || '');
  const m   = /Please retry in ([\d.]+)\s*s/i.exec(msg);
  if (!m) return 0;
  const ms = Math.ceil(parseFloat(m[1], 10) * 1000);
  return Number.isFinite(ms) && ms > 0 && ms < 300_000 ? ms : 0;
}

let _warnedGeminiModel = false;
function warnIfLegacyGeminiModel() {
  const id = geminiRotation.getPinnedModelId() || '';
  if (_warnedGeminiModel || !id) return;
  if (/gemini-1\.5/i.test(id)) {
    _warnedGeminiModel = true;
    console.warn(
      `[llm] GEMINI_MODEL=${id} — some legacy SKUs show weak free quota. Prefer rotation (unset GEMINI_MODEL) or a current Flash family id.`,
    );
  }
}

let genAI = null;
function getGemini() {
  if (!genAI) {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return genAI;
}

let openaiClient = null;
function getOpenAI() {
  if (!openaiClient) {
    const OpenAI = require('openai');
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiClient;
}

// ─── Prompt ───────────────────────────────────────────────────────────────────

function formatResolveHorizon(market) {
  const s = market.secondsToResolve;
  if (s != null && Number.isFinite(s) && s >= 0) {
    if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min`;
    if (s < 86_400) return `${(s / 3600).toFixed(1)} hours`;
    return `${(s / 86_400).toFixed(1)} days`;
  }
  const d = market.daysLeft;
  return d != null && Number.isFinite(d) ? `${d} day(s)` : 'unknown';
}

const SYSTEM_PROMPT = `You are a crypto prediction market analyst specialising in YES/NO binary markets on Jupiter.

Your job: estimate the TRUE probability that a market resolves YES.

You receive:
- The market question (e.g. "Will SOL reach $200 by April 30?")
- The crowd's current implied probability (market price)
- Real-time token price + 24h change from Jupiter Price API
- Required % move and direction to resolution
- Pro math signals: EWMA volatility, Black-Scholes binary probability, momentum ROC, mean reversion, logit-fused math probability

Your edge:
- The math probability anchors your estimate using volatility, momentum, and mean reversion
- Assess if the required move is realistic given current price, volatility, and time remaining
- Detect if the crowd is systematically wrong about the difficulty of the required move
- If math and crowd disagree by >8%, that gap is the exploitable edge

Output ONLY valid JSON. No markdown fences.
Probability must be between 0.03 and 0.97.`;

function buildPrompt(market, tokenData, taData) {
  // Token price section
  let tokenSection = '';
  if (tokenData) {
    const { symbol, price, priceChange24h, targetPrice, direction } = tokenData;
    const requiredMove = targetPrice
      ? (((targetPrice - price) / price) * 100).toFixed(1)
      : null;
    tokenSection = `
REAL-TIME TOKEN DATA (${symbol}):
  Current price:   $${price.toFixed(4)}
  24h change:      ${priceChange24h !== null ? (priceChange24h > 0 ? '+' : '') + priceChange24h.toFixed(2) + '%' : 'N/A'}
  ${targetPrice ? `Target:          $${targetPrice} (must go ${direction.toUpperCase()})` : ''}
  ${requiredMove ? `Required move:   ${requiredMove > 0 ? '+' : ''}${requiredMove}% in ${formatResolveHorizon(market)}` : ''}`;
  }

  // TA section
  const taSection = taData?.summary ? `\n${taData.summary}` : '';

  return `Market: "${market.question}"
Crowd probability: ${(market.yesPrice * 100).toFixed(1)}% YES
Closes: ${market.closeTime?.toDateString?.() ?? 'unknown'} (${formatResolveHorizon(market)} to resolution)
${tokenSection}
${taSection}

What is the TRUE probability this resolves YES?

JSON output only:
{
  "probability": 0.XX,
  "confidence": "high" | "medium" | "low",
  "reasoning": "one sentence — mention required move and TA signal",
  "keyFactors": ["factor1", "factor2"]
}`;
}

function parseResponse(raw) {
  let text = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const data = JSON.parse(text);
  let prob = parseFloat(data.probability);
  if (isNaN(prob)) throw new Error('probability is not a number');
  prob = Math.max(0.03, Math.min(0.97, prob));
  const confidence = ['high', 'medium', 'low'].includes(data.confidence) ? data.confidence : 'medium';
  const reasoning  = String(data.reasoning || '').slice(0, 300);
  const keyFactors = Array.isArray(data.keyFactors) ? data.keyFactors.slice(0, 4).map(String) : [];
  return { probability: prob, confidence, reasoning, keyFactors };
}

async function estimateWithGemini(market, tokenData, taData) {
  warnIfLegacyGeminiModel();
  await throttleGeminiCall();

  const ai = getGemini();
  const prompt = `${SYSTEM_PROMPT}\n\n${buildPrompt(market, tokenData, taData)}`;

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`[llm:gemini] PROMPT for "${market.question.slice(0, 60)}"`);
  console.log(`${'─'.repeat(60)}`);
  console.log(prompt);
  console.log(`${'─'.repeat(60)}`);

  const maxAttempts = geminiMaxRetries();
  const tried = new Set();
  let modelId = geminiRotation.pickModel(market);
  if (!modelId) {
    throw new Error(
      '[llm:gemini] All rotation models at daily RPD cap. Unset other work or set GEMINI_MODEL, or try after local midnight reset.',
    );
  }
  const high = geminiRotation.isHighValueMarket(market);
  console.log(
    `[llm:gemini] model=${modelId} rotation=${geminiRotation.isRotationDisabled() ? 'off (GEMINI_MODEL)' : 'on'} highValue=${high}`,
  );

  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const model  = ai.getGenerativeModel({ model: modelId });
      const result = await model.generateContent(prompt);
      const rawText = result.response.text();

      console.log(`[llm:gemini] RAW RESPONSE:`);
      console.log(rawText);

      const parsed = parseResponse(rawText);
      console.log(`[llm:gemini] PARSED: prob=${(parsed.probability * 100).toFixed(1)}% confidence=${parsed.confidence}`);
      console.log(`[llm:gemini] REASONING: ${parsed.reasoning}`);
      console.log(`[llm:gemini] KEY FACTORS: ${parsed.keyFactors.join(' | ')}`);
      console.log(`${'─'.repeat(60)}\n`);

      geminiRotation.trackUsage(modelId);
      return parsed;
    } catch (err) {
      lastErr = err;
      if (isGeminiRateLimitError(err) && attempt < maxAttempts) {
        tried.add(modelId);
        const next = geminiRotation.pickModel(market, { exclude: tried });
        if (next) {
          console.warn(
            `[llm:gemini] Rate limited on ${modelId} → switching to ${next} (${attempt}/${maxAttempts})` +
              ` — ${err.message.slice(0, 160)}`,
          );
          modelId = next;
          const suggested = parseGeminiRetryAfterMs(err);
          const backoff   = Math.max(suggested, 4_000);
          await sleep(backoff);
          await throttleGeminiCall();
          continue;
        }
        const suggested = parseGeminiRetryAfterMs(err);
        const backoff   = Math.max(suggested, Math.min(120_000, 8_000 * 2 ** (attempt - 1)));
        console.warn(
          `[llm:gemini] Rate limited (attempt ${attempt}/${maxAttempts}) — waiting ${(backoff / 1000).toFixed(1)}s` +
            (suggested ? ' (from API RetryInfo)' : '') +
            `. ${err.message.slice(0, 200)}`,
        );
        await sleep(backoff);
        await throttleGeminiCall();
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

/** When Gemini is unavailable and there is no OpenAI key: neutral LLM prob so post-step fusion ≈ math. */
function mathOnlyLlmFallback(market, err) {
  const hint = err?.message ? String(err.message).slice(0, 120) : 'unknown error';
  console.warn(`[llm] Gemini unavailable — math-only path (crowd baseline). Cause: ${hint}`);
  return {
    probability: market.yesPrice,
    confidence:  'low',
    reasoning:   'LLM unavailable (quota/rate limit or API error). Using technical model vs crowd.',
    keyFactors:  ['math-fallback'],
  };
}

async function estimateWithOpenAI(market, tokenData, taData) {
  const client = getOpenAI();
  const userPrompt = buildPrompt(market, tokenData, taData);

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`[llm:openai] PROMPT for "${market.question.slice(0, 60)}"`);
  console.log(`${'─'.repeat(60)}`);
  console.log(userPrompt);
  console.log(`${'─'.repeat(60)}`);

  const completion = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: userPrompt },
    ],
    temperature: 0.3,
    max_tokens:  400,
  });
  const rawText = completion.choices[0].message.content;

  console.log(`[llm:openai] RAW RESPONSE:`);
  console.log(rawText);

  const parsed = parseResponse(rawText);
  console.log(`[llm:openai] PARSED: prob=${(parsed.probability*100).toFixed(1)}% confidence=${parsed.confidence}`);
  console.log(`[llm:openai] REASONING: ${parsed.reasoning}`);
  console.log(`${'─'.repeat(60)}\n`);

  return parsed;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

// Prevents re-calling Gemini for the same market within the cache window.
const llmCache = require('./llmCache');

function llmCacheTtlMs() {
  const mins = parseInt(process.env.LLM_CACHE_TTL_MINUTES, 10);
  if (Number.isFinite(mins) && mins > 0) return mins * 60 * 1000;
  return 90 * 60 * 1000; // 90 min default — fewer repeat calls on free Gemini RPD
}

async function estimateProbability(market) {
  const hasGemini = !!process.env.GEMINI_API_KEY;
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  if (!hasGemini && !hasOpenAI) throw new Error('No LLM key set');

  // Cache check — skip Gemini entirely if we already have a fresh result
  const cached = llmCache.get(market.id);
  if (cached && Date.now() < cached.expiresAt) {
    console.log(`[llm] Cache hit "${market.question.slice(0, 40)}" — skipping LLM (expires in ${Math.round((cached.expiresAt - Date.now()) / 60000)} min)`);
    return cached.result;
  }

  // 1. Real-time token price
  let tokenData = null;
  try {
    const info = await getMarketTokenPrice(market.question);
    if (info) {
      const { targetPrice, direction } = parseTargetFromQuestion(market.question);
      tokenData = { ...info, targetPrice, direction };
      console.log(`[llm] Token: ${info.symbol} $${info.price.toFixed(4)} (${info.priceChange24h > 0 ? '+' : ''}${info.priceChange24h?.toFixed(2)}% 24h)${targetPrice ? ` → target $${targetPrice} ${direction}` : ''}`);
    }
  } catch (err) {
    console.warn(`[llm] Token price fetch failed: ${err.message}`);
  }

  // 2. Pro math stack: EWMA vol + Black-Scholes + momentum + mean reversion
  let taData = null;
  try {
    const history = getPriceHistory(market.id);
    if (history.length >= 3) {
      const taSec =
        market.secondsToResolve != null && Number.isFinite(market.secondsToResolve) && market.secondsToResolve > 0
          ? market.secondsToResolve
          : Math.max(1, (market.daysLeft ?? 1) * 86_400);
      taData = analyzeMarket(history, taSec);
      if (taData) console.log(`[llm] Math prob: ${(taData.mathProbability * 100).toFixed(1)}% | crowd: ${(market.yesPrice * 100).toFixed(1)}% | gap: ${((taData.mathProbability - market.yesPrice) * 100).toFixed(1)}%`);
    }
  } catch (err) {
    console.warn(`[llm] TA calculation failed: ${err.message}`);
  }

  // 3. Call LLM
  let llmResult;
  if (hasGemini) {
    try {
      llmResult = await estimateWithGemini(market, tokenData, taData);
    } catch (err) {
      console.warn(`[llm] Gemini failed: ${err.message}`);
      if (hasOpenAI) {
        /* fall through to OpenAI */
      } else if (process.env.LLM_MATH_ONLY_FALLBACK === '0') {
        throw err;
      } else {
        llmResult = mathOnlyLlmFallback(market, err);
      }
    }
  }
  if (!llmResult && hasOpenAI) {
    try {
      llmResult = await estimateWithOpenAI(market, tokenData, taData);
    } catch (openErr) {
      console.warn(`[llm] OpenAI failed: ${openErr.message}`);
      if (process.env.LLM_MATH_ONLY_FALLBACK === '0') throw openErr;
      llmResult = mathOnlyLlmFallback(market, openErr);
    }
  }
  if (!llmResult) {
    throw new Error('No LLM produced a result (set OPENAI_API_KEY or enable math fallback)');
  }

  // 4. Fuse math probability with LLM in logit space
  if (taData?.mathProbability != null) {
    const llmSignal = llmResult.probability - market.yesPrice; // how much LLM deviates from crowd
    const fused = fuseProbability(taData.mathProbability, llmSignal, 0);
    console.log(`[llm] Fusion: math=${(taData.mathProbability*100).toFixed(1)}% llmSignal=${(llmSignal*100).toFixed(1)}% → final=${(fused*100).toFixed(1)}%`);
    llmResult.probability = fused;
  }

  console.log(`[llm] Final: "${market.question.slice(0, 50)}" → ${(llmResult.probability * 100).toFixed(1)}% (${llmResult.confidence})`);

  // Store in cache so the next scan cycle skips Gemini for this market
  llmCache.setEntry(market.id, llmResult, Date.now() + llmCacheTtlMs());

  return llmResult;
}

module.exports = { estimateProbability };
