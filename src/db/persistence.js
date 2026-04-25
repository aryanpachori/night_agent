'use strict';

const { getPrisma, isDbEnabled } = require('./client');
const {
  saveRelational,
  loadWalletIntoMemory,
  loadPriceIntoMemory,
  loadLlmIntoMemory,
  loadGeminiIntoMemory,
  migrateFromLegacyAppStorage,
  hasRelationalData,
} = require('./relationalStore');
const llmCache = require('../llm/llmCache');

let persistTimer = null;
const DEBOUNCE_MS = 400;

function requestPersist() {
  if (!isDbEnabled()) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    saveAll().catch(err => console.error('[db] persist error:', err.message));
  }, DEBOUNCE_MS);
}

async function saveAll() {
  const prisma = getPrisma();
  if (!prisma) return;
  await saveRelational(prisma);
}

/**
 * Load snapshots from DB into in-memory stores (normalized tables).
 */
async function initPersistence() {
  if (!isDbEnabled()) {
    console.log('[db] No DATABASE_URL — in-memory only (resets on restart).');
    return;
  }

  const prisma = getPrisma();

  const hadRelational = await hasRelationalData(prisma);
  const migrated = await migrateFromLegacyAppStorage(prisma);

  if (migrated) {
    // Memory was hydrated inside migrate, then saveRelational.
    console.log('[db] State loaded from legacy AppStorage migration into normalized schema.');
  } else if (hadRelational) {
    const wOk = await loadWalletIntoMemory(prisma);
    if (wOk) console.log('[db] Restored wallet from PostgreSQL.');
    await loadPriceIntoMemory(prisma);
    if ((await prisma.priceHistoryPoint.count()) > 0) {
      console.log('[db] Restored price history from PostgreSQL.');
    }
    await loadLlmIntoMemory(prisma);
    if ((await prisma.llmCacheEntry.count()) > 0) {
      console.log('[db] Restored LLM cache from PostgreSQL.');
    }
    await loadGeminiIntoMemory(prisma);
    if ((await prisma.geminiDailyUsage.count()) > 0) {
      console.log('[db] Restored Gemini rotation usage from PostgreSQL.');
    }
  } else {
    console.log('[db] Seeding new state to PostgreSQL (normalized schema)…');
    await saveAll();
  }

  llmCache.setRequestPersist(() => requestPersist());
}

async function flush() {
  if (!isDbEnabled()) return;
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  await saveAll();
}

module.exports = { initPersistence, requestPersist, saveAll, flush, isDbEnabled };
