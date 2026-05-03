'use strict';

const { getPrisma } = require('./client');

/** Writes ISO timestamp for `/api/stats/bot-status` (requires `DATABASE_URL` + migrated `AppStorage`). */
async function recordLastScanAt() {
  const prisma = getPrisma();
  if (!prisma) return;
  try {
    await prisma.appStorage.upsert({
      where: { key: 'lastScanAt' },
      update: { value: new Date().toISOString() },
      create: { key: 'lastScanAt', value: new Date().toISOString() },
    });
  } catch (err) {
    console.warn('[lastScanAt]', err.message);
  }
}

module.exports = { recordLastScanAt };
