'use strict';

const express = require('express');
const { requireDb } = require('../middleware/prisma');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function asObjectPayload(payload) {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) return { ...payload };
  return {};
}

router.get('/', requireDb, requireAuth, async (req, res) => {
  try {
    const { status, limit = '50', offset = '0' } = req.query;
    const where = {
      userId: req.user.userId,
      ...(status && status !== 'all' ? { status } : {}),
    };
    const [positions, total] = await Promise.all([
      req.prisma.paperPosition.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take: Math.min(parseInt(limit, 10) || 50, 100),
        skip: parseInt(offset, 10) || 0,
      }),
      req.prisma.paperPosition.count({ where }),
    ]);

    const formatted = positions.map(pos => ({
      id: pos.id,
      status: pos.status,
      marketId: pos.marketId,
      side: pos.side,
      entryPrice: pos.entryPrice,
      totalCost: pos.totalCost,
      pnl: pos.pnl,
      exitReason: pos.exitReason,
      openedAt: pos.openedAt,
      closedAt: pos.closedAt,
      ...asObjectPayload(pos.payload),
    }));

    res.json({ positions: formatted, total });
  } catch (err) {
    console.error('[positions]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id', requireDb, requireAuth, async (req, res) => {
  try {
    const pos = await req.prisma.paperPosition.findFirst({
      where: { id: req.params.id, userId: req.user.userId },
    });
    if (!pos) return res.status(404).json({ error: 'Not found' });
    res.json({ ...asObjectPayload(pos.payload), id: pos.id, status: pos.status });
  } catch (err) {
    console.error('[positions/:id]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', requireDb, requireAuth, async (req, res) => {
  try {
    const { marketId, marketQuestion, category, side, entryPrice, amount } = req.body;
    if (!marketId || !side || entryPrice == null || amount == null) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (!['YES', 'NO'].includes(side)) return res.status(400).json({ error: 'Invalid side' });
    if (Number(amount) < 1) return res.status(400).json({ error: 'Min bet $1' });

    const wallet = await req.prisma.wallet.findUnique({
      where: { userId: req.user.userId },
      select: { balance: true },
    });
    if (!wallet || wallet.balance < amount) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    const openCount = await req.prisma.paperPosition.count({
      where: { userId: req.user.userId, status: 'open' },
    });
    if (openCount >= 10) return res.status(400).json({ error: 'Max 10 open positions' });

    const ep = Number(entryPrice);
    const amt = Number(amount);
    const contracts = Math.floor(amt / ep);
    const actualCost = contracts * ep;
    const now = new Date();
    const positionId = `pos_dash_${Date.now()}`;

    const payload = {
      id: positionId,
      userId: req.user.userId,
      marketId,
      marketQuestion: marketQuestion ?? '',
      category: category ?? 'unknown',
      side,
      contracts,
      entryPrice: ep,
      totalCost: actualCost,
      potentialPayout: contracts,
      potentialProfit: contracts - actualCost,
      status: 'open',
      openedAt: now.toISOString(),
      source: 'dashboard',
    };

    await req.prisma.$transaction([
      req.prisma.paperPosition.create({
        data: {
          id: positionId,
          userId: req.user.userId,
          status: 'open',
          marketId,
          side,
          entryPrice: ep,
          totalCost: actualCost,
          openedAt: now,
          payload,
        },
      }),
      req.prisma.wallet.update({
        where: { userId: req.user.userId },
        data: { balance: { decrement: actualCost }, totalBets: { increment: 1 } },
      }),
    ]);

    res.status(201).json({ position: payload });
  } catch (err) {
    console.error('[positions POST]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/:id', requireDb, requireAuth, async (req, res) => {
  try {
    const { closePrice, exitReason = 'manual' } = req.body;
    const cp = Number(closePrice);
    if (!Number.isFinite(cp) || cp < 0 || cp > 1) {
      return res.status(400).json({ error: 'closePrice must be 0-1' });
    }

    const position = await req.prisma.paperPosition.findFirst({
      where: { id: req.params.id, userId: req.user.userId, status: 'open' },
    });
    if (!position) return res.status(404).json({ error: 'Position not found or already closed' });

    const payload = asObjectPayload(position.payload);
    const contracts = Number(payload.contracts ?? 0);
    const side = position.side ?? 'YES';
    const entry = Number(position.entryPrice ?? 0);
    const exitValue = cp * contracts;
    const pnl =
      side === 'YES' ? (cp - entry) * contracts : (entry - cp) * contracts;

    const now = new Date();
    const mergedPayload = {
      ...payload,
      status: 'closed',
      closePrice: cp,
      pnl,
      exitReason,
      closedAt: now.toISOString(),
    };

    await req.prisma.$transaction([
      req.prisma.paperPosition.update({
        where: { id: req.params.id },
        data: {
          status: 'closed',
          pnl,
          exitReason,
          closedAt: now,
          payload: mergedPayload,
        },
      }),
      req.prisma.wallet.update({
        where: { userId: req.user.userId },
        data: {
          balance: { increment: exitValue },
          totalPnl: { increment: pnl },
          ...(pnl >= 0 ? { wins: { increment: 1 } } : { losses: { increment: 1 } }),
        },
      }),
      req.prisma.positionAlertDedup.deleteMany({
        where: { userId: req.user.userId, positionId: req.params.id },
      }),
    ]);

    res.json({
      id: req.params.id,
      status: 'closed',
      pnl,
      closePrice: cp,
      exitValue,
      exitReason,
    });
  } catch (err) {
    console.error('[positions PATCH]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
