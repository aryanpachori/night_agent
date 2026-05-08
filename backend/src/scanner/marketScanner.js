'use strict';

let _warnedMinDaysLeftIgnored = false;

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
const JUPITER_CATEGORIES = new Set([
  'all',
  'crypto',
  'sports',
  'politics',
  'esports',
  'culture',
  'economics',
  'tech',
]);

function normalizeCategories(rawCategories) {
  const input = Array.isArray(rawCategories) ? rawCategories : [];
  const mapped = input
    .map((c) => String(c || '').trim().toLowerCase())
    .filter(Boolean)
    .map((c) => (c === 'us elections' ? 'politics' : c))
    .filter((c) => JUPITER_CATEGORIES.has(c));
  if (!mapped.length) return ['crypto'];
  return [...new Set(mapped)];
}

/**
 * When Jupiter sets one side to 0, derive the other from the binary complement in native 1e6 units.
 * Also fixes 0.0¢ display and bogus P&L for NO when buyNoPrice was stored as 0.
 */
function normaliseYesNoFromPricing(pricing) {
  const p = pricing || {};
  const rawY = p.buyYesPriceUsd;
  const rawN = p.buyNoPriceUsd;
  let nNative = rawN;
  let yNative = rawY;
  if (nNative == null || nNative === 0) {
    yNative = yNative ?? 0;
    if (yNative > 0 && yNative < NATIVE_UNIT) nNative = NATIVE_UNIT - yNative;
    else nNative = 0;
  }
  if (yNative == null || yNative === 0) {
    nNative = nNative ?? 0;
    if (nNative > 0 && nNative < NATIVE_UNIT) yNative = NATIVE_UNIT - nNative;
    else yNative = 0;
  }
  let yesPrice = toDecimal(yNative);
  let noPrice = toDecimal(nNative);
  if (noPrice <= 0 && yesPrice > 0 && yesPrice < 1) noPrice = 1 - yesPrice;
  if (yesPrice <= 0 && noPrice > 0 && noPrice < 1) yesPrice = 1 - noPrice;
  return { yesPrice, noPrice };
}

/** Human-readable time left for logs (fast markets: minutes, not "0d"). */
function formatTimeToResolveShort(seconds) {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s < 0) return '?';
  if (s < 120) return `${Math.max(1, Math.round(s))}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86_400) return `${(s / 3600).toFixed(1)}h`;
  return `${(s / 86_400).toFixed(1)}d`;
}

/** Jupiter payloads vary; pull the widest event label we can. */
function pickEventTitle(event) {
  const t =
    event.metadata?.title ??          // Jupiter nested: { metadata: { title: "..." } }
    event.title ??
    event.name ??
    event.eventTitle ??
    event.question ??
    event.summary ??
    event.metadata?.slug?.replace(/[-_]/g, ' ') ??
    event.slug?.replace(/[-_]/g, ' ') ??
    '';
  return String(t).trim();
}

/** Outcome row label (often short: "1.40", "Up", ">$800M"). */
function pickOutcomeTitle(market) {
  const t =
    market.title ??
    market.outcome ??
    market.outcomeTitle ??
    market.shortTitle ??
    market.name ??
    '';
  return String(t).trim();
}

/** Rules / description so cryptic outcomes are still understandable in lists. */
function pickContextHint(event, market) {
  const raw =
    (market.rulesPrimary ??
      market.rules ??
      market.description ??
      event.description ??
      event.rulesPrimary ??
      event.rules ??
      '') + '';
  return raw.trim();
}

function normaliseMarket(event, market, now) {
  const pricing = market.pricing || {};
  const { yesPrice, noPrice } = normaliseYesNoFromPricing(pricing);
  const volumeUsd = (pricing.volume ?? 0) / NATIVE_UNIT;
  const closeTimeSec = market.closeTime ?? market.resolveAt;
  if (!closeTimeSec) return null;
  const closeMs  = closeTimeSec * 1000;
  if (isNaN(closeMs)) return null;
  const et = pickEventTitle(event);
  const mt = pickOutcomeTitle(market);
  const contextHint = pickContextHint(event, market);

  const question = (() => {
    if (et && mt && et !== mt) return `${et} — ${mt}`;
    if (et && mt && et === mt) return et;
    if (et && !mt) return et;
    if (!et && mt && contextHint) {
      return `${contextHint} — ${mt}`;
    }
    if (mt) return mt;
    if (contextHint) return contextHint;
    return '';
  })();

  const secondsToResolve = Math.max(0, (closeMs - now) / 1000);

  // Event-level total volume: Jupiter stores it as micro units (e.g. "18360481000000")
  const eventVolumeUsd = Number(event.volumeUsd ?? 0) / NATIVE_UNIT;

  return {
    id:          market.marketId ?? market.id,
    eventId:     event.eventId   ?? event.id,
    eventTitle:  et,
    outcomeTitle: mt,
    contextHint,
    question,
    description: market.rulesPrimary ?? '',
    category:    event.category  ?? 'crypto',
    subcategory: event.subcategory ?? '',
    yesPrice,
    noPrice,
    sellYesPrice: toDecimal(pricing.sellYesPriceUsd  ?? 0),
    sellNoPrice:  toDecimal(pricing.sellNoPriceUsd   ?? 0),
    volumeUsd,
    eventVolumeUsd,
    daysLeft:    Math.round((closeMs - now) / 86_400_000),
    /** Actual time to resolution in seconds (for 5m/15m/short-dated markets; daysLeft rounds to 0). */
    secondsToResolve,
    closeTime:   new Date(closeMs),
    status:      market.status,
    result:      market.result ?? null,
    _raw:        pricing,
  };
}

/**
 * Scan for prediction markets.
 * @param {{ newOnly?: boolean, categories?: string[] }} options
 *   newOnly is kept for caller logs; filtering is from {@link SCAN_JUPITER_FILTERS} (default live only).
 */
async function scanMarkets({ newOnly = false, categories = ['crypto'] } = {}) {
  const MIN_PRICE      = parseFloat(process.env.MIN_PRICE)    || 0.15;
  const MAX_PRICE      = parseFloat(process.env.MAX_PRICE)    || 0.85;
  // Minimum time until close: use MIN_HOURS_LEFT / MIN_RESOLVE_MINUTES only (no day floor).
  // For "at least ~1 day" set e.g. MIN_HOURS_LEFT=24 (or MIN_RESOLVE_MINUTES=1440).
  const MIN_HOURS = (() => {
    const v = process.env.MIN_HOURS_LEFT;
    if (v === undefined || v === '') return 0;
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  })();
  const MIN_RESOLVE_MINUTES = (() => {
    const v = process.env.MIN_RESOLVE_MINUTES;
    if (v === undefined || v === '') return 0;
    const n = parseFloat(v);
    return Number.isFinite(n) && n > 0 ? n : 0;
  })();
  const MAX_DAYS       = parseInt(process.env.MAX_DAYS_LEFT)  || 365;
  const MIN_VOLUME_USD = parseFloat(process.env.MIN_VOLUME)   || 0;
  const TA_REQUIRED    = process.env.TA_REQUIRED !== 'false';  // default true

  const now      = Date.now();
  if (
    !_warnedMinDaysLeftIgnored &&
    process.env.MIN_DAYS_LEFT != null &&
    String(process.env.MIN_DAYS_LEFT).trim() !== ''
  ) {
    _warnedMinDaysLeftIgnored = true;
    console.warn(
      '[scanner] MIN_DAYS_LEFT is ignored. Use MIN_HOURS_LEFT / MIN_RESOLVE_MINUTES (default 0). e.g. MIN_HOURS_LEFT=24 for ~1 day min.',
    );
  }

  const minEndMs = now + MIN_HOURS * 3_600_000 + MIN_RESOLVE_MINUTES * 60_000;
  const maxEndMs = now + MAX_DAYS * 86_400_000;

  const client  = jupClient();
  const scanCategories = normalizeCategories(categories);
  // QA requirement: scan only live markets (no ended or not-yet-started feeds).
  const filters = ['live'];

  const requests = [];
  for (const category of scanCategories) {
    for (const filter of filters) {
      requests.push(
        client.get('/events', {
          params: { category, filter, includeMarkets: true, end: 100 },
        })
          .then(r => {
            const raw = r.data;
            return Array.isArray(raw) ? raw : (raw.data || raw.events || []);
          })
          .catch(err => {
            console.warn(`[scanner] fetch failed (category=${category}, filter=${filter}): ${err.message}`);
            return [];
          }),
      );
    }
  }
  const results = await Promise.all(requests);

  // Deduplicate events
  const eventMap = new Map();
  results.flat().forEach(ev => {
    const id = ev.eventId || ev.id;
    if (id && !eventMap.has(id)) eventMap.set(id, ev);
  });
  const events = [...eventMap.values()];
  console.log(
    `[scanner] Fetched ${events.length} unique events (categories: ${scanCategories.join(', ')} | filters: ${filters.join(', ')})`,
  );
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
          const ttr = formatTimeToResolveShort(m.secondsToResolve);
          console.log(
            `[scanner] ✗ ${q} — ${ttr} to resolve (need ≥ ${formatTimeToResolveShort(
              (minEndMs - now) / 1000,
            )}, ≤ ${MAX_DAYS}d)`,
          );
          continue;
        }

        // TA pre-filter — compute math signals; skip if no interesting signal
        // Always attach ta to market so index.js can use mathProbability without recomputing
        const taSeconds = Math.max(1, m.secondsToResolve);
        let ta = null;
        if (getPointCount(m.id) >= 3) {
          ta = analyzeMarket(getPriceHistory(m.id), taSeconds);
        }
        if (TA_REQUIRED && ta && !ta.interesting) {
          console.log(`[scanner] ✗ ${q} — no TA signal (math prob ${(ta.mathProbability*100).toFixed(1)}%)`);
          continue;
        }

        m.ta = ta; // attach for index.js math pre-gate (no extra computation)
        const ttrLog = m.secondsToResolve < 86_400
          ? formatTimeToResolveShort(m.secondsToResolve)
          : `${m.daysLeft}d`;
        console.log(
          `[scanner] ✓ ${q} — YES ${(m.yesPrice*100).toFixed(1)}¢ | ${ttrLog} | $${m.volumeUsd.toFixed(2)}${ta ? ` | math ${(ta.mathProbability*100).toFixed(1)}%` : ''}`,
        );
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
    const pricing   = m.pricing || {};
    const { yesPrice, noPrice } = normaliseYesNoFromPricing(pricing);
    const eventLike = m.event || res.data?.event;
    const evTitle   = eventLike
      ? pickEventTitle(eventLike)
      : String(m.eventTitle || m.eventName || m.parentTitle || m.groupName || '').trim();
    const outTitle  = String(pickOutcomeTitle(m) || m.outcomeName || m.shortTitle || m.title || '').trim();
    return {
      id:          m.marketId ?? m.id ?? marketId,
      yesPrice,
      noPrice,
      sellYesPrice: toDecimal(pricing.sellYesPriceUsd ?? 0),
      sellNoPrice:  toDecimal(pricing.sellNoPriceUsd  ?? 0),
      volumeUsd:   (pricing.volume ?? 0) / NATIVE_UNIT,
      status:      m.status,
      result:      m.result ?? null,
      closeTime:   new Date((m.closeTime ?? m.resolveAt) * 1000),
      title:       m.title,
      eventTitle:  evTitle,
      outcomeTitle: outTitle,
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
