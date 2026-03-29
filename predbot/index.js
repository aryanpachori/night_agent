'use strict';

// ─── Load env first ───────────────────────────────────────────────────────────
require('dotenv').config();

// ─── Validate required env vars ───────────────────────────────────────────────
const REQUIRED = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'JUPITER_API_KEY'];
const missing = REQUIRED.filter(k => !process.env[k]);
if (missing.length > 0) {
  console.error(`[startup] Missing required env vars: ${missing.join(', ')}`);
  console.error('[startup] Copy .env.example to .env and fill in your keys.');
  process.exit(1);
}

const needsLLM = !process.env.GEMINI_API_KEY && !process.env.OPENAI_API_KEY;
if (needsLLM) {
  console.warn('[startup] WARNING: No LLM key set. Set GEMINI_API_KEY or OPENAI_API_KEY in .env');
}

// ─── Imports ──────────────────────────────────────────────────────────────────
const cron = require('node-cron');

const wallet = require('./src/wallet/paperWallet');
const { createBot, registerOpportunity, isPaused } = require('./src/telegram/bot');
const alerts = require('./src/telegram/alerts');
const { scanMarkets } = require('./src/scanner/marketScanner');
const { fetchNewsForMarket } = require('./src/news/newsFetcher');
const { estimateProbability } = require('./src/llm/probabilityEstimator');
const { calculateEV, calculateEdge } = require('./src/math/expectedValue');
const { calculateKelly, kellyToDollars } = require('./src/math/kelly');
const { monitorPositions } = require('./src/monitor/positionMonitor');

// ─── Config ───────────────────────────────────────────────────────────────────
const SCAN_INTERVAL = parseInt(process.env.SCAN_INTERVAL_MINUTES) || 5;
const MONITOR_INTERVAL = parseInt(process.env.MONITOR_INTERVAL_MINUTES) || 30;
const MIN_EDGE = parseFloat(process.env.MIN_EDGE) || 0.05;
const MIN_BANKROLL = parseFloat(process.env.MIN_BANKROLL) || 50;
const MAX_OPEN = parseInt(process.env.MAX_OPEN_POSITIONS) || 5;

// ─── Main scan loop ───────────────────────────────────────────────────────────
async function runScan() {
  if (isPaused()) {
    console.log('[scan] Paused — skipping.');
    return;
  }

  const balance = wallet.getBalance();
  if (balance < MIN_BANKROLL) {
    console.log(`[scan] Balance $${balance.toFixed(2)} below minimum $${MIN_BANKROLL}. Paused.`);
    await alerts.sendText(`⚠️ Balance too low ($${balance.toFixed(2)}). Scanning paused. Add funds or /resume manually.`);
    return;
  }

  if (wallet.getOpenPositionCount() >= MAX_OPEN) {
    console.log(`[scan] Max open positions (${MAX_OPEN}) reached. Skipping scan.`);
    return;
  }

  console.log(`[scan] Starting market scan...`);
  let markets;
  try {
    markets = await scanMarkets();
  } catch (err) {
    console.error(`[scan] Market scan failed: ${err.message}`);
    return;
  }

  // Process markets one at a time (rate-limit LLM calls)
  let sent = 0;
  for (const market of markets) {
    // Dedup — skip if alerted recently
    if (wallet.hasRecentMarketAlert(market.id)) continue;

    try {
      const { articles, confidence: newsConfidence } = await fetchNewsForMarket(market.question, market.category);

      const estimate = await estimateProbability(market, articles);

      const edge = calculateEdge(estimate.probability, market.yesPrice);
      if (edge < MIN_EDGE) {
        console.log(`[scan] Skipping "${market.question.slice(0, 40)}..." — edge ${(edge * 100).toFixed(1)}% < ${MIN_EDGE * 100}%`);
        continue;
      }

      const evResult = calculateEV(estimate.probability, market.yesPrice);
      if (!evResult.isPositive) continue;

      const kellyFraction = calculateKelly(estimate.probability, market.yesPrice, estimate.confidence);
      if (kellyFraction <= 0) continue;

      const betAmount = kellyToDollars(kellyFraction, balance);
      if (betAmount < 1) continue;

      // Store for button handler and send alert
      registerOpportunity(market, estimate, evResult, kellyFraction, betAmount);
      await alerts.sendOpportunity(market, estimate, evResult, kellyFraction, betAmount, balance);
      wallet.markMarketAlerted(market.id);

      sent++;
      // Brief pause between alerts to avoid spam
      if (sent >= 3) break;
      await sleep(500);
    } catch (err) {
      console.error(`[scan] Error processing market ${market.id}: ${err.message}`);
    }
  }

  console.log(`[scan] Done. Sent ${sent} opportunity alert(s).`);
}

// ─── Boot sequence ────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║         PredBot — Paper Trading      ║');
  console.log('╚══════════════════════════════════════╝');
  console.log(`[startup] Balance: $${wallet.getBalance().toFixed(2)} USDC`);
  console.log(`[startup] Scan interval: every ${SCAN_INTERVAL} min`);
  console.log(`[startup] Monitor interval: every ${MONITOR_INTERVAL} min`);

  // 1. Start Telegram bot
  const bot = createBot();

  // 2. Send startup message
  try {
    await alerts.sendText(
      `🤖 *PredBot started!*\n\nPaper wallet: $${wallet.getBalance().toFixed(2)} USDC\n` +
      `Scanning Jupiter markets every ${SCAN_INTERVAL} min\n` +
      `LLM: ${process.env.GEMINI_API_KEY ? 'Gemini 2.0 Flash' : 'OpenAI GPT-4o-mini'}`
    );
  } catch (err) {
    console.warn(`[startup] Could not send startup message: ${err.message}`);
  }

  // 3. Run first scan immediately
  await runScan();

  // 4. Schedule market scanner
  const scanCron = buildCronExpression(SCAN_INTERVAL);
  cron.schedule(scanCron, runScan);
  console.log(`[startup] Market scanner scheduled: ${scanCron}`);

  // 5. Schedule position monitor
  const monitorCron = buildCronExpression(MONITOR_INTERVAL);
  cron.schedule(monitorCron, async () => {
    try {
      await monitorPositions();
    } catch (err) {
      console.error(`[monitor] Unhandled error: ${err.message}`);
    }
  });
  console.log(`[startup] Position monitor scheduled: ${monitorCron}`);

  // 6. Daily summary at 8am
  cron.schedule('0 8 * * *', async () => {
    try {
      const stats = wallet.getStats();
      const closedToday = wallet.getClosedToday();
      await alerts.sendDailySummary(stats, closedToday);
    } catch (err) {
      console.error(`[cron] Daily summary error: ${err.message}`);
    }
  });
  console.log('[startup] Daily summary scheduled at 08:00');

  console.log('[startup] PredBot fully started. Watching for opportunities...');
}

// ─── Utilities ────────────────────────────────────────────────────────────────
function buildCronExpression(intervalMinutes) {
  if (intervalMinutes < 60) return `*/${intervalMinutes} * * * *`;
  const hours = Math.floor(intervalMinutes / 60);
  return `0 */${hours} * * *`;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────
process.on('SIGINT', () => {
  console.log('\n[shutdown] SIGINT received. Goodbye.');
  const stats = wallet.getStats();
  console.log(`[shutdown] Final balance: $${stats.balance.toFixed(2)} | PnL: ${stats.totalPnl >= 0 ? '+' : ''}$${stats.totalPnl.toFixed(2)}`);
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  console.error(`[crash] Uncaught exception: ${err.message}`, err.stack);
});

process.on('unhandledRejection', (reason) => {
  console.error(`[crash] Unhandled rejection:`, reason);
});

main().catch(err => {
  console.error('[startup] Fatal error:', err);
  process.exit(1);
});
