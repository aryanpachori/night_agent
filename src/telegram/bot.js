'use strict';

const TelegramBot = require('node-telegram-bot-api');
const alerts      = require('./alerts');
const msgs        = require('./messages');
const wallet      = require('../wallet/paperWallet');
const { calculateKelly, kellyToDollars } = require('../math/kelly');
const { calculateEdge, calculateEV }     = require('../math/expectedValue');
const { estimateProbability }            = require('../llm/probabilityEstimator');
const { fetchMarket }                  = require('../scanner/marketScanner');

let scannerPaused = false;
function isPaused() { return scannerPaused; }

// Injected from index.js so the /markets command can call the scanner
let _scanMarketsFunc  = null;
let _runScanFunc      = null;
let _runMoreFunc      = null;
function registerScanners(scanFn, runFn, moreFn) {
  _scanMarketsFunc = scanFn;
  _runScanFunc     = runFn;
  _runMoreFunc     = moreFn || null;
}

function wantsAddMoreBet(text) {
  const t = text.toLowerCase();
  return /\b(add more|top up|increase (?:my )?bet|double down|bigger bet|more contracts|size up)\b/.test(t);
}

/** Natural language: user is asking about an open bet \\(not just listing positions\\). */
function wantsPositionInsight(text) {
  const t = text.toLowerCase();
  if (wantsAddMoreBet(t)) return true;
  if (/\b(when|what time|how long until|days until|closing|closes|expires|expire|resolve|resolution|deadline|ends?)\b/.test(t) && /\b(bet|position|trade|market|event|outcome)\b/.test(t)) return true;
  if (/\b(volume|liquidity|vol)\b/.test(t) && /\b(bet|position|market|event|my|this)\b/.test(t)) return true;
  if (/\b(status|snapshot|update)\b/.test(t) && /\b(bet|position|market|event)\b/.test(t)) return true;
  if (/\b(chance|chances|odds|probability|win|winning|likelihood)\b/.test(t) && /\b(my|i|me|this)\b/.test(t)) return true;
  if (/\bhow\s+(am\s+i|is\s+my|are\s+my)\b/.test(t) && /\b(bet|position|trade|win|pnl|prediction|market|event|stack)\b/.test(t)) return true;
  if (/\bhow\s+(is|are)\s+my\s+(bet|position|trade)/.test(t)) return true;
  if (/\bwhat\s+(is|are)\s+(the\s+)?(current\s+)?(status|odds|chance|probability)\b/.test(t)) return true;
  if (/\bwhat\s+do\s+you\s+think\b/.test(t)) return true;
  if (/\b(my|our)\s+(win|chance|probability|odds|percent)\b/.test(t)) return true;
  if (/\b(am\s+i|will\s+i)\s+(winning|win)\b/.test(t)) return true;
  if (/\bwin\s*(%|percent|chance)\b/.test(t) && /\b(my|i|me|this)\b/.test(t)) return true;
  if (/\b(status|snapshot)\b/.test(t) && /\b(bet|bets|position|positions|trade|event)\b/.test(t)) return true;
  if (/\b(bet|position|trade)\b.*\b(status|snapshot|odds|chance)\b/.test(t)) return true;
  if (/\b(unrealized|pnl)\b.*\b(bet|position)\b/.test(t)) return true;
  if (/\b(bet|position)\b.*\b(unrealized|pnl)\b/.test(t)) return true;
  if (/\bhow\s+much\s+(could\s+i|will\s+i|am\s+i)\s+(make|win|lose)\b/.test(t)) return true;
  if (/\b(current\s+)?situation\b.*\b(bet|position)\b/.test(t)) return true;
  return false;
}

function shouldUseLlmForInsight(text) {
  if (process.env.CHAT_POSITION_LLM === '0') return false;
  const t = text.toLowerCase();
  if (/\b(think|thought|opinion|percent|probability|chance|chances|estimate|odds|likely|model|fresh|llm)\b/.test(t)) return true;
  if (/\bwhat\s+do\s+you\s+think\b/.test(t)) return true;
  if (/\bwhat.*\b(my|the)\s+(win|chance|chances|probability|odds)\b/.test(t)) return true;
  if (/\bhow\s+likely\b/.test(t)) return true;
  if (/\b(winning|win)\b/.test(t) && /\b(chance|chances|odds|probability)\b/.test(t)) return true;
  return false;
}

function buildMarketForLlm(position, marketSnap) {
  const closeMs = marketSnap.closeTime instanceof Date ? marketSnap.closeTime.getTime() : Date.now() + 7 * 86_400_000;
  const daysLeft = Math.max(0, Math.round((closeMs - Date.now()) / 86_400_000));
  return {
    id:           position.marketId,
    question:     position.marketQuestion,
    eventTitle:   position.eventTitle,
    outcomeTitle: position.outcomeTitle,
    yesPrice:     marketSnap.yesPrice,
    noPrice:      marketSnap.noPrice,
    daysLeft,
    closeTime:    new Date(closeMs),
    volumeUsd:    marketSnap.volumeUsd ?? 0,
    category:     'crypto',
  };
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

  /** Close at Jupiter’s current bid side price \\(manual partial exit\\). */
  async function executeManualExit(positionId, action) {
    const position = wallet.getPositions().find(p => p.id === positionId);
    if (!position) throw new Error('Position not found');

    const market = await fetchMarket(position.marketId);
    if (!market) throw new Error('Could not fetch market');

    const closePrice = position.side === 'YES' ? market.yesPrice : market.noPrice;
    wallet.updatePositionPrice(positionId, closePrice);

    if (action === 'half') {
      const result = wallet.closeHalfPosition(positionId, closePrice, 'manual_half');
      const partial = result.partial ?? result;
      return { kind: 'half', partial, pnl: partial.pnl ?? 0 };
    }
    const closed = wallet.closePosition(positionId, closePrice, 'manual');
    return { kind: 'full', closed, pnl: closed.pnl ?? 0 };
  }

  async function handlePositionInsight(msg, options = {}) {
    const text = (msg.text || '').trim().toLowerCase();
    const useLLM = options.llm !== undefined ? options.llm : shouldUseLlmForInsight(text);
    const addMoreHint = 'addMoreHint' in options ? options.addMoreHint : wantsAddMoreBet(msg.text || '');

    const positions = wallet.getPositions();
    if (!positions.length) {
      if (wantsAddMoreBet(msg.text || '')) {
        reply(msg.chat.id, msgs.addMoreBetHelpMessage());
        return;
      }
      reply(msg.chat.id, msgs.noOpenPositionsInsightMessage());
      return;
    }

    let chosen = positions;
    if (positions.length > 1) {
      const match = positions.find(p => {
        const ev  = (p.eventTitle || '').toLowerCase();
        const ou  = (p.outcomeTitle || '').toLowerCase();
        const mq  = (p.marketQuestion || '').toLowerCase();
        const words = text.split(/\s+/).filter(w => w.length > 4);
        return (
          (ev.length > 5 && text.includes(ev.slice(0, Math.min(40, ev.length)))) ||
          (ou.length > 2 && text.includes(ou.slice(0, Math.min(24, ou.length)))) ||
          words.some(w => mq.includes(w))
        );
      });
      if (match) chosen = [match];
    }
    if (chosen.length > 2) chosen = chosen.slice(0, 2);

    await bot.sendChatAction(msg.chat.id, 'typing').catch(() => {});

    for (const p of chosen) {
      let marketSnap = null;
      try {
        marketSnap = await fetchMarket(p.marketId);
      } catch (err) {
        console.warn(`[bot] fetchMarket ${p.marketId}: ${err.message}`);
      }

      let fresh = null;
      if (useLLM && marketSnap) {
        try {
          fresh = await estimateProbability(buildMarketForLlm(p, marketSnap));
        } catch (err) {
          console.warn(`[bot] Insight LLM: ${err.message}`);
        }
      }

      if (marketSnap) {
        const cur = p.side === 'YES' ? marketSnap.yesPrice : marketSnap.noPrice;
        wallet.updatePositionPrice(p.id, cur);
      }

      const insightText = msgs.positionInsightMessage(p, marketSnap, fresh, { addMoreHint });
      const cur = marketSnap
        ? (p.side === 'YES' ? marketSnap.yesPrice : marketSnap.noPrice)
        : (p.currentPrice ?? p.entryPrice);
      const unreal = p.contracts * cur - p.totalCost;
      const extra = {};
      if (marketSnap && msgs.shouldOfferManualExit(unreal)) {
        extra.reply_markup = { inline_keyboard: [msgs.manualExitKeyboardRow(p.id, null)] };
      }
      reply(msg.chat.id, insightText, extra);
    }
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

  async function sendLivePositionsList(chatId) {
    const positions = wallet.getPositions();
    if (positions.length === 0) {
      reply(chatId, msgs.positionsMessage([]));
      return;
    }

    const snapshots = await Promise.all(
      positions.map(p => fetchMarket(p.marketId).catch(() => null)),
    );

    const lines = positions.map((p, i) => {
      const snap = snapshots[i];
      const cur  = snap ? (p.side === 'YES' ? snap.yesPrice : snap.noPrice) : (p.currentPrice ?? p.entryPrice);
      if (snap) wallet.updatePositionPrice(p.id, cur);
      const unreal = p.contracts * cur - p.totalCost;
      const title  = p.eventTitle && p.outcomeTitle && p.eventTitle !== p.outcomeTitle
        ? `${msgs.escFull(p.eventTitle)} -> ${msgs.escFull(p.outcomeTitle)}`
        : msgs.escFull(p.marketQuestion);
      const closeCt = snap?.closeTime ?? (p.closeTime ? new Date(p.closeTime) : null);
      const volV    = snap?.volumeUsd ?? p.volumeUsdAtEntry;
      const timing  = (closeCt || volV != null)
        ? `\n   ${msgs.eventTimingVolumeLine({
            closeTime: closeCt || undefined,
            daysLeft: closeCt ? msgs.daysLeftFromClose(closeCt) : null,
            volumeUsd: volV,
          })}`
        : '';
      return `${i + 1}\\. *${p.side}*\n   ${title}\n   Entry: ${msgs.escFmt(p.entryPrice * 100, 1)}¢ → Now: ${msgs.escFmt(cur * 100, 1)}¢\n   Unrealised: ${msgs.esc(msgs.sign(unreal) + msgs.usd(unreal))} \\| ${p.contracts} contracts${timing}`;
    });

    const fullText = `*Open positions \\(${positions.length}\\)*\n${msgs.DIV}\n${lines.join('\n\n')}`;

    const keyboardRows = [];
    positions.forEach((p, i) => {
      const snap = snapshots[i];
      if (!snap) return;
      const cur = p.side === 'YES' ? snap.yesPrice : snap.noPrice;
      const unreal = p.contracts * cur - p.totalCost;
      if (msgs.shouldOfferManualExit(unreal)) {
        keyboardRows.push(msgs.manualExitKeyboardRow(p.id, i + 1));
      }
    });

    const payload = { parse_mode: 'MarkdownV2' };
    if (keyboardRows.length > 0) payload.reply_markup = { inline_keyboard: keyboardRows };
    bot.sendMessage(chatId, fullText, payload);
  }

  // ── /positions — live prices; Exit buttons when partially up/down ───────────
  bot.onText(/\/positions/, async msg => {
    if (!guard(msg)) return;
    await sendLivePositionsList(msg.chat.id);
  });

  // ── /status — live snapshot of open bets (no LLM; saves quota) ─────────────
  bot.onText(/\/status/, async msg => {
    if (!guard(msg)) return;
    await handlePositionInsight(msg, { llm: false });
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
    bot.sendMessage(msg.chat.id, 'Fetching markets…');
    try {
      const markets = _scanMarketsFunc
        ? await _scanMarketsFunc({ newOnly: false })
        : [];
      reply(msg.chat.id, msgs.marketsMessage(markets));
    } catch (err) {
      bot.sendMessage(msg.chat.id, `Error fetching markets: ${err.message}`);
    }
  });

  // ── /scan ──────────────────────────────────────────────────────────────────
  // Manually trigger a scan now
  bot.onText(/\/scan/, async msg => {
    if (!guard(msg)) return;
    bot.sendMessage(msg.chat.id, 'Running scan…');
    if (_runScanFunc) _runScanFunc().catch(() => {});
  });

  // ── /more — extra opportunities (bypasses focus cap, up to 2) ───────────────
  bot.onText(/\/more/, async msg => {
    if (!guard(msg)) return;
    bot.sendMessage(msg.chat.id, 'Looking for extra opportunities…');
    if (_runMoreFunc) await _runMoreFunc().catch(err => console.error('[bot] /more:', err.message));
  });

  // ── /pause & /resume ───────────────────────────────────────────────────────
  bot.onText(/\/pause/, msg => {
    if (!guard(msg)) return;
    scannerPaused = true;
    bot.sendMessage(msg.chat.id, 'Scanning paused\\. Send /resume to restart\\.', { parse_mode: 'MarkdownV2' });
  });

  bot.onText(/\/resume/, msg => {
    if (!guard(msg)) return;
    scannerPaused = false;
    bot.sendMessage(msg.chat.id, 'Scanning resumed\\.');
  });

  // ── /ping ──────────────────────────────────────────────────────────────────
  bot.onText(/\/ping/, msg => {
    if (!guard(msg)) return;
    bot.sendMessage(msg.chat.id, 'Pong\\. Night Agent is running\\.', { parse_mode: 'MarkdownV2' });
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

    // ── Chat: status / win% / "what do you think" on open bets ─────────────────
    if (wantsPositionInsight(text)) {
      await handlePositionInsight(msg);
      return;
    }

    // ── Positions — same live list as /positions ──────────────────────────────
    if (text.includes('position') || text.includes('open trade') || text.includes('my bet')) {
      await sendLivePositionsList(msg.chat.id);
      return;
    }

    // ── Stats ─────────────────────────────────────────────────────────────────
    if (text.includes('stat') || text.includes('performance') || text.includes('win rate')) {
      reply(msg.chat.id, msgs.statsMessage(wallet.getStats()));
      return;
    }

    // ── More opportunities (explicit) ───────────────────────────────────────
    if (text.includes('more') && (text.includes('opportunit') || text.includes('edge') || text.includes('pick'))) {
      bot.sendMessage(msg.chat.id, 'Looking for extra opportunities…');
      if (_runMoreFunc) await _runMoreFunc().catch(err => console.error('[bot] more:', err.message));
      return;
    }

    // ── Show markets ──────────────────────────────────────────────────────────
    if (text.includes('market') || text.includes('available') || text.includes('show') || text.includes('list')) {
      bot.sendMessage(msg.chat.id, 'Fetching crypto markets…');
      try {
        const markets = _scanMarketsFunc ? await _scanMarketsFunc({ newOnly: false }) : [];
        reply(msg.chat.id, msgs.marketsMessage(markets));
      } catch (err) {
        bot.sendMessage(msg.chat.id, `Error: ${esc(err.message)}`);
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
      bot.sendMessage(msg.chat.id, `Analysing "${esc(query)}"…`);

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
            `*Analysis* \\(no live market found\\)\n` +
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

        const timingLine = msgs.eventTimingVolumeLine(match);
        let responseText =
          `*Analysis: ${esc(match.question)}*\n` +
          `━━━━━━━━━━━━━━━━━━━━━━\n` +
          (timingLine ? `${timingLine}\n` : '') +
          `Market price: *${(match.yesPrice * 100).toFixed(1)}¢*\n` +
          `My estimate:  *${(estimate.probability * 100).toFixed(1)}%* YES\n` +
          `Edge: *${edge >= 0 ? '+' : ''}${(edge * 100).toFixed(1)}%*  \\|  EV: *${evResult.ev >= 0 ? '+' : ''}${evResult.ev.toFixed(3)}*\n` +
          `Confidence: ${esc(estimate.confidence.toUpperCase())}\n` +
          `━━━━━━━━━━━━━━━━━━━━━━\n` +
          `_${esc(estimate.reasoning)}_\n` +
          `━━━━━━━━━━━━━━━━━━━━━━\n`;

        if (hasEdge) {
          responseText +=
            `*BET ${side}* — Kelly suggests $${betAmt.toFixed(0)}\n` +
            `Tap the button to place it:`;

          estimate.side           = side;
          estimate.effectivePrice = evResult.effectivePrice;
          await alerts.sendOpportunityAlert(match, estimate, kelly, betAmt, balance);
        } else {
          responseText +=
            `*No bet* — edge ${(edge * 100).toFixed(1)}% is below ${((parseFloat(process.env.MIN_EDGE) || 0.08) * 100).toFixed(0)}% minimum\\.`;
          reply(msg.chat.id, responseText);
        }
      } catch (err) {
        bot.sendMessage(msg.chat.id, `Analysis failed: ${esc(err.message)}`);
      }
      return;
    }

    // ── Help / fallback ───────────────────────────────────────────────────────
    if (text.includes('help') || text.includes('command')) {
      reply(msg.chat.id, msgs.helpMessage());
      return;
    }

    bot.sendMessage(msg.chat.id,
      `Not sure what you mean\\. Try:\n` +
      `• /status — snapshot \\(end time, volume, odds, optional model\\)\n` +
      `• /positions\n` +
      `• /help`,
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
        alerts.pendingOpportunities.delete(marketId);
        wallet.markMarketAlerted(marketId);
        bot.sendMessage(chatId, 'Skipped\\.', { parse_mode: 'MarkdownV2' });
        return;
      }

      const pending = alerts.getPendingOpportunity(marketId);
      if (!pending) {
        bot.sendMessage(chatId, 'Opportunity expired or not found\\.');
        return;
      }
      if (Date.now() > pending.expiresAt) {
        bot.sendMessage(chatId, 'Opportunity expired \\(10 min\\)\\.', { parse_mode: 'MarkdownV2' });
        return;
      }

      const balance = wallet.getBalance();
      if (wallet.getOpenPositionCount() >= (parseInt(process.env.MAX_OPEN_POSITIONS) || 10)) {
        bot.sendMessage(chatId, `Max open positions reached\\.`);
        return;
      }
      if (balance < (parseFloat(process.env.MIN_BANKROLL) || 10)) {
        bot.sendMessage(chatId, `Balance too low \\($${balance.toFixed(2)}\\)\\.`, { parse_mode: 'MarkdownV2' });
        return;
      }

      let betAmount = size === 'half' ? pending.halfBetAmount : pending.betAmount;
      betAmount = Math.max(5, Math.round(betAmount * 100) / 100);

      try {
        const position = wallet.openPosition({
          marketId,
          marketQuestion: pending.market.question,
          eventTitle:     pending.market.eventTitle || '',
          outcomeTitle:   pending.market.outcomeTitle || '',
          side:           pending.analysis.side,
          entryPrice:     pending.entryPrice,
          betAmount,
          myEstimatedProbability: pending.analysis.probability,
          edge:           pending.edge,
          ev:             pending.ev,
          kellyFraction:  pending.kellyFraction,
          confidence:     pending.analysis.confidence,
          closeTime:      pending.market.closeTime ?? null,
          volumeUsd:      pending.market.volumeUsd ?? null,
        });
        wallet.markMarketAlerted(marketId);
        alerts.pendingOpportunities.delete(marketId);
        reply(chatId, msgs.betConfirmedMessage(position));
      } catch (err) {
        bot.sendMessage(chatId, `Failed to place bet: ${err.message}`);
      }
      return;
    }

    // ── manual_exit:{positionId}:{full|half} — partial PnL exit at live Jupiter price
    if (data.startsWith('manual_exit:')) {
      const [, positionId, action] = data.split(':');
      if (action !== 'full' && action !== 'half') return;
      try {
        const result = await executeManualExit(positionId, action);
        if (result.kind === 'half') {
          const pnl = result.pnl;
          bot.sendMessage(chatId, `Closed half\\. PnL: ${pnl >= 0 ? '\\+' : ''}$${pnl.toFixed(2)}`, { parse_mode: 'MarkdownV2' });
        } else {
          reply(chatId, msgs.manualExitClosedMessage(result.closed));
        }
      } catch (err) {
        bot.sendMessage(chatId, `Error: ${msgs.esc(err.message)}`, { parse_mode: 'MarkdownV2' });
      }
      return;
    }

    // ── exit:{positionId}:{action} ───────────────────────────────────────────
    if (data.startsWith('exit:')) {
      const [, positionId, action] = data.split(':');

      if (action === 'hold') {
        wallet.markPositionAlerted(positionId);
        alerts.pendingExits.delete(positionId);
        bot.sendMessage(chatId, 'Holding position\\.', { parse_mode: 'MarkdownV2' });
        return;
      }

      const pending = alerts.getPendingExit(positionId);
      const position = wallet.getPositions().find(p => p.id === positionId);
      if (!position) {
        bot.sendMessage(chatId, 'Position not found \\(already closed\\?\\)\\.', { parse_mode: 'MarkdownV2' });
        return;
      }

      const closePrice = pending?.currentPrice ?? position.currentPrice ?? position.entryPrice;

      try {
        if (action === 'half') {
          const result  = wallet.closeHalfPosition(positionId, closePrice, 'manual_half');
          const partial = result.partial ?? result;
          const pnl     = partial.pnl ?? 0;
          alerts.pendingExits.delete(positionId);
          bot.sendMessage(chatId, `Closed half\\. PnL: ${pnl >= 0 ? '\\+' : ''}$${pnl.toFixed(2)}`, { parse_mode: 'MarkdownV2' });
        } else {
          const closed = wallet.closePosition(positionId, closePrice, 'manual');
          alerts.pendingExits.delete(positionId);
          reply(chatId, msgs.manualExitClosedMessage(closed));
        }
      } catch (err) {
        bot.sendMessage(chatId, `Failed to close: ${err.message}`);
      }
    }
  });

  bot.on('polling_error', err => console.error(`[bot] Polling error: ${err.message}`));
  console.log('[bot] Telegram bot started');
  return bot;
}

module.exports = { createBot, isPaused, registerScanners };
