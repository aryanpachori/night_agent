'use strict';

const { getPrisma } = require('../db/client');

let activeUsersCache = [];
let lastFetchAt = 0;
const CACHE_TTL_MS = 60 * 1000;

function invalidateCache() {
  lastFetchAt = 0;
}

async function fetchActiveUsersFresh(prisma) {
  return prisma.user.findMany({
    where: { isPaused: false },
    select: {
      id: true,
      telegramId: true,
      categories: true,
      riskMode: true,
      maxAlertsPerDay: true,
      alertIntervalMin: true,
      telegramAlerts: true,
      isPaused: true,
      wallet: { select: { balance: true } },
    },
  });
}

async function getActiveUsers() {
  const prisma = getPrisma();
  if (!prisma) return [];

  const now = Date.now();
  if (now - lastFetchAt < CACHE_TTL_MS && activeUsersCache.length > 0) {
    return activeUsersCache;
  }

  try {
    const users = await fetchActiveUsersFresh(prisma);
    activeUsersCache = users;
    lastFetchAt = now;
    return users;
  } catch (err) {
    console.error('[userManager] Failed to fetch users:', err.message);
    return activeUsersCache;
  }
}

async function hasActiveUsers() {
  const prisma = getPrisma();
  if (!prisma) return true;
  const users = await getActiveUsers();
  return users.length > 0;
}

async function canSendAlertToUser(prisma, user) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const max = user.maxAlertsPerDay ?? 10;

  const [alertsToday, lastAlert] = await Promise.all([
    prisma.alert.count({ where: { userId: user.id, createdAt: { gte: start } } }),
    prisma.alert.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
  ]);

  if (alertsToday >= max) return false;

  // Per-user minimum interval between alerts (default 5 min)
  const intervalMin = user.alertIntervalMin ?? 5;
  if (lastAlert) {
    const minsSinceLast = (Date.now() - new Date(lastAlert.createdAt).getTime()) / 60000;
    if (minsSinceLast < intervalMin) return false;
  }

  return true;
}

function categoryMatches(user, market) {
  const cat = String(market.category || 'crypto').toLowerCase();
  const cats = (user.categories || []).map(c => String(c).toLowerCase());
  if (!cats.length) return true;
  return cats.includes(cat);
}

/** Users eligible for opportunity alerts in DB (Telegram optional). */
async function getUsersForOpportunityAlert(market) {
  const prisma = getPrisma();
  if (!prisma) return [];

  const minBank = parseFloat(process.env.MIN_BANKROLL) || 10;
  const users = await getActiveUsers();
  const out = [];

  for (const u of users) {
    if (u.isPaused) continue;
    if (!categoryMatches(u, market)) continue;
    const bal = Number(u.wallet?.balance ?? 0);
    if (bal < minBank) continue;
    if (!(await canSendAlertToUser(prisma, u))) continue;
    out.push(u);
  }
  return out;
}

/**
 * If TELEGRAM_CHAT_ID is set and no row exists yet, create the operator user + wallet
 * so user-gated scanning can run without a prior dashboard signup.
 */
async function seedOwnerIfNeeded() {
  const prisma = getPrisma();
  if (!prisma) return;

  const raw = process.env.TELEGRAM_CHAT_ID;
  if (!raw || !/^\d+$/.test(String(raw).trim())) return;

  const telegramId = BigInt(String(raw).trim());
  const existing = await prisma.user.findUnique({ where: { telegramId } });
  if (existing) return;

  const paper = parseFloat(process.env.PAPER_BALANCE) || 1000;
  console.log('[startup] Auto-seeding owner user from TELEGRAM_CHAT_ID…');

  const user = await prisma.user.create({
    data: {
      telegramId,
      firstName: 'Owner',
      authMethod: 'telegram',
      categories: ['crypto', 'politics'],
      riskMode: 'moderate',
      maxAlertsPerDay: 10,
      isPaused: false,
      wallet: {
        create: {
          balance: paper,
          startingBalance: paper,
          brierScores: [],
        },
      },
    },
  });

  await prisma.appStorage.upsert({
    where: { key: 'botOwnerId' },
    update: { value: user.id },
    create: { key: 'botOwnerId', value: user.id },
  });

  invalidateCache();
  console.log('[startup] Owner user seeded:', user.id);
}

module.exports = {
  getActiveUsers,
  hasActiveUsers,
  invalidateCache,
  getUsersForOpportunityAlert,
  canSendAlertToUser,
  seedOwnerIfNeeded,
};
