'use strict';

const axios = require('axios');

// Jupiter Price API v3
const PRICE_API = 'https://api.jup.ag/price/v3';

// ─── Known token mints on Solana ─────────────────────────────────────────────
const TOKEN_MINTS = {
  SOL:  'So11111111111111111111111111111111111111112',
  BTC:  '9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E',
  ETH:  '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  JUP:  'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
  BONK: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  WIF:  'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
  PYTH: 'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3',
  RAY:  '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
};

const SYMBOL_PATTERNS = [
  { symbols: ['SOL', 'SOLANA', '$SOL'],      key: 'SOL' },
  { symbols: ['BTC', 'BITCOIN', '$BTC'],     key: 'BTC' },
  { symbols: ['ETH', 'ETHEREUM', '$ETH'],    key: 'ETH' },
  { symbols: ['JUP', '$JUP', 'JUPITER'],     key: 'JUP' },
  { symbols: ['BONK', '$BONK'],              key: 'BONK' },
  { symbols: ['WIF', '$WIF', 'DOGWIFHAT'],   key: 'WIF' },
  { symbols: ['PYTH', '$PYTH'],              key: 'PYTH' },
  { symbols: ['RAY', '$RAY', 'RAYDIUM'],     key: 'RAY' },
];

function extractTokenFromQuestion(question) {
  const upper = question.toUpperCase();
  for (const { symbols, key } of SYMBOL_PATTERNS) {
    if (symbols.some(s => upper.includes(s))) return key;
  }
  return null;
}

/**
 * Fetch prices for one or more mints from Jupiter Price API v3.
 * Returns map of { mint → { price, priceChange24h } }
 */
async function fetchPricesByMint(mints) {
  if (!mints || mints.length === 0) return {};
  try {
    const res = await axios.get(PRICE_API, {
      params: { ids: mints.join(',') },
      timeout: 8_000,
    });
    const data = res.data?.data || {};
    const result = {};
    for (const [mint, info] of Object.entries(data)) {
      result[mint] = {
        price:          parseFloat(info.usdPrice)        || null,
        priceChange24h: parseFloat(info.priceChange24h)  || null,
      };
    }
    return result;
  } catch (err) {
    console.warn(`[price] Failed to fetch prices: ${err.message}`);
    return {};
  }
}

/**
 * Get current price and 24h change for a token symbol.
 * Returns { price, priceChange24h } or null.
 */
async function getTokenPrice(symbol) {
  const mint = TOKEN_MINTS[symbol?.toUpperCase()];
  if (!mint) return null;
  const prices = await fetchPricesByMint([mint]);
  return prices[mint] ?? null;
}

/**
 * Get token price relevant to a market question.
 * Returns { symbol, price, priceChange24h } or null.
 */
async function getMarketTokenPrice(question) {
  const symbol = extractTokenFromQuestion(question);
  if (!symbol) return null;
  const data = await getTokenPrice(symbol);
  if (!data || data.price === null) return null;
  return { symbol, ...data };
}

/**
 * Parse target price and direction from a market question.
 * e.g. "Will SOL reach $200 by April?" → { targetPrice: 200, direction: 'above' }
 */
function parseTargetFromQuestion(question) {
  const lower = question.toLowerCase();
  const direction = (lower.includes('below') || lower.includes('under') || lower.includes('drop') || lower.includes('fall'))
    ? 'below'
    : 'above';
  const match = question.match(/\$([0-9,]+(?:\.[0-9]+)?)/);
  const targetPrice = match ? parseFloat(match[1].replace(/,/g, '')) : null;
  return { targetPrice, direction };
}

module.exports = {
  getTokenPrice,
  getMarketTokenPrice,
  extractTokenFromQuestion,
  parseTargetFromQuestion,
  TOKEN_MINTS,
};
