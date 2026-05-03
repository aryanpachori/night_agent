'use strict';

const { fetchMarket } = require('../scanner/marketScanner');
const { estimateProbability } = require('../llm/probabilityEstimator');
const { recordOutcome } = require('../math/brierScore');
const { sendExitAlert, sendStopLossAutoClosedNotification, sendPositionPriceTick } = require('../telegram/alerts');
const wallet = require('../wallet/paperWallet');
const { getPrisma } = require('../db/client');
const { hasActiveUsers, getActiveUsers } = require('../bot/userManager');

/**
 * Fetch the effective auto-exit settings for the first active user.
 * Falls back to global env vars when no user setting is configured.
 * Returns { takeProfitPct: number|null, stopLossPct: number|null }
 */
async function getAutoExitSettings() {
  const users = await getActiveUsers();
  const u = users[0] ?? null;

  const envTP = parseFloat(process.env.AUTO_TAKE_PROFIT_PCT);
  const envSL = parseFloat(process.env.AUTO_STOP_LOSS_PCT);

  return {
    takeProfitPct: (u?.autoTakeProfitPct != null) ? u.autoTakeProfitPct : (Number.isFinite(envTP) ? envTP : null),
    stopLossPct:   (u?.autoStopLossPct  != null) ? u.autoStopLossPct  : (Number.isFinite(envSL) ? envSL : null),
  };
}

// ─── Thresholds ───────────────────────────────────────────────────────────────

const MIN_PRICE_MOVE = 0.05; // ignore < 5¢ moves for LLM / TP in full check

/** Price "heartbeat" alerts — move vs last tick, cooldown. */
const PRICE_TICK_MIN_MOVE    = parseFloat(process.env.PRICE_TICK_MIN_MOVE) || 0.03;
const PRICE_TICK_COOLDOWN_MS = (parseInt(process.env.PRICE_TICK_INTERVAL_MINUTES, 10) || 5) * 60 * 1000;

const priceTickState = new Map(); // positionId → { lastAlertPrice, lastSentAt }

// ─── Configurable stop-loss ───────────────────────────────────────────────────

function stopLossPriceMove() {
  const c = parseFloat(process.env.STOP_LOSS_CENTS);
  if (Number.isFinite(c) && c > 0) return c / 100;
  return 0.12; // 12¢ default
}

/**
 * Exit when mark value (contracts × current price) falls to this fraction of cost.
 * STOP_LOSS_DRAWDOWN_PCT=50 → exit when mark ≤ 50% of cost (i.e. lost half).
 */
function stopLossDrawdownMinMarkFraction() {
  const p = parseFloat(process.env.STOP_LOSS_DRAWDOWN_PCT);
  if (!Number.isFinite(p) || p <= 0 || p > 100) return null;
  return 1 - p / 100;
}

// ─── Duration-aware helpers ───────────────────────────────────────────────────

/**
 * Take-profit threshold scales down for shorter markets.
 * A 5-min market moves far less than a 24h market; 15¢ TP is unreachable.
 *
 * Env TAKE_PROFIT_CENTS overrides the base (default 15¢).
 */
function takeProfitThreshold(secondsToResolve) {
  const base = (parseFloat(process.env.TAKE_PROFIT_CENTS) || 15) / 100;
  if (!Number.isFinite(secondsToResolve)) return base;
  const m = secondsToResolve / 60;
  if (m < 5)   return Math.max(0.03, base * 0.25);
  if (m < 15)  return Math.max(0.04, base * 0.35);
  if (m < 30)  return Math.max(0.05, base * 0.50);
  if (m < 60)  return Math.max(0.07, base * 0.65);
  if (m < 120) return Math.max(0.10, base * 0.80);
  return base;
}

/**
 * Grace period before first price-tick alert.
 * For markets resolving in < 30 min, we send the first tick immediately on any move.
 */
function priceTickGraceMs(secondsToResolve) {
  if (Number.isFinite(secondsToResolve) && secondsToResolve < 30 * 60) return 0;
  return 30 * 60 * 1000; // 30 min for long-dated markets
}

/**
 * Cooldown between consecutive price-tick alerts, scaled by remaining time.
 * For very short markets, allow ticks every 60 s.
 */
function priceTickCooldownMs(secondsToResolve) {
  if (!Number.isFinite(secondsToResolve)) return PRICE_TICK_COOLDOWN_MS;
  const m = secondsToResolve / 60;
  if (m < 10) return 60 * 1000;    // 1 min
  if (m < 30) return 2 * 60 * 1000; // 2 min
  return PRICE_TICK_COOLDOWN_MS;
}

// ─── Full monitor (LLM + TP + edge-flip, runs every MONITOR_INTERVAL_MINUTES) ─

/**
 * Full position check: resolution, stop-loss, TP, LLM edge-flip.
 * Called by the standard cron (default every 5 min).
 */
async function monitorPositions() {
  if (getPrisma() && !(await hasActiveUsers())) return;
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
  const market = await fetchMarket(position.marketId);
  if (!market) {
    console.warn(`[monitor] Could not fetch market ${position.marketId}`);
    return;
  }

  if (market.result !== null && market.result !== undefined) {
    await handleResolution(position, market);
    return;
  }

  const currentPrice = position.side === 'YES' ? market.yesPrice : market.noPrice;
  wallet.updatePositionPrice(position.id, currentPrice);

  const unrealized  = (position.contracts * currentPrice) - position.totalCost;
  const secondsLeft = market.secondsToResolve;
  await maybeSendPriceTick(position, secondsLeft, currentPrice, unrealized);

  const markValue   = position.contracts * currentPrice;
  const totalCost   = position.totalCost;
  const priceDiff   = currentPrice - position.entryPrice;
  const absDiff     = Math.abs(priceDiff);
  const stopLossTh  = stopLossPriceMove();

  // Fetch per-user auto-exit thresholds (cached, cheap)
  const { takeProfitPct, stopLossPct } = await getAutoExitSettings();

  // ── Auto stop-loss: per-user % loss threshold (overrides global STOP_LOSS_DRAWDOWN_PCT) ──
  const effectiveSLFrac = stopLossPct != null
    ? (1 - stopLossPct / 100)                 // user setting
    : stopLossDrawdownMinMarkFraction();        // global env fallback

  if (effectiveSLFrac != null && totalCost > 0 && markValue <= totalCost * effectiveSLFrac) {
    const lossPct = ((1 - markValue / totalCost) * 100).toFixed(1);
    console.log(
      `[monitor] SL drawdown ${lossPct}% loss (mark ${(markValue / totalCost * 100).toFixed(0)}% of cost) — auto-exit ${position.id}`,
    );
    try {
      const closed = wallet.closePosition(position.id, currentPrice, 'stop_loss');
      await sendStopLossAutoClosedNotification(closed);
    } catch (err) {
      console.error(`[monitor] SL close: ${err.message}`);
    }
    return;
  }

  // Stop loss: price dropped ≥ N¢ (needs ≥ 5¢ so 1-tick noise doesn't fire)
  if (absDiff >= MIN_PRICE_MOVE && priceDiff <= -stopLossTh) {
    console.log(
      `[monitor] SL cent -${(Math.abs(priceDiff) * 100).toFixed(1)}¢ — auto-exit ${position.id}`,
    );
    try {
      const closed = wallet.closePosition(position.id, currentPrice, 'stop_loss');
      await sendStopLossAutoClosedNotification(closed);
    } catch (err) {
      console.error(`[monitor] SL close: ${err.message}`);
    }
    return;
  }

  // ── Auto take-profit: if user set a target %, auto-close instead of just alerting ──
  if (takeProfitPct != null && totalCost > 0) {
    const profitPct = (unrealized / totalCost) * 100;
    if (profitPct >= takeProfitPct) {
      console.log(
        `[monitor] AUTO-TP ${profitPct.toFixed(1)}% profit (target ${takeProfitPct}%) — auto-exit ${position.id}`,
      );
      try {
        const closed = wallet.closePosition(position.id, currentPrice, 'take_profit_auto');
        // Reuse the stop-loss notification style (it's a closed-position alert)
        await sendStopLossAutoClosedNotification({ ...closed, exitReason: 'take_profit_auto' });
      } catch (err) {
        console.error(`[monitor] Auto-TP close: ${err.message}`);
      }
      return;
    }
  }

  // Skip TP / LLM path if price barely moved
  if (absDiff < MIN_PRICE_MOVE) return;

  // Debounce TP/LLM alerts — don't re-alert same position within 2 hours
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
      secondsToResolve: secondsLeft,
    };
    newEstimate = await estimateProbability(marketForLLM);
  } catch (err) {
    console.warn(`[monitor] LLM re-estimate failed for ${position.id}: ${err.message}`);
  }

  // Take profit: price moved up enough (threshold scales with duration) — send alert only (no auto-TP set)
  const tpThreshold = takeProfitThreshold(secondsLeft);
  if (priceDiff >= tpThreshold) {
    console.log(`[monitor] TP +${(priceDiff * 100).toFixed(1)}¢ (need ${(tpThreshold * 100).toFixed(0)}¢) — exit alert ${position.id}`);
    wallet.markPositionAlerted(position.id);
    const profit = unrealized;
    await sendExitAlert(position, currentPrice, profit);
    return;
  }

  // EV gone: LLM estimate flips edge negative
  if (newEstimate) {
    const sideYes = position.side === 'YES';
    const newEdge = sideYes
      ? newEstimate.probability - market.yesPrice
      : (1 - newEstimate.probability) - market.noPrice;

    if (newEdge < -(parseFloat(process.env.MIN_EDGE) || 0.05)) {
      console.log(`[monitor] Edge flipped ${(newEdge * 100).toFixed(1)}% — exit alert ${position.id}`);
      wallet.markPositionAlerted(position.id);
      await sendExitAlert(position, currentPrice, unrealized);
    }
  }
}

// ─── Fast monitor (no LLM — just resolution + SL; runs every 1 min) ───────────

/**
 * Lightweight 1-minute check for ALL open positions: resolution + both stop-loss
 * variants + price-tick (duration-aware grace). No LLM call, no TP alert.
 *
 * This is how fast-resolving (5/10/15/30 min) positions get closed promptly
 * without waiting for the full 5-min monitor cycle.
 */
async function monitorFastPositions() {
  if (getPrisma() && !(await hasActiveUsers())) return;
  const positions = wallet.getPositions();
  if (positions.length === 0) return;
  for (const position of positions) {
    try {
      await checkPositionFast(position);
    } catch (err) {
      console.error(`[monitor/fast] ${position.id}: ${err.message}`);
    }
  }
}

async function checkPositionFast(position) {
  const market = await fetchMarket(position.marketId);
  if (!market) return;

  // Already closed by full monitor? Skip silently.
  const stillOpen = wallet.getPositions().some(p => p.id === position.id);
  if (!stillOpen) return;

  if (market.result !== null && market.result !== undefined) {
    await handleResolution(position, market);
    return;
  }

  const currentPrice = position.side === 'YES' ? market.yesPrice : market.noPrice;
  wallet.updatePositionPrice(position.id, currentPrice);

  const unrealized  = (position.contracts * currentPrice) - position.totalCost;
  const secondsLeft = market.secondsToResolve;
  await maybeSendPriceTick(position, secondsLeft, currentPrice, unrealized);

  const markValue  = position.contracts * currentPrice;
  const totalCost  = position.totalCost;
  const priceDiff  = currentPrice - position.entryPrice;
  const stopLossTh = stopLossPriceMove();

  // Per-user auto-exit thresholds
  const { takeProfitPct: fastTP, stopLossPct: fastSL } = await getAutoExitSettings();

  // Drawdown SL (no price-move gate) — per-user threshold or global fallback
  const fastSLFrac = fastSL != null
    ? (1 - fastSL / 100)
    : stopLossDrawdownMinMarkFraction();

  if (fastSLFrac != null && totalCost > 0 && markValue <= totalCost * fastSLFrac) {
    const lossPct = ((1 - markValue / totalCost) * 100).toFixed(1);
    console.log(`[monitor/fast] SL drawdown ${lossPct}% — auto-exit ${position.id}`);
    try {
      const closed = wallet.closePosition(position.id, currentPrice, 'stop_loss');
      await sendStopLossAutoClosedNotification(closed);
    } catch (err) {
      console.error(`[monitor/fast] SL close: ${err.message}`);
    }
    return;
  }

  // Auto take-profit in fast path
  if (fastTP != null && totalCost > 0) {
    const profitPct = (((position.contracts * currentPrice) - totalCost) / totalCost) * 100;
    if (profitPct >= fastTP) {
      console.log(`[monitor/fast] AUTO-TP ${profitPct.toFixed(1)}% — auto-exit ${position.id}`);
      try {
        const closed = wallet.closePosition(position.id, currentPrice, 'take_profit_auto');
        await sendStopLossAutoClosedNotification({ ...closed, exitReason: 'take_profit_auto' });
      } catch (err) {
        console.error(`[monitor/fast] Auto-TP close: ${err.message}`);
      }
      return;
    }
  }

  // Cent SL — no MIN_PRICE_MOVE gate in fast path (fast path already polls every minute)
  if (priceDiff <= -stopLossTh) {
    console.log(
      `[monitor/fast] SL cent -${(Math.abs(priceDiff) * 100).toFixed(1)}¢ — auto-exit ${position.id}`,
    );
    try {
      const closed = wallet.closePosition(position.id, currentPrice, 'stop_loss');
      await sendStopLossAutoClosedNotification(closed);
    } catch (err) {
      console.error(`[monitor/fast] SL close: ${err.message}`);
    }
    return;
  }
}

// ─── Price tick (shared) ──────────────────────────────────────────────────────

/**
 * Send a PnL heartbeat alert when price moves enough and cooldown has passed.
 * Grace period and cooldown both scale down for short-duration markets.
 *
 * @param {object} position
 * @param {number|null} secondsToResolve
 * @param {number} currentPrice
 * @param {number} unrealized
 */
async function maybeSendPriceTick(position, secondsToResolve, currentPrice, unrealized) {
  let st = priceTickState.get(position.id);
  if (!st) {
    st = { lastAlertPrice: position.entryPrice, lastSentAt: 0 };
    priceTickState.set(position.id, st);
  }

  const now      = Date.now();
  const moved    = Math.abs(currentPrice - st.lastAlertPrice);
  const graceMs  = priceTickGraceMs(secondsToResolve);
  const cooldown = priceTickCooldownMs(secondsToResolve);

  // Within cooldown window and price hasn't moved enough → skip
  if (st.lastSentAt && now - st.lastSentAt < cooldown && moved < PRICE_TICK_MIN_MOVE) return;

  // First tick: apply grace period (0 for short markets)
  if (!st.lastSentAt) {
    const sinceOpen = now - new Date(position.openedAt).getTime();
    if (sinceOpen < graceMs && moved < PRICE_TICK_MIN_MOVE) return;
  }

  st.lastAlertPrice = currentPrice;
  st.lastSentAt     = now;
  try {
    await sendPositionPriceTick(position, currentPrice, unrealized);
  } catch (err) {
    console.warn(`[monitor] Price tick send failed: ${err.message}`);
  }
}

// ─── Resolution ───────────────────────────────────────────────────────────────

async function handleResolution(position, market) {
  priceTickState.delete(position.id);

  const yesWon     = market.result === 'yes';
  const ourSideWon = (position.side === 'YES' && yesWon) || (position.side === 'NO' && !yesWon);
  const closePrice = ourSideWon ? 1.0 : 0.0;

  try {
    const closed = wallet.closePosition(position.id, closePrice, 'resolved');
    recordOutcome(position.myEstimatedProbability, yesWon ? 1 : 0);
    const { sendResolvedAlert } = require('../telegram/alerts');
    await sendResolvedAlert(closed, ourSideWon);
  } catch (err) {
    console.error(`[monitor] Resolution error: ${err.message}`);
  }
}

module.exports = { monitorPositions, monitorFastPositions };
