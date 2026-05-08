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
const {
  sendVerificationCode,
  checkVerificationCode,
  revokeVerificationCode,
} = require('../telegramGateway');

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

function otpKey(phone) {
  return `otp_${phone}`;
}

function parseOtpRecord(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
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

    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
    return res.redirect(`${frontendUrl}/dashboard?token=${encodeURIComponent(token)}`);
  } catch (err) {
    console.error('[auth/telegram-callback]', err);
    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
    return res.redirect(`${frontendUrl}/login?error=server`);
  }
});

// POST /api/auth/send-otp
router.post('/send-otp', requireDb, async (req, res) => {
  try {
    const prisma = req.prisma;
    const { phone } = req.body || {};
    if (!phone) return res.status(400).json({ error: 'Phone number required' });

    const normalized = phone.trim().startsWith('+') ? phone.trim() : `+${phone.trim()}`;
    const digits = normalized.replace(/[^\d]/g, '');
    if (digits.length < 8 || digits.length > 15) {
      return res.status(400).json({ error: 'Invalid phone number' });
    }

    const { requestId } = await sendVerificationCode(normalized);
    const value = JSON.stringify({
      requestId,
      phone: normalized,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });
    await prisma.appStorage.upsert({
      where: { key: otpKey(normalized) },
      update: { value },
      create: { key: otpKey(normalized), value },
    });
    return res.json({ ok: true, message: 'Verification code sent to your Telegram app' });
  } catch (err) {
    console.error('[auth/send-otp]', err.message);
    return res.status(400).json({ error: err.message ?? 'Failed to send code' });
  }
});

// POST /api/auth/verify-otp
router.post('/verify-otp', requireDb, requireAuth, async (req, res) => {
  try {
    const prisma = req.prisma;
    const { phone, code } = req.body || {};
    const userId = req.user.userId;
    if (!phone || !code) {
      return res.status(400).json({ error: 'Phone and code are required' });
    }

    const normalized = phone.trim().startsWith('+') ? phone.trim() : `+${phone.trim()}`;
    const stored = await prisma.appStorage.findUnique({ where: { key: otpKey(normalized) } });
    if (!stored) {
      return res.status(400).json({ error: 'No pending code for this number. Please request a new one.' });
    }
    const storedData = parseOtpRecord(stored.value);
    if (!storedData?.requestId || !storedData?.expiresAt) {
      return res.status(400).json({ error: 'Invalid OTP state. Please request a new code.' });
    }
    if (Date.now() > Number(storedData.expiresAt)) {
      await prisma.appStorage.delete({ where: { key: otpKey(normalized) } }).catch(() => {});
      return res.status(400).json({ error: 'Code expired. Please request a new one.' });
    }

    const { valid, telegramId } = await checkVerificationCode(storedData.requestId, code);
    if (!valid) return res.status(400).json({ error: 'Invalid code. Please try again.' });
    await prisma.appStorage.delete({ where: { key: otpKey(normalized) } }).catch(() => {});
    await revokeVerificationCode(storedData.requestId);

    if (!telegramId) {
      return res.status(400).json({ error: 'Could not get Telegram ID. Please try again.' });
    }

    const existingUser = await prisma.user.findUnique({
      where: { telegramId: BigInt(telegramId) },
      select: { id: true },
    });
    if (existingUser && existingUser.id !== userId) {
      return res.status(400).json({ error: 'This Telegram account is already linked to another NightAgent account.' });
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        telegramId: BigInt(telegramId),
        telegramAlerts: true,
      },
      select: {
        id: true,
        firstName: true,
        username: true,
        telegramId: true,
        telegramAlerts: true,
      },
    });
    invalidateCache();

    fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: telegramId,
        text:
          '✅ *Telegram connected to NightAgent!*\n\n' +
          "You'll now receive bet signals directly in this chat.\n\n" +
          "💰 Your paper wallet is ready with $1,000 USDC.\n\n" +
          '_I\'ll alert you the next time I find a good opportunity._',
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[{ text: '📊 Open Dashboard', url: process.env.FRONTEND_URL }]],
        },
      }),
    }).catch((sendErr) => {
      console.log('[verify-otp] Could not send welcome message:', sendErr?.message || sendErr);
    });

    return res.json({
      ok: true,
      telegramId: telegramId.toString(),
      message: 'Telegram connected successfully',
      user: {
        ...updatedUser,
        telegramId: updatedUser.telegramId?.toString(),
      },
    });
  } catch (err) {
    console.error('[auth/verify-otp]', err?.message || err);
    return res.status(400).json({ error: err?.message || 'Verification failed' });
  }
});

// POST /api/auth/resend-otp
router.post('/resend-otp', requireDb, async (req, res) => {
  try {
    const prisma = req.prisma;
    const { phone } = req.body || {};
    if (!phone) return res.status(400).json({ error: 'Phone required' });

    const normalized = phone.trim().startsWith('+') ? phone.trim() : `+${phone.trim()}`;
    const existing = await prisma.appStorage.findUnique({ where: { key: otpKey(normalized) } });
    const stored = parseOtpRecord(existing?.value);
    if (stored?.requestId) {
      await revokeVerificationCode(stored.requestId);
    }
    const { requestId } = await sendVerificationCode(normalized);
    const value = JSON.stringify({
      requestId,
      phone: normalized,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });
    await prisma.appStorage.upsert({
      where: { key: otpKey(normalized) },
      update: { value },
      create: { key: otpKey(normalized), value },
    });
    return res.json({ ok: true, message: 'New code sent' });
  } catch (err) {
    return res.status(400).json({ error: err?.message || 'Failed to resend OTP' });
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
