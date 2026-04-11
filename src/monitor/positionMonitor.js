'use strict';

const { fetchMarket } = require('../scanner/marketScanner');
const { estimateProbability } = require('../llm/probabilityEstimator');
const { recordOutcome } = require('../math/brierScore');
const { sendExitAlert, sendStopLossAlert, sendRawMessage } = require('../telegram/alerts');
const wallet = require('../wallet/paperWallet');

const TAKE_PROFIT_THRESHOLD = 0.15;   // +15¢
const STOP_LOSS_THRESHOLD = 0.12;     // -12¢
const MIN_PRICE_MOVE = 0.05;          // ignore < 5¢ moves

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

  const priceDiff = currentPrice - position.entryPrice;
  const absDiff = Math.abs(priceDiff);

  // Skip if price barely moved
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

  // Stop loss: price dropped >= 12¢
  if (priceDiff <= -STOP_LOSS_THRESHOLD) {
    console.log(`[monitor] Stop loss triggered for ${position.id} (-${(Math.abs(priceDiff) * 100).toFixed(1)}¢)`);
    wallet.markPositionAlerted(position.id);
    const loss = position.totalCost - (position.contracts * currentPrice);
    await sendStopLossAlert(position, currentPrice, loss);
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

async function handleResolution(position, market) {
  const yesWon = market.result === 'yes';
  const ourSideWon = (position.side === 'YES' && yesWon) || (position.side === 'NO' && !yesWon);
  const closePrice = ourSideWon ? 1.0 : 0.0;

  try {
    const closed = wallet.closePosition(position.id, closePrice, 'resolved');
    const pnl = closed.pnl;
    const sign = pnl >= 0 ? '+' : '';

    // Update Brier score
    recordOutcome(position.myEstimatedProbability, yesWon ? 1 : 0);

    await sendRawMessage(
      `🏁 *Market Resolved*\n\n` +
      `_${position.marketQuestion}_\n` +
      `Result: *${market.result.toUpperCase()}*\n` +
      `Your bet: *${position.side}* — ${ourSideWon ? '✅ WON' : '❌ LOST'}\n` +
      `PnL: ${sign}$${Math.abs(pnl).toFixed(2)}`
    );
  } catch (err) {
    console.error(`[monitor] Resolution handling error: ${err.message}`);
  }
}

module.exports = { monitorPositions };
