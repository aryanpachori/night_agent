'use strict';

const crypto = require('crypto');
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
const { getPrisma } = require('../db/client');
const { emitToUser } = require('../api/sseClients');
const { getActiveUsers } = require('../bot/userManager');

let _bot = null;

function setBot(bot) {
  _bot = bot;
}

async function sendToChat(targetChatId, text, extra = {}) {
  if (!targetChatId) return null;
  if (!_bot) {
    console.warn('[alerts] Bot not initialised');
    return null;
  }
  try {
    return await _bot.sendMessage(String(targetChatId), text, { parse_mode: 'MarkdownV2', ...extra });
  } catch (err) {
    console.error(`[alerts] Send failed: ${err.message}`);
    const prisma = getPrisma();
    if (prisma) {
      const day = new Date().toISOString().slice(0, 10);
      const key = `delivery_dead_letter:${String(targetChatId)}:${day}`;
      const row = await prisma.appStorage.findUnique({ where: { key } });
      let value = { count: 0, lastError: '', updatedAt: 0 };
      if (row?.value) {
        try { value = { ...value, ...JSON.parse(row.value) }; } catch {}
      }
      value.count += 1;
      value.lastError = err.message;
      value.updatedAt = Date.now();
      await prisma.appStorage.upsert({
        where: { key },
        update: { value: JSON.stringify(value) },
        create: { key, value: JSON.stringify(value) },
      });
    }
    return null;
  }
}

async function resolveTargetTelegramId(userId) {
  const prisma = getPrisma();
  if (!prisma) return null;

  if (userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { telegramId: true, telegramAlerts: true },
    });
    if (user?.telegramId != null && user.telegramAlerts) {
      return String(user.telegramId);
    }
  }

  const active = await getActiveUsers();
  const fallback = active.find((u) => u.telegramId != null && u.telegramAlerts);
  return fallback?.telegramId != null ? String(fallback.telegramId) : null;
}

function newOpportunityToken() {
  return crypto.randomBytes(12).toString('base64url');
}

// ─── Pending opportunity state ────────────────────────────────────────────────
// Opaque token → pending data (inline `callback_data` must stay short; market ids can be long).
const pendingOpportunities = new Map();

function setPendingOpportunity(token, data) {
  pendingOpportunities.set(token, data);
  setTimeout(() => pendingOpportunities.delete(token), 10 * 60 * 1000);
}

function getPendingOpportunity(token) {
  return pendingOpportunities.get(token) ?? null;
}

/** Focus cap: count distinct markets with a pending opportunity alert. */
function getPendingOpportunityCount() {
  const ids = new Set();
  for (const p of pendingOpportunities.values()) {
    const mid = p.market?.id ?? p.marketId;
    if (mid) ids.add(mid);
  }
  return ids.size;
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

async function recordAlertRow(user, market, analysis, kellyData, sentViaTelegram) {
  const prisma = getPrisma();
  if (!prisma || !user?.id) return;
  try {
    const conf = String(analysis.confidence || 'medium').toLowerCase();

    const evT = String(market.eventTitle || '').trim();
    const outT = String(market.outcomeTitle || '').trim();
    const title = String(market.title || '').trim();
    const question = String(market.question || '').trim();
    const primary = title || question || (evT && outT && evT !== outT ? `${evT} — ${outT}` : evT);
    const validQuestion = primary.length > 10
      ? primary
      : `${market.category ?? 'Crypto'} market ${String(market.id ?? '').slice(0, 8) || 'event'}`;

    const alertRow = await prisma.alert.create({
      data: {
        userId: user.id,
        marketId: market.id,
        marketQuestion: validQuestion,
        category: market.category ?? 'crypto',
        marketPrice: market.yesPrice,
        myProbability: analysis.probability,
        edge: kellyData.edge,
        ev: kellyData.ev,
        confidence: ['high', 'medium', 'low'].includes(conf) ? conf : 'medium',
        reasoning: analysis.reasoning || '',
        keyFactors: Array.isArray(analysis.keyFactors) ? analysis.keyFactors : [],
        suggestedAmount: kellyData.betAmount,
        suggestedContracts: kellyData.contracts,
        side: analysis.side,
        eventVolumeUsd: (market.eventVolumeUsd != null && market.eventVolumeUsd > 0)
          ? market.eventVolumeUsd
          : (market.volumeUsd != null ? Number(market.volumeUsd) : null),
        sentViaTelegram: !!sentViaTelegram,
      },
    });
    // Push to any connected web clients immediately via SSE
    emitToUser(user.id, 'new_alert', alertRow);
  } catch (err) {
    console.error('[alerts] Failed to store alert row:', err.message);
  }
}

/**
 * @param {object} [opts]
 * @param {object} [opts.user] — Prisma user row (`id`, `telegramId`) for multi-tenant Telegram + DB alert
 * @param {boolean} [opts.deferWalletMark] — if true, caller must call `wallet.markMarketAlerted(market.id)`
 */
async function sendOpportunityAlert(market, analysis, kellyFraction, betAmount, balance, opts = {}) {
  const { user = null, deferWalletMark = false } = opts;

  const entryPrice = analysis.effectivePrice || market.yesPrice;
  const contracts = Math.floor(betAmount / entryPrice);
  const halfBetAmount = betAmount / 2;
  const halfContracts = Math.floor(halfBetAmount / entryPrice);
  const edge = analysis.probability - market.yesPrice;
  const ev =
    analysis.probability * (1 - market.yesPrice) - (1 - analysis.probability) * market.yesPrice;

  const kellyData = { betAmount, contracts, entryPrice, halfBetAmount, halfContracts, edge, ev };
  const text = opportunityMessage(market, analysis, kellyData);

  const token = newOpportunityToken();
  const reply_markup = {
    inline_keyboard: [
      [
        { text: `BET ${analysis.side} full $${betAmount.toFixed(0)}`, callback_data: `bet:${token}:full` },
        { text: `BET half $${halfBetAmount.toFixed(0)}`, callback_data: `bet:${token}:half` },
      ],
      [{ text: 'SKIP', callback_data: `bet:${token}:skip` }],
    ],
  };

  // Only send Telegram to users who registered via the website and have a telegramId linked.
  // No fallback to global TELEGRAM_CHAT_ID — opportunity alerts are user-scoped.
  const targetChat = user?.telegramId != null ? String(user.telegramId) : null;

  if (!deferWalletMark) {
    wallet.markMarketAlerted(market.id);
  }

  let sent = false;
  if (targetChat) {
    setPendingOpportunity(token, {
      market,
      marketId: market.id,
      analysis,
      kellyFraction,
      betAmount,
      halfBetAmount,
      contracts,
      halfContracts,
      entryPrice,
      edge,
      ev,
      telegramChatId: String(targetChat),
      userId: user?.id ?? null,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });
    const msg = await sendToChat(targetChat, text, { reply_markup });
    sent = !!msg;
  }

  await recordAlertRow(user, market, analysis, kellyData, sent);
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
  const targetChat = await resolveTargetTelegramId(position?.userId ?? null);
  await sendToChat(targetChat, text, { reply_markup });
}

// ─── Stop loss: close is done in `positionMonitor`; this is Telegram follow\\-up only ─
async function sendStopLossAutoClosedNotification(closed) {
  const text = stopLossAutoClosedMessage(closed);
  const targetChat = await resolveTargetTelegramId(closed?.userId ?? null);
  await sendToChat(targetChat, text);
}

// ─── sendDailySummary ─────────────────────────────────────────────────────────
async function sendDailySummary(walletModule) {
  const activeUsers = await getActiveUsers();
  const sendable = activeUsers.filter((u) => u.telegramId != null && u.telegramAlerts);
  await Promise.all(
    sendable.map((u) => sendToChat(String(u.telegramId), dailySummaryMessage(walletModule))),
  );
}

async function sendPositionPriceTick(position, currentPrice, unrealizedUsd) {
  const text = positionPriceTickMessage(position, currentPrice, unrealizedUsd);
  const extra = {};
  if (shouldOfferManualExit(unrealizedUsd)) {
    extra.reply_markup = { inline_keyboard: [manualExitKeyboardRow(position.id, null)] };
  }
  const targetChat = await resolveTargetTelegramId(position?.userId ?? null);
  return sendToChat(targetChat, text, extra);
}

async function sendResolvedAlert(position, won) {
  const targetChat = await resolveTargetTelegramId(position?.userId ?? null);
  return sendToChat(targetChat, resolvedMessage(position, won));
}

// ─── sendRawMessage ───────────────────────────────────────────────────────────
async function sendRawMessage(text) {
  const { esc } = require('./messages');
  const activeUsers = await getActiveUsers();
  const sendable = activeUsers.filter((u) => u.telegramId != null && u.telegramAlerts);
  await Promise.all(sendable.map((u) => sendToChat(String(u.telegramId), esc(text))));
}

// ─── sendWelcomeMessage — sent to a newly registered web user who has Telegram linked ─
async function sendWelcomeMessage(telegramId, firstName) {
  if (!telegramId) return;
  const { esc } = require('./messages');
  const name = firstName ? esc(firstName) : 'there';
  const siteUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const text =
    `👋 Hey ${name}\\! Welcome to *Night Agent*\\.\n\n` +
    `You're now connected — I'll send you bet signals here as soon as I spot a good opportunity\\.\n\n` +
    `*How it works:*\n` +
    `• I scan prediction markets 24/7 looking for edges\n` +
    `• When I find one, you'll get a message here with the event, which side to bet, and the payout\n` +
    `• You can also view all alerts and manage your bets on the dashboard\n\n` +
    `🌐 Dashboard: ${esc(siteUrl)}\n\n` +
    `_Alerts are only sent here if you have Telegram Alerts enabled in your settings\\._`;
  await sendToChat(String(telegramId), text);
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
  sendWelcomeMessage,
  getPendingOpportunity,
  getPendingOpportunityCount,
  getPendingExit,
  pendingOpportunities,
  pendingExits,
};
