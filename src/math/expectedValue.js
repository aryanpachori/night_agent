'use strict';

/**
 * Calculate expected value and which side to bet.
 * All prices are in decimal (0-1), not cents.
 */
function calculateEV(myProbability, marketPrice) {
  const lossProbability = 1 - myProbability;

  // EV per $1 staked on YES at `marketPrice` (standard binary contract)
  const winAmountYes = 1 - marketPrice;
  const loseAmountYes = marketPrice;
  const evYes =
    myProbability * winAmountYes - lossProbability * loseAmountYes;

  // EV per $1 staked on NO at (1 - marketPrice)
  const noPrice = 1 - marketPrice;
  const evNo =
    lossProbability * marketPrice - myProbability * noPrice;

  const bettingYES = myProbability > marketPrice;
  const side = bettingYES ? 'YES' : 'NO';
  const effectivePrice = bettingYES ? marketPrice : noPrice;

  const ev = bettingYES ? evYes : evNo;

  return {
    ev,
    evYes,
    evNo,
    isPositive: ev > 0,
    side,
    effectivePrice,
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
