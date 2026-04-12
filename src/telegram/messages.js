'use strict';

const DIV = '━━━━━━━━━━━━━━━━━━━━━━';

function fmt(n, d = 2)  { return Number(n).toFixed(d); }
function usd(n)          { return `$${fmt(Math.abs(n))}`; }
function pct(n)          { return `${fmt(n * 100, 1)}%`; }
function sign(n)         { return n >= 0 ? '+' : '-'; }
function esc(t)          { return String(t || '').replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&'); }

/** Escaped full string for titles \\(no mid\\-word truncation\\). */
function escFull(s) {
  return esc(String(s ?? ''));
}

/** Short line for list views \\(Telegram max 4096 chars per message\\). */
function escShort(s, maxLen) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  if (t.length <= maxLen) return esc(t);
  return esc(t.slice(0, Math.max(0, maxLen - 1))) + '…';
}

/** MarkdownV2\\-safe UTC timestamp for chat */
function escDateUtc(d) {
  if (!d) return '…';
  const x = d instanceof Date ? d : new Date(d);
  if (isNaN(x.getTime())) return '…';
  return esc(x.toISOString().slice(0, 16).replace('T', ' ') + ' UTC');
}

function daysLeftFromClose(closeTime) {
  if (!closeTime) return null;
  const ms = closeTime instanceof Date ? closeTime.getTime() : new Date(closeTime).getTime();
  if (isNaN(ms)) return null;
  return Math.max(0, Math.round((ms - Date.now()) / 86_400_000));
}

/**
 * One line: end time \\+ days left \\+ optional volume \\(for opportunities / markets lists\\).
 * @param {{ closeTime?: Date|string, daysLeft?: number, volumeUsd?: number }} m
 */
function eventTimingVolumeLine(m) {
  if (!m) return '';
  const parts = [];
  if (m.closeTime) {
    const d = m.closeTime instanceof Date ? m.closeTime : new Date(m.closeTime);
    const dl = m.daysLeft != null ? m.daysLeft : daysLeftFromClose(d);
    const dls = dl != null ? esc(String(dl)) : '…';
    parts.push(`Ends \\~ ${escDateUtc(d)} \\(${dls}d left\\)`);
  }
  if (m.volumeUsd != null && Number.isFinite(Number(m.volumeUsd))) {
    parts.push(`Vol: ${escUsd(Number(m.volumeUsd))}`);
  }
  return parts.join(' \\| ');
}

/** Crowd\\-implied probability your side wins \\(buy price of that outcome token\\). */
function crowdImpliedSideWinPct(side, marketSnap) {
  if (!marketSnap) return null;
  const p = side === 'YES' ? marketSnap.yesPrice : marketSnap.noPrice;
  if (p == null || !Number.isFinite(p)) return null;
  return escPct(p);
}
/** MarkdownV2: numbers/currency from fmt/usd/pct contain `.` — must be escaped outside esc(text). */
function escFmt(n, d = 2) { return esc(fmt(n, d)); }
function escUsd(n)        { return esc(usd(n)); }
function escPct(n)        { return esc(pct(n)); }

// ─── Startup ──────────────────────────────────────────────────────────────────
function startupMessage(balance) {
  const cap = process.env.MAX_FOCUS_EVENTS || '2';
  return `*Night Agent online*\n${DIV}\nBalance: ${escUsd(balance)} USDC\nScanning crypto markets \\(focus: up to ${esc(String(cap))} pending \\+ open\\)\nSay *give me opportunities* or /scan for BET alerts \\| /status for open bets\nModel: Gemini Flash Lite \\| TA: EWMA vol \\+ BS \\+ momentum\n${DIV}\n/help for commands`;
}

function manualExitMinUnrealized() {
  const v = parseFloat(process.env.MANUAL_EXIT_MIN_UNREALIZED);
  return Number.isFinite(v) && v >= 0 ? v : 0.01;
}

/** Offer manual exit when unrealized is clearly not flat \\(partial profit or loss\\). */
function shouldOfferManualExit(unrealizedUsd) {
  return Math.abs(unrealizedUsd) >= manualExitMinUnrealized();
}

/** One row: full \\+ half for /positions or price ticks \\(index 1\\-based for label\\). */
function manualExitKeyboardRow(positionId, index1based) {
  const tag = index1based != null ? ` #${index1based}` : '';
  return [
    { text: `Exit${tag} full`, callback_data: `manual_exit:${positionId}:full` },
    { text: `Half${tag}`, callback_data: `manual_exit:${positionId}:half` },
  ];
}

// ─── Help ─────────────────────────────────────────────────────────────────────
function helpMessage() {
  return `*Night Agent — commands*\n${DIV}\n/balance — wallet balance \\& PnL\n/positions — open positions \\(live end time \\& vol; exit buttons when partially up/down\\)\n/status — snapshot of open bets\n/history — last 10 closed positions\n/stats — performance stats\n/markets — markets that pass the same opportunity filters as alerts \\(LLM; may take a minute\\)\n/scan / /opportunities — run edge scan; sends BET \\/ SKIP if a market passes filters\n/more — extra opportunities \\(same idea, focus rules\\)\n/pause — pause scanning\n/resume — resume scanning\n/ping — health check\n${DIV}\n*Focus mode:* up to *2* pending opportunities \\+ open bets\\. Auto\\-scan waits at the cap\\.\n${DIV}\n*Chat about your bets:*\n• when does this event end \\| what is the volume\n• chances of winning \\| current status\n• status of my bet \\| model win percent\n• how to add size\n${DIV}\n*Ask for bets:* "give me opportunities", "show me events", "what can I bet on" \\| same as /scan\n${DIV}\n*Natural language:* show markets \\(list only\\), more opportunities, should I bet on \\.\\.\\., balance, open positions\n${DIV}\n*Alerts:* BET \\/ SKIP; exit: EXIT \\/ HOLD; manual exit on /positions or /status when unrealized PnL meets threshold`;
}

// ─── Balance ──────────────────────────────────────────────────────────────────
function balanceMessage(stats) {
  return `*Paper wallet*\n${DIV}\nBalance: ${escUsd(stats.balance)} USDC\nTotal PnL: ${esc(sign(stats.totalPnl) + usd(stats.totalPnl))} \\(${stats.roi >= 0 ? '\\+' : ''}${esc(String(stats.roi))}% ROI\\)\nOpen: ${stats.openCount} \\| Closed: ${stats.closedCount}\nWins: ${stats.wonCount} \\| Losses: ${stats.lostCount}`;
}

// ─── Positions ────────────────────────────────────────────────────────────────
function positionsMessage(positions) {
  if (positions.length === 0) return 'No open positions\\.';
  const lines = positions.map((p, i) => {
    const unreal = p.contracts * (p.currentPrice ?? p.entryPrice) - p.totalCost;
    const title  = p.eventTitle && p.outcomeTitle && p.eventTitle !== p.outcomeTitle
      ? `${escFull(p.eventTitle)} -> ${escFull(p.outcomeTitle)}`
      : escFull(p.marketQuestion);
    const endLn = p.closeTime
      ? `\n   ${eventTimingVolumeLine({ closeTime: p.closeTime, volumeUsd: p.volumeUsdAtEntry })}`
      : '';
    return `${i + 1}\\. *${p.side}*\n   ${title}\n   Entry: ${escFmt(p.entryPrice * 100, 1)}¢ -> Now: ${escFmt((p.currentPrice ?? p.entryPrice) * 100, 1)}¢\n   Unrealised: ${esc(sign(unreal) + usd(unreal))} \\| ${p.contracts} contracts${endLn}`;
  });
  return `*Open positions \\(${positions.length}\\)*\n${DIV}\n${lines.join('\n\n')}`;
}

// ─── History ──────────────────────────────────────────────────────────────────
function historyMessage(closed) {
  if (closed.length === 0) return 'No closed positions yet\\.';
  const lines = closed.slice(-10).map((p, i) =>
    `${i + 1}\\. *${p.side}* ${escFull(p.marketQuestion)}\n   ${esc(sign(p.pnl) + usd(p.pnl))} \\| ${esc(p.exitReason)} \\| ${esc(new Date(p.closedAt).toLocaleDateString())}`
  );
  const total = closed.reduce((s, p) => s + (p.pnl || 0), 0);
  return `*Closed positions \\(last 10 of ${closed.length}\\)*\n${DIV}\n${lines.join('\n\n')}\n${DIV}\n*Total PnL: ${esc(sign(total) + usd(total))}*`;
}

// ─── Stats ────────────────────────────────────────────────────────────────────
function statsMessage(stats) {
  const { brierGrade } = require('../math/brierScore');
  return `*Performance*\n${DIV}\nBalance: ${escUsd(stats.balance)} USDC\nPnL: ${esc(sign(stats.totalPnl) + usd(stats.totalPnl))} \\(${esc(String(stats.roi))}% ROI\\)\n\nTrades: ${stats.closedCount} closed\nWin rate: ${esc(String(stats.winRate))}%\nAvg edge: ${esc(String(stats.avgEdge))}%\nBrier: ${stats.brierScore !== null ? escFmt(stats.brierScore, 4) : 'N/A'} ${esc(brierGrade(stats.brierScore))}`;
}

// ─── Markets list \\(compact \\+ split: Telegram 4096 char limit\\) ─────────
const MARKET_LIST_TITLE_MAX = 120;
const MARKET_LIST_HINT_MAX  = 80;
const MARKET_LIST_MAX_ITEMS = 30;
/** ~3200 chars body per message so header/footer fit under 4096\\. */
const TELEGRAM_CHUNK_BODY = 3200;

/**
 * @param {{ titlePrefix?: string, emptyMessage?: string, footerExtra?: string }} [options]
 * @returns {string[]} One or more messages; each under Telegram limit\\.
 */
function marketsMessageChunks(markets, options = {}) {
  const {
    titlePrefix = 'Available crypto markets',
    emptyMessage = 'No crypto markets available right now\\.',
    footerExtra,
  } = options;

  if (!markets || markets.length === 0) return [emptyMessage];

  const lines = markets.slice(0, MARKET_LIST_MAX_ITEMS).map((m, i) => {
    const n = i + 1;
    const yPct = esc(fmt(m.yesPrice * 100, 1));
    const vol  = m.volumeUsd > 0 ? esc(`$${m.volumeUsd.toFixed(2)}`) : '$0';
    const endBit = m.closeTime
      ? ` \\| ${escDateUtc(m.closeTime)} \\(${esc(String(m.daysLeft ?? daysLeftFromClose(m.closeTime)))}d\\)`
      : ` \\| ${esc(String(m.daysLeft ?? '…'))}d left`;
    let stats = `\n   YES: *${yPct}¢* \\| Vol: ${vol}${endBit}`;
    const opp = m.opportunityPreview;
    if (opp && typeof opp.edge === 'string') {
      stats += `\n   Edge *${esc(opp.edge)}%* \\| Model *${esc(opp.model)}%* \\| ~$${esc(opp.bet)} bet`;
    }
    const ev    = (m.eventTitle || '').trim();
    const out   = (m.outcomeTitle || '').trim();
    const hint  = (m.contextHint || '').trim();

    if (ev && out && ev !== out) {
      let block = `${n}\\. *Event:* ${escShort(ev, 100)}\n   *Outcome:* ${escShort(out, 100)}`;
      if (hint.length > 0) {
        block += `\n   ${escShort(hint, MARKET_LIST_HINT_MAX)}`;
      }
      return block + stats;
    }

    const q = (m.question || [ev, out].filter(Boolean).join(' — ')).trim();
    if (q.length > 0) {
      return `${n}\\. ${escShort(q, MARKET_LIST_TITLE_MAX)}${stats}`;
    }
    return `${n}\\. _\\(no title from API\\)_${stats}`;
  });

  const footer =
    footerExtra != null
      ? `\n${DIV}\n${footerExtra}`
      : `\n${DIV}\n_Titles shortened for chat limit\\. Full text on Jupiter\\. Scan ${process.env.SCAN_INTERVAL_MINUTES || 5} min_`;

  const bodies = [];
  let buf = [];
  let bufLen = 0;

  const flush = () => {
    if (buf.length === 0) return;
    bodies.push(buf.join('\n\n'));
    buf = [];
    bufLen = 0;
  };

  for (const line of lines) {
    if (bufLen + line.length + 2 > TELEGRAM_CHUNK_BODY && buf.length > 0) flush();
    buf.push(line);
    bufLen += line.length + 2;
  }
  flush();

  const total = bodies.length;
  return bodies.map((body, idx) =>
    `*${esc(titlePrefix)} \\(${markets.length}\\)${total > 1 ? ` part ${idx + 1}/${total}` : ''}*\n${DIV}\n${body}${footer}`,
  );
}

/** @deprecated Prefer marketsMessageChunks; returns first chunk only\\. */
function marketsMessage(markets) {
  const c = marketsMessageChunks(markets);
  return c[0] || '';
}

/** Event + outcome lines for bets \\(MarkdownV2\\). */
function formatBetTargetHeader(market) {
  const ev  = (market.eventTitle || '').trim();
  const out = (market.outcomeTitle || '').trim();
  if (ev && out && ev !== out) {
    return `*Event:* ${esc(ev)}\n*Outcome \\(bet\\):* ${esc(out)}`;
  }
  const q = (market.question || market.marketQuestion || '').trim();
  return `*Market:* ${esc(q)}`;
}

// ─── Opportunity ──────────────────────────────────────────────────────────────
function opportunityMessage(market, analysis, kelly) {
  const { betAmount, contracts, entryPrice, halfBetAmount, halfContracts } = kelly;
  const edge = analysis.probability - market.yesPrice;
  const ev   = (analysis.probability * (1 - market.yesPrice)) - ((1 - analysis.probability) * market.yesPrice);

  const sideHint = analysis.side
    ? `*Side:* ${esc(analysis.side)} \\(entry \\~ ${escFmt(entryPrice * 100, 1)}¢\\)\n`
    : '';
  const timing = eventTimingVolumeLine(market);
  return `*New opportunity*\n${DIV}\n${formatBetTargetHeader(market)}\n${sideHint}${timing ? `${timing}\n` : ''}${DIV}\nYES token: *${escFmt(market.yesPrice * 100, 1)}¢* \\(crowd ${escPct(market.yesPrice)}\\)\nModel P\\(YES\\): *${escPct(analysis.probability)}*\nEdge vs crowd: *\\+${escPct(edge)}*\nEV per \\$1: \\+${escFmt(ev, 3)}\nConfidence: ${esc(analysis.confidence.toUpperCase())}\n${DIV}\n_${esc(analysis.reasoning)}_\n${DIV}\nFull bet: *${escUsd(betAmount)}* \\(${contracts} contracts @ ${escFmt(entryPrice * 100, 1)}¢\\)\nHalf bet: *${escUsd(halfBetAmount)}* \\(${halfContracts} contracts\\)`;
}

// ─── Open position price tick \\(focus tracking\\) ─────────────────────────────
function noOpenPositionsInsightMessage() {
  return 'No open bets\\. Use an opportunity alert or /scan\\.';
}

/**
 * Chat reply: live snapshot of one open position \\(optional fresh LLM estimate\\).
 * @param {object|null} marketSnap — from fetchMarket\\(\\) or null
 * @param {{ probability, confidence, reasoning }|null} freshEstimate
 * @param {{ addMoreHint?: boolean }} [opts]
 */
function positionInsightMessage(position, marketSnap, freshEstimate, opts = {}) {
  const { addMoreHint = false } = opts;
  const header = formatBetTargetHeader(position);
  const side   = position.side;
  const curPrice = marketSnap
    ? (side === 'YES' ? marketSnap.yesPrice : marketSnap.noPrice)
    : (position.currentPrice ?? position.entryPrice);
  const unrealized = (position.contracts * curPrice) - position.totalCost;
  const crowdYes = marketSnap ? escFmt(marketSnap.yesPrice * 100, 1) : '…';

  const closeForLine = marketSnap
    ? (marketSnap.closeTime || (position.closeTime ? new Date(position.closeTime) : null))
    : (position.closeTime ? new Date(position.closeTime) : null);
  const volForLine = marketSnap ? marketSnap.volumeUsd : position.volumeUsdAtEntry;
  const dlVal      = closeForLine ? daysLeftFromClose(closeForLine) : null;
  const timingLine = (closeForLine || volForLine != null)
    ? eventTimingVolumeLine({
        closeTime: closeForLine || undefined,
        daysLeft: dlVal,
        volumeUsd: volForLine,
      })
    : '';

  const crowdWin = crowdImpliedSideWinPct(side, marketSnap);
  const st = marketSnap?.status ? esc(String(marketSnap.status).toUpperCase()) : null;

  let body =
    `*Position snapshot*\n${DIV}\n${header}\n` +
    `*Side:* ${esc(side)}\n` +
    `Entry: *${escFmt(position.entryPrice * 100, 1)}¢* -> now: *${escFmt(curPrice * 100, 1)}¢*\n`;
  if (timingLine) {
    body += `${timingLine}\n`;
  }
  if (st) {
    body += `Market status: *${st}*\n`;
  }
  if (marketSnap) {
    body += `YES token: *${crowdYes}c* \\(implied P\\(YES\\)\\)\n`;
    if (crowdWin) {
      body += `Crowd P\\(your side wins\\): *${crowdWin}*\n`;
    }
  } else {
    body += `_Live fetch failed \\- using last price\\._\n`;
  }
  body +=
    `Unrealized PnL: *${esc(sign(unrealized) + usd(unrealized))}*\n` +
    `Model at entry \\(P YES\\): *${escPct(position.myEstimatedProbability)}*\n`;

  if (shouldOfferManualExit(unrealized) && marketSnap) {
    body += `\n_Use Exit buttons below to close at live price\\._`;
  }

  if (freshEstimate) {
    const pYes = freshEstimate.probability;
    const pSide = side === 'YES' ? pYes : 1 - pYes;
    body +=
      `${DIV}\n*Updated estimate*\n` +
      `P\\(YES\\): *${escPct(pYes)}* \\| ${esc(String(freshEstimate.confidence).toUpperCase())}\n` +
      `Your *${esc(side)}* win prob\\. \\~ *${escPct(pSide)}*\n` +
      `_${esc(freshEstimate.reasoning)}_`;
  }

  if (addMoreHint) {
    body += `\n${DIV}\n${addMoreBetHelpMessage()}`;
  }
  return body;
}

function addMoreBetHelpMessage() {
  const maxO = esc(String(process.env.MAX_OPEN_POSITIONS || 10));
  return (
    `*Adding size*\n` +
    `Bets are fixed at placement\\. For more exposure, use another alert or /scan if the market appears again\\. ` +
    `Max open positions: *${maxO}*\\.`
  );
}

function positionPriceTickMessage(position, currentPrice, unrealizedUsd) {
  const header = position.eventTitle && position.outcomeTitle && position.eventTitle !== position.outcomeTitle
    ? `*${esc(position.eventTitle)}*\n*${esc(position.outcomeTitle)}*`
    : `*${esc(position.marketQuestion)}*`;
  const side = position.side;
  const nowC = escFmt(currentPrice * 100, 1);
  const entC = escFmt(position.entryPrice * 100, 1);
  const pnl  = unrealizedUsd >= 0 ? `\\+${escUsd(unrealizedUsd)}` : `\\-${escUsd(Math.abs(unrealizedUsd))}`;
  let msg = `*Position update*\n${DIV}\n${header}\n${side} @ ${entC}¢ -> *${nowC}¢*\nUnrealized: *${pnl}*`;
  if (position.closeTime) {
    const tl = eventTimingVolumeLine({ closeTime: position.closeTime, volumeUsd: position.volumeUsdAtEntry });
    if (tl) msg += `\n${tl}`;
  }
  if (shouldOfferManualExit(unrealizedUsd)) {
    msg += `\n_Partial PnL: use buttons below to exit\\._`;
  }
  return msg;
}

// ─── Bet confirmed ────────────────────────────────────────────────────────────
function betConfirmedMessage(position) {
  const head = position.eventTitle && position.outcomeTitle && position.eventTitle !== position.outcomeTitle
    ? `_${esc(position.eventTitle)}_\n_${esc(position.outcomeTitle)}_\n`
    : `_${esc(position.marketQuestion)}_\n`;
  const tv = eventTimingVolumeLine({
    closeTime: position.closeTime,
    volumeUsd: position.volumeUsdAtEntry,
  });
  const timing = tv ? `${tv}\n` : '';
  return `*Bet placed \\(paper\\)*\n${DIV}\n${head}*${position.side}*\n${timing}Contracts: ${position.contracts} @ ${escFmt(position.entryPrice * 100, 1)}¢\nCost: ${escUsd(position.totalCost)}\nMax payout: ${escUsd(position.potentialPayout)}\nMax profit: \\+${escUsd(position.potentialProfit)}`;
}

// ─── Exit opportunity ─────────────────────────────────────────────────────────
function exitOpportunityMessage(position, currentPrice, profit) {
  const diff = currentPrice - position.entryPrice;
  return `*Take profit \\- exit signal*\n${DIV}\n${formatBetTargetHeader(position)}\n${position.side} @ ${escFmt(position.entryPrice * 100, 1)}¢ -> *${escFmt(currentPrice * 100, 1)}¢* \\(\\+${escFmt(diff * 100, 1)}¢\\)\n${DIV}\nExit now: *${esc(sign(profit) + usd(profit))}*\nIf held to resolution: \\+${escUsd(position.potentialProfit)}`;
}

// ─── Stop loss ────────────────────────────────────────────────────────────────
function stopLossMessage(position, currentPrice, loss) {
  const diff = position.entryPrice - currentPrice;
  return `*Stop loss alert*\n${DIV}\n${formatBetTargetHeader(position)}\n${position.side} @ ${escFmt(position.entryPrice * 100, 1)}¢ -> *${escFmt(currentPrice * 100, 1)}¢* \\(-${escFmt(diff * 100, 1)}¢\\)\nCurrent loss: *\\-${escUsd(loss)}*`;
}

// ─── Resolved ─────────────────────────────────────────────────────────────────
function resolvedMessage(position, won) {
  const pnl = position.pnl || 0;
  return `*Resolution*\n${DIV}\n_${esc(position.marketQuestion)}_\nSide: *${position.side}* \\| Result: *${won ? 'WON' : 'LOST'}*\nPnL: ${esc(sign(pnl) + '$' + Math.abs(pnl).toFixed(2))}`;
}

/** Paper exit before resolution \\(manual / take\\-profit callback\\). */
function manualExitClosedMessage(position) {
  const pnl = position.pnl || 0;
  return `*Position closed*\n${DIV}\n_${esc(position.marketQuestion)}_\n${position.side} \\| PnL: ${esc(sign(pnl) + '$' + Math.abs(pnl).toFixed(2))}`;
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
  return `*Daily summary — ${esc(new Date().toDateString())}*\n${DIV}\nBalance: ${escUsd(stats.balance)} USDC\nTotal PnL: ${esc(sign(stats.totalPnl) + usd(stats.totalPnl))}\nROI: ${stats.roi >= 0 ? '\\+' : ''}${esc(String(stats.roi))}%\n${DIV}\nClosed today: ${closedToday.length}\n  Won: ${won.length} \\(\\+${escUsd(wonAmt)}\\)\n  Lost: ${lost.length} \\(\\-${escUsd(lostAmt)}\\)\n${DIV}\nWin rate: ${esc(String(stats.winRate))}%\nAvg edge: ${esc(String(stats.avgEdge))}%\nBrier: ${stats.brierScore !== null ? escFmt(stats.brierScore, 4) : 'N/A'} ${esc(brierGrade(stats.brierScore))}${best ? `\n${DIV}\nBest: _${escFull(best.marketQuestion)}_ \\(\\+${escUsd(best.pnl)}\\)` : ''}`;
}

module.exports = {
  DIV,
  escFull,
  startupMessage, helpMessage, balanceMessage, positionsMessage,
  historyMessage, statsMessage, marketsMessage, marketsMessageChunks, opportunityMessage,
  betConfirmedMessage, exitOpportunityMessage, stopLossMessage,
  resolvedMessage, manualExitClosedMessage, dailySummaryMessage,
  noOpenPositionsInsightMessage, positionInsightMessage,
  positionPriceTickMessage, formatBetTargetHeader,
  manualExitMinUnrealized, shouldOfferManualExit, manualExitKeyboardRow,
  addMoreBetHelpMessage, eventTimingVolumeLine, escDateUtc, daysLeftFromClose,
  esc, escFmt, escUsd, escPct, usd, fmt, sign,
};
