'use strict';

const express = require('express');
const { requireDb } = require('../middleware/prisma');
const { requireAuth } = require('../middleware/auth');
const { addClient, removeClient } = require('../sseClients');

const router = express.Router();

function buildEventName(question, side) {
  if (!question) return 'Market event';

  const q = String(question).toLowerCase();

  let token = 'Crypto';
  if (q.includes('bitcoin') || q.includes('btc')) token = 'Bitcoin';
  else if (q.includes('ethereum') || q.includes('eth')) token = 'Ethereum';
  else if (q.includes('solana') || q.includes('sol')) token = 'Solana';
  else if (q.includes('bnb')) token = 'BNB';
  else if (q.includes('xrp')) token = 'XRP';
  else if (q.includes('doge')) token = 'Dogecoin';
  else if (q.includes('hyper') || q.includes('hype')) token = 'Hyperliquid';

  let timeWindow = '';
  const timeMatch = String(question).match(/(\d+)\s*(min|minute|hour|hr|day)/i);
  if (timeMatch) {
    timeWindow = ` in ${timeMatch[1]} ${timeMatch[2]}`;
  }

  const dir = side === 'YES' ? 'goes UP ↑' : 'goes DOWN ↓';
  return `${token} ${dir}${timeWindow}`;
}

/**
 * GET /api/alerts/stream — Server-Sent Events stream for real-time alert push.
 * EventSource cannot send headers, so the JWT is passed as ?token=<jwt>.
 */
router.get('/stream', requireDb, requireAuth, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const userId = req.user.userId;
  addClient(userId, res);

  // Send a heartbeat every 25s to keep the connection alive through proxies
  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch { clearInterval(heartbeat); }
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    removeClient(userId, res);
  });
});

router.get('/', requireDb, requireAuth, async (req, res) => {
  try {
    const { type, limit = '20', offset = '0' } = req.query;
    const userId = req.user.userId;
    const prisma = req.prisma;

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    await prisma.alert.updateMany({
      where: {
        userId,
        actionTaken: null,
        createdAt: { lt: fiveMinutesAgo },
      },
      data: { actionTaken: 'expired' },
    });

    const where = {
      userId,
      ...(type === 'bet'
        ? { actionTaken: { in: ['bet_full', 'bet_half'] } }
        : type === 'skipped'
          ? { actionTaken: { in: ['skipped', 'expired'] } }
          : type === 'pending'
            ? { actionTaken: null }
            : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.alert.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Math.min(parseInt(limit, 10) || 20, 100),
        skip: parseInt(offset, 10) || 0,
      }),
      prisma.alert.count({ where }),
    ]);

    const alerts = rows.map(a => ({
      ...a,
      // Convenience aliases used by the frontend
      betAmountUsd: a.suggestedAmount,
      winAmountUsd: a.suggestedContracts ?? 0,
      profitAmountUsd: Math.max(0, (a.suggestedContracts ?? 0) - (a.suggestedAmount ?? 0)),
      aiConfidencePct: Math.round((a.myProbability ?? 0) * 100),
      eventName: buildEventName(a.marketQuestion, a.side),
      isActionable:
        !a.actionTaken &&
        Date.now() - new Date(a.createdAt).getTime() < 5 * 60 * 1000,
    }));

    res.json({ alerts, total });
  } catch (err) {
    console.error('[alerts]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/:id', requireDb, requireAuth, async (req, res) => {
  try {
    const { actionTaken, positionId } = req.body;
    const VALID = ['bet_full', 'bet_half', 'skipped', 'expired'];
    if (!VALID.includes(actionTaken)) return res.status(400).json({ error: 'Invalid actionTaken' });

    const alert = await req.prisma.alert.findFirst({
      where: { id: req.params.id, userId: req.user.userId },
    });
    if (!alert) return res.status(404).json({ error: 'Not found' });

    const updated = await req.prisma.alert.update({
      where: { id: req.params.id },
      data: { actionTaken, positionId: positionId ?? null },
    });
    res.json(updated);
  } catch (err) {
    console.error('[alerts PATCH]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
