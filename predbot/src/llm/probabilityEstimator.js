'use strict';

// ─── Gemini ───────────────────────────────────────────────────────────────────
let genAI = null;
function getGemini() {
  if (!genAI) {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return genAI;
}

// ─── OpenAI ───────────────────────────────────────────────────────────────────
let openaiClient = null;
function getOpenAI() {
  if (!openaiClient) {
    const OpenAI = require('openai');
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiClient;
}

// ─── Prompt builders ─────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a prediction market analyst with expertise in geopolitics, economics, and finance. \
Your job is to estimate the TRUE probability of an event happening based on recent news.

You must output ONLY valid JSON. No markdown, no explanation outside JSON.
Be calibrated — if you're uncertain, reflect that in confidence level.
Never output probability above 0.97 or below 0.03.`;

function buildUserPrompt(market, articles) {
  const articleLines = articles
    .slice(0, 10)
    .map(a => `- ${a.title}: ${a.description || '(no description)'}`)
    .join('\n');

  return `Market question: ${market.question}

Current market price (crowd's estimate): ${market.yesPrice.toFixed(2)} (${(market.yesPrice * 100).toFixed(0)}% chance YES)
Market closes: ${market.closeTime?.toDateString?.() ?? 'unknown'} (${market.daysLeft} days)
Category: ${market.category}

Recent news articles:
${articleLines || '(no articles found)'}

Based on this information, what is the true probability of this market resolving YES?

Output format (JSON only, no markdown fences):
{
  "probability": 0.XX,
  "confidence": "high" | "medium" | "low",
  "reasoning": "one sentence max",
  "keyFactors": ["factor1", "factor2"]
}`;
}

// ─── Response parser ──────────────────────────────────────────────────────────
function parseResponse(raw) {
  // Strip markdown fences if present
  let text = raw.trim();
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');

  const data = JSON.parse(text);

  // Validate
  let prob = parseFloat(data.probability);
  if (isNaN(prob)) throw new Error('probability is not a number');
  prob = Math.max(0.03, Math.min(0.97, prob));

  const confidence = ['high', 'medium', 'low'].includes(data.confidence) ? data.confidence : 'medium';
  const reasoning = String(data.reasoning || '').slice(0, 300);
  const keyFactors = Array.isArray(data.keyFactors)
    ? data.keyFactors.slice(0, 4).map(String)
    : [];

  return { probability: prob, confidence, reasoning, keyFactors };
}

// ─── Gemini estimator ─────────────────────────────────────────────────────────
async function estimateWithGemini(market, articles) {
  const ai = getGemini();
  const model = ai.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const prompt = `${SYSTEM_PROMPT}\n\n${buildUserPrompt(market, articles)}`;
  const result = await model.generateContent(prompt);
  const raw = result.response.text();
  return parseResponse(raw);
}

// ─── OpenAI estimator ─────────────────────────────────────────────────────────
async function estimateWithOpenAI(market, articles) {
  const client = getOpenAI();
  const completion = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(market, articles) },
    ],
    temperature: 0.3,
    max_tokens: 400,
  });
  const raw = completion.choices[0].message.content;
  return parseResponse(raw);
}

// ─── Main estimator (with fallback) ──────────────────────────────────────────
/**
 * Estimate probability for a market given news articles.
 * Tries Gemini first, falls back to OpenAI if available.
 *
 * @param {object} market   - normalised market object (question, yesPrice, daysLeft, etc.)
 * @param {Array}  articles - from newsFetcher
 * @returns {{ probability, confidence, reasoning, keyFactors }}
 */
async function estimateProbability(market, articles) {
  const hasGemini = !!process.env.GEMINI_API_KEY;
  const hasOpenAI = !!process.env.OPENAI_API_KEY;

  if (!hasGemini && !hasOpenAI) {
    throw new Error('No LLM API key configured. Set GEMINI_API_KEY or OPENAI_API_KEY in .env');
  }

  // Try Gemini first
  if (hasGemini) {
    try {
      const result = await estimateWithGemini(market, articles);
      console.log(`[llm] Gemini estimate for "${market.question.slice(0, 50)}...": ${(result.probability * 100).toFixed(1)}% (${result.confidence})`);
      return result;
    } catch (err) {
      console.warn(`[llm] Gemini failed: ${err.message}`);
      if (!hasOpenAI) throw err;
    }
  }

  // Fallback to OpenAI
  const result = await estimateWithOpenAI(market, articles);
  console.log(`[llm] OpenAI estimate for "${market.question.slice(0, 50)}...": ${(result.probability * 100).toFixed(1)}% (${result.confidence})`);
  return result;
}

module.exports = { estimateProbability };
