'use strict';

/**
 * Calculate expected value and which side to bet.
 * All prices are in decimal (0-1), not cents.
 */
function calculateEV(myProbability, marketPrice) {
  const winAmount = 1 - marketPrice;    // profit per contract if win
  const loseAmount = marketPrice;       // loss per contract if lose
  const lossProbability = 1 - myProbability;

  const ev = (myProbability * winAmount) - (lossProbability * loseAmount);

  // Determine which side has positive edge
  const bettingYES = myProbability > marketPrice;
  const side = bettingYES ? 'YES' : 'NO';
  const effectivePrice = bettingYES ? marketPrice : (1 - marketPrice);

  return {
    ev,
    isPositive: ev > 0,
    side,
    effectivePrice,
    // Also compute NO side for reference
    noEV: ((1 - myProbability) * (1 - (1 - marketPrice))) - (myProbability * (1 - marketPrice)),
  };
}

/**
 * Edge = how far our estimate is from the market price, on the side we'd bet.
 */
function calculateEdge(myProbability, marketPrice) {
  if (myProbability > marketPrice) {
    return myProbability - marketPrice;                           // YES edge
  } else {
    return (1 - myProbability) - (1 - marketPrice);              // NO edge
  }
}

module.exports = { calculateEV, calculateEdge };
