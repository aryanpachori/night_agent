'use strict';

require('dotenv').config();

const { getPrisma, disconnect } = require('../src/db/client');

const BAD_QUESTIONS = new Set(['down', 'up', 'yes', 'no', 'true', 'false', '']);
const JUPITER_BASE = process.env.JUPITER_PREDICTION_BASE_URL ?? 'https://api.jup.ag/prediction/v1';
const JUPITER_KEY = process.env.JUPITER_PREDICTION_API_KEY ?? process.env.JUPITER_API_KEY ?? '';

function isBadQuestion(value) {
  const q = String(value ?? '').toLowerCase().trim();
  return BAD_QUESTIONS.has(q) || q.length < 5;
}

async function fetchJupiterQuestion(marketId) {
  const res = await fetch(`${JUPITER_BASE}/markets/${marketId}`, {
    headers: JUPITER_KEY ? { 'x-api-key': JUPITER_KEY } : {},
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const question = String(data?.title ?? data?.question ?? '').trim();
  return question.length > 10 ? question : null;
}

async function main() {
  const prisma = getPrisma();
  if (!prisma) {
    console.error('No DATABASE_URL configured.');
    process.exit(1);
  }

  const positions = await prisma.paperPosition.findMany({
    where: { status: 'open' },
    orderBy: { updatedAt: 'desc' },
  });

  console.log(`Found ${positions.length} open positions to check.`);
  let fixed = 0;

  for (const pos of positions) {
    const payload = (pos.payload && typeof pos.payload === 'object' && !Array.isArray(pos.payload))
      ? { ...pos.payload }
      : {};
    const currentQuestion = String(payload.marketQuestion ?? '');
    if (!isBadQuestion(currentQuestion) || !pos.marketId) continue;

    console.log(`Fixing ${pos.id} (current="${currentQuestion || '(empty)'}", market=${pos.marketId})`);
    try {
      const better = await fetchJupiterQuestion(pos.marketId);
      if (!better) {
        console.log('  -> no better question from Jupiter');
      } else {
        payload.marketQuestion = better;
        await prisma.paperPosition.update({
          where: { id: pos.id },
          data: { payload },
        });
        fixed++;
        console.log(`  -> fixed: "${better.slice(0, 80)}"`);
      }
    } catch (err) {
      console.error(`  -> failed: ${err.message}`);
    }

    await new Promise((r) => setTimeout(r, 400));
  }

  console.log(`Done. Fixed ${fixed} open positions.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await disconnect();
  });
