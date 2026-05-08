'use strict';

const express = require('express');
const crypto = require('crypto');
const { SignJWT } = require('jose');
const nacl = require('tweetnacl');
const { PublicKey } = require('@solana/web3.js');

const { requireDb } = require('../middleware/prisma');
const { requireAuth, getJwtSecret } = require('../middleware/auth');
const { invalidateCache } = require('../../bot/userManager');
const { sendWelcomeMessage } = require('../../telegram/alerts');

const router = express.Router();
const connectAttemptBuckets = new Map();

function isConnectAttemptAllowed(key) {
  const now = Date.now();
  const bucket = connectAttemptBuckets.get(key) ?? { count: 0, resetAt: now + 10 * 60 * 1000 };
  if (now > bucket.resetAt) {
    connectAttemptBuckets.set(key, { count: 1, resetAt: now + 10 * 60 * 1000 });
    return true;
  }
  if (bucket.count >= 20) return false;
  bucket.count += 1;
  connectAttemptBuckets.set(key, bucket);
  return true;
}

async function recordConnectAttempt(prisma, userId, ip, outcome) {
  const today = new Date().toISOString().slice(0, 10);
  const storageKey = `connect_attempts:${userId}:${ip || 'unknown'}:${today}`;
  const row = await prisma.appStorage.findUnique({ where: { key: storageKey } });
  let value = { failed: 0, blocked: 0, updatedAt: Date.now() };
  if (row?.value) {
    try {
      value = { ...value, ...JSON.parse(row.value) };
    } catch {
      // ignore malformed historical value
    }
  }
  if (outcome === 'failed') value.failed += 1;
  if (outcome === 'blocked') value.blocked += 1;
  value.updatedAt = Date.now();
  await prisma.appStorage.upsert({
    where: { key: storageKey },
    update: { value: JSON.stringify(value) },
    create: { key: storageKey, value: JSON.stringify(value) },
  });
}

function cookieAttrs() {
  const parts = ['HttpOnly', 'Path=/', 'Max-Age=2592000'];
  const prod = process.env.NODE_ENV === 'production';
  if (prod) {
    parts.push('Secure', 'SameSite=None');
  } else {
    parts.push('SameSite=Lax');
  }
  return parts.join('; ');
}

async function createToken(secret, payload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(secret);
}

// POST /api/auth/telegram
router.post('/telegram', requireDb, async (req, res) => {
  try {
    const prisma = req.prisma;
    const { hash, ...userData } = req.body;

    if (!hash || userData.id == null) {
      return res.status(400).json({ error: 'Missing telegram data' });
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const secretKey = crypto.createHash('sha256').update(botToken).digest();
    const checkString = Object.keys(userData)
      .sort()
      .filter(k => userData[k])
      .map(k => `${k}=${userData[k]}`)
      .join('\n');
    const expectedHash = crypto.createHmac('sha256', secretKey).update(checkString).digest('hex');

    if (expectedHash !== hash) {
      return res.status(401).json({ error: 'Invalid hash' });
    }

    const authDate = Number(userData.auth_date);
    if (!Number.isFinite(authDate) || Date.now() / 1000 - authDate > 86400) {
      return res.status(401).json({ error: 'Auth data expired' });
    }

    const telegramId = BigInt(userData.id);

    // Check if this is a genuinely new signup (first-ever Telegram login)
    const existing = await prisma.user.findUnique({ where: { telegramId }, select: { id: true } });
    const isNewUser = !existing;

    const user = await prisma.user.upsert({
      where: { telegramId },
      update: {
        firstName: userData.first_name ?? null,
        username: userData.username ?? null,
        photoUrl: userData.photo_url ?? null,
        authMethod: 'telegram',
      },
      create: {
        telegramId,
        firstName: userData.first_name ?? null,
        username: userData.username ?? null,
        photoUrl: userData.photo_url ?? null,
        authMethod: 'telegram',
        wallet: {
          create: {
            balance: 1000,
            startingBalance: 1000,
            brierScores: [],
          },
        },
      },
    });

    const secret = getJwtSecret();
    const token = await createToken(secret, { userId: user.id, telegramId: String(userData.id) });

    invalidateCache();

    // Send a welcome DM to new users who just linked their Telegram
    if (isNewUser) {
      setImmediate(() => {
        sendWelcomeMessage(telegramId, userData.first_name).catch(err =>
          console.warn('[auth/telegram] Welcome message failed:', err.message),
        );
      });
    }

    res.setHeader('Set-Cookie', `nightagent_token=${token}; ${cookieAttrs()}`);
    res.json({
      token,
      user: {
        id: user.id,
        firstName: user.firstName,
        username: user.username,
        photoUrl: user.photoUrl,
        authMethod: user.authMethod,
      },
    });
  } catch (err) {
    console.error('[auth/telegram]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/auth/telegram-callback
router.get('/telegram-callback', requireDb, async (req, res) => {
  try {
    const prisma = req.prisma;
    const { hash, ...userData } = req.query;

    if (!hash || userData.id == null) {
      return res.redirect(`${(process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '')}/login?error=missing`);
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const secretKey = crypto.createHash('sha256').update(botToken).digest();
    const checkString = Object.keys(userData)
      .sort()
      .map(k => `${k}=${userData[k]}`)
      .join('\n');
    const expectedHash = crypto.createHmac('sha256', secretKey).update(checkString).digest('hex');

    if (expectedHash !== hash) {
      return res.redirect(`${(process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '')}/login?error=invalid`);
    }

    const authDate = Number(userData.auth_date);
    if (!Number.isFinite(authDate) || Date.now() / 1000 - authDate > 86400) {
      return res.redirect(`${(process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '')}/login?error=expired`);
    }

    const telegramId = BigInt(userData.id);
    const existing = await prisma.user.findUnique({ where: { telegramId }, select: { id: true } });
    const isNewUser = !existing;

    const user = await prisma.user.upsert({
      where: { telegramId },
      update: {
        firstName: userData.first_name ?? null,
        username: userData.username ?? null,
        photoUrl: userData.photo_url ?? null,
        authMethod: 'telegram',
      },
      create: {
        telegramId,
        firstName: userData.first_name ?? null,
        username: userData.username ?? null,
        photoUrl: userData.photo_url ?? null,
        authMethod: 'telegram',
        wallet: {
          create: {
            balance: 1000,
            startingBalance: 1000,
            brierScores: [],
          },
        },
      },
    });

    const secret = getJwtSecret();
    const token = await createToken(secret, { userId: user.id, telegramId: String(userData.id) });

    invalidateCache();

    if (isNewUser) {
      setImmediate(() => {
        sendWelcomeMessage(telegramId, userData.first_name).catch(err =>
          console.warn('[auth/telegram-callback] Welcome message failed:', err.message),
        );
      });
    }

    res.setHeader('Set-Cookie', `nightagent_token=${token}; ${cookieAttrs()}`);
    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
    return res.redirect(`${frontendUrl}/dashboard`);
  } catch (err) {
    console.error('[auth/telegram-callback]', err);
    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
    return res.redirect(`${frontendUrl}/login?error=server`);
  }
});

// POST /api/auth/connect-telegram
router.post('/connect-telegram', requireDb, requireAuth, async (req, res) => {
  try {
    const prisma = req.prisma;
    const userId = req.user.userId;
    const attemptKey = `connect:${userId}:${req.ip || 'unknown'}`;
    if (!isConnectAttemptAllowed(attemptKey)) {
      await recordConnectAttempt(prisma, userId, req.ip, 'blocked');
      return res.status(429).json({ error: 'Too many attempts. Please wait 10 minutes and try again.' });
    }

    const { code } = req.body || {};
    if (!code || String(code).trim().length !== 6) {
      return res.status(400).json({ error: 'Enter the 6-character code from the bot' });
    }

    const normalizedCode = String(code).trim().toUpperCase();
    const stored = await prisma.appStorage.findUnique({
      where: { key: `connect_${normalizedCode}` },
    });
    if (!stored?.value) {
      await recordConnectAttempt(prisma, userId, req.ip, 'failed');
      return res.status(400).json({
        error: 'Invalid code. Send /connect to @nightagentt_bot to get a new one.',
      });
    }

    let data;
    try {
      data = JSON.parse(stored.value);
    } catch {
      data = null;
    }
    const telegramId = data?.telegramId;
    const firstName = data?.firstName ?? 'there';
    const username = data?.username ?? null;
    const expiresAt = Number(data?.expiresAt ?? 0);
    if (!telegramId || !expiresAt) {
      await recordConnectAttempt(prisma, userId, req.ip, 'failed');
      return res.status(400).json({
        error: 'Invalid code. Send /connect to @nightagentt_bot to get a new one.',
      });
    }

    if (Date.now() > expiresAt) {
      await prisma.appStorage.delete({ where: { key: `connect_${normalizedCode}` } }).catch(() => {});
      await recordConnectAttempt(prisma, userId, req.ip, 'failed');
      return res.status(400).json({
        error: 'Code expired. Send /connect to @nightagentt_bot for a new one.',
      });
    }

    const telegramIdBigInt = BigInt(telegramId);
    const existingUser = await prisma.user.findUnique({
      where: { telegramId: telegramIdBigInt },
      select: { id: true },
    });
    if (existingUser && existingUser.id !== userId) {
      await recordConnectAttempt(prisma, userId, req.ip, 'failed');
      return res.status(400).json({
        error: 'This Telegram account is already linked to another NightAgent account.',
      });
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        telegramId: telegramIdBigInt,
        username: username ?? null,
        telegramAlerts: true,
      },
    });

    await prisma.appStorage.delete({ where: { key: `connect_${normalizedCode}` } }).catch(() => {});
    invalidateCache();

    try {
      await fetch(
        `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: telegramId,
            text:
              `✅ *Telegram connected to NightAgent!*\n\n` +
              `Hi ${firstName}! You'll now receive bet signals directly here.\n\n` +
              `💰 Your paper wallet is ready.\n` +
              `I'll alert you when I find a good opportunity.`,
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '📊 Open Dashboard', url: process.env.FRONTEND_URL }],
              ],
            },
          }),
        },
      );
    } catch (botErr) {
      console.error('[connect-telegram] Confirmation message failed:', botErr?.message || botErr);
    }

    console.log(`[connect-telegram] Linked telegramId ${telegramId} to userId ${userId}`);
    return res.json({
      ok: true,
      telegramId: String(telegramId),
      message: 'Telegram connected successfully',
    });
  } catch (err) {
    console.error('[connect-telegram]', err);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// POST /api/auth/wallet
router.post('/wallet', requireDb, async (req, res) => {
  try {
    const prisma = req.prisma;
    const { publicKey, signature, message } = req.body;

    if (!publicKey || !signature || !message) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    const tsMatch = String(message).match(/Timestamp:\s*(\d+)/);
    if (!tsMatch || Date.now() - parseInt(tsMatch[1], 10) > 5 * 60 * 1000) {
      return res.status(401).json({ error: 'Message expired' });
    }

    const messageBytes = Buffer.from(message, 'utf8');
    const signatureBytes = Buffer.from(signature, 'base64');
    const pubKeyBytes = new PublicKey(publicKey).toBytes();

    const valid = nacl.sign.detached.verify(messageBytes, signatureBytes, pubKeyBytes);
    if (!valid) return res.status(401).json({ error: 'Invalid signature' });

    const user = await prisma.user.upsert({
      where: { walletAddress: publicKey },
      update: { authMethod: 'wallet' },
      create: {
        walletAddress: publicKey,
        authMethod: 'wallet',
        wallet: {
          create: { balance: 1000, startingBalance: 1000, brierScores: [] },
        },
      },
    });

    const secret = getJwtSecret();
    const token = await createToken(secret, { userId: user.id, walletAddress: publicKey });

    invalidateCache();

    res.setHeader('Set-Cookie', `nightagent_token=${token}; ${cookieAttrs()}`);
    res.json({
      token,
      user: { id: user.id, walletAddress: user.walletAddress },
    });
  } catch (err) {
    console.error('[auth/wallet]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/auth/me
router.get('/me', requireDb, requireAuth, async (req, res) => {
  try {
    const prisma = req.prisma;
    const user = await prisma.user.findUnique({
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
        wallet: {
          select: {
            balance: true,
            startingBalance: true,
            totalPnl: true,
            wins: true,
            losses: true,
            totalBets: true,
          },
        },
      },
    });

    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({
      ...user,
      telegramId: user.telegramId != null ? user.telegramId.toString() : null,
    });
  } catch (err) {
    console.error('[auth/me]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/logout', (req, res) => {
  const prod = process.env.NODE_ENV === 'production';
  const clear = prod
    ? 'nightagent_token=; HttpOnly; SameSite=None; Secure; Path=/; Max-Age=0'
    : 'nightagent_token=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0';
  res.setHeader('Set-Cookie', clear);
  res.json({ ok: true });
});

module.exports = router;
