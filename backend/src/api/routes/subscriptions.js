'use strict';

const crypto = require('crypto');
const express = require('express');
const { requireDb } = require('../middleware/prisma');
const { requireAuth } = require('../middleware/auth');
const { invalidateCache } = require('../../bot/userManager');

const router = express.Router();

const PRO_PLAN_ID = 'pro_monthly';
const PRO_PRICE_USD = Number(process.env.PRO_PLAN_PRICE_USD || 12);
const FREE_TIER = 'free';
const PRO_TIER = 'pro';
const DODO_TEST_BASE_URL = 'https://test.dodopayments.com';

function normalizePlanTier(value) {
  const v = String(value || '').toLowerCase();
  return v === PRO_TIER ? PRO_TIER : FREE_TIER;
}

function normalizePlanStatus(value) {
  const v = String(value || '').toLowerCase();
  if (['active', 'past_due', 'canceled', 'inactive'].includes(v)) return v;
  return 'inactive';
}

function parseIsoDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

function isValidWebhook(req) {
  const secret = process.env.DODO_WEBHOOK_SECRET;
  if (!secret) return true; // Allow test mode without secret during local dev.
  const provided = String(req.headers['x-dodo-signature'] || '');
  if (!provided) return false;
  const payload = JSON.stringify(req.body || {});
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided);
  if (expectedBuf.length !== providedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

function dodoBaseUrl() {
  // Safety lock for grant MVP: only test mode is allowed.
  return DODO_TEST_BASE_URL;
}

function buildReturnUrl() {
  const frontend = String(process.env.FRONTEND_URL || 'http://localhost:3001').replace(/\/$/, '');
  return `${frontend}/pricing?source=dodo`;
}

async function createDodoCheckoutSession({ userId, email, name }) {
  const apiKey = process.env.DODO_PAYMENTS_API_KEY;
  const productId = process.env.DODO_PRO_PRODUCT_ID;
  if (!apiKey) throw new Error('DODO_PAYMENTS_API_KEY is not configured');
  if (!productId) throw new Error('DODO_PRO_PRODUCT_ID is not configured');

  const payload = {
    product_cart: [{ product_id: productId, quantity: 1 }],
    customer: {
      email,
      name,
    },
    return_url: buildReturnUrl(),
    metadata: {
      userId,
      planId: PRO_PLAN_ID,
      source: 'nightagent_pricing',
    },
    feature_flags: {
      redirect_immediately: true,
    },
  };

  const response = await fetch(`${dodoBaseUrl()}/checkouts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    throw new Error(`Dodo checkout failed (${response.status}): ${errBody}`);
  }

  const session = await response.json();
  if (!session?.checkout_url) throw new Error('Dodo response missing checkout_url');
  return session;
}

router.get('/status', requireDb, requireAuth, async (req, res) => {
  try {
    const user = await req.prisma.user.findUnique({
      where: { id: req.user.userId },
      select: {
        planTier: true,
        planStatus: true,
        subscriptionCurrentPeriodEnd: true,
        subscriptionCancelAtPeriodEnd: true,
      },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json({
      planId: normalizePlanTier(user.planTier) === PRO_TIER ? PRO_PLAN_ID : null,
      planTier: normalizePlanTier(user.planTier),
      planStatus: normalizePlanStatus(user.planStatus),
      priceUsd: PRO_PRICE_USD,
      currentPeriodEnd: user.subscriptionCurrentPeriodEnd,
      cancelAtPeriodEnd: Boolean(user.subscriptionCancelAtPeriodEnd),
      entitlements: {
        priorityAlerts: normalizePlanTier(user.planTier) === PRO_TIER,
        advancedCategorySelection: normalizePlanTier(user.planTier) === PRO_TIER,
      },
    });
  } catch (err) {
    console.error('[subscriptions/status]', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.post('/checkout', requireDb, requireAuth, async (req, res) => {
  try {
    const { planId } = req.body || {};
    if (planId !== PRO_PLAN_ID) {
      return res.status(400).json({ error: `Unsupported plan. Use ${PRO_PLAN_ID}.` });
    }
    const user = await req.prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { firstName: true, username: true, walletAddress: true },
    });
    const fallbackName = user?.firstName || user?.username || `User-${String(req.user.userId).slice(0, 6)}`;
    const fallbackEmail = `${String(req.user.userId).slice(0, 10)}@nightagent.local`;
    const session = await createDodoCheckoutSession({
      userId: String(req.user.userId),
      email: fallbackEmail,
      name: fallbackName,
    });

    if (!session.checkout_url) {
      return res.status(500).json({ error: 'Unable to generate checkout URL' });
    }
    return res.json({
      checkoutUrl: session.checkout_url,
      sessionId: session.session_id ?? null,
      planId: PRO_PLAN_ID,
      priceUsd: PRO_PRICE_USD,
      mode: 'test',
    });
  } catch (err) {
    console.error('[subscriptions/checkout]', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
});

router.get('/manage', requireDb, requireAuth, async (req, res) => {
  try {
    const base = process.env.DODO_TEST_MANAGE_URL || process.env.DODO_MANAGE_SUBSCRIPTION_URL || '';
    if (!base) {
      return res.status(500).json({ error: 'DODO_TEST_MANAGE_URL is not configured' });
    }
    const url = new URL(base);
    url.searchParams.set('client_reference_id', req.user.userId);
    return res.json({ manageUrl: url.toString() });
  } catch (err) {
    console.error('[subscriptions/manage]', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.post('/webhook', requireDb, async (req, res) => {
  try {
    if (!isValidWebhook(req)) return res.status(401).json({ error: 'Invalid signature' });

    const eventType = String(req.body?.type || req.body?.event_type || '').toLowerCase();
    const payload = req.body?.data || req.body || {};
    const metadata = payload.metadata || req.body?.metadata || {};
    const userId = metadata.userId || metadata.user_id || payload.client_reference_id || payload.customer_reference;
    if (!userId) return res.status(400).json({ error: 'Missing user reference in webhook payload' });

    const planTier = normalizePlanTier(payload.plan_tier || payload.plan || payload.tier || '');
    const planStatus = normalizePlanStatus(payload.status || payload.subscription_status || eventType);
    const currentPeriodEnd =
      parseIsoDate(payload.current_period_end || payload.currentPeriodEnd || payload.renews_at);

    const shouldActivatePro =
      planTier === PRO_TIER ||
      eventType.includes('subscription.active') ||
      eventType.includes('subscription.created') ||
      eventType.includes('subscription.renewed');

    const updateData = {
      planTier: shouldActivatePro ? PRO_TIER : FREE_TIER,
      planStatus: shouldActivatePro ? 'active' : planStatus,
      dodoCustomerId: payload.customer_id || payload.customerId || null,
      dodoSubscriptionId: payload.subscription_id || payload.subscriptionId || null,
      subscriptionCurrentPeriodEnd: currentPeriodEnd,
      subscriptionCancelAtPeriodEnd: Boolean(payload.cancel_at_period_end || payload.cancelAtPeriodEnd),
    };
    if (shouldActivatePro) {
      updateData.maxAlertsPerDay = 30;
      updateData.alertIntervalMin = 2;
    }

    await req.prisma.user.update({
      where: { id: String(userId) },
      data: updateData,
    });
    invalidateCache();
    return res.json({ ok: true });
  } catch (err) {
    console.error('[subscriptions/webhook]', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
