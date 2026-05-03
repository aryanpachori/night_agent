'use strict';

const { rehydratePosition } = require('./positionSerde');

/** Stable synthetic wallet when no Telegram user row exists yet (persists paper-trading bot only). */
const INTERNAL_BOT_WALLET = 'paper-bot-internal';

function parseMaybeJson(val) {
  if (val == null) return null;
  if (typeof val === 'object') return val;
  if (typeof val === 'string') {
    try {
      return JSON.parse(val);
    } catch {
      return null;
    }
  }
  return null;
}

async function resolveBotUserIdForLoad(prisma) {
  const explicit = process.env.BOT_USER_ID;
  if (explicit) {
    const row = await prisma.wallet.findUnique({ where: { userId: explicit } });
    if (row) return explicit;
  }
  const firstWallet = await prisma.wallet.findFirst({ select: { userId: true } });
  if (firstWallet) return firstWallet.userId;
  const firstPos = await prisma.paperPosition.findFirst({ select: { userId: true } });
  if (firstPos) return firstPos.userId;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (chatId && /^\d+$/.test(String(chatId).trim())) {
    const u = await prisma.user.findUnique({ where: { telegramId: BigInt(String(chatId).trim()) } });
    if (u?.id) return u.id;
  }
  return null;
}

async function getOrCreateBotUser(prisma) {
  const explicit = process.env.BOT_USER_ID;
  if (explicit) {
    const u = await prisma.user.findUnique({ where: { id: explicit } });
    if (u) return u.id;
  }
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (chatId && /^\d+$/.test(String(chatId).trim())) {
    const tid = BigInt(String(chatId).trim());
    let user = await prisma.user.findUnique({ where: { telegramId: tid } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          telegramId: tid,
          authMethod: 'telegram',
          wallet: {
            create: {
              balance: parseFloat(process.env.PAPER_BALANCE) || 1000,
              startingBalance: parseFloat(process.env.PAPER_BALANCE) || 1000,
              brierScores: [],
            },
          },
        },
      });
    }
    return user.id;
  }

  let bot = await prisma.user.findUnique({ where: { walletAddress: INTERNAL_BOT_WALLET } });
  if (!bot) {
    bot = await prisma.user.create({
      data: {
        walletAddress: INTERNAL_BOT_WALLET,
        authMethod: 'wallet',
        wallet: {
          create: {
            balance: parseFloat(process.env.PAPER_BALANCE) || 1000,
            startingBalance: parseFloat(process.env.PAPER_BALANCE) || 1000,
            brierScores: [],
          },
        },
      },
    });
  }
  return bot.id;
}

function walletDerivedStats(w) {
  const closed = w.closedPositions || [];
  const wins = closed.filter(p => (Number(p.pnl) || 0) > 0).length;
  const losses = closed.filter(p => (Number(p.pnl) || 0) <= 0).length;
  const totalPnl = closed.reduce((s, p) => s + (Number(p.pnl) || 0), 0);
  const totalBets = closed.length + (w.positions || []).length;
  return { wins, losses, totalPnl, totalBets };
}

/** If the same position id appears in open + closed (sync bug), keep the row with higher status rank. */
function dedupePositionRows(rows) {
  const rank = { open: 3, closed: 2, resolved: 1 };
  const byId = new Map();
  for (const row of rows) {
    const prev = byId.get(row.id);
    if (!prev) {
      byId.set(row.id, row);
      continue;
    }
    const rNew = rank[row.status] ?? 0;
    const rOld = rank[prev.status] ?? 0;
    if (rNew > rOld) byId.set(row.id, row);
  }
  return [...byId.values()];
}

function rowFromPayload(userId, status, payload) {
  const p = typeof payload === 'object' && payload !== null ? payload : {};
  const openedAt = p.openedAt != null ? new Date(p.openedAt) : null;
  const closedAt = p.closedAt != null ? new Date(p.closedAt) : null;
  return {
    id: String(p.id),
    userId,
    status,
    marketId: p.marketId ?? null,
    payload: p,
    side: p.side ?? null,
    entryPrice: p.entryPrice != null ? Number(p.entryPrice) : null,
    totalCost: p.totalCost != null ? Number(p.totalCost) : null,
    myProbability: p.myEstimatedProbability != null ? Number(p.myEstimatedProbability) : null,
    edge: p.edge != null ? Number(p.edge) : null,
    pnl: p.pnl != null ? Number(p.pnl) : null,
    exitReason: p.exitReason ?? null,
    openedAt,
    closedAt,
  };
}

function snapshotFromWallet(ws, openRows, closedRows, mAlerts, pAlerts) {
  return {
    balance: ws.balance,
    totalDeposited: ws.startingBalance,
    brierScores: Array.isArray(ws.brierScores) ? ws.brierScores : [],
    positions: openRows.map(r => rehydratePosition(r.payload)),
    closedPositions: closedRows.map(r => rehydratePosition(r.payload)),
    alertedMarkets: Object.fromEntries(mAlerts.map(a => [a.marketId, Number(a.lastAlertAt)])),
    alertedPositions: Object.fromEntries(pAlerts.map(a => [a.positionId, Number(a.lastAlertAt)])),
  };
}

async function saveRelational(prisma) {
  const { getSnapshot } = require('../wallet/paperWallet');
  const { getStateForPersist } = require('../price/priceHistory');
  const llmCache = require('../llm/llmCache');
  const geminiRotation = require('../llm/geminiModelRotation');

  const userId = await getOrCreateBotUser(prisma);
  const w = getSnapshot();
  const price = getStateForPersist();
  const llm = llmCache.toJSON();
  const gr = geminiRotation.toJSON();
  const { wins, losses, totalPnl, totalBets } = walletDerivedStats(w);

  await prisma.$transaction(
    async tx => {
      await tx.wallet.upsert({
        where: { userId },
        create: {
          userId,
          balance: w.balance,
          startingBalance: w.totalDeposited,
          totalPnl,
          wins,
          losses,
          totalBets,
          brierScores: Array.isArray(w.brierScores) ? w.brierScores : [],
        },
        update: {
          balance: w.balance,
          startingBalance: w.totalDeposited,
          totalPnl,
          wins,
          losses,
          totalBets,
          brierScores: Array.isArray(w.brierScores) ? w.brierScores : [],
        },
      });

      await tx.paperPosition.deleteMany({ where: { userId } });

      const open = (w.positions || []).map(p => rowFromPayload(userId, 'open', p));
      const closed = (w.closedPositions || []).map(p =>
        rowFromPayload(userId, p.status === 'resolved' ? 'resolved' : 'closed', p),
      );
      const posRows = dedupePositionRows([...open, ...closed]);
      if (posRows.length) await tx.paperPosition.createMany({ data: posRows });

      await tx.marketAlertDedup.deleteMany({ where: { userId } });
      const ma = w.alertedMarkets || {};
      const maRows = Object.entries(ma).map(([marketId, lastAlertAt]) => ({
        userId,
        marketId,
        lastAlertAt: BigInt(Math.floor(Number(lastAlertAt) || 0)),
      }));
      if (maRows.length) await tx.marketAlertDedup.createMany({ data: maRows });

      await tx.positionAlertDedup.deleteMany({ where: { userId } });
      const pa = w.alertedPositions || {};
      const paRows = Object.entries(pa).map(([positionId, lastAlertAt]) => ({
        userId,
        positionId,
        lastAlertAt: BigInt(Math.floor(Number(lastAlertAt) || 0)),
      }));
      if (paRows.length) await tx.positionAlertDedup.createMany({ data: paRows });

      const marketIds = Object.keys(price);
      if (marketIds.length) {
        await tx.priceHistoryPoint.deleteMany({ where: { marketId: { notIn: marketIds } } });
      } else {
        await tx.priceHistoryPoint.deleteMany();
      }
      for (const marketId of marketIds) {
        const pts = price[marketId];
        await tx.priceHistoryPoint.deleteMany({ where: { marketId } });
        if (!Array.isArray(pts) || !pts.length) continue;
        await tx.priceHistoryPoint.createMany({
          data: pts.map((p, i) => ({
            marketId,
            ts: BigInt(p.timestamp),
            sortIdx: i,
            yesPrice: p.yesPrice,
            noPrice: p.noPrice,
            volume: p.volume != null && Number.isFinite(Number(p.volume)) ? Number(p.volume) : 0,
          })),
        });
      }

      await tx.llmCacheEntry.deleteMany();
      const llmRows = Object.entries(llm)
        .filter(([, v]) => v && typeof v === 'object' && v.result != null)
        .map(([marketId, v]) => ({
          marketId,
          expiresAt: BigInt(Math.floor(v.expiresAt)),
          result: v.result,
        }));
      if (llmRows.length) await tx.llmCacheEntry.createMany({ data: llmRows });

      const ymd = gr && gr.day;
      const used = (gr && gr.used) || {};
      if (ymd) {
        await tx.geminiDailyUsage.deleteMany({ where: { ymd } });
        const gu = Object.entries(used)
          .filter(([, n]) => Number(n) > 0)
          .map(([modelId, n]) => ({ ymd, modelId, used: Math.floor(Number(n)) }));
        if (gu.length) await tx.geminiDailyUsage.createMany({ data: gu });
      }
    },
    {
      maxWait: 20000,
      timeout: 120000,
    },
  );
}

async function loadWalletIntoMemory(prisma) {
  const { loadSnapshot } = require('../wallet/paperWallet');
  const userId = await resolveBotUserIdForLoad(prisma);
  if (!userId) return false;

  const ws = await prisma.wallet.findUnique({ where: { userId } });
  const [open, closed, mAlerts, pAlerts] = await Promise.all([
    prisma.paperPosition.findMany({ where: { userId, status: 'open' } }),
    prisma.paperPosition.findMany({
      where: { userId, status: { in: ['closed', 'resolved'] } },
    }),
    prisma.marketAlertDedup.findMany({ where: { userId } }),
    prisma.positionAlertDedup.findMany({ where: { userId } }),
  ]);

  if (!ws) {
    const fallback = {
      balance: parseFloat(process.env.PAPER_BALANCE) || 1000,
      startingBalance: parseFloat(process.env.PAPER_BALANCE) || 1000,
      brierScores: [],
    };
    loadSnapshot(snapshotFromWallet(fallback, open, closed, mAlerts, pAlerts));
    return true;
  }

  loadSnapshot(snapshotFromWallet(ws, open, closed, mAlerts, pAlerts));
  return true;
}

async function loadPriceIntoMemory(prisma) {
  const { loadStateFromPersist } = require('../price/priceHistory');
  const rows = await prisma.priceHistoryPoint.findMany({ orderBy: [{ marketId: 'asc' }, { sortIdx: 'asc' }] });
  if (!rows.length) return;
  const byMarket = new Map();
  for (const r of rows) {
    if (!byMarket.has(r.marketId)) byMarket.set(r.marketId, []);
    byMarket.get(r.marketId).push({
      timestamp: Number(r.ts),
      yesPrice: r.yesPrice,
      noPrice: r.noPrice,
      volume: r.volume,
    });
  }
  loadStateFromPersist(Object.fromEntries([...byMarket.entries()]));
}

async function loadLlmIntoMemory(prisma) {
  const llmCache = require('../llm/llmCache');
  const rows = await prisma.llmCacheEntry.findMany();
  if (!rows.length) return;
  const obj = Object.fromEntries(
    rows.map(r => [r.marketId, { result: r.result, expiresAt: Number(r.expiresAt) }]),
  );
  llmCache.fromJSON(obj);
}

async function loadGeminiIntoMemory(prisma) {
  const geminiRotation = require('../llm/geminiModelRotation');
  const ymd = geminiRotation._localYmd();
  const rows = await prisma.geminiDailyUsage.findMany({ where: { ymd } });
  if (!rows.length) return;
  const used = Object.fromEntries(rows.map(r => [r.modelId, r.used]));
  geminiRotation.fromJSON({ day: ymd, used });
}

/**
 * One-time: load legacy `AppStorage` JSON into memory, persist with saveRelational, remove keys.
 */
async function migrateFromLegacyAppStorage(prisma) {
  const { loadSnapshot } = require('../wallet/paperWallet');
  const { loadStateFromPersist } = require('../price/priceHistory');
  const llmCache = require('../llm/llmCache');
  const geminiRotation = require('../llm/geminiModelRotation');

  if ((await prisma.wallet.count()) > 0) return false;

  const keys = ['wallet', 'priceHistory', 'llmCache', 'geminiRotation'];
  const legacy = await prisma.appStorage.findMany({ where: { key: { in: keys } } });
  if (!legacy.length) return false;

  const byKey = new Map(legacy.map(r => [r.key, parseMaybeJson(r.value)]));

  const w = byKey.get('wallet');
  if (w && typeof w === 'object') loadSnapshot(w);

  const ph = byKey.get('priceHistory');
  if (ph && typeof ph === 'object') loadStateFromPersist(ph);

  const lc = byKey.get('llmCache');
  if (lc && typeof lc === 'object') llmCache.fromJSON(lc);

  const gr = byKey.get('geminiRotation');
  if (gr && typeof gr === 'object') geminiRotation.fromJSON(gr);

  await saveRelational(prisma);
  await prisma.appStorage.deleteMany({ where: { key: { in: keys } } });
  console.log('[db] Migrated legacy AppStorage into normalized tables and removed old keys.');
  return true;
}

async function hasRelationalData(prisma) {
  if ((await prisma.wallet.count()) > 0) return true;
  if ((await prisma.paperPosition.count()) > 0) return true;
  return (await prisma.priceHistoryPoint.count()) > 0;
}

module.exports = {
  saveRelational,
  loadWalletIntoMemory,
  loadPriceIntoMemory,
  loadLlmIntoMemory,
  loadGeminiIntoMemory,
  migrateFromLegacyAppStorage,
  hasRelationalData,
};
