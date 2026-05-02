'use strict';

const wallet = require('../wallet/paperWallet');
const { estimateProbability } = require('../llm/probabilityEstimator');
const { calculateEV, calculateEdge } = require('../math/expectedValue');
const { calculateKelly, kellyToDollars } = require('../math/kelly');

const MIN_EDGE = parseFloat(process.env.MIN_EDGE) || 0.08;
const MIN_BET_USD = parseFloat(process.env.MIN_BET_USD) || 5;

/**
 * Absolute floor: skip markets resolving this soon (e.g. garbage sub-2-min buckets).
 * Default 0 (off). For 5/15/30 min markets, set to 0 and rely on durationScaledMinEdge instead.
 */
function minResolveSecondsThreshold() {
  const s = parseInt(process.env.MIN_RESOLVE_SECONDS, 10);
  if (Number.isFinite(s) && s > 0) return s;
  const h = parseFloat(process.env.MIN_HOURS_TO_RESOLVE);
  if (Number.isFinite(h) && h > 0) return Math.round(h * 3600);
  return 0;
}

/**
 * Stricter edge requirement for shorter markets.
 * Short windows are dominated by noise — need a much larger signal to justify a bet.
 *
 * Minutes left → multiplier on MIN_EDGE:
 *   < 5m  → 4.0×   < 15m → 3.0×   < 30m → 2.5×
 *   < 60m → 2.0×   < 2h  → 1.5×   < 4h  → 1.2×
 *   ≥ 4h  → 1.0×
 */
function durationScaledMinEdge(secondsToResolve, baseEdge) {
  if (!Number.isFinite(secondsToResolve) || secondsToResolve <= 0) return baseEdge;
  const m = secondsToResolve / 60;
  if (m < 5)   return baseEdge * 4.0;
  if (m < 15)  return baseEdge * 3.0;
  if (m < 30)  return baseEdge * 2.5;
  if (m < 60)  return baseEdge * 2.0;
  if (m < 120) return baseEdge * 1.5;
  if (m < 240) return baseEdge * 1.2;
  return baseEdge;
}

/**
 * Kelly fraction multiplier for market duration.
 * Shorter horizon = higher uncertainty = smaller bet even if edge passes.
 *
 *   < 5m  → 0.15×   < 15m → 0.25×   < 30m → 0.40×
 *   < 60m → 0.55×   < 2h  → 0.75×   < 4h  → 0.90×
 *   ≥ 4h  → 1.00×
 */
function durationKellyMultiplier(secondsToResolve) {
  if (!Number.isFinite(secondsToResolve) || secondsToResolve <= 0) return 1.0;
  const m = secondsToResolve / 60;
  if (m < 5)   return 0.15;
  if (m < 15)  return 0.25;
  if (m < 30)  return 0.40;
  if (m < 60)  return 0.55;
  if (m < 120) return 0.75;
  if (m < 240) return 0.90;
  return 1.0;
}

function capBetAmount(usd) {
  const cap = parseFloat(process.env.MAX_BET_USD);
  if (Number.isFinite(cap) && cap > 0 && usd > cap) return cap;
  return usd;
}

/**
 * Same gates as {@link runOpportunityScan} before sending an alert (math pre-gate,
 * LLM, duration-scaled edge & Kelly, EV, min bet).
 *
 * @param {object} market — from {@link scanMarkets} (optional `.ta`, `.secondsToResolve`)
 * @param {number} balance — wallet balance for Kelly sizing
 * @param {{ skipRecentAlert?: boolean, verbose?: boolean }} [opts]
 * @returns {Promise<null | { estimate, edge, evResult, kellyFraction, betAmount }>}
 */
async function evaluateOpportunity(market, balance, opts = {}) {
  const { skipRecentAlert = false, verbose = false } = opts;
  const v = (...args) => { if (verbose) console.log(...args); };

  if (skipRecentAlert && wallet.hasRecentMarketAlert(market.id)) return null;

  const secondsLeft = Number.isFinite(market.secondsToResolve) ? market.secondsToResolve : null;

  // Absolute floor (default off; set MIN_RESOLVE_SECONDS=120 to block sub-2-min garbage only)
  const minSec = minResolveSecondsThreshold();
  if (minSec > 0 && secondsLeft != null && secondsLeft < minSec) {
    v(`[scan]   ✗ Resolves in ${Math.round(secondsLeft)}s (hard floor: ${minSec}s)`);
    return null;
  }

  // Duration-scaled edge gate — much stricter for short windows
  const effectiveMinEdge = durationScaledMinEdge(secondsLeft, MIN_EDGE);
  const kellyMult        = durationKellyMultiplier(secondsLeft);
  if (secondsLeft != null) {
    const minsLeft = (secondsLeft / 60).toFixed(0);
    v(
      `[scan]   Duration ${minsLeft}m → min edge ${(effectiveMinEdge * 100).toFixed(1)}% ` +
      `(${(effectiveMinEdge / MIN_EDGE).toFixed(1)}× base) | Kelly mult ${(kellyMult * 100).toFixed(0)}%`,
    );
  }

  // Math pre-gate (TA)
  if (market.ta?.mathProbability != null) {
    const mathEdge = Math.abs(market.ta.mathProbability - market.yesPrice);
    v(`[scan]   Math prob: ${(market.ta.mathProbability * 100).toFixed(1)}% | math edge: ${(mathEdge * 100).toFixed(1)}%`);
    if (mathEdge < effectiveMinEdge) {
      v(`[scan]   ✗ Math edge ${(mathEdge * 100).toFixed(1)}% < ${(effectiveMinEdge * 100).toFixed(1)}% — skip LLM`);
      return null;
    }
  }

  const estimate = await estimateProbability(market);
  const edge = calculateEdge(estimate.probability, market.yesPrice);
  v(`[scan]   LLM edge: ${(edge * 100).toFixed(1)}% (need ≥ ${(effectiveMinEdge * 100).toFixed(1)}%)`);

  if (edge < effectiveMinEdge) {
    v(`[scan]   ✗ Edge too small for this duration — skip`);
    return null;
  }

  const evResult = calculateEV(estimate.probability, market.yesPrice);
  v(`[scan]   EV: ${evResult.ev.toFixed(4)} (positive: ${evResult.isPositive})`);
  if (!evResult.isPositive) {
    v('[scan]   ✗ Negative EV — skip');
    return null;
  }

  const rawKelly = calculateKelly(estimate.probability, market.yesPrice, estimate.confidence);
  const kellyFraction = rawKelly * kellyMult;
  v(
    `[scan]   Kelly: raw ${(rawKelly * 100).toFixed(2)}% × ${(kellyMult * 100).toFixed(0)}% ` +
    `= ${(kellyFraction * 100).toFixed(2)}%`,
  );
  if (kellyFraction <= 0) {
    v('[scan]   ✗ Kelly=0 — skip');
    return null;
  }

  let betAmount = kellyToDollars(kellyFraction, balance);
  const beforeCap = betAmount;
  betAmount = capBetAmount(betAmount);
  if (betAmount < beforeCap - 0.0001) {
    v(`[scan]   Bet capped: $${beforeCap.toFixed(2)} → $${betAmount.toFixed(2)} (MAX_BET_USD)`);
  }
  v(`[scan]   Bet amount: $${betAmount.toFixed(2)} (min $${MIN_BET_USD})`);
  if (betAmount < MIN_BET_USD) {
    v('[scan]   ✗ Bet below minimum — skip');
    return null;
  }

  return { estimate, edge, evResult, kellyFraction, betAmount };
}

module.exports = { evaluateOpportunity, MIN_EDGE, MIN_BET_USD };
