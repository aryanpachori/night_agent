'use strict';

const express = require('express');
const { requireDb } = require('../middleware/prisma');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireDb, requireAuth, async (req, res) => {
  try {
    const { type, limit = '20', offset = '0' } = req.query;
    const where = {
      userId: req.user.userId,
      ...(type === 'bet'
        ? { actionTaken: { in: ['bet_full', 'bet_half'] } }
        : type === 'skipped'
          ? { actionTaken: 'skipped' }
          : {}),
    };
    const [alerts, total] = await Promise.all([
      req.prisma.alert.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Math.min(parseInt(limit, 10) || 20, 100),
        skip: parseInt(offset, 10) || 0,
      }),
      req.prisma.alert.count({ where }),
    ]);
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
