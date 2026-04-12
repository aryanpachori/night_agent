'use strict';

require('dotenv').config();

// ─── Validate required env vars ───────────────────────────────────────────────
const REQUIRED = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'JUPITER_API_KEY', 'GEMINI_API_KEY'];
const missing  = REQUIRED.filter(k => !process.env[k]);
if (missing.length > 0) {
  console.error(`[startup] Missing required env vars: ${missing.join(', ')}`);
  console.error('[startup] Copy .env.example to .env and fill in your keys.');
  process.exit(1);
}

// ─── Imports ──────────────────────────────────────────────────────────────────
const cron = require('node-cron');

const wallet                                     = require('./src/wallet/paperWallet');
const { createBot, isPaused, registerScanners }  = require('./src/telegram/bot');
const alerts                                     = require('./src/telegram/alerts');
const { scanMarkets, fetchAllCryptoMarkets }     = require('./src/scanner/marketScanner');
const { recordPrice }                            = require('./src/price/priceHistory');
const { estimateProbability }                    = require('./src/llm/probabilityEstimator');
const { calculateEV, calculateEdge }             = require('./src/math/expectedValue');
const { calculateKelly, kellyToDollars }         = require('./src/math/kelly');
const { monitorPositions }                       = require('./src/monitor/positionMonitor');

// ─── Config ───────────────────────────────────────────────────────────────────
const SCAN_INTERVAL         = parseInt(process.env.SCAN_INTERVAL_MINUTES)         || 5;
const NEW_MARKET_SCAN_MINS  = parseInt(process.env.NEW_MARKET_SCAN_MINUTES, 10)   || 5;
const MONITOR_INTERVAL      = parseInt(process.env.MONITOR_INTERVAL_MINUTES)      || 30;
const MIN_EDGE         = parseFloat(process.env.MIN_EDGE)                || 0.08;
const MIN_BANKROLL     = parseFloat(process.env.MIN_BANKROLL)            || 10;
const MAX_OPEN         = parseInt(process.env.MAX_OPEN_POSITIONS)        || 10;
/** Pending opportunity alerts \\+ open bets — auto\\-scan skips new opps when at cap. */
const MAX_FOCUS_EVENTS = parseInt(process.env.MAX_FOCUS_EVENTS, 10)       || 2;
const MAX_OPPORTUNITIES_PER_SCAN = parseInt(process.env.MAX_OPPORTUNITIES_PER_SCAN, 10) || 2;
const MORE_OPPORTUNITIES_COUNT   = parseInt(process.env.MORE_OPPORTUNITIES_COUNT, 10)   || 2;

// ─── 60-second price poller ───────────────────────────────────────────────────
async function pollPrices() {
  try {
    const markets = await fetchAllCryptoMarkets();
    for (const m of markets) {
      recordPrice(m.id, m.yesPrice, m.noPrice, m.volumeUsd);
    }
    console.log(`[poller] Prices recorded for ${markets.length} markets`);
  } catch (err) {
    console.error(`[poller] Error: ${err.message}`);
  }
}

// ─── Main scan loop ───────────────────────────────────────────────────────────
async function runOpportunityScan({ newOnly = false, moreMode = false } = {}) {
  if (isPaused()) { console.log('[scan] Paused — skipping.'); return; }

  const balance = wallet.getBalance();
  if (balance < MIN_BANKROLL) {
    console.log(`[scan] Balance $${balance.toFixed(2)} below minimum. Halted.`);
    await alerts.sendRawMessage(`Balance too low ($${balance.toFixed(2)}). Scanning paused.`);
    return;
  }
  if (wallet.getOpenPositionCount() >= MAX_OPEN) {
    console.log(`[scan] Max open positions (${MAX_OPEN}) reached. Skipping.`);
    return;
  }

  const pendingN = alerts.getPendingOpportunityCount();
  const openN    = wallet.getOpenPositionCount();
  const focusSlots = pendingN + openN;

  if (!moreMode && focusSlots >= MAX_FOCUS_EVENTS) {
    console.log(`[scan] Focus cap (${MAX_FOCUS_EVENTS}): ${pendingN} pending + ${openN} open — skip new opportunities`);
    return;
  }

  const maxSend = moreMode
    ? MORE_OPPORTUNITIES_COUNT
    : Math.min(MAX_OPPORTUNITIES_PER_SCAN, Math.max(0, MAX_FOCUS_EVENTS - focusSlots));

  if (maxSend <= 0) {
    console.log('[scan] Nothing to send (maxSend=0).');
    return;
  }

  console.log(`[scan] ── Starting${newOnly ? ' new-market' : ' full'} scan${moreMode ? ' (MORE)' : ''} — up to ${maxSend} alert(s) ──`);

  let markets;
  try {
    markets = await scanMarkets({ newOnly });
  } catch (err) {
    console.error(`[scan] Market scan failed: ${err.message}`);
    return;
  }

  let sent = 0;
  for (const market of markets) {
    if (wallet.hasRecentMarketAlert(market.id)) continue;

    try {
      console.log(`\n[scan] Analysing: "${market.question.slice(0, 60)}"`);
      console.log(`[scan]   YES price: ${(market.yesPrice * 100).toFixed(1)}¢ | Vol: $${market.volumeUsd.toFixed(2)} | Days: ${market.daysLeft}`);

      // Math pre-gate: only call Gemini if math already sees edge >= MIN_EDGE
      // Saves LLM quota when the math signals agree with the crowd
      if (market.ta?.mathProbability != null) {
        const mathEdge = Math.abs(market.ta.mathProbability - market.yesPrice);
        console.log(`[scan]   Math prob: ${(market.ta.mathProbability*100).toFixed(1)}% | math edge: ${(mathEdge*100).toFixed(1)}%`);
        if (mathEdge < MIN_EDGE) {
          console.log(`[scan]   ✗ Math edge too small — skip LLM`);
          continue;
        }
      }

      const estimate = await estimateProbability(market);

      const edge = calculateEdge(estimate.probability, market.yesPrice);
      console.log(`[scan]   Edge: ${(edge * 100).toFixed(1)}% (min ${MIN_EDGE * 100}%)`);

      if (edge < MIN_EDGE) {
        console.log(`[scan]   ✗ Edge too small — skip`);
        continue;
      }

      const evResult = calculateEV(estimate.probability, market.yesPrice);
      console.log(`[scan]   EV: ${evResult.ev.toFixed(4)} (positive: ${evResult.isPositive})`);
      if (!evResult.isPositive) { console.log(`[scan]   ✗ Negative EV — skip`); continue; }

      const kellyFraction = calculateKelly(estimate.probability, market.yesPrice, estimate.confidence);
      console.log(`[scan]   Kelly fraction: ${(kellyFraction * 100).toFixed(2)}%`);
      if (kellyFraction <= 0) { console.log(`[scan]   ✗ Kelly=0 — skip`); continue; }

      const betAmount = kellyToDollars(kellyFraction, balance);
      console.log(`[scan]   Bet amount: $${betAmount.toFixed(2)} (min $5)`);
      if (betAmount < 5) { console.log(`[scan]   ✗ Bet below $5 minimum — skip`); continue; }

      console.log(`[scan]   ✓ OPPORTUNITY — sending alert`);
      estimate.side           = evResult.side;
      estimate.effectivePrice = evResult.effectivePrice;

      await alerts.sendOpportunityAlert(market, estimate, kellyFraction, betAmount, balance);
      sent++;
      if (sent >= maxSend) break;
      await sleep(500);
    } catch (err) {
      console.error(`[scan] Error on "${market.question.slice(0, 40)}": ${err.message}`);
    }
  }

  console.log(`[scan] ── Done. Sent ${sent} alert(s) ──\n`);
}

async function runScan(opts = {}) {
  return runOpportunityScan({ newOnly: !!opts.newOnly, moreMode: false });
}

async function runMoreOpportunities() {
  return runOpportunityScan({ newOnly: false, moreMode: true });
}

// ─── Boot sequence ────────────────────────────────────────────────────────────
async function main() {
  console.log('--- Night Agent (paper trading) ---');
  console.log(`[startup] Balance:      $${wallet.getBalance().toFixed(2)} USDC`);
  console.log(`[startup] Scan:         every ${SCAN_INTERVAL} min`);
  console.log(`[startup] New-market:  every ${NEW_MARKET_SCAN_MINS} min`);
  console.log(`[startup] Monitor:      every ${MONITOR_INTERVAL} min`);
  console.log(`[startup] Min edge:     ${MIN_EDGE * 100}%`);
  console.log(`[startup] Max positions: ${MAX_OPEN}`);
  console.log(`[startup] Focus cap:   ${MAX_FOCUS_EVENTS} (pending alerts + open bets)`);

  // 1. Start Telegram bot
  createBot();

  // 2. Register scanner functions so /markets and /scan commands work
  registerScanners(scanMarkets, runScan, runMoreOpportunities);

  // 3. Price poller — every 60 seconds (feeds TA indicators)
  await pollPrices();
  cron.schedule('* * * * *', pollPrices);
  console.log('[startup] Price poller:    every 60s');

  // 4. New-market scan (default every 5 min — easier on Gemini free-tier RPD than every 1 min)
  cron.schedule(buildCron(NEW_MARKET_SCAN_MINS), () => runScan({ newOnly: true }));
  console.log(`[startup] New-market scan: ${buildCron(NEW_MARKET_SCAN_MINS)}`);

  // 5. Full scan with TA pre-filter
  await runScan();
  const scanCron = buildCron(SCAN_INTERVAL);
  cron.schedule(scanCron, () => runScan());
  console.log(`[startup] Full scan:       ${scanCron}`);

  // 6. Position monitor
  const monitorCron = buildCron(MONITOR_INTERVAL);
  cron.schedule(monitorCron, async () => {
    try { await monitorPositions(); }
    catch (err) { console.error(`[monitor] Error: ${err.message}`); }
  });
  console.log(`[startup] Position monitor: ${monitorCron} (price ticks: move ≥ ${process.env.PRICE_TICK_MIN_MOVE || 0.04} / ${process.env.PRICE_TICK_INTERVAL_MINUTES || 12}min cooldown)`);

  // 7. Daily summary at 8am
  cron.schedule('0 8 * * *', async () => {
    try { await alerts.sendDailySummary(wallet); }
    catch (err) { console.error(`[cron] Daily summary error: ${err.message}`); }
  });
  console.log('[startup] Daily summary:   08:00');

  console.log('\n[startup] Night Agent started.\n');
}

// ─── Utilities ────────────────────────────────────────────────────────────────
function buildCron(minutes) {
  if (minutes < 60) return `*/${minutes} * * * *`;
  return `0 */${Math.floor(minutes / 60)} * * *`;
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Graceful shutdown ────────────────────────────────────────────────────────
process.on('SIGINT', () => {
  console.log('\n[shutdown] SIGINT received. Goodbye.');
  const s = wallet.getStats();
  console.log(`[shutdown] Final balance: $${s.balance.toFixed(2)} | PnL: ${s.totalPnl >= 0 ? '+' : ''}$${s.totalPnl.toFixed(2)}`);
  process.exit(0);
});
process.on('uncaughtException',  err => console.error(`[crash] Uncaught: ${err.message}`, err.stack));
process.on('unhandledRejection', r   => console.error(`[crash] Unhandled:`, r));

main().catch(err => { console.error('[startup] Fatal:', err); process.exit(1); });
