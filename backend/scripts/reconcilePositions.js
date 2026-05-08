#!/usr/bin/env node
'use strict';

const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  try {
    const openPositions = await prisma.paperPosition.findMany({
      where: { status: 'open' },
      select: {
        id: true,
        userId: true,
        entryPrice: true,
        totalCost: true,
        payload: true,
      },
    });

    let mismatches = 0;
    for (const pos of openPositions) {
      const payload = pos.payload && typeof pos.payload === 'object' ? pos.payload : {};
      const contracts = Number(payload.contracts ?? 0);
      const entryPrice = Number(pos.entryPrice ?? 0);
      const totalCost = Number(pos.totalCost ?? 0);

      if (!Number.isFinite(contracts) || contracts <= 0 || !Number.isFinite(entryPrice) || entryPrice <= 0) {
        console.log(`[reconcile] ${pos.id} user=${pos.userId} invalid contracts/entryPrice`);
        mismatches += 1;
        continue;
      }

      const expectedCost = contracts * entryPrice;
      const diff = Math.abs(expectedCost - totalCost);
      if (diff > 0.01) {
        console.log(
          `[reconcile] ${pos.id} user=${pos.userId} cost mismatch expected=${expectedCost.toFixed(4)} actual=${totalCost.toFixed(4)}`,
        );
        mismatches += 1;
      }
    }

    console.log(`[reconcile] scanned=${openPositions.length} mismatches=${mismatches}`);
    process.exitCode = mismatches > 0 ? 1 : 0;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[reconcile] fatal', err);
  process.exit(1);
});
