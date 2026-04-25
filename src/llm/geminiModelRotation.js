'use strict';

/**
 * Free-tier RPD–aware model rotation. Primary: Gemini 3.1 Flash Lite (high RPD),
 * then backups, then Gemma. Premium slot (2.5 Flash) only for "high value" markets.
 *
 * Set GEMINI_MODEL to pin a single model (bypasses rotation, for debugging).
 */

const _premiumMinVolume = () => {
  const v = parseFloat(process.env.GEMINI_PREMIUM_MIN_VOLUME);
  return Number.isFinite(v) && v > 0 ? v : 100_000;
};

/** @type {{ day: string, used: Record<string, number> }} */
let _state = { day: '', used: Object.create(null) };

function _localYmd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function _ensureDay() {
  const today = _localYmd();
  if (_state.day !== today) {
    _state = { day: today, used: Object.create(null) };
    if (isDbUrlSet()) {
      try {
        require('../db/persistence').requestPersist();
      } catch (_) { /* no persistence */ }
    }
  }
}

function isDbUrlSet() {
  return !!process.env.DATABASE_URL;
}

/**
 * Free-tier RPD table (per your Google AI Studio / billing page — adjust RPDs if your quota differs).
 * Order for normal flow: primary → backup → backup2 → emergency. Premium is inserted first when highValue.
 */
function getRotationList() {
  return [
    { id: 'gemini-3.1-flash-lite-preview', rpd: 500, kind: 'primary' },
    { id: 'gemini-2.5-flash', rpd: 20, kind: 'premium' },
    { id: 'gemini-2.0-flash', rpd: 20, kind: 'backup' },
    { id: 'gemini-2.5-flash-lite', rpd: 20, kind: 'backup' },
    { id: 'gemma-3-27b-it', rpd: 14_400, kind: 'emergency' },
  ];
}

function isHighValueMarket(market) {
  const vol = market?.volumeUsd;
  if (vol == null || !Number.isFinite(Number(vol))) return false;
  return Number(vol) >= _premiumMinVolume();
}

function isRotationDisabled() {
  return !!(process.env.GEMINI_MODEL && String(process.env.GEMINI_MODEL).trim());
}

function getPinnedModelId() {
  const id = String(process.env.GEMINI_MODEL || '').trim();
  return id || null;
}

function getUsed(modelId) {
  _ensureDay();
  return _state.used[modelId] || 0;
}

function canUse(modelId) {
  const rpd = getRotationList().find(m => m.id === modelId)?.rpd;
  if (rpd == null) return true;
  return getUsed(modelId) < rpd;
}

/**
 * @param {object} market
 * @param {{ exclude?: Set<string> }} [opts]
 * @returns {string|null} model id
 */
function pickModel(market, opts = {}) {
  if (isRotationDisabled()) return getPinnedModelId();

  _ensureDay();
  const exclude = opts.exclude || new Set();
  const list = getRotationList();
  const byId = new Map(list.map(m => [m.id, m]));

  const primary = list.filter(m => m.kind === 'primary');
  const premium = list.filter(m => m.kind === 'premium');
  const rest = list.filter(m => m.kind !== 'primary' && m.kind !== 'premium');
  const high = isHighValueMarket(market);

  /** Order: [premium?] + primary + other backups in list order (already: backup, backup, emergency) */
  const chain = [];
  if (high && premium.length) chain.push(...premium);
  chain.push(...primary, ...rest);

  const seen = new Set();
  for (const m of chain) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    if (exclude.has(m.id)) continue;
    const u = getUsed(m.id);
    if (u < m.rpd) return m.id;
  }
  return null;
}

/**
 * @param {import('../db/persistence')|null} _ persistence optional
 */
function trackUsage(modelId) {
  if (!modelId || isRotationDisabled()) return;
  _ensureDay();
  _state.used[modelId] = (getUsed(modelId) || 0) + 1;
  try {
    require('../db/persistence').requestPersist();
  } catch (_) { /* optional */ }
}

function toJSON() {
  _ensureDay();
  return { day: _state.day, used: { ..._state.used } };
}

function fromJSON(obj) {
  if (!obj || typeof obj !== 'object') return;
  const today = _localYmd();
  if (obj.day === today && obj.used && typeof obj.used === 'object') {
    const used = Object.create(null);
    for (const k of Object.keys(obj.used)) {
      const n = Number(obj.used[k]);
      if (Number.isFinite(n) && n >= 0) used[k] = n;
    }
    _state = { day: today, used };
  } else {
    _state = { day: today, used: Object.create(null) };
  }
}

function logStateHint() {
  if (isRotationDisabled()) {
    console.log(`[llm:rotation] Pinned: GEMINI_MODEL=${getPinnedModelId()}`);
    return;
  }
  const list = getRotationList();
  const parts = list.map(m => `${m.id.split('/').pop()}:${getUsed(m.id)}/${m.rpd}`);
  console.log(`[llm:rotation] Today RPD: ${parts.join(' | ')} (premium if vol≥$${Number(_premiumMinVolume()).toLocaleString()})`);
}

module.exports = {
  isHighValueMarket,
  isRotationDisabled,
  getPinnedModelId,
  pickModel,
  trackUsage,
  toJSON,
  fromJSON,
  logStateHint,
  getRotationList,
  getUsed,
  canUse,
  _localYmd, // for tests
};
