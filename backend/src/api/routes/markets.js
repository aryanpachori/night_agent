'use strict';

const express = require('express');
const { requireDb } = require('../middleware/prisma');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const JUPITER_BASE =
  process.env.JUPITER_PREDICTION_BASE_URL || process.env.JUPITER_API_BASE || 'https://api.jup.ag/prediction/v1';
const JUPITER_KEY = process.env.JUPITER_PREDICTION_API_KEY || process.env.JUPITER_API_KEY || '';

function extractEvents(data) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];

  if (Array.isArray(data.events)) return data.events;
  if (Array.isArray(data.data)) return data.data;
  if (Array.isArray(data.items)) return data.items;
  if (data.events && typeof data.events === 'object') return Object.values(data.events);

  return [];
}

router.get('/', requireDb, requireAuth, async (req, res) => {
  try {
    const { category, filter = 'live', limit = '20' } = req.query;
    const params = new URLSearchParams({
      filter,
      includeMarkets: 'true',
      limit: Math.min(parseInt(limit, 10) || 20, 50).toString(),
      ...(category && category !== 'all' ? { category } : {}),
    });

    const response = await fetch(`${JUPITER_BASE}/events?${params}`, {
      headers: { 'x-api-key': JUPITER_KEY },
    });

    if (!response.ok) return res.status(502).json({ error: 'Jupiter API error', status: response.status });

    const data = await response.json();
    const events = extractEvents(data);
    if (!Array.isArray(events)) {
      console.warn('[markets] Unexpected Jupiter response shape');
      return res.json({ markets: [], total: 0 });
    }

    const markets = events.map(event => {
      const pricing = event.pricing ?? {};
      const yesPrice = Number(pricing.buyYesPriceUsd ?? 500000) / 1_000_000;
      const noPrice = Number(pricing.buyNoPriceUsd ?? 500000) / 1_000_000;
      const openMs =
        event.openTime > 1e12 ? Number(event.openTime) : Number(event.openTime ?? 0) * 1000;
      return {
        id: event.id,
        question: event.title ?? event.question,
        category: event.category,
        volume: Number(pricing.volume ?? 0) / 1_000_000,
        yesPrice: Math.round(yesPrice * 1000) / 1000,
        noPrice: Math.round(noPrice * 1000) / 1000,
        openTime: event.openTime,
        closeTime: event.closeTime,
        isNew: Date.now() - openMs < 24 * 60 * 60 * 1000,
      };
    });

    res.json({ markets, total: markets.length });
  } catch (err) {
    console.error('[markets]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id', requireDb, requireAuth, async (req, res) => {
  try {
    const marketId = req.params.id;

    const [jupiterRes, llmCache, priceHistory] = await Promise.all([
      fetch(`${JUPITER_BASE}/markets/${marketId}`, { headers: { 'x-api-key': JUPITER_KEY } }).then(async r =>
        r.ok ? r.json() : null,
      ),
      req.prisma.llmCacheEntry.findUnique({ where: { marketId } }),
      req.prisma.priceHistoryPoint.findMany({
        where: { marketId },
        orderBy: { sortIdx: 'asc' },
        take: 100,
      }),
    ]);

    if (!jupiterRes) return res.status(404).json({ error: 'Market not found' });

    const pricing = jupiterRes.pricing ?? {};
    const yesPrice = Number(pricing.buyYesPriceUsd ?? 500000) / 1_000_000;
    const noPrice = Number(pricing.buyNoPriceUsd ?? 500000) / 1_000_000;

    res.json({
      market: {
        id: marketId,
        question: jupiterRes.title ?? jupiterRes.question,
        category: jupiterRes.category,
        yesPrice: Math.round(yesPrice * 1000) / 1000,
        noPrice: Math.round(noPrice * 1000) / 1000,
        volume: Number(pricing.volume ?? 0) / 1_000_000,
        closeTime: jupiterRes.closeTime,
        result: jupiterRes.result ?? null,
      },
      analysis: llmCache?.result ?? null,
      analysisFresh: llmCache ? Number(llmCache.expiresAt) > Date.now() : false,
      priceHistory: priceHistory.map(p => ({
        ts: Number(p.ts),
        yesPrice: p.yesPrice,
        noPrice: p.noPrice,
        volume: p.volume,
      })),
    });
  } catch (err) {
    console.error('[markets/:id]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
