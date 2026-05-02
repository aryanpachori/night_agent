'use strict';

/** marketId -> { result, expiresAt: ms } — persisted when DATABASE_URL is set. */
const cache = new Map();
let onMutate = null;

function setRequestPersist(fn) {
  onMutate = typeof fn === 'function' ? fn : null;
}

function touch() {
  if (onMutate) onMutate();
}

function get(marketId) {
  return cache.get(marketId);
}

function setEntry(marketId, result, expiresAt) {
  cache.set(marketId, { result, expiresAt });
  touch();
}

function toJSON() {
  return Object.fromEntries(cache);
}

function fromJSON(obj) {
  cache.clear();
  const now = Date.now();
  for (const [k, v] of Object.entries(obj || {})) {
    if (v && typeof v.expiresAt === 'number' && v.expiresAt > now) {
      cache.set(k, v);
    }
  }
}

module.exports = { get, setEntry, toJSON, fromJSON, setRequestPersist };
