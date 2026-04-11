'use strict';

const axios = require('axios');
const { getPriceHistory, getPointCount } = require('../price/priceHistory');
const { analyzeMarket } = require('../price/technicalAnalysis');

const BASE_URL   = 'https://api.jup.ag/prediction/v1';
const NATIVE_UNIT = 1_000_000;

function jupClient() {
  const key = process.env.JUPITER_API_KEY;
  if (!key) throw new Error('JUPITER_API_KEY not set in environment');
  return axios.create({
    baseURL: BASE_URL,
    headers: { 'x-api-key': key, 'Content-Type': 'application/json' },
    timeout: 12_000,
  });
}

function toDecimal(native) { return native / NATIVE_UNIT; }
function toNative(decimal)  { return Math.round(decimal * NATIVE_UNIT); }

function normaliseMarket(event, market, now) {
  const pricing = market.pricing || {};
  const yesPrice  = toDecimal(pricing.buyYesPriceUsd ?? 0);
  const volumeUsd = (pricing.volume ?? 0) / NATIVE_UNIT;
  const closeTimeSec = market.closeTime ?? market.resolveAt;
  if (!closeTimeSec) return null;
  const closeMs  = closeTimeSec * 1000;
  if (isNaN(closeMs)) return null;
  return {
    id:          market.marketId ?? market.id,
    eventId:     event.eventId   ?? event.id,
    question:    (() => {
      const et = (event.title  ?? '').trim();
      const mt = (market.title ?? '').trim();
      if (et && mt && et !== mt) return `${et} — ${mt}`;
      return et || mt || '';
    })(),
    description: market.rulesPrimary ?? '',
    category:    event.category  ?? 'crypto',
    subcategory: event.subcategory ?? '',
    yesPrice,
    noPrice:      toDecimal(pricing.buyNoPriceUsd    ?? (NATIVE_UNIT - (pricing.buyYesPriceUsd ?? 0))),
    sellYesPrice: toDecimal(pricing.sellYesPriceUsd  ?? 0),
    sellNoPrice:  toDecimal(pricing.sellNoPriceUsd   ?? 0),
    volumeUsd,
    daysLeft:    Math.round((closeMs - now) / 86_400_000),
    closeTime:   new Date(closeMs),
    status:      market.status,
    result:      market.result ?? null,
    _raw:        pricing,
  };
}

/**
 * Scan for crypto prediction markets.
 * @param {{ newOnly?: boolean }} options
 *   newOnly=true  → only 'new' filter (first-mover fast scan)
 *   newOnly=false → 'new' + 'live' (full scan)
 */
async function scanMarkets({ newOnly = false } = {}) {
  const MIN_PRICE      = parseFloat(process.env.MIN_PRICE)    || 0.15;
  const MAX_PRICE      = parseFloat(process.env.MAX_PRICE)    || 0.85;
  const MIN_DAYS       = parseInt(process.env.MIN_DAYS_LEFT)  || 1;
  const MAX_DAYS       = parseInt(process.env.MAX_DAYS_LEFT)  || 365;
  const MIN_VOLUME_USD = parseFloat(process.env.MIN_VOLUME)   || 0;
  const TA_REQUIRED    = process.env.TA_REQUIRED !== 'false';  // default true

  const now      = Date.now();
  const minEndMs = now + MIN_DAYS * 86_400_000;
  const maxEndMs = now + MAX_DAYS * 86_400_000;

  const client  = jupClient();
  // 'new'      = recently created crypto markets (first-mover opportunity)
  // 'live'     = currently active crypto markets
  // 'trending' = high-activity crypto markets (most likely to have edge)
  const filters = newOnly ? ['new'] : ['new', 'live', 'trending'];

  const results = await Promise.all(
    filters.map(filter =>
      client.get('/events', {
        params: { category: 'crypto', filter, includeMarkets: true, end: 100 },
      })
        .then(r => {
          const raw = r.data;
          return Array.isArray(raw) ? raw : (raw.data || raw.events || []);
        })
        .catch(err => {
          console.warn(`[scanner] fetch failed (filter=${filter}): ${err.message}`);
          return [];
        })
    )
  );

  // Deduplicate events
  const eventMap = new Map();
  results.flat().forEach(ev => {
    const id = ev.eventId || ev.id;
    if (id && !eventMap.has(id)) eventMap.set(id, ev);
  });
  const events = [...eventMap.values()];
  console.log(`[scanner] Fetched ${events.length} unique crypto events`);
  if (events.length > 0 && process.env.DEBUG_SCANNER === 'true') {
    const sample = events[0];
    console.log('[scanner] RAW SAMPLE EVENT:', JSON.stringify({
      eventId:    sample.eventId ?? sample.id,
      title:      sample.title,
      category:   sample.category,
      markets:    (sample.markets ?? []).slice(0, 2).map(m => ({
        marketId: m.marketId ?? m.id,
        title:    m.title,
        status:   m.status,
        closeTime: m.closeTime,
        pricing:  m.pricing,
      })),
    }, null, 2));
  }

  const filtered = [];

  for (const event of events) {
    for (const market of (event.markets || [])) {
      try {
        if (market.status !== 'open') continue;

        const m = normaliseMarket(event, market, now);
        if (!m) continue;

        const q = `"${m.question.slice(0, 45)}"`;

        // Hard gates — log the specific reason for rejection
        if (m.yesPrice < MIN_PRICE || m.yesPrice > MAX_PRICE) {
          console.log(`[scanner] ✗ ${q} — price ${(m.yesPrice*100).toFixed(1)}¢ outside [${MIN_PRICE*100}¢, ${MAX_PRICE*100}¢]`);
          continue;
        }
        if (m.volumeUsd < MIN_VOLUME_USD) {
          console.log(`[scanner] ✗ ${q} — vol $${m.volumeUsd.toFixed(2)} < $${MIN_VOLUME_USD}`);
          continue;
        }
        if (m.closeTime.getTime() < minEndMs || m.closeTime.getTime() > maxEndMs) {
          console.log(`[scanner] ✗ ${q} — ${m.daysLeft}d outside [${MIN_DAYS}d, ${MAX_DAYS}d]`);
          continue;
        }

        // TA pre-filter — compute math signals; skip if no interesting signal
        // Always attach ta to market so index.js can use mathProbability without recomputing
        let ta = null;
        if (getPointCount(m.id) >= 3) {
          ta = analyzeMarket(getPriceHistory(m.id), m.daysLeft * 86_400);
        }
        if (TA_REQUIRED && ta && !ta.interesting) {
          console.log(`[scanner] ✗ ${q} — no TA signal (math prob ${(ta.mathProbability*100).toFixed(1)}%)`);
          continue;
        }

        m.ta = ta; // attach for index.js math pre-gate (no extra computation)
        console.log(`[scanner] ✓ ${q} — YES ${(m.yesPrice*100).toFixed(1)}¢ | ${m.daysLeft}d | $${m.volumeUsd.toFixed(2)}${ta ? ` | math ${(ta.mathProbability*100).toFixed(1)}%` : ''}`);
        filtered.push(m);
      } catch (e) {
        // skip malformed
      }
    }
  }

  filtered.sort((a, b) => b.volumeUsd - a.volumeUsd);
  console.log(`[scanner] ${filtered.length} qualifying markets after filtering`);
  return filtered;
}

/**
 * Fetch all live crypto markets for the price poller (no TA filter, no news).
 * Used by the 60-second price polling loop in index.js.
 */
async function fetchAllCryptoMarkets() {
  try {
    const client = jupClient();
    const r = await client.get('/events', {
      params: { category: 'crypto', filter: 'live', includeMarkets: true, limit: 100 },
    });
    const raw    = r.data;
    const events = Array.isArray(raw) ? raw : (raw.data || raw.events || []);
    const now    = Date.now();
    const markets = [];
    for (const ev of events) {
      for (const m of (ev.markets || [])) {
        const norm = normaliseMarket(ev, m, now);
        if (norm && m.status === 'open') markets.push(norm);
      }
    }
    return markets;
  } catch (err) {
    console.warn(`[scanner] fetchAllCryptoMarkets error: ${err.message}`);
    return [];
  }
}

/**
 * Fetch a single market's current state (used by position monitor).
 */
async function fetchMarket(marketId) {
  try {
    const client = jupClient();
    const res    = await client.get(`/markets/${marketId}`);
    const m      = res.data?.market ?? res.data;
    if (!m) return null;
    const pricing = m.pricing || {};
    return {
      id:          m.marketId ?? m.id ?? marketId,
      yesPrice:    toDecimal(pricing.buyYesPriceUsd  ?? 0),
      noPrice:     toDecimal(pricing.buyNoPriceUsd   ?? 0),
      sellYesPrice: toDecimal(pricing.sellYesPriceUsd ?? 0),
      sellNoPrice:  toDecimal(pricing.sellNoPriceUsd  ?? 0),
      volumeUsd:   (pricing.volume ?? 0) / NATIVE_UNIT,
      status:      m.status,
      result:      m.result ?? null,
      closeTime:   new Date((m.closeTime ?? m.resolveAt) * 1000),
      title:       m.title,
    };
  } catch (err) {
    console.warn(`[scanner] fetchMarket(${marketId}) error: ${err.message}`);
    return null;
  }
}

/**
 * Check orderbook liquidity for a market.
 * Returns { ok, availableYes, availableNo }
 */
async function checkLiquidity(marketId, minContracts = 10) {
  try {
    const client = jupClient();
    const res    = await client.get(`/orderbook/${marketId}`);
    const book   = res.data;
    const sumQty = (side) => (book[side] || []).reduce((s, [, q]) => s + q, 0);
    const availableYes = sumQty('yes');
    const availableNo  = sumQty('no');
    return {
      ok:           availableYes >= minContracts || availableNo >= minContracts,
      availableYes,
      availableNo,
    };
  } catch (err) {
    // Orderbook endpoint may not exist for all markets — treat as ok
    return { ok: true, availableYes: null, availableNo: null };
  }
}

async function searchMarkets(query) {
  try {
    const client = jupClient();
    const res    = await client.get('/events/search', { params: { query, limit: 20 } });
    return res.data?.events ?? res.data?.data ?? res.data ?? [];
  } catch (err) {
    console.warn(`[scanner] searchMarkets error: ${err.message}`);
    return [];
  }
}

module.exports = {
  scanMarkets,
  fetchAllCryptoMarkets,
  fetchMarket,
  checkLiquidity,
  searchMarkets,
  toDecimal,
  toNative,
  NATIVE_UNIT,
};
