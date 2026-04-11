'use strict';

const TelegramBot = require('node-telegram-bot-api');
const alerts      = require('./alerts');
const msgs        = require('./messages');
const wallet      = require('../wallet/paperWallet');
const { calculateKelly, kellyToDollars } = require('../math/kelly');
const { calculateEdge, calculateEV }     = require('../math/expectedValue');
const { estimateProbability }            = require('../llm/probabilityEstimator');

let scannerPaused = false;
function isPaused() { return scannerPaused; }

// Injected from index.js so the /markets command can call the scanner
let _scanMarketsFunc  = null;
let _runScanFunc      = null;
function registerScanners(scanFn, runFn) {
  _scanMarketsFunc = scanFn;
  _runScanFunc     = runFn;
}

// ─── Create bot ───────────────────────────────────────────────────────────────
function createBot() {
  const token  = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN not set');

  const bot    = new TelegramBot(token, { polling: true });
  const chatId = process.env.TELEGRAM_CHAT_ID;

  alerts.setBot(bot);

  function guard(msg) { return String(msg.chat.id) === chatId; }
  function reply(id, text, extra = {}) {
    return bot.sendMessage(id, text, { parse_mode: 'MarkdownV2', ...extra });
  }

  // ── /start ─────────────────────────────────────────────────────────────────
  bot.onText(/\/start/, msg => {
    if (!guard(msg)) return;
    reply(msg.chat.id, msgs.startupMessage(wallet.getBalance()));
  });

  // ── /help ──────────────────────────────────────────────────────────────────
  bot.onText(/\/help/, msg => {
    if (!guard(msg)) return;
    reply(msg.chat.id, msgs.helpMessage());
  });

  // ── /balance ───────────────────────────────────────────────────────────────
  bot.onText(/\/balance/, msg => {
    if (!guard(msg)) return;
    reply(msg.chat.id, msgs.balanceMessage(wallet.getStats()));
  });

  // ── /positions ─────────────────────────────────────────────────────────────
  bot.onText(/\/positions/, msg => {
    if (!guard(msg)) return;
    reply(msg.chat.id, msgs.positionsMessage(wallet.getPositions()));
  });

  // ── /history ───────────────────────────────────────────────────────────────
  bot.onText(/\/history/, msg => {
    if (!guard(msg)) return;
    reply(msg.chat.id, msgs.historyMessage(wallet.getClosedPositions()));
  });

  // ── /stats ─────────────────────────────────────────────────────────────────
  bot.onText(/\/stats/, msg => {
    if (!guard(msg)) return;
    reply(msg.chat.id, msgs.statsMessage(wallet.getStats()));
  });

  // ── /markets ───────────────────────────────────────────────────────────────
  // Lists currently available crypto markets with prices
  bot.onText(/\/markets/, async msg => {
    if (!guard(msg)) return;
    bot.sendMessage(msg.chat.id, '🔍 Fetching current markets…');
    try {
      const markets = _scanMarketsFunc
        ? await _scanMarketsFunc({ newOnly: false })
        : [];
      reply(msg.chat.id, msgs.marketsMessage(markets));
    } catch (err) {
      bot.sendMessage(msg.chat.id, `❌ Error fetching markets: ${err.message}`);
    }
  });

  // ── /scan ──────────────────────────────────────────────────────────────────
  // Manually trigger a scan now
  bot.onText(/\/scan/, async msg => {
    if (!guard(msg)) return;
    bot.sendMessage(msg.chat.id, '🔄 Running scan now…');
    if (_runScanFunc) _runScanFunc().catch(() => {});
  });

  // ── /pause & /resume ───────────────────────────────────────────────────────
  bot.onText(/\/pause/, msg => {
    if (!guard(msg)) return;
    scannerPaused = true;
    bot.sendMessage(msg.chat.id, '⏸ Scanning paused\\. Send /resume to restart\\.', { parse_mode: 'MarkdownV2' });
  });

  bot.onText(/\/resume/, msg => {
    if (!guard(msg)) return;
    scannerPaused = false;
    bot.sendMessage(msg.chat.id, '▶️ Scanning resumed\\.');
  });

  // ── /ping ──────────────────────────────────────────────────────────────────
  bot.onText(/\/ping/, msg => {
    if (!guard(msg)) return;
    bot.sendMessage(msg.chat.id, '🏓 Pong\\! Night Agent is alive\\.', { parse_mode: 'MarkdownV2' });
  });

  // ── Natural language ────────────────────────────────────────────────────────
  bot.on('message', async msg => {
    if (!guard(msg) || !msg.text || msg.text.startsWith('/')) return;
    const text = msg.text.toLowerCase().trim();
    const { esc } = msgs;

    // ── Balance / wallet ──────────────────────────────────────────────────────
    if (text.includes('balance') || text.includes('wallet') || text.includes('money')) {
      reply(msg.chat.id, msgs.balanceMessage(wallet.getStats()));
      return;
    }

    // ── Positions ─────────────────────────────────────────────────────────────
    if (text.includes('position') || text.includes('open trade') || text.includes('my bet')) {
      reply(msg.chat.id, msgs.positionsMessage(wallet.getPositions()));
      return;
    }

    // ── Stats ─────────────────────────────────────────────────────────────────
    if (text.includes('stat') || text.includes('performance') || text.includes('win rate')) {
      reply(msg.chat.id, msgs.statsMessage(wallet.getStats()));
      return;
    }

    // ── Show markets ──────────────────────────────────────────────────────────
    if (text.includes('market') || text.includes('available') || text.includes('show') || text.includes('list')) {
      bot.sendMessage(msg.chat.id, '🔍 Fetching current crypto markets…');
      try {
        const markets = _scanMarketsFunc ? await _scanMarketsFunc({ newOnly: false }) : [];
        reply(msg.chat.id, msgs.marketsMessage(markets));
      } catch (err) {
        bot.sendMessage(msg.chat.id, `❌ Error: ${esc(err.message)}`);
      }
      return;
    }

    // ── "Should I bet on X?" / "analyse X" / "bet YES or NO on X?" ───────────
    // Detects: "should i bet on", "analyse", "analyze", "what about", "check"
    const analyseMatch =
      text.match(/(?:should i (?:bet|trade)|analyse|analyze|what about|check|evaluate|look at)\s+(.+)/i) ||
      text.match(/(?:bet|trade)\s+(?:on\s+)?(.+?)(?:\?|$)/i);

    if (analyseMatch) {
      const query = analyseMatch[1].trim().replace(/\?$/, '');
      bot.sendMessage(msg.chat.id, `🔍 Analysing "${esc(query)}"…`);

      try {
        // Find matching market from live list
        const markets = _scanMarketsFunc ? await _scanMarketsFunc({ newOnly: false }) : [];
        const match = markets.find(m =>
          m.question.toLowerCase().includes(query.toLowerCase()) ||
          query.toLowerCase().includes(m.question.toLowerCase().slice(0, 20))
        );

        if (!match) {
          // No matching live market — still run LLM with user's question as context
          const syntheticMarket = {
            id:        `user_query_${Date.now()}`,
            question:  msg.text.replace(/should i (?:bet|trade) (?:on )?/i, '').replace(/\?$/, ''),
            yesPrice:  0.5,
            noPrice:   0.5,
            daysLeft:  7,
            closeTime: new Date(Date.now() + 7 * 86_400_000),
            volumeUsd: 0,
            category:  'crypto',
          };
          const estimate = await estimateProbability(syntheticMarket);
          const side = estimate.probability > 0.5 ? 'YES' : 'NO';
          const conf = estimate.confidence.toUpperCase();
          bot.sendMessage(msg.chat.id,
            `🤖 *Analysis* \\(no live market found\\)\n` +
            `My estimate: *${(estimate.probability * 100).toFixed(1)}%* YES\n` +
            `Recommendation: *${side}* \\(${conf} confidence\\)\n` +
            `_${esc(estimate.reasoning)}_`,
            { parse_mode: 'MarkdownV2' }
          );
          return;
        }

        // Full pipeline on the matched market
        const balance  = wallet.getBalance();
        const estimate = await estimateProbability(match);
        const edge     = calculateEdge(estimate.probability, match.yesPrice);
        const evResult = calculateEV(estimate.probability, match.yesPrice);
        const kelly    = calculateKelly(estimate.probability, match.yesPrice, estimate.confidence);
        const betAmt   = kellyToDollars(kelly, balance);

        const hasEdge  = edge >= (parseFloat(process.env.MIN_EDGE) || 0.08) && evResult.isPositive && betAmt >= 5;
        const side     = evResult.side;

        let responseText =
          `🎯 *Analysis: ${esc(match.question.slice(0, 60))}*\n` +
          `━━━━━━━━━━━━━━━━━━━━━━\n` +
          `Market price: *${(match.yesPrice * 100).toFixed(1)}¢*\n` +
          `My estimate:  *${(estimate.probability * 100).toFixed(1)}%* YES\n` +
          `Edge: *${edge >= 0 ? '+' : ''}${(edge * 100).toFixed(1)}%*  \\|  EV: *${evResult.ev >= 0 ? '+' : ''}${evResult.ev.toFixed(3)}*\n` +
          `Confidence: ${esc(estimate.confidence.toUpperCase())}\n` +
          `━━━━━━━━━━━━━━━━━━━━━━\n` +
          `_${esc(estimate.reasoning)}_\n` +
          `━━━━━━━━━━━━━━━━━━━━━━\n`;

        if (hasEdge) {
          responseText +=
            `✅ *BET ${side}* — Kelly suggests $${betAmt.toFixed(0)}\n` +
            `Tap the button to place it:`;

          estimate.side           = side;
          estimate.effectivePrice = evResult.effectivePrice;
          await alerts.sendOpportunityAlert(match, estimate, kelly, betAmt, balance);
        } else {
          responseText +=
            `❌ *No bet* — edge ${(edge * 100).toFixed(1)}% is below ${((parseFloat(process.env.MIN_EDGE) || 0.08) * 100).toFixed(0)}% minimum\\.`;
          reply(msg.chat.id, responseText);
        }
      } catch (err) {
        bot.sendMessage(msg.chat.id, `❌ Analysis failed: ${esc(err.message)}`);
      }
      return;
    }

    // ── Help / fallback ───────────────────────────────────────────────────────
    if (text.includes('help') || text.includes('command')) {
      reply(msg.chat.id, msgs.helpMessage());
      return;
    }

    bot.sendMessage(msg.chat.id,
      `❓ Not sure what you mean\\. Try:\n` +
      `• "show markets"\n` +
      `• "should I bet on BTC reaching 100k?"\n` +
      `• "analyse Rory McIlroy"\n` +
      `• /help for all commands`,
      { parse_mode: 'MarkdownV2' }
    );
  });

  // ── Inline button callbacks ─────────────────────────────────────────────────
  bot.on('callback_query', async query => {
    if (String(query.message?.chat?.id) !== chatId) {
      bot.answerCallbackQuery(query.id, { text: 'Unauthorized.' });
      return;
    }
    bot.answerCallbackQuery(query.id);

    const data = query.data;

    // ── bet:{marketId}:{size} ────────────────────────────────────────────────
    if (data.startsWith('bet:')) {
      const [, marketId, size] = data.split(':');

      if (size === 'skip') {
        wallet.markMarketAlerted(marketId);
        bot.sendMessage(chatId, '⏭ Skipped\\.', { parse_mode: 'MarkdownV2' });
        return;
      }

      const pending = alerts.getPendingOpportunity(marketId);
      if (!pending) {
        bot.sendMessage(chatId, '⚠️ Opportunity expired or not found\\.');
        return;
      }
      if (Date.now() > pending.expiresAt) {
        bot.sendMessage(chatId, '⏰ Opportunity expired \\(10 min\\)\\.', { parse_mode: 'MarkdownV2' });
        return;
      }

      const balance = wallet.getBalance();
      if (wallet.getOpenPositionCount() >= (parseInt(process.env.MAX_OPEN_POSITIONS) || 10)) {
        bot.sendMessage(chatId, `⚠️ Max open positions reached\\.`);
        return;
      }
      if (balance < (parseFloat(process.env.MIN_BANKROLL) || 10)) {
        bot.sendMessage(chatId, `⚠️ Balance too low \\($${balance.toFixed(2)}\\)\\.`, { parse_mode: 'MarkdownV2' });
        return;
      }

      let betAmount = size === 'half' ? pending.halfBetAmount : pending.betAmount;
      betAmount = Math.max(5, Math.round(betAmount * 100) / 100);

      try {
        const position = wallet.openPosition({
          marketId,
          marketQuestion: pending.market.question,
          side:           pending.analysis.side,
          entryPrice:     pending.entryPrice,
          betAmount,
          myEstimatedProbability: pending.analysis.probability,
          edge:           pending.edge,
          ev:             pending.ev,
          kellyFraction:  pending.kellyFraction,
          confidence:     pending.analysis.confidence,
        });
        wallet.markMarketAlerted(marketId);
        alerts.pendingOpportunities.delete(marketId);
        reply(chatId, msgs.betConfirmedMessage(position));
      } catch (err) {
        bot.sendMessage(chatId, `❌ Failed to place bet: ${err.message}`);
      }
      return;
    }

    // ── exit:{positionId}:{action} ───────────────────────────────────────────
    if (data.startsWith('exit:')) {
      const [, positionId, action] = data.split(':');

      if (action === 'hold') {
        wallet.markPositionAlerted(positionId);
        alerts.pendingExits.delete(positionId);
        bot.sendMessage(chatId, '⏳ Holding position\\.', { parse_mode: 'MarkdownV2' });
        return;
      }

      const pending = alerts.getPendingExit(positionId);
      const position = wallet.getPositions().find(p => p.id === positionId);
      if (!position) {
        bot.sendMessage(chatId, '⚠️ Position not found \\(already closed?\\)\\.', { parse_mode: 'MarkdownV2' });
        return;
      }

      const closePrice = pending?.currentPrice ?? position.currentPrice ?? position.entryPrice;

      try {
        if (action === 'half') {
          const result  = wallet.closeHalfPosition(positionId, closePrice, 'manual_half');
          const partial = result.partial ?? result;
          const pnl     = partial.pnl ?? 0;
          alerts.pendingExits.delete(positionId);
          bot.sendMessage(chatId, `📊 Closed half\\. PnL: ${pnl >= 0 ? '\\+' : ''}$${pnl.toFixed(2)}`, { parse_mode: 'MarkdownV2' });
        } else {
          const closed = wallet.closePosition(positionId, closePrice, 'manual');
          const pnl    = closed.pnl;
          alerts.pendingExits.delete(positionId);
          reply(chatId, msgs.resolvedMessage(closed, pnl > 0));
        }
      } catch (err) {
        bot.sendMessage(chatId, `❌ Failed to close: ${err.message}`);
      }
    }
  });

  bot.on('polling_error', err => console.error(`[bot] Polling error: ${err.message}`));
  console.log('[bot] Telegram bot started ✅');
  return bot;
}

module.exports = { createBot, isPaused, registerScanners };
