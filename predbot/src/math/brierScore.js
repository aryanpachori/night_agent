'use strict';

const { updateBrierScore, getAverageBrierScore } = require('../wallet/paperWallet');

/**
 * Record an outcome and update Brier score.
 * @param {number} myProbability  - LLM's YES probability (0-1)
 * @param {boolean} yesWon        - true if YES resolved
 */
function recordOutcome(myProbability, yesWon) {
  const actualOutcome = yesWon ? 1 : 0;
  const newAvg = updateBrierScore(myProbability, actualOutcome);
  console.log(`[brier] Recorded outcome (p=${myProbability}, actual=${actualOutcome}) → avg Brier: ${newAvg !== null ? newAvg.toFixed(4) : 'N/A'}`);
  return newAvg;
}

/**
 * Human-readable Brier grade.
 */
function brierGrade(score) {
  if (score === null) return 'N/A';
  if (score <= 0.10) return '🟢 Excellent';
  if (score <= 0.15) return '🟡 Good';
  if (score <= 0.20) return '🟠 Ok';
  return '🔴 Poor';
}

module.exports = { recordOutcome, brierGrade, getAverageBrierScore };
