'use strict';

const DIV = '━━━━━━━━━━━━━━━━━━━━━━';

function fmt(n, d = 2)  { return Number(n).toFixed(d); }
function usd(n)          { return `$${fmt(Math.abs(n))}`; }
function pct(n)          { return `${fmt(n * 100, 1)}%`; }
function sign(n)         { return n >= 0 ? '+' : '-'; }
function esc(t)          { return String(t || '').replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&'); }

// ─── Startup ──────────────────────────────────────────────────────────────────
function startupMessage(balance) {
  return `🌙 *Night Agent Online* ✅\n${DIV}\n💼 Balance: ${usd(balance)} USDC\n📊 Scanning: Crypto markets\n🧠 LLM: Gemini 2\\.0 Flash\n⚡ TA: Bollinger Bands \\+ MA \\+ RSI\n${DIV}\nType /help for commands`;
}

// ─── Help ─────────────────────────────────────────────────────────────────────
function helpMessage() {
  return `🌙 *Night Agent — Commands*\n${DIV}\n/balance — wallet balance & PnL\n/positions — open positions\n/history — last 10 closed positions\n/stats — performance stats\n/markets — show available crypto markets\n/scan — trigger a fresh scan now\n/pause — pause scanning\n/resume — resume scanning\n/ping — health check\n${DIV}\n*Natural language:*\n• "show markets"\n• "should I bet on BTC 100k?"\n• "analyse Rory McIlroy"\n• "my balance" / "open positions"\n${DIV}\n*Alerts:* tap ✅ BET or ❌ SKIP\n*Exit alerts:* tap 💰 EXIT or ⏳ HOLD`;
}

// ─── Balance ──────────────────────────────────────────────────────────────────
function balanceMessage(stats) {
  return `💼 *Paper Wallet*\n${DIV}\nBalance: ${usd(stats.balance)} USDC\nTotal PnL: ${sign(stats.totalPnl)}${usd(stats.totalPnl)} \\(${stats.roi >= 0 ? '\\+' : ''}${stats.roi}% ROI\\)\nOpen: ${stats.openCount} \\| Closed: ${stats.closedCount}\nWins: ${stats.wonCount} \\| Losses: ${stats.lostCount}`;
}

// ─── Positions ────────────────────────────────────────────────────────────────
function positionsMessage(positions) {
  if (positions.length === 0) return '📭 No open positions\\.';
  const lines = positions.map((p, i) => {
    const unreal = p.contracts * (p.currentPrice ?? p.entryPrice) - p.totalCost;
    return `${i + 1}\\. *${p.side}* ${esc(p.marketQuestion.slice(0, 50))}\n   Entry: ${fmt(p.entryPrice * 100, 1)}¢ → Now: ${fmt((p.currentPrice ?? p.entryPrice) * 100, 1)}¢\n   Unrealised: ${sign(unreal)}${usd(unreal)} \\| ${p.contracts} contracts`;
  });
  return `📊 *Open Positions \\(${positions.length}\\)*\n${DIV}\n${lines.join('\n\n')}`;
}

// ─── History ──────────────────────────────────────────────────────────────────
function historyMessage(closed) {
  if (closed.length === 0) return '📭 No closed positions yet\\.';
  const lines = closed.slice(-10).map((p, i) =>
    `${i + 1}\\. *${p.side}* ${esc(p.marketQuestion.slice(0, 45))}\n   ${sign(p.pnl)}${usd(p.pnl)} \\| ${esc(p.exitReason)} \\| ${new Date(p.closedAt).toLocaleDateString()}`
  );
  const total = closed.reduce((s, p) => s + (p.pnl || 0), 0);
  return `📋 *Closed Positions \\(last 10 of ${closed.length}\\)*\n${DIV}\n${lines.join('\n\n')}\n${DIV}\n*Total PnL: ${sign(total)}${usd(total)}*`;
}

// ─── Stats ────────────────────────────────────────────────────────────────────
function statsMessage(stats) {
  const { brierGrade } = require('../math/brierScore');
  return `📈 *Performance*\n${DIV}\nBalance: ${usd(stats.balance)} USDC\nPnL: ${sign(stats.totalPnl)}${usd(stats.totalPnl)} \\(${stats.roi}% ROI\\)\n\nTrades: ${stats.closedCount} closed\nWin rate: ${stats.winRate}%\nAvg edge: ${stats.avgEdge}%\nBrier: ${stats.brierScore !== null ? fmt(stats.brierScore, 4) : 'N/A'} ${esc(brierGrade(stats.brierScore))}`;
}

// ─── Markets list ─────────────────────────────────────────────────────────────
function marketsMessage(markets) {
  if (!markets || markets.length === 0) return '📭 No crypto markets available right now\\.';
  const lines = markets.slice(0, 15).map((m, i) => {
    const yPct = fmt(m.yesPrice * 100, 1);
    const vol  = m.volumeUsd > 0 ? `$${m.volumeUsd.toFixed(2)}` : '$0';
    return `${i + 1}\\. ${esc(m.question.slice(0, 55))}\n   YES: *${yPct}¢* \\| Vol: ${vol} \\| ${m.daysLeft}d left`;
  });
  return `🔍 *Available Crypto Markets \\(${markets.length} found\\)*\n${DIV}\n${lines.join('\n\n')}\n${DIV}\n_Scanning these every ${process.env.SCAN_INTERVAL_MINUTES || 5} min for edge_`;
}

// ─── Opportunity ──────────────────────────────────────────────────────────────
function opportunityMessage(market, analysis, kelly) {
  const { betAmount, contracts, entryPrice, halfBetAmount, halfContracts } = kelly;
  const edge = analysis.probability - market.yesPrice;
  const ev   = (analysis.probability * (1 - market.yesPrice)) - ((1 - analysis.probability) * market.yesPrice);

  return `🎯 *NEW OPPORTUNITY*\n${DIV}\n📌 ${esc(market.question)}\n⏰ ${market.daysLeft} days \\| Vol: $${fmt(market.volumeUsd, 2)}\n${DIV}\n📊 Market price:  *${fmt(market.yesPrice * 100, 1)}¢* \\(crowd: ${pct(market.yesPrice)}\\)\n🤖 My estimate:   *${pct(analysis.probability)}* chance\n📈 Edge:          *\\+${pct(edge)}*\n💡 EV per $1:     \\+${fmt(ev, 3)}\n📊 Confidence:    ${esc(analysis.confidence.toUpperCase())}\n${DIV}\n📰 _${esc(analysis.reasoning)}_\n${DIV}\n💵 Full bet: *${usd(betAmount)}* \\(${contracts} contracts @ ${fmt(entryPrice * 100, 1)}¢\\)\n💵 Half bet: *${usd(halfBetAmount)}* \\(${halfContracts} contracts\\)`;
}

// ─── Bet confirmed ────────────────────────────────────────────────────────────
function betConfirmedMessage(position) {
  return `✅ *Bet Placed \\(Paper\\)*\n${DIV}\n${position.side} on: _${esc(position.marketQuestion)}_\nContracts: ${position.contracts} @ ${fmt(position.entryPrice * 100, 1)}¢\nCost: ${usd(position.totalCost)}\nMax payout: ${usd(position.potentialPayout)}\nMax profit: \\+${usd(position.potentialProfit)}`;
}

// ─── Exit opportunity ─────────────────────────────────────────────────────────
function exitOpportunityMessage(position, currentPrice, profit) {
  const diff = currentPrice - position.entryPrice;
  return `🚀 *EXIT OPPORTUNITY — TAKE PROFIT*\n${DIV}\n📌 ${esc(position.marketQuestion)}\n📈 ${position.side} @ ${fmt(position.entryPrice * 100, 1)}¢ → now *${fmt(currentPrice * 100, 1)}¢* \\(\\+${fmt(diff * 100, 1)}¢\\)\n${DIV}\n💰 Exit now: *${sign(profit)}${usd(profit)}*\n🎯 If resolves: \\+${usd(position.potentialProfit)}`;
}

// ─── Stop loss ────────────────────────────────────────────────────────────────
function stopLossMessage(position, currentPrice, loss) {
  const diff = position.entryPrice - currentPrice;
  return `🛑 *STOP LOSS ALERT*\n${DIV}\n📌 ${esc(position.marketQuestion)}\n📉 ${position.side} @ ${fmt(position.entryPrice * 100, 1)}¢ → now *${fmt(currentPrice * 100, 1)}¢* \\(\\-${fmt(diff * 100, 1)}¢\\)\n💸 Current loss: *\\-${usd(loss)}*`;
}

// ─── Resolved ─────────────────────────────────────────────────────────────────
function resolvedMessage(position, won) {
  const pnl = position.pnl || 0;
  return `🏁 *Market Resolved*\n${DIV}\n_${esc(position.marketQuestion)}_\nYour bet: *${position.side}* — ${won ? '✅ WON' : '❌ LOST'}\nPnL: ${sign(pnl)}$${Math.abs(pnl).toFixed(2)}`;
}

// ─── Daily summary ────────────────────────────────────────────────────────────
function dailySummaryMessage(walletModule) {
  const { brierGrade } = require('../math/brierScore');
  const stats      = walletModule.getStats ? walletModule.getStats() : walletModule;
  const closedToday = walletModule.getClosedToday ? walletModule.getClosedToday() : [];
  const won  = closedToday.filter(p => p.pnl > 0);
  const lost = closedToday.filter(p => p.pnl <= 0);
  const wonAmt  = won.reduce((s, p) => s + p.pnl, 0);
  const lostAmt = lost.reduce((s, p) => s + Math.abs(p.pnl), 0);
  const best = closedToday.length > 0
    ? closedToday.reduce((b, p) => p.pnl > (b?.pnl ?? -Infinity) ? p : b, null)
    : null;
  return `📊 *DAILY SUMMARY — ${esc(new Date().toDateString())}*\n${DIV}\n💼 Balance: ${usd(stats.balance)} USDC\nTotal PnL: ${sign(stats.totalPnl)}${usd(stats.totalPnl)}\nROI: ${stats.roi >= 0 ? '\\+' : ''}${stats.roi}%\n${DIV}\nClosed today: ${closedToday.length}\n  ✅ Won: ${won.length} \\(\\+${usd(wonAmt)}\\)\n  ❌ Lost: ${lost.length} \\(\\-${usd(lostAmt)}\\)\n${DIV}\nWin rate: ${stats.winRate}%\nAvg edge: ${stats.avgEdge}%\nBrier: ${stats.brierScore !== null ? fmt(stats.brierScore, 4) : 'N/A'} ${esc(brierGrade(stats.brierScore))}${best ? `\n${DIV}\n🏆 Best: _${esc(best.marketQuestion.slice(0, 60))}_ \\(\\+${usd(best.pnl)}\\)` : ''}`;
}

module.exports = {
  startupMessage, helpMessage, balanceMessage, positionsMessage,
  historyMessage, statsMessage, marketsMessage, opportunityMessage,
  betConfirmedMessage, exitOpportunityMessage, stopLossMessage,
  resolvedMessage, dailySummaryMessage, esc, usd, fmt, sign,
};
