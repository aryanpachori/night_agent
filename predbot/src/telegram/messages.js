'use strict';

/**
 * Format all outgoing Telegram message types.
 * Returns { text, reply_markup } objects ready to pass to bot.sendMessage().
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmt(n, decimals = 2) {
  return Number(n).toFixed(decimals);
}
function fmtUSD(n) {
  return `$${fmt(Math.abs(n))}`;
}
function fmtPct(n) {
  return `${fmt(n * 100, 1)}%`;
}
function pnlSign(n) {
  return n >= 0 ? '+' : '-';
}

// ─── Message 1: New Opportunity ───────────────────────────────────────────────
function opportunityMessage(market, estimate, evResult, kellyFraction, betAmount, balance) {
  const contracts = Math.floor(betAmount / market.yesPrice);
  const side = evResult.side;
  const entryPrice = evResult.effectivePrice;
  const payout = contracts;
  const maxLoss = betAmount;
  const afterBalance = balance - betAmount;

  const text = `🎯 *NEW OPPORTUNITY FOUND*

📌 *${escapeMarkdown(market.question)}*
🏷️ Category: ${market.category}
💰 Volume: $${Math.round(market.volumeUsd).toLocaleString()}
⏰ Closes: ${market.closeTime?.toDateString?.()} (${market.daysLeft} days)

📊 Market price:   ${fmt(market.yesPrice * 100, 1)}¢ (crowd: ${fmtPct(market.yesPrice)})
🤖 My estimate:    ${fmtPct(estimate.probability)} chance
📈 Edge:           +${fmtPct(estimate.probability - market.yesPrice)}
💡 EV per $1:      +$${fmt(evResult.ev, 3)}

📰 *Key factors:*
${estimate.keyFactors.map(f => `  • ${escapeMarkdown(f)}`).join('\n') || '  • (none identified)'}

🤖 Reasoning: _${escapeMarkdown(estimate.reasoning)}_

💵 Suggested bet:  ${fmtUSD(betAmount)} USDC (${contracts} contracts @ ${fmt(entryPrice * 100, 1)}¢)
📤 Payout if win:  ${fmtUSD(payout)}
📉 Max loss:       ${fmtUSD(maxLoss)}
📊 Confidence:     ${estimate.confidence.toUpperCase()}
💼 Bankroll after: ${fmtUSD(afterBalance)}`;

  const reply_markup = {
    inline_keyboard: [
      [
        { text: `✅ BET ${side} (full)`, callback_data: `opportunity:${market.id}:${side}:full` },
        { text: `🔄 BET ${side} (half)`, callback_data: `opportunity:${market.id}:${side}:half` },
      ],
      [
        { text: `❌ SKIP`, callback_data: `opportunity:${market.id}:skip` },
      ],
    ],
  };

  return { text, reply_markup, parse_mode: 'Markdown' };
}

// ─── Message 2: Exit Opportunity (take profit) ────────────────────────────────
function exitOpportunityMessage(position, currentPrice, newEstimate) {
  const priceDiff = currentPrice - position.entryPrice;
  const currentProfit = (position.contracts * currentPrice) - position.totalCost;
  const maxProfit = position.potentialProfit;

  const text = `🚀 *EXIT OPPORTUNITY — TAKE PROFIT*

📌 *${escapeMarkdown(position.marketQuestion)}*
📈 You bought *${position.side}* at ${fmt(position.entryPrice * 100, 1)}¢
📈 Current price: ${fmt(currentPrice * 100, 1)}¢ (+${fmt(priceDiff * 100, 1)}¢)

💰 If you exit NOW:  ${pnlSign(currentProfit)}${fmtUSD(currentProfit)}
🎯 If resolves ${position.side}: +${fmtUSD(maxProfit)}
⚠️ If price falls back: could return to entry or $0

🤖 New estimate: ${newEstimate ? fmtPct(newEstimate.probability) : 'N/A'}
${newEstimate ? `🤖 Reasoning: _${escapeMarkdown(newEstimate.reasoning)}_` : ''}`;

  const reply_markup = {
    inline_keyboard: [
      [
        { text: `💰 EXIT NOW ${pnlSign(currentProfit)}${fmtUSD(currentProfit)}`, callback_data: `exit:${position.id}:full` },
        { text: `📊 EXIT HALF`, callback_data: `exit:${position.id}:half` },
      ],
      [
        { text: `⏳ HOLD`, callback_data: `exit:${position.id}:hold` },
      ],
    ],
  };

  return { text, reply_markup, parse_mode: 'Markdown' };
}

// ─── Message 3: Stop Loss Alert ───────────────────────────────────────────────
function stopLossMessage(position, currentPrice, newEstimate) {
  const priceDiff = position.entryPrice - currentPrice;
  const currentLoss = position.totalCost - (position.contracts * currentPrice);

  const text = `🛑 *STOP LOSS ALERT*

📌 *${escapeMarkdown(position.marketQuestion)}*
📉 You bought *${position.side}* at ${fmt(position.entryPrice * 100, 1)}¢
📉 Current price: ${fmt(currentPrice * 100, 1)}¢ (-${fmt(priceDiff * 100, 1)}¢)

💸 Current loss: -${fmtUSD(currentLoss)}
🛑 Stop loss triggered (-12¢ threshold)

🤖 New analysis: _${newEstimate ? escapeMarkdown(newEstimate.reasoning) : 'N/A'}_
📊 New estimate: ${newEstimate ? fmtPct(newEstimate.probability) : 'N/A'} (was ${fmtPct(position.myEstimatedProbability)})`;

  const reply_markup = {
    inline_keyboard: [
      [
        { text: `🛑 EXIT NOW -${fmtUSD(currentLoss)}`, callback_data: `exit:${position.id}:full` },
        { text: `⏳ HOLD ANYWAY`, callback_data: `exit:${position.id}:hold` },
      ],
    ],
  };

  return { text, reply_markup, parse_mode: 'Markdown' };
}

// ─── Message 4: Daily Summary ─────────────────────────────────────────────────
function dailySummaryMessage(stats, closedToday) {
  const { brierGrade } = require('../math/brierScore');
  const wonToday = closedToday.filter(p => p.pnl > 0);
  const lostToday = closedToday.filter(p => p.pnl <= 0);
  const wonAmt = wonToday.reduce((s, p) => s + p.pnl, 0);
  const lostAmt = lostToday.reduce((s, p) => s + Math.abs(p.pnl), 0);
  const bestBet = closedToday.length > 0
    ? closedToday.reduce((best, p) => (p.pnl > (best?.pnl ?? -Infinity) ? p : best), null)
    : null;

  const text = `📊 *DAILY SUMMARY — ${new Date().toDateString()}*

💼 Paper Wallet Balance: ${fmtUSD(stats.balance)} USDC
📈 Total PnL: ${pnlSign(stats.totalPnl)}${fmtUSD(stats.totalPnl)}
📊 vs Starting $1000: ${stats.roi >= 0 ? '+' : ''}${stats.roi}%

Active positions: ${stats.openCount}
Closed today: ${closedToday.length}
  ✅ Won: ${wonToday.length} (+${fmtUSD(wonAmt)})
  ❌ Lost: ${lostToday.length} (-${fmtUSD(lostAmt)})

🎯 *Accuracy stats:*
  Win rate: ${stats.winRate}%
  Avg edge found: ${stats.avgEdge}%
  Brier score: ${stats.brierScore !== null ? fmt(stats.brierScore, 4) : 'N/A'} ${brierGrade(stats.brierScore)}

${bestBet ? `Best bet today: _${escapeMarkdown(bestBet.marketQuestion.slice(0, 60))}_ (+${fmtUSD(bestBet.pnl)})` : ''}`;

  return { text, parse_mode: 'Markdown' };
}

// ─── Misc messages ────────────────────────────────────────────────────────────
function startMessage(balance) {
  return {
    text: `👋 *PredBot is online!*

📊 Paper wallet: ${fmtUSD(balance)} USDC
🔍 Scanning Jupiter prediction markets...

Commands:
/balance — wallet balance
/positions — open positions
/history — closed positions + PnL
/stats — performance stats
/pause — pause scanning
/resume — resume scanning`,
    parse_mode: 'Markdown',
  };
}

function balanceMessage(stats) {
  return {
    text: `💼 *Paper Wallet*

Balance: ${fmtUSD(stats.balance)} USDC
Total PnL: ${pnlSign(stats.totalPnl)}${fmtUSD(stats.totalPnl)} (${stats.roi >= 0 ? '+' : ''}${stats.roi}% ROI)
Open positions: ${stats.openCount}
Closed: ${stats.closedCount} (${stats.wonCount} wins / ${stats.lostCount} losses)`,
    parse_mode: 'Markdown',
  };
}

function positionsMessage(positions) {
  if (positions.length === 0) {
    return { text: '📭 No open positions.', parse_mode: 'Markdown' };
  }
  const lines = positions.map((p, i) => {
    const unrealised = p.contracts * (p.currentPrice ?? p.entryPrice) - p.totalCost;
    return `${i + 1}. *${p.side}* ${escapeMarkdown(p.marketQuestion.slice(0, 50))}
   Entry: ${fmt(p.entryPrice * 100, 1)}¢ | Now: ${fmt((p.currentPrice ?? p.entryPrice) * 100, 1)}¢
   Unrealised: ${pnlSign(unrealised)}${fmtUSD(unrealised)} | ${p.contracts} contracts`;
  });
  return { text: `📊 *Open Positions (${positions.length})*\n\n${lines.join('\n\n')}`, parse_mode: 'Markdown' };
}

function historyMessage(closed) {
  if (closed.length === 0) {
    return { text: '📭 No closed positions yet.', parse_mode: 'Markdown' };
  }
  const lines = closed.slice(-10).map((p, i) => {
    return `${i + 1}. *${p.side}* ${escapeMarkdown(p.marketQuestion.slice(0, 45))}
   ${pnlSign(p.pnl)}${fmtUSD(p.pnl)} | ${p.exitReason} | ${new Date(p.closedAt).toLocaleDateString()}`;
  });
  const totalPnl = closed.reduce((s, p) => s + (p.pnl || 0), 0);
  return {
    text: `📋 *Closed Positions (last 10 of ${closed.length})*\n\n${lines.join('\n\n')}\n\n*Total PnL: ${pnlSign(totalPnl)}${fmtUSD(totalPnl)}*`,
    parse_mode: 'Markdown',
  };
}

function statsMessage(stats) {
  const { brierGrade } = require('../math/brierScore');
  return {
    text: `📈 *Bot Performance*

Balance: ${fmtUSD(stats.balance)} USDC
Total PnL: ${pnlSign(stats.totalPnl)}${fmtUSD(stats.totalPnl)} (${stats.roi}% ROI)

Trades: ${stats.closedCount} closed
Win rate: ${stats.winRate}%
Avg edge: ${stats.avgEdge}%

Brier score: ${stats.brierScore !== null ? fmt(stats.brierScore, 4) : 'N/A'} ${brierGrade(stats.brierScore)}`,
    parse_mode: 'Markdown',
  };
}

function confirmBetMessage(position) {
  return {
    text: `✅ *Bet Placed (Paper)*

${position.side} on: _${escapeMarkdown(position.marketQuestion)}_
Contracts: ${position.contracts} @ ${fmt(position.entryPrice * 100, 1)}¢
Cost: ${fmtUSD(position.totalCost)}
Max payout: ${fmtUSD(position.potentialPayout)}
Max profit: +${fmtUSD(position.potentialProfit)}`,
    parse_mode: 'Markdown',
  };
}

function confirmExitMessage(position, proceeds) {
  const pnl = proceeds - position.totalCost;
  return {
    text: `${pnl >= 0 ? '✅' : '❌'} *Position Closed (Paper)*

${position.side} on: _${escapeMarkdown(position.marketQuestion)}_
Exit @ ${fmt((position.closePrice ?? 0) * 100, 1)}¢
PnL: ${pnlSign(pnl)}${fmtUSD(pnl)}
Reason: ${position.exitReason}`,
    parse_mode: 'Markdown',
  };
}

// ─── Utility ──────────────────────────────────────────────────────────────────
function escapeMarkdown(text) {
  return String(text || '').replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

module.exports = {
  opportunityMessage,
  exitOpportunityMessage,
  stopLossMessage,
  dailySummaryMessage,
  startMessage,
  balanceMessage,
  positionsMessage,
  historyMessage,
  statsMessage,
  confirmBetMessage,
  confirmExitMessage,
  escapeMarkdown,
};
