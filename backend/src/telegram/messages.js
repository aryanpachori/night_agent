'use strict';

const { calculateEV, calculateEdge } = require('../math/expectedValue');

const DIV = '━━━━━━━━━━━━━━━━━━━━━━';
/** One line in lists/summaries — API often sends full rules in title fields\\. */
const POSITION_COMPACT_MAX = 100;

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

/**
 * Short event/outcome or truncated question for positions, summaries, alerts\\. No multi\\-paragraph rules\\.
 * @param {{ eventTitle?: string, outcomeTitle?: string, marketQuestion?: string }} p
 */
function positionCompactTitle(p) {
  const ev  = String(p.eventTitle || '').trim();
  const out = String(p.outcomeTitle || '').trim();
  const q   = String(p.marketQuestion || '').replace(/\s+/g, ' ').trim();
  let raw = '';
  if (ev && out && ev !== out) {
    raw = `${ev} — ${out}`;
  } else if (ev) {
    raw = ev;
  } else if (q) {
    raw = q;
  } else {
    return '…';
  }
  return raw.length > POSITION_COMPACT_MAX ? escShort(raw, POSITION_COMPACT_MAX) : esc(raw);
}

/**
 * Prefer short event \\+ outcome from a live `fetchMarket` snap when available \\(cleaner than rules text\\)\\
 */
function positionDisplayTitle(p, marketSnap) {
  const evS  = (marketSnap?.eventTitle && String(marketSnap.eventTitle).trim()) || '';
  const outB = (marketSnap?.outcomeTitle && String(marketSnap.outcomeTitle).trim()) || String(p.outcomeTitle || '').trim();
  if (evS && outB && evS !== outB) {
    const raw = `${evS} — ${outB}`;
    return raw.length > POSITION_COMPACT_MAX ? escShort(raw, POSITION_COMPACT_MAX) : esc(raw);
  }
  if (evS) {
    return evS.length > POSITION_COMPACT_MAX ? escShort(evS, POSITION_COMPACT_MAX) : esc(evS);
  }
  return positionCompactTitle(p);
}

/** One line: entry, live token price for your side, unrealized PnL \\(MarkdownV2\\) */
function openPositionListLine(p, i, marketSnap) {
  const side = p.side;
  const cur  = marketSnap
    ? (side === 'YES' ? marketSnap.yesPrice : marketSnap.noPrice)
    : (p.currentPrice ?? p.entryPrice);
  const ent  = p.entryPrice;
  const unreal = p.contracts * cur - p.totalCost;
  const tag    = side === 'YES' ? 'YES' : 'NO';
  const t      = positionDisplayTitle(p, marketSnap);
  const closeCt = marketSnap?.closeTime ?? (p.closeTime ? new Date(p.closeTime) : null);
  const volV    = marketSnap?.volumeUsd ?? p.volumeUsdAtEntry;
  const volB    = volV != null && Number.isFinite(volV) ? ` \\| Vol: ${escUsd(volV)}` : '';
  const endB    = closeCt ? ` \\| ${escDateUtc(closeCt)}` : '';
  return (
    `${i + 1}\\. *${esc(side)}* — ${t}\n` +
    `   *U\\.PnL* ${esc(sign(unreal) + usd(unreal))} \\| *${esc(tag)} token* ${escFmt(ent * 100, 1)}→${escFmt(cur * 100, 1)}¢ \\| ${esc(String(p.contracts))} ct${endB}${volB}`
  );
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
  const cap  = String(process.env.MAX_FOCUS_EVENTS || '2');
  const hop  = String(process.env.MAX_OPPORTUNITY_ALERTS_PER_HOUR || '0');
  const hopL = hop !== '0' ? ` Up to *${esc(hop)}* new opportunity alerts per rolling hour\\.\n` : '';
  return `*Night Agent — commands*\n${DIV}\n/balance — wallet balance \\& PnL\n/positions — open positions \\(U\\.PnL, live *YES\\|NO* price; exit buttons when partially up/down\\)\n/status — snapshot of open bets \\(add natural language to call Gemini on a bet\\)\n/history — last 10 closed positions\n/stats — performance stats\n/markets — markets that pass the same opportunity filters as alerts \\(LLM; may take a minute\\)\n/scan / /opportunities — run edge scan; sends BET \\/ SKIP if a market passes filters\n/more — extra opportunities \\(focus rules\\)\n/pause — pause scanning\n/resume — resume scanning\n/ping — health check\n${DIV}\n*Focus:* at most *${esc(cap)}* combined \\(pending opportunity alerts \\+ open bets\\)\\. New alerts pause until you fall below the cap\\.\n${hopL}${DIV}\n*Chat about your bets:*\n• when does this event end \\| what is the volume\n• chances of winning \\| current status\n• status of my bet \\| model win percent\n• how to add size\n${DIV}\n*Ask for bets:* "give me opportunities", "show me events", "what can I bet on" \\| same as /scan\n${DIV}\n*Natural language:* show markets \\(list only\\), more opportunities, should I bet on \\.\\.\\., balance, open positions\n${DIV}\n*Alerts:* BET \\/ SKIP; exit: EXIT \\/ HOLD; manual exit on /positions or /status when unrealized PnL meets threshold\n${DIV}\n*Side YES vs NO:* the model only outputs *P\\(YES\\)*\\. It bets **NO** when it thinks P\\(YES\\) is *below* the crowd price; **YES** when *above*\\. If you only see one side, the model and crowd rarely disagree the other way on the markets in your scan.`;
}

// ─── Balance ──────────────────────────────────────────────────────────────────
function balanceMessage(stats) {
  return `*Paper wallet*\n${DIV}\nBalance: ${escUsd(stats.balance)} USDC\nTotal PnL: ${esc(sign(stats.totalPnl) + usd(stats.totalPnl))} \\(${stats.roi >= 0 ? '\\+' : ''}${esc(String(stats.roi))}% ROI\\)\nOpen: ${stats.openCount} \\| Closed: ${stats.closedCount}\nWins: ${stats.wonCount} \\| Losses: ${stats.lostCount}`;
}

// ─── Positions ────────────────────────────────────────────────────────────────
function positionsMessage(positions) {
  if (positions.length === 0) return 'No open bets yet\\.';
  const lines = positions.map((p, i) => {
    const cur  = p.currentPrice ?? p.entryPrice;
    const worth = p.contracts * cur;
    const unreal = worth - p.totalCost;
    const pnlStr = unreal >= 0 ? `\\+${escUsd(unreal)} ✅` : `\\-${escUsd(Math.abs(unreal))} 🔴`;
    const title  = positionCompactTitle(p);
    const endB = p.closeTime
      ? ` \\| ${esc(String(daysLeftFromClose(new Date(p.closeTime)) ?? '?'))}d left`
      : '';
    return `${i + 1}\\. *${esc(p.side)}* — ${title}\n   Bet: *${escUsd(p.totalCost)}* → now *${escUsd(worth)}* \\| ${pnlStr}${endB}`;
  });
  return `*Your open bets \\(${positions.length}\\)*\n${DIV}\n${lines.join('\n\n')}`;
}

// ─── History ──────────────────────────────────────────────────────────────────
function historyMessage(closed) {
  if (closed.length === 0) return 'No closed positions yet\\.';
  const lines = closed.slice(-10).map((p, i) =>
    `${i + 1}\\. *${p.side}* — ${positionCompactTitle(p)} \\| ${esc(sign(p.pnl) + usd(p.pnl))} \\| ${esc(p.exitReason)} \\| ${esc(new Date(p.closedAt).toLocaleDateString())}`
  );
  const total = closed.reduce((s, p) => s + (p.pnl || 0), 0);
  return `*Closed positions \\(last 10 of ${closed.length}\\)*\n${DIV}\n${lines.join('\n')}\n${DIV}\n*Total PnL: ${esc(sign(total) + usd(total))}*`;
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

/** One compact title line for bets \\(MarkdownV2\\) — avoids full rule text in chat\\.*/
function formatBetTargetHeader(market) {
  return `*${positionCompactTitle(market)}*`;
}

// ─── Opportunity ──────────────────────────────────────────────────────────────
function opportunityMessage(market, analysis, kelly) {
  const { betAmount, contracts, entryPrice, halfBetAmount } = kelly;
  const side      = analysis.side || 'YES';
  // Payout = contracts (each pays $1 at resolution); profit = payout - stake
  const payout    = contracts;
  const profit    = payout - betAmount;
  const halfPayout = Math.floor(halfBetAmount / entryPrice);
  const halfProfit = halfPayout - halfBetAmount;

  const daysLeft  = daysLeftFromClose(market.closeTime);
  const daysStr   = daysLeft != null ? ` \\(${esc(String(daysLeft))}d left\\)` : '';
  const confidenceLabel =
    analysis.confidence === 'high' ? 'High ✅' :
    analysis.confidence === 'medium' ? 'Medium ⚡' : 'Low ⚠️';

  return (
    `*📣 New Bet Signal*\n${DIV}\n` +
    `${formatBetTargetHeader(market)}\n` +
    `*Bet:* ${esc(side)}${daysStr}\n` +
    `${DIV}\n` +
    `💵 Put in *${escUsd(betAmount)}* → win *${escUsd(payout)}* \\(profit \\+${escUsd(profit)}\\)\n` +
    `⚠️ Max loss: *${escUsd(betAmount)}*\n` +
    `${DIV}\n` +
    `Bot confidence: *${esc(confidenceLabel)}*\n` +
    `_${esc(analysis.reasoning)}_\n` +
    `${DIV}\n` +
    `Smaller bet: *${escUsd(halfBetAmount)}* → win *${escUsd(halfPayout)}* \\(profit \\+${escUsd(halfProfit)}\\)`
  );
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
  const currentWorth = position.contracts * curPrice;
  const unrealized   = currentWorth - position.totalCost;
  const pnlStr       = unrealized >= 0
    ? `\\+${escUsd(unrealized)} ✅`
    : `\\-${escUsd(Math.abs(unrealized))} 🔴`;

  const closeForLine = marketSnap
    ? (marketSnap.closeTime || (position.closeTime ? new Date(position.closeTime) : null))
    : (position.closeTime ? new Date(position.closeTime) : null);
  const dlVal  = closeForLine ? daysLeftFromClose(closeForLine) : null;
  const daysStr = dlVal != null ? `${esc(String(dlVal))} days left` : '';
  const st = marketSnap?.status ? esc(String(marketSnap.status).toUpperCase()) : null;

  let body =
    `*Your Bet*\n${DIV}\n${header}\n` +
    `Side: *${esc(side)}*\n` +
    `You put in: *${escUsd(position.totalCost)}*\n` +
    `Currently worth: *${escUsd(currentWorth)}*\n` +
    `Profit\\/Loss: *${pnlStr}*\n`;

  if (daysStr) body += `Time left: ${daysStr}\n`;
  if (st)      body += `Status: *${st}*\n`;
  if (!marketSnap) body += `_\\(Live price unavailable — showing last known\\)_\n`;

  if (shouldOfferManualExit(unrealized) && marketSnap) {
    body += `\n_Use the Exit buttons below to close your position\\._`;
  }

  if (freshEstimate) {
    const confidenceLabel =
      freshEstimate.confidence === 'high' ? 'High ✅' :
      freshEstimate.confidence === 'medium' ? 'Medium ⚡' : 'Low ⚠️';
    body +=
      `\n${DIV}\n*Bot's latest view*\n` +
      `Confidence: *${esc(confidenceLabel)}*\n` +
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
  const header = `*${positionCompactTitle(position)}*`;
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
  const daysLeft = daysLeftFromClose(position.closeTime);
  const daysStr  = daysLeft != null ? `\nEvent ends in: *${esc(String(daysLeft))} days*` : '';
  return (
    `*✅ Bet placed\\!*\n${DIV}\n` +
    `_${positionCompactTitle(position)}_\n` +
    `Side: *${esc(position.side)}*\n` +
    `You bet: *${escUsd(position.totalCost)}*\n` +
    `If you win: *\\+${escUsd(position.potentialProfit)}* \\(total ${escUsd(position.potentialPayout)}\\)\n` +
    `Max loss: *${escUsd(position.totalCost)}*${daysStr}`
  );
}

// ─── Exit opportunity (manual only; auto\\-close applies to stop\\-loss in monitor) ─
function exitOpportunityMessage(position, currentPrice, profit) {
  const currentWorth = position.contracts * currentPrice;
  return (
    `*💰 Time to take profit\\!*\n${DIV}\n` +
    `${formatBetTargetHeader(position)}\n` +
    `You put in: *${escUsd(position.totalCost)}*\n` +
    `Exit now for: *${escUsd(currentWorth)}*\n` +
    `Profit: *\\+${escUsd(profit)}* ✅\n` +
    `${DIV}\n_Use the Exit buttons to lock in your profit\\._`
  );
}

// ─── Stop loss (legacy text if ever shown before auto\\-close) ───────────────
function stopLossMessage(position, currentPrice, loss) {
  const currentWorth = position.contracts * currentPrice;
  return (
    `*⚠️ Your bet is losing*\n${DIV}\n` +
    `${formatBetTargetHeader(position)}\n` +
    `You put in: *${escUsd(position.totalCost)}*\n` +
    `Currently worth: *${escUsd(currentWorth)}*\n` +
    `Loss so far: *\\-${escUsd(loss)}* 🔴\n` +
    `${DIV}\n_Consider exiting to limit your losses\\. Use the Exit buttons below\\._`
  );
}

/** After automatic stop\\-loss exit \\(\\+ Telegram confirmation\\) */
function stopLossAutoClosedMessage(closed) {
  const pnl = closed.pnl || 0;
  const pnlStr = pnl >= 0 ? `\\+${escUsd(pnl)}` : `\\-${escUsd(Math.abs(pnl))}`;
  return (
    `*🛑 Bet auto\\-closed \\(stop loss\\)*\n${DIV}\n` +
    `${positionCompactTitle(closed)}\n` +
    `Side: *${esc(closed.side)}*\n` +
    `Result: *${pnlStr}*\n` +
    `_Your position has already been closed to protect you from further losses\\._`
  );
}

// ─── Resolved ─────────────────────────────────────────────────────────────────
function resolvedMessage(position, won) {
  const pnl = position.pnl || 0;
  const pnlStr = pnl >= 0 ? `\\+${escUsd(pnl)}` : `\\-${escUsd(Math.abs(pnl))}`;
  return (
    `*${won ? '🎉 You won\\!' : '😔 Bet lost'}*\n${DIV}\n` +
    `${positionCompactTitle(position)}\n` +
    `Side: *${esc(position.side)}*\n` +
    `${won ? `Profit: *${pnlStr}* ✅` : `Loss: *${pnlStr}* 🔴`}`
  );
}

/** Paper exit before resolution \\(manual / take\\-profit callback\\). */
function manualExitClosedMessage(position) {
  const pnl = position.pnl || 0;
  return `*Position closed*\n${DIV}\n${positionCompactTitle(position)}\n${position.side} \\| PnL: ${esc(sign(pnl) + '$' + Math.abs(pnl).toFixed(2))}`;
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
  const open = walletModule.getPositions ? walletModule.getPositions() : [];
  const openBlock = (() => {
    if (open.length === 0) return '';
    const rows = open.map((p, i) => {
      const cur  = p.currentPrice ?? p.entryPrice;
      const u    = p.contracts * cur - p.totalCost;
      const t    = positionCompactTitle(p);
      const volB = p.volumeUsdAtEntry != null && Number.isFinite(p.volumeUsdAtEntry)
        ? ` \\| Vol: ${escUsd(p.volumeUsdAtEntry)}` : '';
      const endB = p.closeTime
        ? ` \\| ${escDateUtc(new Date(p.closeTime))}` : '';
      return `*${i + 1}\\.* ${esc(p.side)} — ${t}\n   ${escFmt(p.entryPrice * 100, 1)}→${escFmt(cur * 100, 1)}¢ U ${esc(sign(u) + usd(u))} \\| ${p.contracts} ct${endB}${volB}`;
    });
    return `${DIV}\n*Open* \\(${open.length}\\)\n${rows.join('\n\n')}\n`;
  })();
  return `*Daily summary — ${esc(new Date().toDateString())}*\n${DIV}\nBalance: ${escUsd(stats.balance)} USDC\nTotal PnL: ${esc(sign(stats.totalPnl) + usd(stats.totalPnl))}\nROI: ${stats.roi >= 0 ? '\\+' : ''}${esc(String(stats.roi))}%\n${openBlock}${DIV}\nClosed today: ${closedToday.length}\n  Won: ${won.length} \\(\\+${escUsd(wonAmt)}\\)\n  Lost: ${lost.length} \\(\\-${escUsd(lostAmt)}\\)\n${DIV}\nWin rate: ${esc(String(stats.winRate))}%\nAvg edge: ${esc(String(stats.avgEdge))}%\nBrier: ${stats.brierScore !== null ? escFmt(stats.brierScore, 4) : 'N/A'} ${esc(brierGrade(stats.brierScore))}${best ? `\n${DIV}\nBest: ${positionCompactTitle(best)} \\(\\+${escUsd(best.pnl)}\\)` : ''}`;
}

module.exports = {
  DIV,
  escFull,
  startupMessage, helpMessage, balanceMessage, positionsMessage,
  historyMessage, statsMessage, marketsMessage, marketsMessageChunks, opportunityMessage,
  betConfirmedMessage, exitOpportunityMessage, stopLossMessage, stopLossAutoClosedMessage,
  resolvedMessage, manualExitClosedMessage, dailySummaryMessage,
  noOpenPositionsInsightMessage, positionInsightMessage,
  positionPriceTickMessage, formatBetTargetHeader,
  manualExitMinUnrealized, shouldOfferManualExit, manualExitKeyboardRow,
  addMoreBetHelpMessage, eventTimingVolumeLine, escDateUtc, daysLeftFromClose,
  esc, escFmt, escUsd, escPct, usd, fmt, sign,
  positionCompactTitle, positionDisplayTitle, openPositionListLine,
};
