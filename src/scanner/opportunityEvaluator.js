'use strict';

const wallet = require('../wallet/paperWallet');
const { estimateProbability } = require('../llm/probabilityEstimator');
const { calculateEV, calculateEdge } = require('../math/expectedValue');
const { calculateKelly, kellyToDollars } = require('../math/kelly');

const MIN_EDGE = parseFloat(process.env.MIN_EDGE) || 0.08;
const MIN_BET_USD = parseFloat(process.env.MIN_BET_USD) || 5;

/**
 * Same gates as {@link runOpportunityScan} before sending an alert (math pre-gate,
 * LLM, edge, EV, Kelly, min bet).
 *
 * @param {object} market — from {@link scanMarkets} (optional `.ta`)
 * @param {number} balance — wallet balance for Kelly sizing
 * @param {{ skipRecentAlert?: boolean, verbose?: boolean }} [opts]
 * @returns {Promise<null | { estimate: object, edge: number, evResult: object, kellyFraction: number, betAmount: number }>}
 */
async function evaluateOpportunity(market, balance, opts = {}) {
  const { skipRecentAlert = false, verbose = false } = opts;
  const v = (...args) => {
    if (verbose) console.log(...args);
  };

  if (skipRecentAlert && wallet.hasRecentMarketAlert(market.id)) return null;

  if (market.ta?.mathProbability != null) {
    const mathEdge = Math.abs(market.ta.mathProbability - market.yesPrice);
    v(`[scan]   Math prob: ${(market.ta.mathProbability * 100).toFixed(1)}% | math edge: ${(mathEdge * 100).toFixed(1)}%`);
    if (mathEdge < MIN_EDGE) {
      v('[scan]   ✗ Math edge too small — skip LLM');
      return null;
    }
  }

  const estimate = await estimateProbability(market);
  const edge = calculateEdge(estimate.probability, market.yesPrice);
  v(`[scan]   Edge: ${(edge * 100).toFixed(1)}% (min ${MIN_EDGE * 100}%)`);

  if (edge < MIN_EDGE) {
    v('[scan]   ✗ Edge too small — skip');
    return null;
  }

  const evResult = calculateEV(estimate.probability, market.yesPrice);
  v(`[scan]   EV: ${evResult.ev.toFixed(4)} (positive: ${evResult.isPositive})`);
  if (!evResult.isPositive) {
    v('[scan]   ✗ Negative EV — skip');
    return null;
  }

  const kellyFraction = calculateKelly(estimate.probability, market.yesPrice, estimate.confidence);
  v(`[scan]   Kelly fraction: ${(kellyFraction * 100).toFixed(2)}%`);
  if (kellyFraction <= 0) {
    v('[scan]   ✗ Kelly=0 — skip');
    return null;
  }

  const betAmount = kellyToDollars(kellyFraction, balance);
  v(`[scan]   Bet amount: $${betAmount.toFixed(2)} (min $${MIN_BET_USD})`);
  if (betAmount < MIN_BET_USD) {
    v('[scan]   ✗ Bet below minimum — skip');
    return null;
  }

  return { estimate, edge, evResult, kellyFraction, betAmount };
}

module.exports = { evaluateOpportunity, MIN_EDGE, MIN_BET_USD };
