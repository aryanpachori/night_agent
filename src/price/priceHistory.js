'use strict';

// ─── In-memory price history store ───────────────────────────────────────────
// marketId → array of { timestamp, yesPrice, noPrice, volume }
// Capped at MAX_POINTS per market to avoid unbounded memory growth.

const MAX_POINTS = 50;
const store = new Map();

/**
 * Record a price snapshot for a market.
 */
function recordPrice(marketId, yesPrice, noPrice, volume) {
  if (!store.has(marketId)) store.set(marketId, []);
  const history = store.get(marketId);
  history.push({ timestamp: Date.now(), yesPrice, noPrice, volume });
  if (history.length > MAX_POINTS) history.shift();
  try {
    require('../db/persistence').requestPersist();
  } catch (_) { /* no db or cycle */ }
}

/**
 * Get full price history for a market.
 * Returns array of snapshots, oldest first.
 */
function getPriceHistory(marketId) {
  return store.get(marketId) ?? [];
}

/**
 * Get just the YES price series for a market (for TA calculations).
 */
function getYesPrices(marketId) {
  return getPriceHistory(marketId).map(p => p.yesPrice);
}

/**
 * Get just the volume series for a market.
 */
function getVolumes(marketId) {
  return getPriceHistory(marketId).map(p => p.volume);
}

/**
 * Get the latest recorded snapshot for a market.
 */
function getLatestSnapshot(marketId) {
  const h = store.get(marketId);
  return h && h.length > 0 ? h[h.length - 1] : null;
}

/**
 * Get all tracked market IDs.
 */
function getTrackedMarkets() {
  return [...store.keys()];
}

/**
 * How many data points we have for a market.
 */
function getPointCount(marketId) {
  return store.get(marketId)?.length ?? 0;
}

/** For PostgreSQL persistence (full map, capped in RAM per market). */
function getStateForPersist() {
  return Object.fromEntries([...store.entries()]);
}

function loadStateFromPersist(obj) {
  store.clear();
  for (const [k, v] of Object.entries(obj || {})) {
    if (Array.isArray(v)) {
      const capped = v.length > MAX_POINTS ? v.slice(-MAX_POINTS) : v;
      store.set(k, capped);
    }
  }
}

module.exports = {
  recordPrice,
  getPriceHistory,
  getYesPrices,
  getVolumes,
  getLatestSnapshot,
  getTrackedMarkets,
  getPointCount,
  getStateForPersist,
  loadStateFromPersist,
};
