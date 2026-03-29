'use strict';

const TelegramBot = require('node-telegram-bot-api');
const alerts = require('./alerts');
const {
  startMessage,
  balanceMessage,
  positionsMessage,
  historyMessage,
  statsMessage,
  confirmBetMessage,
  confirmExitMessage,
} = require('./messages');

const wallet = require('../wallet/paperWallet');
const { calculateKelly, kellyToDollars } = require('../math/kelly');
const { calculateEV, calculateEdge } = require('../math/expectedValue');

// ─── State shared from index.js ───────────────────────────────────────────────
let pendingOpportunities = {};   // marketId → { market, estimate, evResult, kellyFraction, betAmount }
let scannerPaused = false;

function isPaused() { return scannerPaused; }

// Called by index.js to store opportunity data so button callbacks can access it
function registerOpportunity(market, estimate, evResult, kellyFraction, betAmount) {
  pendingOpportunities[market.id] = { market, estimate, evResult, kellyFraction, betAmount };
  // Expire after 2 hours
  setTimeout(() => delete pendingOpportunities[market.id], 2 * 60 * 60 * 1000);
}

// ─── Bot setup ────────────────────────────────────────────────────────────────
function createBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN not set in environment');

  const bot = new TelegramBot(token, { polling: true });
  alerts.setBot(bot);

  const chatId = process.env.TELEGRAM_CHAT_ID;

  // ─── Command handlers ───────────────────────────────────────────────────────

  bot.onText(/\/start/, (msg) => {
    if (String(msg.chat.id) !== chatId) return;
    const stats = wallet.getStats();
    const m = startMessage(stats.balance);
    bot.sendMessage(msg.chat.id, m.text, { parse_mode: m.parse_mode });
  });

  bot.onText(/\/balance/, (msg) => {
    if (String(msg.chat.id) !== chatId) return;
    const stats = wallet.getStats();
    const m = balanceMessage(stats);
    bot.sendMessage(msg.chat.id, m.text, { parse_mode: m.parse_mode });
  });

  bot.onText(/\/positions/, (msg) => {
    if (String(msg.chat.id) !== chatId) return;
    const positions = wallet.getPositions();
    const m = positionsMessage(positions);
    bot.sendMessage(msg.chat.id, m.text, { parse_mode: m.parse_mode });
  });

  bot.onText(/\/history/, (msg) => {
    if (String(msg.chat.id) !== chatId) return;
    const closed = wallet.getClosedPositions();
    const m = historyMessage(closed);
    bot.sendMessage(msg.chat.id, m.text, { parse_mode: m.parse_mode });
  });

  bot.onText(/\/stats/, (msg) => {
    if (String(msg.chat.id) !== chatId) return;
    const stats = wallet.getStats();
    const m = statsMessage(stats);
    bot.sendMessage(msg.chat.id, m.text, { parse_mode: m.parse_mode });
  });

  bot.onText(/\/pause/, (msg) => {
    if (String(msg.chat.id) !== chatId) return;
    scannerPaused = true;
    bot.sendMessage(msg.chat.id, '⏸ Scanning paused. Send /resume to restart.');
  });

  bot.onText(/\/resume/, (msg) => {
    if (String(msg.chat.id) !== chatId) return;
    scannerPaused = false;
    bot.sendMessage(msg.chat.id, '▶️ Scanning resumed.');
  });

  bot.onText(/\/help/, (msg) => {
    if (String(msg.chat.id) !== chatId) return;
    bot.sendMessage(msg.chat.id,
      `/start — welcome\n/balance — wallet balance\n/positions — open positions\n/history — closed + PnL\n/stats — performance\n/pause — pause scanning\n/resume — resume scanning`
    );
  });

  // ─── Inline button callbacks ───────────────────────────────────────────────

  bot.on('callback_query', async (query) => {
    if (String(query.message?.chat?.id) !== chatId) {
      bot.answerCallbackQuery(query.id, { text: 'Unauthorized.' });
      return;
    }

    const data = query.data;
    bot.answerCallbackQuery(query.id); // acknowledge immediately

    // ── opportunity:{marketId}:{side}:{size} ──────────────────────────────────
    if (data.startsWith('opportunity:')) {
      const [, marketId, side, size] = data.split(':');
      const opp = pendingOpportunities[marketId];
      if (!opp) {
        bot.sendMessage(chatId, '⚠️ Opportunity expired or not found.');
        return;
      }

      if (data.endsWith(':skip')) {
        wallet.markMarketAlerted(marketId);
        bot.sendMessage(chatId, `❌ Skipped market.`);
        return;
      }

      const { market, estimate, evResult, kellyFraction } = opp;
      const balance = wallet.getBalance();

      // Check limits
      if (wallet.getOpenPositionCount() >= (parseInt(process.env.MAX_OPEN_POSITIONS) || 5)) {
        bot.sendMessage(chatId, `⚠️ Max open positions reached (${process.env.MAX_OPEN_POSITIONS || 5}). Close one first.`);
        return;
      }
      if (balance < (parseFloat(process.env.MIN_BANKROLL) || 50)) {
        bot.sendMessage(chatId, `⚠️ Balance too low ($${balance.toFixed(2)}). Scanning stopped.`);
        return;
      }

      let betAmount = kellyToDollars(kellyFraction, balance);
      if (size === 'half') betAmount = betAmount / 2;
      betAmount = Math.max(1, Math.round(betAmount * 100) / 100);

      const entryPrice = evResult.effectivePrice;

      try {
        const position = wallet.openPosition({
          marketId,
          marketQuestion: market.question,
          side: evResult.side,
          entryPrice,
          betAmount,
          myEstimatedProbability: estimate.probability,
          edge: calculateEdge(estimate.probability, market.yesPrice),
          ev: evResult.ev,
          kellyFraction,
          confidence: estimate.confidence,
        });

        wallet.markMarketAlerted(marketId);
        const m = confirmBetMessage(position);
        bot.sendMessage(chatId, m.text, { parse_mode: m.parse_mode });
      } catch (err) {
        bot.sendMessage(chatId, `❌ Failed to place bet: ${err.message}`);
      }
      return;
    }

    // ── exit:{positionId}:{action} ────────────────────────────────────────────
    if (data.startsWith('exit:')) {
      const [, positionId, action] = data.split(':');

      if (action === 'hold') {
        wallet.markPositionAlerted(positionId);
        bot.sendMessage(chatId, '⏳ Holding position.');
        return;
      }

      const position = wallet.getPositions().find(p => p.id === positionId);
      if (!position) {
        bot.sendMessage(chatId, '⚠️ Position not found (already closed?).');
        return;
      }

      // Use current price or entry price as fallback
      const closePrice = position.currentPrice ?? position.entryPrice;

      try {
        if (action === 'half') {
          const result = wallet.closeHalfPosition(positionId, closePrice, 'manual_half');
          const partial = result.partial ?? result;
          const pnl = partial.pnl ?? 0;
          bot.sendMessage(chatId, `📊 Closed half position. PnL: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`);
        } else {
          const closed = wallet.closePosition(positionId, closePrice, 'manual');
          const m = confirmExitMessage(closed, closed.contracts * closePrice);
          bot.sendMessage(chatId, m.text, { parse_mode: m.parse_mode });
        }
      } catch (err) {
        bot.sendMessage(chatId, `❌ Failed to close position: ${err.message}`);
      }
      return;
    }
  });

  // ─── Error handler ──────────────────────────────────────────────────────────
  bot.on('polling_error', (err) => {
    console.error(`[bot] Polling error: ${err.message}`);
  });

  console.log('[bot] Telegram bot started (polling)');
  return bot;
}

module.exports = { createBot, registerOpportunity, isPaused };
