'use strict';

const { getAverageBrierScore } = require('../wallet/paperWallet');

/**
 * Fractional Kelly criterion with confidence + Brier score adjustments.
 * Returns a fraction of bankroll (0–MAX_BET_PERCENT).
 */
function calculateKelly(myProbability, marketPrice, confidence) {
  const MAX_BET = parseFloat(process.env.MAX_BET_PERCENT) || 0.10;

  // Determine which side we're betting
  const bettingYES = myProbability > marketPrice;
  const p = bettingYES ? myProbability : 1 - myProbability;
  const price = bettingYES ? marketPrice : 1 - marketPrice;

  const b = (1 - price) / price;   // odds ratio (profit / stake)
  const q = 1 - p;                 // probability of losing

  const rawKelly = p - (q / b);
  if (rawKelly <= 0) return 0;

  // Confidence multiplier
  const confidenceMultiplier = {
    high: 0.40,
    medium: 0.25,
    low: 0.10,
  }[confidence] ?? 0.25;

  // Brier score adjustment
  const brierScore = getAverageBrierScore();
  const brierMultiplier = getBrierMultiplier(brierScore);

  if (brierMultiplier === 0) return 0;

  const adjusted = rawKelly * confidenceMultiplier * brierMultiplier;
  return Math.min(adjusted, MAX_BET);
}

function getBrierMultiplier(brierScore) {
  if (brierScore === null) return 0.50;   // no history yet — conservative
  if (brierScore <= 0.10) return 1.00;
  if (brierScore <= 0.15) return 0.75;
  if (brierScore <= 0.20) return 0.50;
  return 0;                               // model is broken, don't bet
}

/**
 * Convert a Kelly fraction to a dollar bet amount given current balance.
 */
function kellyToDollars(kellyFraction, balance) {
  return Math.floor(balance * kellyFraction * 100) / 100; // round down to cents
}

module.exports = { calculateKelly, getBrierMultiplier, kellyToDollars };
