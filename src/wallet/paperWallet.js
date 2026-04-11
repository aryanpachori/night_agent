'use strict';

const { v4: uuidv4 } = require('uuid');

// ─── Core state ───────────────────────────────────────────────────────────────
const wallet = {
  balance: parseFloat(process.env.PAPER_BALANCE) || 1000,
  totalDeposited: parseFloat(process.env.PAPER_BALANCE) || 1000,
  positions: [],         // open bets
  closedPositions: [],   // resolved / exited bets
  brierScores: [],       // accuracy tracking
  alertedMarkets: {},    // marketId → timestamp (dedup)
  alertedPositions: {},  // positionId → timestamp (exit alert dedup)
};

// ─── Getters ─────────────────────────────────────────────────────────────────
function getBalance() { return wallet.balance; }
function getPositions() { return wallet.positions; }
function getClosedPositions() { return wallet.closedPositions; }
function getOpenPositionCount() { return wallet.positions.length; }

function getTotalPnl() {
  const closed = wallet.closedPositions.reduce((s, p) => s + (p.pnl || 0), 0);
  const open = wallet.positions.reduce((s, p) => {
    // unrealised: mark-to-current not tracked until monitor updates price
    return s;
  }, 0);
  return closed + open;
}

function getStats() {
  const closed = wallet.closedPositions;
  const won = closed.filter(p => p.pnl > 0);
  const lost = closed.filter(p => p.pnl <= 0);
  const winRate = closed.length > 0 ? ((won.length / closed.length) * 100).toFixed(1) : '0.0';
  const totalPnl = getTotalPnl();
  const roi = (((wallet.balance - wallet.totalDeposited) / wallet.totalDeposited) * 100).toFixed(2);
  const avgEdge = closed.length > 0
    ? (closed.reduce((s, p) => s + p.edge, 0) / closed.length * 100).toFixed(1)
    : '0.0';
  return {
    balance: wallet.balance,
    totalDeposited: wallet.totalDeposited,
    totalPnl,
    roi,
    openCount: wallet.positions.length,
    closedCount: closed.length,
    wonCount: won.length,
    lostCount: lost.length,
    wonAmount: won.reduce((s, p) => s + p.pnl, 0),
    lostAmount: lost.reduce((s, p) => s + p.pnl, 0),
    winRate,
    avgEdge,
    brierScore: getAverageBrierScore(),
  };
}

// ─── Position operations ─────────────────────────────────────────────────────
function openPosition({ marketId, marketQuestion, side, entryPrice, betAmount, myEstimatedProbability, edge, ev, kellyFraction, confidence }) {
  if (betAmount > wallet.balance) {
    throw new Error(`Insufficient balance: $${wallet.balance.toFixed(2)} < $${betAmount.toFixed(2)}`);
  }

  const contracts = Math.floor(betAmount / entryPrice);
  if (contracts < 1) throw new Error('Bet too small — would buy 0 contracts');

  const actualCost = contracts * entryPrice;
  const potentialPayout = contracts; // $1 per contract
  const potentialProfit = potentialPayout - actualCost;

  const position = {
    id: uuidv4(),
    marketId,
    marketQuestion,
    side,
    contracts,
    entryPrice,
    totalCost: actualCost,
    potentialPayout,
    potentialProfit,
    myEstimatedProbability,
    edge,
    evPerContract: ev,
    kellyFraction,
    confidence,
    currentPrice: entryPrice, // updated by monitor
    status: 'open',
    openedAt: new Date(),
    closedAt: null,
    closePrice: null,
    pnl: null,
    exitReason: null,
    lastAlertAt: null,
  };

  wallet.balance -= actualCost;
  wallet.positions.push(position);
  console.log(`[wallet] Opened ${side} on "${marketQuestion}" | ${contracts} contracts @ $${entryPrice} | cost $${actualCost.toFixed(2)} | balance $${wallet.balance.toFixed(2)}`);
  return position;
}

function closePosition(positionId, closePrice, exitReason = 'manual') {
  const idx = wallet.positions.findIndex(p => p.id === positionId);
  if (idx === -1) throw new Error(`Position ${positionId} not found`);

  const position = wallet.positions[idx];

  // Proceeds = contracts × closePrice
  const proceeds = position.contracts * closePrice;
  const pnl = proceeds - position.totalCost;

  position.closePrice = closePrice;
  position.pnl = pnl;
  position.closedAt = new Date();
  position.status = 'closed';
  position.exitReason = exitReason;

  wallet.balance += proceeds;
  wallet.positions.splice(idx, 1);
  wallet.closedPositions.push(position);

  console.log(`[wallet] Closed ${position.side} "${position.marketQuestion}" @ $${closePrice} | PnL ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)} | balance $${wallet.balance.toFixed(2)}`);
  return position;
}

function closeHalfPosition(positionId, closePrice, exitReason = 'manual_half') {
  const position = wallet.positions.find(p => p.id === positionId);
  if (!position) throw new Error(`Position ${positionId} not found`);

  const halfContracts = Math.floor(position.contracts / 2);
  if (halfContracts < 1) {
    // Too small to split — close all
    return closePosition(positionId, closePrice, exitReason);
  }

  const halfCost = halfContracts * position.entryPrice;
  const proceeds = halfContracts * closePrice;
  const pnl = proceeds - halfCost;

  // Update existing position
  position.contracts -= halfContracts;
  position.totalCost -= halfCost;
  position.potentialPayout = position.contracts;
  position.potentialProfit = position.potentialPayout - position.totalCost;
  wallet.balance += proceeds;

  // Record partial close as a closed position entry
  const partial = {
    ...position,
    id: uuidv4(),
    contracts: halfContracts,
    totalCost: halfCost,
    potentialPayout: halfContracts,
    potentialProfit: halfContracts - halfCost,
    closePrice,
    pnl,
    closedAt: new Date(),
    status: 'closed',
    exitReason,
  };
  wallet.closedPositions.push(partial);

  console.log(`[wallet] Closed HALF of ${position.side} "${position.marketQuestion}" @ $${closePrice} | PnL ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`);
  return { position, partial };
}

function updatePositionPrice(positionId, currentPrice) {
  const position = wallet.positions.find(p => p.id === positionId);
  if (position) position.currentPrice = currentPrice;
}

// ─── Brier score ─────────────────────────────────────────────────────────────
function updateBrierScore(myProbability, actualOutcome) {
  const score = Math.pow(myProbability - actualOutcome, 2);
  wallet.brierScores.push(score);
  return getAverageBrierScore();
}

function getAverageBrierScore() {
  if (wallet.brierScores.length === 0) return null;
  return wallet.brierScores.reduce((a, b) => a + b, 0) / wallet.brierScores.length;
}

// ─── Deduplication helpers ────────────────────────────────────────────────────
const MARKET_DEBOUNCE_MS = 60 * 60 * 1000; // 1 hour
const POSITION_ALERT_DEBOUNCE_MS = 2 * 60 * 60 * 1000; // 2 hours

function hasRecentMarketAlert(marketId) {
  const ts = wallet.alertedMarkets[marketId];
  if (!ts) return false;
  return (Date.now() - ts) < MARKET_DEBOUNCE_MS;
}

function markMarketAlerted(marketId) {
  wallet.alertedMarkets[marketId] = Date.now();
}

function hasRecentPositionAlert(positionId) {
  const ts = wallet.alertedPositions[positionId];
  if (!ts) return false;
  return (Date.now() - ts) < POSITION_ALERT_DEBOUNCE_MS;
}

function markPositionAlerted(positionId) {
  wallet.alertedPositions[positionId] = Date.now();
}

// ─── Daily closed-today helper ────────────────────────────────────────────────
function getClosedToday() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return wallet.closedPositions.filter(p => new Date(p.closedAt) >= start);
}

module.exports = {
  getBalance,
  getPositions,
  getClosedPositions,
  getOpenPositionCount,
  getTotalPnl,
  getStats,
  openPosition,
  closePosition,
  closeHalfPosition,
  updatePositionPrice,
  updateBrierScore,
  getAverageBrierScore,
  hasRecentMarketAlert,
  markMarketAlerted,
  hasRecentPositionAlert,
  markPositionAlerted,
  getClosedToday,
  wallet, // expose raw state for read-only inspection
};
