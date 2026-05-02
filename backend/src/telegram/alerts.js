'use strict';

const {
  opportunityMessage,
  exitOpportunityMessage,
  stopLossAutoClosedMessage,
  dailySummaryMessage,
  positionPriceTickMessage,
  resolvedMessage,
  shouldOfferManualExit,
  manualExitKeyboardRow,
} = require('./messages');
const wallet = require('../wallet/paperWallet');

let _bot = null;
const chatId = () => process.env.TELEGRAM_CHAT_ID;

function setBot(bot) { _bot = bot; }

async function send(text, extra = {}) {
  if (!_bot) { console.warn('[alerts] Bot not initialised'); return null; }
  try {
    return await _bot.sendMessage(chatId(), text, { parse_mode: 'MarkdownV2', ...extra });
  } catch (err) {
    console.error(`[alerts] Send failed: ${err.message}`);
    return null;
  }
}

// ─── Pending opportunity state ────────────────────────────────────────────────
// marketId → pending opportunity data (so inline buttons can execute the bet)
const pendingOpportunities = new Map();

function setPendingOpportunity(marketId, data) {
  pendingOpportunities.set(marketId, data);
  setTimeout(() => pendingOpportunities.delete(marketId), 10 * 60 * 1000); // 10 min expiry
}

function getPendingOpportunity(marketId) {
  return pendingOpportunities.get(marketId) ?? null;
}

function getPendingOpportunityCount() {
  return pendingOpportunities.size;
}

// ─── Pending exit state ───────────────────────────────────────────────────────
const pendingExits = new Map();

function setPendingExit(positionId, data) {
  pendingExits.set(positionId, data);
  setTimeout(() => pendingExits.delete(positionId), 10 * 60 * 1000);
}

function getPendingExit(positionId) {
  return pendingExits.get(positionId) ?? null;
}

// ─── sendOpportunityAlert ─────────────────────────────────────────────────────
async function sendOpportunityAlert(market, analysis, kellyFraction, betAmount, balance) {
  const entryPrice     = analysis.effectivePrice || market.yesPrice;
  const contracts      = Math.floor(betAmount / entryPrice);
  const halfBetAmount  = betAmount / 2;
  const halfContracts  = Math.floor(halfBetAmount / entryPrice);
  const edge           = analysis.probability - market.yesPrice;
  const ev             = (analysis.probability * (1 - market.yesPrice)) - ((1 - analysis.probability) * market.yesPrice);

  const kellyData = { betAmount, contracts, entryPrice, halfBetAmount, halfContracts };
  const text = opportunityMessage(market, analysis, kellyData);

  const reply_markup = {
    inline_keyboard: [
      [
        { text: `BET ${analysis.side} full $${betAmount.toFixed(0)}`, callback_data: `bet:${market.id}:full` },
        { text: `BET half $${halfBetAmount.toFixed(0)}`, callback_data: `bet:${market.id}:half` },
      ],
      [{ text: 'SKIP', callback_data: `bet:${market.id}:skip` }],
    ],
  };

  setPendingOpportunity(market.id, {
    market,
    analysis,
    kellyFraction,
    betAmount,
    halfBetAmount,
    contracts,
    halfContracts,
    entryPrice,
    edge,
    ev,
    expiresAt: Date.now() + 10 * 60 * 1000,
  });

  wallet.markMarketAlerted(market.id);
  await send(text, { reply_markup });
}

// ─── sendExitAlert — take profit / negative edge: manual buttons only (no auto\\-close on profit) ─
async function sendExitAlert(position, currentPrice, profit) {
  const text = exitOpportunityMessage(position, currentPrice, profit);
  const reply_markup = {
    inline_keyboard: [
      [
        { text: `EXIT full ${profit >= 0 ? '+' : ''}$${Math.abs(profit).toFixed(2)}`, callback_data: `exit:${position.id}:full` },
        { text: 'EXIT half', callback_data: `exit:${position.id}:half` },
      ],
      [{ text: 'HOLD', callback_data: `exit:${position.id}:hold` }],
    ],
  };
  setPendingExit(position.id, { position, currentPrice, profit, expiresAt: Date.now() + 10 * 60 * 1000 });
  await send(text, { reply_markup });
}

// ─── Stop loss: close is done in `positionMonitor`; this is Telegram follow\\-up only ─
async function sendStopLossAutoClosedNotification(closed) {
  const text = stopLossAutoClosedMessage(closed);
  await send(text);
}

// ─── sendDailySummary ─────────────────────────────────────────────────────────
async function sendDailySummary(walletModule) {
  await send(dailySummaryMessage(walletModule));
}

async function sendPositionPriceTick(position, currentPrice, unrealizedUsd) {
  const text = positionPriceTickMessage(position, currentPrice, unrealizedUsd);
  const extra = {};
  if (shouldOfferManualExit(unrealizedUsd)) {
    extra.reply_markup = { inline_keyboard: [manualExitKeyboardRow(position.id, null)] };
  }
  return send(text, extra);
}

async function sendResolvedAlert(position, won) {
  return send(resolvedMessage(position, won));
}

// ─── sendRawMessage ───────────────────────────────────────────────────────────
async function sendRawMessage(text) {
  // Plain text send — escape for MarkdownV2
  const { esc } = require('./messages');
  await send(esc(text));
}

module.exports = {
  setBot,
  sendOpportunityAlert,
  sendExitAlert,
  sendStopLossAutoClosedNotification,
  sendDailySummary,
  sendPositionPriceTick,
  sendResolvedAlert,
  sendRawMessage,
  getPendingOpportunity,
  getPendingOpportunityCount,
  getPendingExit,
  pendingOpportunities,
  pendingExits,
};
