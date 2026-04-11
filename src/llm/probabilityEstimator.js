'use strict';

const { getMarketTokenPrice, parseTargetFromQuestion } = require('../price/tokenPrice');
const { getPriceHistory } = require('../price/priceHistory');
const { analyzeMarket, fuseProbability } = require('../price/technicalAnalysis');

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
  ${requiredMove ? `Required move:   ${requiredMove > 0 ? '+' : ''}${requiredMove}% in ${market.daysLeft} day(s)` : ''}`;
  }

  // TA section
  const taSection = taData?.summary ? `\n${taData.summary}` : '';

  return `Market: "${market.question}"
Crowd probability: ${(market.yesPrice * 100).toFixed(1)}% YES
Closes: ${market.closeTime?.toDateString?.() ?? 'unknown'} (${market.daysLeft} days)
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
  const ai    = getGemini();
  const model = ai.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-2.0-flash-lite' });
  const prompt = `${SYSTEM_PROMPT}\n\n${buildPrompt(market, tokenData, taData)}`;

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`[llm:gemini] PROMPT for "${market.question.slice(0, 60)}"`);
  console.log(`${'─'.repeat(60)}`);
  console.log(prompt);
  console.log(`${'─'.repeat(60)}`);

  const result  = await model.generateContent(prompt);
  const rawText = result.response.text();

  console.log(`[llm:gemini] RAW RESPONSE:`);
  console.log(rawText);

  const parsed = parseResponse(rawText);
  console.log(`[llm:gemini] PARSED: prob=${(parsed.probability*100).toFixed(1)}% confidence=${parsed.confidence}`);
  console.log(`[llm:gemini] REASONING: ${parsed.reasoning}`);
  console.log(`[llm:gemini] KEY FACTORS: ${parsed.keyFactors.join(' | ')}`);
  console.log(`${'─'.repeat(60)}\n`);

  return parsed;
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

// ─── LLM result cache ─────────────────────────────────────────────────────────
// Prevents re-calling Gemini for the same market within the cache window.
// 5-min scans would otherwise call Gemini every cycle for every qualifying market.
const _llmCache = new Map(); // marketId → { result, expiresAt }
const LLM_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

async function estimateProbability(market) {
  const hasGemini = !!process.env.GEMINI_API_KEY;
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  if (!hasGemini && !hasOpenAI) throw new Error('No LLM key set');

  // Cache check — skip Gemini entirely if we already have a fresh result
  const cached = _llmCache.get(market.id);
  if (cached && Date.now() < cached.expiresAt) {
    console.log(`[llm] Cache hit "${market.question.slice(0, 40)}" — skipping Gemini (expires in ${Math.round((cached.expiresAt - Date.now()) / 60000)}min)`);
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
      taData = analyzeMarket(history, (market.daysLeft ?? 1) * 86_400);
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
      if (!hasOpenAI) throw err;
    }
  }
  if (!llmResult) {
    llmResult = await estimateWithOpenAI(market, tokenData, taData);
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
  _llmCache.set(market.id, { result: llmResult, expiresAt: Date.now() + LLM_CACHE_TTL_MS });

  return llmResult;
}

module.exports = { estimateProbability };
