'use strict';

const express = require('express');
const { requireDb } = require('../middleware/prisma');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireDb, requireAuth, async (req, res) => {
  try {
    const user = await req.prisma.user.findUnique({
      where: { id: req.user.userId },
      select: {
        id: true,
        telegramId: true,
        walletAddress: true,
        firstName: true,
        username: true,
        photoUrl: true,
        authMethod: true,
        categories: true,
        riskMode: true,
        maxAlertsPerDay: true,
        alertIntervalMin: true,
        telegramAlerts: true,
        isPaused: true,
        createdAt: true,
      },
    });
    if (!user) return res.status(404).json({ error: 'Not found' });
    res.json({
      ...user,
      telegramId: user.telegramId != null ? user.telegramId.toString() : null,
    });
  } catch (err) {
    console.error('[user GET]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/', requireDb, requireAuth, async (req, res) => {
  try {
    const ALLOWED = ['categories', 'riskMode', 'maxAlertsPerDay', 'alertIntervalMin', 'telegramAlerts'];
    const update = {};
    for (const key of ALLOWED) {
      if (key in req.body) update[key] = req.body[key];
    }

    if (update.riskMode && !['conservative', 'moderate', 'aggressive'].includes(update.riskMode)) {
      return res.status(400).json({ error: 'Invalid riskMode' });
    }
    if (update.categories) {
      const VALID = ['crypto', 'politics', 'economics', 'sports', 'tech', 'culture', 'us elections'];
      if (!Array.isArray(update.categories) || update.categories.some(c => !VALID.includes(c))) {
        return res.status(400).json({ error: 'Invalid categories' });
      }
    }
    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: 'No valid fields' });
    }

    const updated = await req.prisma.user.update({
      where: { id: req.user.userId },
      data: update,
      select: {
        categories: true,
        riskMode: true,
        maxAlertsPerDay: true,
        alertIntervalMin: true,
        telegramAlerts: true,
      },
    });
    res.json(updated);
  } catch (err) {
    console.error('[user PATCH]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/pause', requireDb, requireAuth, async (req, res) => {
  try {
    const current = await req.prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { isPaused: true },
    });
    const newPaused = typeof req.body.paused === 'boolean' ? req.body.paused : !current?.isPaused;
    await req.prisma.user.update({
      where: { id: req.user.userId },
      data: { isPaused: newPaused },
    });
    res.json({ isPaused: newPaused });
  } catch (err) {
    console.error('[user/pause]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/test-telegram', requireDb, requireAuth, async (req, res) => {
  try {
    const user = await req.prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { telegramId: true, firstName: true },
    });
    if (!user?.telegramId) {
      return res.status(400).json({ error: 'No Telegram account linked' });
    }

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: user.telegramId.toString(),
        text: `✅ *NightAgent Connected*\n\nHi ${user.firstName ?? 'there'}\\! Your dashboard is linked\\.`,
        parse_mode: 'MarkdownV2',
      }),
    });
    const result = await response.json();
    if (!result.ok) return res.status(500).json({ error: 'Telegram send failed', detail: result.description });
    res.json({ ok: true });
  } catch (err) {
    console.error('[user/test-telegram]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
