'use strict';

const { rehydratePosition } = require('./positionSerde');

/**
 * Normalized Prisma tables (replaces monolithic AppStorage JSON snapshots).
 */

async function saveRelational(prisma) {
  const { getSnapshot } = require('../wallet/paperWallet');
  const { getStateForPersist } = require('../price/priceHistory');
  const llmCache = require('../llm/llmCache');
  const geminiRotation = require('../llm/geminiModelRotation');

  const w = getSnapshot();
  const price = getStateForPersist();
  const llm = llmCache.toJSON();
  const gr = geminiRotation.toJSON();

  await prisma.$transaction(async tx => {
    await tx.walletSettings.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        balance: w.balance,
        totalDeposited: w.totalDeposited,
        brierScores: w.brierScores,
      },
      update: {
        balance: w.balance,
        totalDeposited: w.totalDeposited,
        brierScores: w.brierScores,
      },
    });

    await tx.paperPosition.deleteMany();
    const open = (w.positions || []).map(p => ({ id: p.id, status: 'open', marketId: p.marketId ?? null, payload: p }));
    const closed = (w.closedPositions || []).map(p => ({ id: p.id, status: 'closed', marketId: p.marketId ?? null, payload: p }));
    const posRows = [...open, ...closed];
    if (posRows.length) {
      await tx.paperPosition.createMany({ data: posRows });
    }

    await tx.marketAlertDedup.deleteMany();
    const ma = w.alertedMarkets || {};
    const maRows = Object.entries(ma).map(([marketId, lastAlertAt]) => ({
      marketId,
      lastAlertAt: BigInt(Math.floor(Number(lastAlertAt) || 0)),
    }));
    if (maRows.length) await tx.marketAlertDedup.createMany({ data: maRows });

    await tx.positionAlertDedup.deleteMany();
    const pa = w.alertedPositions || {};
    const paRows = Object.entries(pa).map(([positionId, lastAlertAt]) => ({
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
  });
}

function snapshotFromDb(ws, openRows, closedRows, mAlerts, pAlerts) {
  return {
    balance: ws.balance,
    totalDeposited: ws.totalDeposited,
    brierScores: Array.isArray(ws.brierScores) ? ws.brierScores : [],
    positions: openRows.map(r => rehydratePosition(r.payload)),
    closedPositions: closedRows.map(r => rehydratePosition(r.payload)),
    alertedMarkets: Object.fromEntries(mAlerts.map(a => [a.marketId, Number(a.lastAlertAt)])),
    alertedPositions: Object.fromEntries(pAlerts.map(a => [a.positionId, Number(a.lastAlertAt)])),
  };
}

async function loadWalletIntoMemory(prisma) {
  const { loadSnapshot } = require('../wallet/paperWallet');
  const ws = await prisma.walletSettings.findUnique({ where: { id: 1 } });
  if (!ws) return false;
  const [open, closed, mAlerts, pAlerts] = await Promise.all([
    prisma.paperPosition.findMany({ where: { status: 'open' } }),
    prisma.paperPosition.findMany({ where: { status: 'closed' } }),
    prisma.marketAlertDedup.findMany(),
    prisma.positionAlertDedup.findMany(),
  ]);
  loadSnapshot(snapshotFromDb(ws, open, closed, mAlerts, pAlerts));
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
 * One-time: load legacy `AppStorage` into memory, persist with saveRelational, remove keys.
 */
async function migrateFromLegacyAppStorage(prisma) {
  const { loadSnapshot } = require('../wallet/paperWallet');
  const { loadStateFromPersist } = require('../price/priceHistory');
  const llmCache = require('../llm/llmCache');
  const geminiRotation = require('../llm/geminiModelRotation');

  const hasNew = await prisma.walletSettings.findUnique({ where: { id: 1 } });
  if (hasNew) return false;

  const keys = ['wallet', 'priceHistory', 'llmCache', 'geminiRotation'];
  const legacy = await prisma.appStorage.findMany({ where: { key: { in: keys } } });
  if (!legacy.length) return false;

  const byKey = new Map(legacy.map(r => [r.key, r.value]));

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
  const ws = await prisma.walletSettings.findUnique({ where: { id: 1 } });
  if (ws) return true;
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
