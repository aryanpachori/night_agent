'use strict';

const express = require('express');
const { requireDb } = require('../middleware/prisma');
const { requireAuth } = require('../middleware/auth');
const { invalidateCache } = require('../../bot/userManager');
const { sendOTP, verifyOTP } = require('../telegramMtproto');

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
        autoTakeProfitPct: true,
        autoStopLossPct: true,
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
    const ALLOWED = ['categories', 'riskMode', 'maxAlertsPerDay', 'alertIntervalMin', 'telegramAlerts', 'autoTakeProfitPct', 'autoStopLossPct'];
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
    if ('autoTakeProfitPct' in update) {
      const v = update.autoTakeProfitPct;
      if (v !== null && (!Number.isFinite(Number(v)) || Number(v) < 10 || Number(v) > 1000)) {
        return res.status(400).json({ error: 'autoTakeProfitPct must be 10-1000 or null' });
      }
      update.autoTakeProfitPct = v === null ? null : Number(v);
    }
    if ('autoStopLossPct' in update) {
      const v = update.autoStopLossPct;
      if (v !== null && (!Number.isFinite(Number(v)) || Number(v) < 5 || Number(v) > 99)) {
        return res.status(400).json({ error: 'autoStopLossPct must be 5-99 or null' });
      }
      update.autoStopLossPct = v === null ? null : Number(v);
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
        autoTakeProfitPct: true,
        autoStopLossPct: true,
      },
    });
    invalidateCache();
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
    invalidateCache();
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

router.post('/telegram/send-otp', requireDb, requireAuth, async (req, res) => {
  try {
    const { phone } = req.body || {};
    if (!phone) return res.status(400).json({ error: 'Phone number is required' });

    const normalized = phone.trim().startsWith('+') ? phone.trim() : `+${phone.trim()}`;
    const digits = normalized.replace(/[^\d]/g, '');
    if (digits.length < 8 || digits.length > 15) {
      return res.status(400).json({ error: 'Invalid phone number format' });
    }

    await sendOTP(normalized);
    res.json({ ok: true, message: 'OTP sent to your Telegram app' });
  } catch (err) {
    const msg = String(err?.message || '');
    console.error('[user/telegram/send-otp]', msg);
    const message = msg.includes('PHONE_NUMBER_INVALID')
      ? 'Invalid phone number. Please check and try again.'
      : msg.includes('FLOOD_WAIT')
        ? 'Too many attempts. Please wait a few minutes.'
        : msg || 'Failed to send OTP';
    res.status(400).json({ error: message });
  }
});

router.post('/telegram/resend-otp', requireDb, requireAuth, async (req, res) => {
  try {
    const { phone } = req.body || {};
    if (!phone) return res.status(400).json({ error: 'Phone number is required' });

    const normalized = phone.trim().startsWith('+') ? phone.trim() : `+${phone.trim()}`;
    await sendOTP(normalized);
    res.json({ ok: true, message: 'New OTP sent' });
  } catch (err) {
    const msg = String(err?.message || '');
    console.error('[user/telegram/resend-otp]', msg);
    res.status(400).json({ error: msg || 'Failed to resend OTP' });
  }
});

router.post('/telegram/verify-otp', requireDb, requireAuth, async (req, res) => {
  try {
    const { phone, code } = req.body || {};
    if (!phone || !code) {
      return res.status(400).json({ error: 'Phone and code are required' });
    }

    const normalized = phone.trim().startsWith('+') ? phone.trim() : `+${phone.trim()}`;
    const tgUser = await verifyOTP(normalized, code);
    const telegramId = BigInt(tgUser.telegramId);

    const existingOwner = await req.prisma.user.findUnique({
      where: { telegramId },
      select: { id: true },
    });
    if (existingOwner && existingOwner.id !== req.user.userId) {
      return res.status(409).json({ error: 'This Telegram account is already linked to another user' });
    }

    const updated = await req.prisma.user.update({
      where: { id: req.user.userId },
      data: {
        telegramId,
        firstName: tgUser.firstName ?? undefined,
        username: tgUser.username ?? undefined,
        telegramAlerts: true,
      },
      select: { telegramId: true, username: true, telegramAlerts: true },
    });
    invalidateCache();

    res.json({
      ok: true,
      telegramId: updated.telegramId?.toString() ?? null,
      username: updated.username ?? null,
      telegramAlerts: !!updated.telegramAlerts,
    });
  } catch (err) {
    const msg = String(err?.message || '');
    console.error('[user/telegram/verify-otp]', msg);
    res.status(400).json({ error: msg || 'Verification failed' });
  }
});

router.post('/telegram/disconnect', requireDb, requireAuth, async (req, res) => {
  try {
    await req.prisma.user.update({
      where: { id: req.user.userId },
      data: { telegramId: null, telegramAlerts: false },
    });
    invalidateCache();
    res.json({ ok: true });
  } catch (err) {
    console.error('[user/telegram/disconnect]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
