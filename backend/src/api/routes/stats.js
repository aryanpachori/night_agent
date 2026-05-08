'use strict';

const express = require('express');
const { requireDb } = require('../middleware/prisma');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

router.get('/summary', requireDb, requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const [wallet, openCount, closedToday, alertsToday, user] = await Promise.all([
      req.prisma.wallet.findUnique({ where: { userId } }),
      req.prisma.paperPosition.count({ where: { userId, status: 'open' } }),
      req.prisma.paperPosition.count({
        where: {
          userId,
          status: { in: ['closed', 'resolved'] },
          closedAt: { gte: startOfToday() },
        },
      }),
      req.prisma.alert.count({
        where: { userId, createdAt: { gte: startOfToday() } },
      }),
      req.prisma.user.findUnique({
        where: { id: userId },
        select: { maxAlertsPerDay: true, isPaused: true, categories: true },
      }),
    ]);

    if (!wallet) return res.status(404).json({ error: 'Wallet not found' });

    const brierScores = Array.isArray(wallet.brierScores) ? wallet.brierScores : [];
    const avgBrierScore =
      brierScores.length > 0 ? brierScores.reduce((a, b) => a + Number(b), 0) / brierScores.length : null;
    const winRate = wallet.totalBets > 0 ? Math.round((wallet.wins / wallet.totalBets) * 100) : 0;
    const roi =
      wallet.startingBalance > 0 ? ((wallet.balance - wallet.startingBalance) / wallet.startingBalance) * 100 : 0;

    res.json({
      balance: wallet.balance,
      startingBalance: wallet.startingBalance,
      totalPnl: wallet.totalPnl,
      roi: Math.round(roi * 100) / 100,
      winRate,
      wins: wallet.wins,
      losses: wallet.losses,
      totalBets: wallet.totalBets,
      avgBrierScore: avgBrierScore !== null ? Math.round(avgBrierScore * 1000) / 1000 : null,
      openPositionsCount: openCount,
      closedTodayCount: closedToday,
      alertsTodayCount: alertsToday,
      maxAlertsPerDay: user?.maxAlertsPerDay ?? 3,
      alertsRemaining: Math.max(0, (user?.maxAlertsPerDay ?? 3) - alertsToday),
      isPaused: user?.isPaused ?? false,
      categories: user?.categories ?? [],
    });
  } catch (err) {
    console.error('[stats/summary]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/bot-status', requireDb, requireAuth, async (req, res) => {
  try {
    const [lastScanRow, user] = await Promise.all([
      req.prisma.appStorage.findUnique({ where: { key: 'lastScanAt' } }),
      req.prisma.user.findUnique({
        where: { id: req.user.userId },
        select: { isPaused: true },
      }),
    ]);

    let lastScanAt = null;
    if (lastScanRow?.value) {
      const d = new Date(lastScanRow.value);
      lastScanAt = Number.isNaN(d.getTime()) ? null : d;
    }

    const secondsSince = lastScanAt ? Math.floor((Date.now() - lastScanAt.getTime()) / 1000) : null;

    res.json({
      isActive: !user?.isPaused && secondsSince !== null && secondsSince < 600,
      isPaused: user?.isPaused ?? false,
      lastScanAt: lastScanAt?.toISOString() ?? null,
      secondsSinceLastScan: secondsSince,
      // Avoid expensive table-wide aggregations on each poll; this endpoint is hit every ~15s.
      marketsWatching: null,
      scanIntervalSeconds: parseInt(process.env.SCAN_INTERVAL_MINUTES ?? '5', 10) * 60,
    });
  } catch (err) {
    console.error('[stats/bot-status]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/delivery-metrics', requireDb, requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const today = startOfToday();
    const [alertsToday, pendingAlerts, failedConnectAttempts, deadLetterBuckets] = await Promise.all([
      req.prisma.alert.count({ where: { userId, createdAt: { gte: today } } }),
      req.prisma.alert.count({ where: { userId, actionTaken: null } }),
      req.prisma.appStorage.count({
        where: { key: { startsWith: `connect_attempts:${userId}:` } },
      }),
      req.prisma.appStorage.findMany({
        where: { key: { startsWith: 'delivery_dead_letter:' } },
        select: { key: true, value: true },
      }),
    ]);

    const deliveryFailures = deadLetterBuckets.reduce((sum, row) => {
      try {
        const parsed = JSON.parse(row.value || '{}');
        return sum + Number(parsed.count || 0);
      } catch {
        return sum;
      }
    }, 0);

    res.json({
      alertsToday,
      pendingAlerts,
      failedConnectAttemptBuckets: failedConnectAttempts,
      deliveryDeadLetters: deliveryFailures,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[stats/delivery-metrics]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
