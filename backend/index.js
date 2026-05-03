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
const { evaluateOpportunity }                    = require('./src/scanner/opportunityEvaluator');
const { recordPrice }                            = require('./src/price/priceHistory');
const { monitorPositions, monitorFastPositions }  = require('./src/monitor/positionMonitor');
const {
  canSendOpportunityAlert,
  recordOpportunityAlert,
}                  = require('./src/telegram/opportunityRateLimit');
const { recordLastScanAt } = require('./src/db/lastScan');
const { startApiServer } = require('./src/api/server');
const { getPrisma } = require('./src/db/client');
const {
  hasActiveUsers,
  getActiveUsers,
  seedOwnerIfNeeded,
  getUsersForOpportunityAlert,
} = require('./src/bot/userManager');

// ─── Config ───────────────────────────────────────────────────────────────────
const SCAN_INTERVAL         = parseInt(process.env.SCAN_INTERVAL_MINUTES)         || 5;
const NEW_MARKET_SCAN_MINS  = parseInt(process.env.NEW_MARKET_SCAN_MINUTES, 10)   || 5;
const MONITOR_INTERVAL      = parseInt(process.env.MONITOR_INTERVAL_MINUTES)      || 30;
const MIN_EDGE         = parseFloat(process.env.MIN_EDGE)                || 0.08;
const MIN_BANKROLL     = parseFloat(process.env.MIN_BANKROLL)            || 10;
const MAX_OPEN         = parseInt(process.env.MAX_OPEN_POSITIONS)        || 10;
/** Pending opportunity alerts \\+ open bets — auto\\-scan skips new opps when at cap. */
const MAX_FOCUS_EVENTS = parseInt(process.env.MAX_FOCUS_EVENTS, 10)       || 2;
/** Per scan: default 1 so a single run cannot spam multiple BET alerts when focus allows more than 1\\. */
const MAX_OPPORTUNITIES_PER_SCAN = parseInt(process.env.MAX_OPPORTUNITIES_PER_SCAN, 10) || 1;
const MORE_OPPORTUNITIES_COUNT   = parseInt(process.env.MORE_OPPORTUNITIES_COUNT, 10)   || 2;

/** Set when REST API starts (`JWT_SECRET` ≥ 16 chars). */
let apiHttpServer = null;

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

  if (getPrisma() && !(await hasActiveUsers())) {
    console.log('[scan] No active users — skipping scan cycle.');
    return;
  }

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

  const MIN_BET_USD = parseFloat(process.env.MIN_BET_USD) || 5;

  let markets;
  try {
    markets = await scanMarkets({ newOnly });
  } catch (err) {
    console.error(`[scan] Market scan failed: ${err.message}`);
    return;
  }

  let sent = 0;
  try {
    for (const market of markets) {
      try {
        const pendingN2 = alerts.getPendingOpportunityCount();
        const openN2      = wallet.getOpenPositionCount();
        if (!moreMode && pendingN2 + openN2 >= MAX_FOCUS_EVENTS) {
          console.log(`[scan] Focus cap (${MAX_FOCUS_EVENTS}) — stop mid-scan (${pendingN2} pending + ${openN2} open)`);
          break;
        }
        const maxThisPass = moreMode
          ? Math.min(MORE_OPPORTUNITIES_COUNT, Math.max(0, MAX_FOCUS_EVENTS - pendingN2 - openN2))
          : Math.min(MAX_OPPORTUNITIES_PER_SCAN, Math.max(0, MAX_FOCUS_EVENTS - pendingN2 - openN2));
        if (maxThisPass <= 0 || sent >= maxThisPass) break;

        console.log(`\n[scan] Analysing: "${market.question.slice(0, 60)}"`);
        console.log(`[scan]   YES price: ${(market.yesPrice * 100).toFixed(1)}¢ | Vol: $${market.volumeUsd.toFixed(2)} | Days: ${market.daysLeft}`);

        const r = await evaluateOpportunity(market, balance, { skipRecentAlert: true, verbose: true });
        if (!r) continue;

        if (!canSendOpportunityAlert()) {
          console.log('[scan] Hourly opportunity alert cap reached — stop');
          break;
        }

        r.estimate.side = r.evResult.side;
        r.estimate.effectivePrice = r.evResult.effectivePrice;

        const prisma = getPrisma();
        let dispatched = 0;

        if (prisma) {
          const recipients = await getUsersForOpportunityAlert(market);
          if (recipients.length === 0) {
            console.log('[scan]   ✓ OPPORTUNITY — no eligible Telegram users (paused / limits / categories / balance)');
            continue;
          }
          console.log('[scan]   ✓ OPPORTUNITY — sending alert(s)');
          for (const user of recipients) {
            const uBal = Number(user.wallet?.balance ?? 0);
            const betAmountForUser = Math.min(r.betAmount, uBal);
            if (betAmountForUser < MIN_BET_USD) continue;
            await alerts.sendOpportunityAlert(market, r.estimate, r.kellyFraction, betAmountForUser, balance, {
              user,
              deferWalletMark: true,
            });
            dispatched++;
          }
          if (dispatched === 0) {
            console.log('[scan]   ✓ OPPORTUNITY — no user passed min bet after per-wallet cap');
            continue;
          }
          wallet.markMarketAlerted(market.id);
        } else {
          console.log('[scan]   ✓ OPPORTUNITY — sending alert');
          await alerts.sendOpportunityAlert(market, r.estimate, r.kellyFraction, r.betAmount, balance, {
            deferWalletMark: false,
          });
          dispatched = 1;
        }

        recordOpportunityAlert();
        sent++;
        await sleep(500);
      } catch (err) {
        console.error(`[scan] Error on "${market.question.slice(0, 40)}": ${err.message}`);
      }
    }
  } finally {
    await recordLastScanAt();
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
  const { initPersistence } = require('./src/db/persistence');
  await initPersistence();
  require('./src/llm/geminiModelRotation').logStateHint();

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

  apiHttpServer = await startApiServer();

  await seedOwnerIfNeeded();

  if (getPrisma()) {
    const n = (await getActiveUsers()).length;
    console.log(
      `[startup] Active DB users (not paused): ${n} — opportunity scans ${n ? 'on' : 'paused until at least one user'}`,
    );
  }

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
  if (!getPrisma() || (await hasActiveUsers())) {
    await runScan();
  } else {
    console.log('[startup] No active users — skipping initial full scan (cron will retry).');
  }
  const scanCron = buildCron(SCAN_INTERVAL);
  cron.schedule(scanCron, () => runScan());
  console.log(`[startup] Full scan:       ${scanCron}`);

  // 6a. Fast position monitor — every 1 min (no LLM: only SL + resolution + price tick)
  cron.schedule('* * * * *', async () => {
    try { await monitorFastPositions(); }
    catch (err) { console.error(`[monitor/fast] Error: ${err.message}`); }
  });
  console.log('[startup] Fast monitor:     every 60s (SL + resolution, no LLM)');

  // 6b. Full position monitor — LLM re-estimate, TP alert, edge-flip
  const monitorCron = buildCron(MONITOR_INTERVAL);
  cron.schedule(monitorCron, async () => {
    try { await monitorPositions(); }
    catch (err) { console.error(`[monitor] Error: ${err.message}`); }
  });
  console.log(`[startup] Full monitor:     ${monitorCron} (TP + LLM edge-flip | price ticks: ≥${process.env.PRICE_TICK_MIN_MOVE || 0.03}¢ / ${process.env.PRICE_TICK_INTERVAL_MINUTES || 5}min cooldown)`);

  // 7. Daily summary at 8am
  cron.schedule('0 8 * * *', async () => {
    try {
      if (getPrisma() && !(await hasActiveUsers())) return;
      await alerts.sendDailySummary(wallet);
    }
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
  (async () => {
    console.log('\n[shutdown] SIGINT received. Flushing DB…');
    try {
      if (apiHttpServer && typeof apiHttpServer.close === 'function') {
        await new Promise(resolve => apiHttpServer.close(() => resolve()));
      }
    } catch (e) {
      console.warn('[shutdown] API close:', e.message);
    }
    try {
      const { flush } = require('./src/db/persistence');
      const { disconnect } = require('./src/db/client');
      await flush();
      await disconnect();
    } catch (e) {
      console.error('[shutdown] DB error:', e.message);
    }
    const s = wallet.getStats();
    console.log(`[shutdown] Final balance: $${s.balance.toFixed(2)} | PnL: ${s.totalPnl >= 0 ? '+' : ''}$${s.totalPnl.toFixed(2)}`);
    process.exit(0);
  })();
});
process.on('uncaughtException',  err => console.error(`[crash] Uncaught: ${err.message}`, err.stack));
process.on('unhandledRejection', r   => console.error(`[crash] Unhandled:`, r));

main().catch(err => { console.error('[startup] Fatal:', err); process.exit(1); });
