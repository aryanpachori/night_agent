'use strict';

const axios = require('axios');

// ─── Jupiter Prediction API ───────────────────────────────────────────────────
// Base URL: https://api.jup.ag/prediction/v1
// Auth: x-api-key header
// Price unit: 1,000,000 native units = $1.00

const BASE_URL = 'https://api.jup.ag/prediction/v1';
const NATIVE_UNIT = 1_000_000; // 1 USD in native units

function jupClient() {
  const key = process.env.JUPITER_API_KEY;
  if (!key) throw new Error('JUPITER_API_KEY not set in environment');
  return axios.create({
    baseURL: BASE_URL,
    headers: { 'x-api-key': key, 'Content-Type': 'application/json' },
    timeout: 12_000,
  });
}

/** Convert native unit price to decimal (0-1) */
function toDecimal(nativePrice) {
  return nativePrice / NATIVE_UNIT;
}

/** Convert decimal to native units */
function toNative(decimal) {
  return Math.round(decimal * NATIVE_UNIT);
}

// ─── Market scanner ───────────────────────────────────────────────────────────

/**
 * Fetch and filter active Jupiter prediction markets.
 * Returns array of normalised market objects ready for LLM + math pipeline.
 */
async function scanMarkets() {
  const MIN_PRICE = parseFloat(process.env.MIN_PRICE) || 0.15;
  const MAX_PRICE = parseFloat(process.env.MAX_PRICE) || 0.85;
  const MIN_DAYS = parseInt(process.env.MIN_DAYS_LEFT) || 7;
  const MAX_DAYS = parseInt(process.env.MAX_DAYS_LEFT) || 90;
  const MIN_VOLUME_USD = parseFloat(process.env.MIN_VOLUME) || 1_000_000; // in USD

  const now = Date.now();
  const minEndMs = now + MIN_DAYS * 86_400_000;
  const maxEndMs = now + MAX_DAYS * 86_400_000;

  const client = jupClient();

  // Fetch live events — try status filters in parallel
  const statuses = ['live', 'trending'];
  const fetches = statuses.map(status =>
    client.get('/events', { params: { status, includeMarkets: true, limit: 100 } })
      .then(r => r.data?.events || r.data || [])
      .catch(err => {
        console.warn(`[scanner] Failed to fetch events (status=${status}): ${err.message}`);
        return [];
      })
  );
  const results = await Promise.all(fetches);

  // Flatten + deduplicate events
  const eventMap = new Map();
  results.flat().forEach(ev => {
    if (!eventMap.has(ev.id)) eventMap.set(ev.id, ev);
  });
  const events = [...eventMap.values()];
  console.log(`[scanner] Fetched ${events.length} unique events from Jupiter`);

  const filtered = [];

  for (const event of events) {
    const markets = event.markets || [];
    for (const market of markets) {
      try {
        if (market.status !== 'open') continue;

        // Parse YES buy price (we use buyYesPriceUsd as the "current YES price")
        const yesPrice = toDecimal(market.buyYesPriceUsd ?? market.yesPriceUsd ?? 0);
        if (yesPrice < MIN_PRICE || yesPrice > MAX_PRICE) continue;

        // Volume filter (volume is in native units → convert to USD)
        const volumeUsd = (market.volume ?? 0) / NATIVE_UNIT;
        if (volumeUsd < MIN_VOLUME_USD) continue;

        // Date filter
        const closeTime = new Date(market.closeTime ?? market.resolveAt);
        if (isNaN(closeTime.getTime())) continue;
        const closeMs = closeTime.getTime();
        if (closeMs < minEndMs || closeMs > maxEndMs) continue;

        const daysLeft = Math.round((closeMs - now) / 86_400_000);

        filtered.push({
          id: market.id ?? market.marketId,
          eventId: event.id,
          question: market.title ?? event.title,
          description: market.rules ?? event.description ?? '',
          category: event.category ?? 'unknown',
          subcategory: event.subcategory ?? '',
          yesPrice,                                          // decimal 0-1
          noPrice: toDecimal(market.buyNoPriceUsd ?? (NATIVE_UNIT - (market.buyYesPriceUsd ?? 0))),
          sellYesPrice: toDecimal(market.sellYesPriceUsd ?? 0),
          sellNoPrice: toDecimal(market.sellNoPriceUsd ?? 0),
          volumeUsd,
          daysLeft,
          closeTime,
          status: market.status,
          result: market.result ?? null,
          // Keep raw native prices for potential future order placement
          _raw: {
            buyYesPriceUsd: market.buyYesPriceUsd,
            buyNoPriceUsd: market.buyNoPriceUsd,
            sellYesPriceUsd: market.sellYesPriceUsd,
            sellNoPriceUsd: market.sellNoPriceUsd,
          },
        });
      } catch (e) {
        // skip malformed markets
      }
    }
  }

  // Sort by volume descending
  filtered.sort((a, b) => b.volumeUsd - a.volumeUsd);
  console.log(`[scanner] ${filtered.length} qualifying markets after filtering`);
  return filtered;
}

/**
 * Fetch a single market's current state (used by position monitor).
 * Returns normalised market or null.
 */
async function fetchMarket(marketId) {
  try {
    const client = jupClient();
    const res = await client.get(`/markets/${marketId}`);
    const m = res.data?.market ?? res.data;
    if (!m) return null;
    return {
      id: m.id ?? m.marketId ?? marketId,
      yesPrice: toDecimal(m.buyYesPriceUsd ?? 0),
      noPrice: toDecimal(m.buyNoPriceUsd ?? 0),
      sellYesPrice: toDecimal(m.sellYesPriceUsd ?? 0),
      sellNoPrice: toDecimal(m.sellNoPriceUsd ?? 0),
      volumeUsd: (m.volume ?? 0) / NATIVE_UNIT,
      status: m.status,
      result: m.result ?? null,
      closeTime: new Date(m.closeTime ?? m.resolveAt),
      title: m.title,
    };
  } catch (err) {
    console.warn(`[scanner] fetchMarket(${marketId}) error: ${err.message}`);
    return null;
  }
}

/**
 * Search events by keyword.
 */
async function searchMarkets(query) {
  try {
    const client = jupClient();
    const res = await client.get('/events/search', { params: { query, limit: 20 } });
    return res.data?.events ?? res.data ?? [];
  } catch (err) {
    console.warn(`[scanner] searchMarkets error: ${err.message}`);
    return [];
  }
}

/**
 * Fetch order status from Jupiter.
 */
async function fetchOrderStatus(orderPubkey) {
  try {
    const client = jupClient();
    const res = await client.get(`/orders/status/${orderPubkey}`);
    return res.data;
  } catch (err) {
    console.warn(`[scanner] fetchOrderStatus error: ${err.message}`);
    return null;
  }
}

/**
 * Get orderbook for a market.
 */
async function fetchOrderbook(marketId) {
  try {
    const client = jupClient();
    const res = await client.get(`/orderbook/${marketId}`);
    return res.data;
  } catch (err) {
    console.warn(`[scanner] fetchOrderbook error: ${err.message}`);
    return null;
  }
}

module.exports = {
  scanMarkets,
  fetchMarket,
  searchMarkets,
  fetchOrderStatus,
  fetchOrderbook,
  toDecimal,
  toNative,
  NATIVE_UNIT,
};
