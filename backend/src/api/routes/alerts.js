'use strict';

const express = require('express');
const { requireDb } = require('../middleware/prisma');
const { requireAuth } = require('../middleware/auth');
const { addClient, removeClient } = require('../sseClients');

const router = express.Router();

function buildEventName(question, side) {
  if (!question) return 'Market event';
  const q = String(question).toLowerCase();
  const dir = side === 'YES' ? '↑ UP' : '↓ DOWN';
  if (q.includes('bitcoin') || q.includes('btc')) return `Bitcoin ${dir}`;
  if (q.includes('ethereum') || q.includes('eth')) return `Ethereum ${dir}`;
  if (q.includes('solana') || q.includes('sol')) return `Solana ${dir}`;
  if (q.includes('bnb')) return `BNB ${dir}`;
  if (q.includes('xrp')) return `XRP ${dir}`;
  if (q.includes('doge')) return `Dogecoin ${dir}`;
  if (q.includes('hyper') || q.includes('hype')) return `Hyperliquid ${dir}`;
  const cleaned = String(question)
    .replace(/this market will resolve.*?if\s+/gi, '')
    .replace(/the .* price at.*$/gi, '')
    .replace(/otherwise.*$/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  return (cleaned.slice(0, 55) || String(question).slice(0, 55)) || 'Market event';
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
    const where = {
      userId: req.user.userId,
      ...(type === 'bet'
        ? { actionTaken: { in: ['bet_full', 'bet_half'] } }
        : type === 'skipped'
          ? { actionTaken: { in: ['skipped', 'expired'] } }
          : type === 'pending'
            ? { actionTaken: null }
            : {}),
    };
    const [rows, total] = await Promise.all([
      req.prisma.alert.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Math.min(parseInt(limit, 10) || 20, 100),
        skip: parseInt(offset, 10) || 0,
      }),
      req.prisma.alert.count({ where }),
    ]);

    const alerts = rows.map(a => ({
      ...a,
      // Convenience aliases used by the frontend
      betAmountUsd: a.suggestedAmount,
      winAmountUsd: a.suggestedContracts ?? 0,
      profitAmountUsd: Math.max(0, (a.suggestedContracts ?? 0) - (a.suggestedAmount ?? 0)),
      aiConfidencePct: Math.round((a.myProbability ?? 0) * 100),
      eventName: buildEventName(a.marketQuestion, a.side),
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
