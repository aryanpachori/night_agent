'use strict';

const { fetchMarket } = require('../scanner/marketScanner');
const { estimateProbability } = require('../llm/probabilityEstimator');
const { recordOutcome } = require('../math/brierScore');
const { sendExitAlert, sendStopLossAutoClosedNotification, sendPositionPriceTick } = require('../telegram/alerts');
const wallet = require('../wallet/paperWallet');

const TAKE_PROFIT_THRESHOLD = 0.15;   // +15¢
const STOP_LOSS_THRESHOLD = 0.12;     // -12¢
const MIN_PRICE_MOVE = 0.05;          // ignore < 5¢ moves for TP/SL/LLM exit

/** Price “heartbeat” alerts — move vs last tick, cooldown (separate from TP alerts). */
const PRICE_TICK_MIN_MOVE = parseFloat(process.env.PRICE_TICK_MIN_MOVE) || 0.04;
const PRICE_TICK_COOLDOWN_MS = (parseInt(process.env.PRICE_TICK_INTERVAL_MINUTES, 10) || 12) * 60 * 1000;

const priceTickState = new Map(); // positionId → { lastAlertPrice, lastSentAt }

/**
 * Called by cron every MONITOR_INTERVAL_MINUTES.
 * Iterates all open positions, checks for exit triggers.
 */
async function monitorPositions() {
  const positions = wallet.getPositions();
  if (positions.length === 0) return;

  console.log(`[monitor] Checking ${positions.length} open position(s)...`);

  for (const position of positions) {
    try {
      await checkPosition(position);
    } catch (err) {
      console.error(`[monitor] Error checking position ${position.id}: ${err.message}`);
    }
  }
}

async function checkPosition(position) {
  // Fetch current market data
  const market = await fetchMarket(position.marketId);
  if (!market) {
    console.warn(`[monitor] Could not fetch market ${position.marketId}`);
    return;
  }

  // Check if market resolved
  if (market.result !== null && market.result !== undefined) {
    await handleResolution(position, market);
    return;
  }

  // Get current price from our side
  const currentPrice = position.side === 'YES' ? market.yesPrice : market.noPrice;
  wallet.updatePositionPrice(position.id, currentPrice);

  const unrealized = (position.contracts * currentPrice) - position.totalCost;
  await maybeSendPriceTick(position, currentPrice, unrealized);

  const priceDiff = currentPrice - position.entryPrice;
  const absDiff = Math.abs(priceDiff);

  // Skip TP/SL/LLM path if price barely moved
  if (absDiff < MIN_PRICE_MOVE) return;

  // Debounce — don't alert same position twice within 2 hours
  if (wallet.hasRecentPositionAlert(position.id)) return;

  // Re-run LLM to check if edge has flipped
  let newEstimate = null;
  try {
    const marketForLLM = {
      id:        position.marketId,
      question:  position.marketQuestion,
      yesPrice:  market.yesPrice,
      daysLeft:  Math.round((new Date(market.closeTime) - Date.now()) / 86_400_000),
      closeTime: market.closeTime,
      category:  market.category ?? '',
    };
    newEstimate = await estimateProbability(marketForLLM);
  } catch (err) {
    console.warn(`[monitor] LLM re-estimate failed for ${position.id}: ${err.message}`);
  }

  // ── Exit triggers ───────────────────────────────────────────────────────────

  // Take profit: price moved up >= 15¢
  if (priceDiff >= TAKE_PROFIT_THRESHOLD) {
    console.log(`[monitor] Take profit triggered for ${position.id} (+${(priceDiff * 100).toFixed(1)}¢)`);
    wallet.markPositionAlerted(position.id);
    const profit = (position.contracts * currentPrice) - position.totalCost;
    await sendExitAlert(position, currentPrice, profit);
    return;
  }

  // Stop loss: price dropped >= 12¢ — close immediately, Telegram is notification only
  if (priceDiff <= -STOP_LOSS_THRESHOLD) {
    console.log(`[monitor] Stop loss — auto-exit ${position.id} (-${(Math.abs(priceDiff) * 100).toFixed(1)}¢)`);
    wallet.markPositionAlerted(position.id);
    try {
      const closed = wallet.closePosition(position.id, currentPrice, 'stop_loss');
      await sendStopLossAutoClosedNotification(closed);
    } catch (err) {
      console.error(`[monitor] stop_loss close: ${err.message}`);
    }
    return;
  }

  // EV gone: new LLM estimate flips edge negative
  if (newEstimate) {
    const sideYes = position.side === 'YES';
    const newEdge = sideYes
      ? newEstimate.probability - market.yesPrice
      : (1 - newEstimate.probability) - market.noPrice;

    if (newEdge < -(parseFloat(process.env.MIN_EDGE) || 0.05)) {
      console.log(`[monitor] Edge flipped negative for ${position.id} (edge=${(newEdge * 100).toFixed(1)}%)`);
      wallet.markPositionAlerted(position.id);
      const profit = (position.contracts * currentPrice) - position.totalCost;
      await sendExitAlert(position, currentPrice, profit);
    }
  }
}

/**
 * Lightweight PnL update for focused positions (not the same as take\\-profit alerts).
 */
async function maybeSendPriceTick(position, currentPrice, unrealized) {
  let st = priceTickState.get(position.id);
  if (!st) {
    st = { lastAlertPrice: position.entryPrice, lastSentAt: 0 };
    priceTickState.set(position.id, st);
  }
  const now   = Date.now();
  const moved = Math.abs(currentPrice - st.lastAlertPrice);

  if (st.lastSentAt && now - st.lastSentAt < PRICE_TICK_COOLDOWN_MS && moved < PRICE_TICK_MIN_MOVE) return;

  // First tick: need a clear move or 30m in the trade (avoid spam right after fill)
  if (!st.lastSentAt) {
    const sinceOpen = Date.now() - new Date(position.openedAt).getTime();
    if (sinceOpen < 30 * 60 * 1000 && moved < PRICE_TICK_MIN_MOVE) return;
  }

  st.lastAlertPrice = currentPrice;
  st.lastSentAt     = now;
  try {
    await sendPositionPriceTick(position, currentPrice, unrealized);
  } catch (err) {
    console.warn(`[monitor] Price tick send failed: ${err.message}`);
  }
}

async function handleResolution(position, market) {
  priceTickState.delete(position.id);

  const yesWon = market.result === 'yes';
  const ourSideWon = (position.side === 'YES' && yesWon) || (position.side === 'NO' && !yesWon);
  const closePrice = ourSideWon ? 1.0 : 0.0;

  try {
    const closed = wallet.closePosition(position.id, closePrice, 'resolved');

    // Update Brier score
    recordOutcome(position.myEstimatedProbability, yesWon ? 1 : 0);

    const { sendResolvedAlert } = require('../telegram/alerts');
    await sendResolvedAlert(closed, ourSideWon);
  } catch (err) {
    console.error(`[monitor] Resolution handling error: ${err.message}`);
  }
}

module.exports = { monitorPositions };
