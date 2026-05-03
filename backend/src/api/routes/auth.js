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
