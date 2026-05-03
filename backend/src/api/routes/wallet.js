'use strict';

const express = require('express');
const { requireDb } = require('../middleware/prisma');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireDb, requireAuth, async (req, res) => {
  try {
    const wallet = await req.prisma.wallet.findUnique({ where: { userId: req.user.userId } });
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
      wins: wallet.wins,
      losses: wallet.losses,
      totalBets: wallet.totalBets,
      winRate,
      avgBrierScore: avgBrierScore !== null ? Math.round(avgBrierScore * 1000) / 1000 : null,
    });
  } catch (err) {
    console.error('[wallet]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/history', requireDb, requireAuth, async (req, res) => {
  try {
    const wallet = await req.prisma.wallet.findUnique({
      where: { userId: req.user.userId },
      select: { startingBalance: true, balance: true },
    });
    if (!wallet) return res.status(404).json({ error: 'Not found' });

    const now = new Date();
    const dayEnds = [];
    for (let i = 29; i >= 0; i--) {
      const dayEnd = new Date(now);
      dayEnd.setDate(dayEnd.getDate() - i);
      dayEnd.setHours(23, 59, 59, 999);
      dayEnds.push(dayEnd);
    }

    const closedPositions = await req.prisma.paperPosition.findMany({
      where: {
        userId: req.user.userId,
        status: { in: ['closed', 'resolved'] },
        pnl: { not: null },
        closedAt: { not: null, lte: dayEnds[dayEnds.length - 1] },
      },
      select: { closedAt: true, pnl: true },
      orderBy: { closedAt: 'asc' },
    });

    const history = [];
    for (let i = 0; i < dayEnds.length; i++) {
      const dayEnd = dayEnds[i];
      const cumPnl = closedPositions
        .filter(p => p.closedAt <= dayEnd)
        .reduce((s, p) => s + (Number(p.pnl) || 0), 0);

      // Last day = actual wallet balance (includes open-position effects)
      const balance = (i === dayEnds.length - 1)
        ? wallet.balance
        : wallet.startingBalance + cumPnl;

      history.push({
        date: dayEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        balance: Math.round(balance * 100) / 100,
        pnl: Math.round(cumPnl * 100) / 100,
      });
    }

    res.json({
      history,
      currentBalance: wallet.balance,
      startingBalance: wallet.startingBalance,
    });
  } catch (err) {
    console.error('[wallet/history]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/reset', requireDb, requireAuth, async (req, res) => {
  try {
    if (req.body.confirm !== true) {
      return res.status(400).json({ error: 'Send { confirm: true }' });
    }
    await req.prisma.$transaction([
      req.prisma.wallet.update({
        where: { userId: req.user.userId },
        data: {
          balance: 1000,
          startingBalance: 1000,
          totalPnl: 0,
          wins: 0,
          losses: 0,
          totalBets: 0,
          brierScores: [],
        },
      }),
      req.prisma.paperPosition.updateMany({
        where: { userId: req.user.userId, status: 'open' },
        data: { status: 'closed', exitReason: 'wallet_reset', closedAt: new Date() },
      }),
      req.prisma.marketAlertDedup.deleteMany({ where: { userId: req.user.userId } }),
      req.prisma.positionAlertDedup.deleteMany({ where: { userId: req.user.userId } }),
    ]);
    res.json({ ok: true, newBalance: 1000 });
  } catch (err) {
    console.error('[wallet/reset]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
