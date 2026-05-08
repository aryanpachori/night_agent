'use strict';

const crypto = require('crypto');
const express = require('express');
const { requireDb } = require('../middleware/prisma');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const JUPITER_BASE = process.env.JUPITER_PREDICTION_BASE_URL ?? 'https://api.jup.ag/prediction/v1';
const JUPITER_KEY = process.env.JUPITER_PREDICTION_API_KEY ?? process.env.JUPITER_API_KEY ?? '';
const DEBUG_JUPITER_TIME = String(process.env.DEBUG_JUPITER_TIME || '').toLowerCase() === 'true';

function asObjectPayload(payload) {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) return { ...payload };
  return {};
}

function buildPositionEventName(question, side) {
  if (!question || String(question).length < 5) return 'Market event';

  const q = String(question).toLowerCase();
  let token = null;
  if (q.includes('bitcoin') || q.includes('btc')) token = 'Bitcoin';
  else if (q.includes('ethereum') || q.includes('eth')) token = 'Ethereum';
  else if (q.includes('solana') || q.includes('sol')) token = 'Solana';
  else if (q.includes('bnb')) token = 'BNB';
  else if (q.includes('xrp')) token = 'XRP';
  else if (q.includes('doge')) token = 'Dogecoin';
  else if (q.includes('hyper') || q.includes('hype')) token = 'Hyperliquid';

  if (!token) {
    const cleaned = String(question)
      .replace(/This market will resolve.*?if /gi, '')
      .replace(/the .* price at.*$/gi, '')
      .trim();
    return cleaned.slice(0, 60) || String(question).slice(0, 60);
  }

  const timeMatch = String(question).match(/(\d+)\s*(min|minute|hour|hr)/i);
  const timeStr = timeMatch ? ` in ${timeMatch[1]}${timeMatch[2][0]}` : '';
  const isUpMarket = q.includes(' up') || q.includes('upper') || q.includes('above');
  const isDownMarket = q.includes(' down') || q.includes('lower') || q.includes('below');

  let direction = '';
  if (side === 'YES') direction = isUpMarket ? '↑ UP' : isDownMarket ? '↓ DOWN' : '↑ UP';
  else direction = isUpMarket ? '↓ DOWN' : isDownMarket ? '↑ UP' : '↓ DOWN';

  return `${token} ${direction}${timeStr}`;
}

function normalizeIdempotencyKey(raw) {
  if (!raw) return null;
  const key = String(raw).trim();
  if (!key || key.length > 120) return null;
  return key;
}

function deriveCloseTimeFromQuestion(question) {
  if (!question) return null;
  const q = String(question);
  const re = /([A-Za-z]+)\s+(\d{1,2}),\s*(\d{1,2}):(\d{2})(AM|PM)\s*-\s*(\d{1,2}):(\d{2})(AM|PM)/i;
  const m = q.match(re);
  if (!m) return null;

  const monthStr = m[1];
  const day = Number(m[2]);
  const endHourRaw = Number(m[6]);
  const endMinute = Number(m[7]);
  const endMeridiem = String(m[8] || '').toUpperCase();

  const monthIdx = new Date(`${monthStr} 1, 2000`).getMonth();
  if (!Number.isFinite(monthIdx) || monthIdx < 0 || monthIdx > 11) return null;
  if (!Number.isFinite(day) || day < 1 || day > 31) return null;
  if (!Number.isFinite(endHourRaw) || endHourRaw < 1 || endHourRaw > 12) return null;
  if (!Number.isFinite(endMinute) || endMinute < 0 || endMinute > 59) return null;

  let hour24 = endHourRaw % 12;
  if (endMeridiem === 'PM') hour24 += 12;

  const now = new Date();
  let year = now.getUTCFullYear();
  let candidate = new Date(Date.UTC(year, monthIdx, day, hour24, endMinute, 0, 0));

  // If parsed close is implausibly far in the past, assume next year market label.
  if (candidate.getTime() < now.getTime() - 90 * 24 * 60 * 60 * 1000) {
    year += 1;
    candidate = new Date(Date.UTC(year, monthIdx, day, hour24, endMinute, 0, 0));
  }

  return candidate.getTime();
}

function parseMaybeMs(value) {
  if (value == null) return null;
  if (typeof value === 'string') {
    const asNum = Number(value);
    if (Number.isFinite(asNum) && asNum > 0) {
      return asNum > 1e12 ? asNum : asNum * 1000;
    }
    const asDate = Date.parse(value);
    return Number.isFinite(asDate) ? asDate : null;
  }
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value > 1e12 ? value : value * 1000;
  }
  return null;
}

function extractCloseTimeMs(jupData) {
  if (!jupData || typeof jupData !== 'object') return null;
  const candidates = [
    jupData.closeTime,
    jupData.market?.closeTime,
    jupData.market?.resolveAt,
    jupData.metadata?.closeTime,
    jupData.event?.closeTime,
    jupData.event?.metadata?.closeTime,
  ];
  for (const c of candidates) {
    const ms = parseMaybeMs(c);
    if (ms) return ms;
  }
  return null;
}

async function getIdempotentResult(prisma, key) {
  const row = await prisma.appStorage.findUnique({ where: { key } });
  if (!row?.value) return null;
  try {
    return JSON.parse(row.value);
  } catch {
    return null;
  }
}

async function saveIdempotentResult(prisma, key, payload) {
  await prisma.appStorage.upsert({
    where: { key },
    update: { value: JSON.stringify(payload) },
    create: { key, value: JSON.stringify(payload) },
  });
}

router.get('/', requireDb, requireAuth, async (req, res) => {
  try {
    const { status, limit = '50', offset = '0' } = req.query;
    const where = {
      userId: req.user.userId,
      ...(status && status !== 'all' ? { status } : {}),
    };
    const [positions, total] = await Promise.all([
      req.prisma.paperPosition.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take: Math.min(parseInt(limit, 10) || 50, 100),
        skip: parseInt(offset, 10) || 0,
      }),
      req.prisma.paperPosition.count({ where }),
    ]);

    const formatted = await Promise.all(
      positions.map(async (pos) => {
        const payload = asObjectPayload(pos.payload);
        let currentPrice = Number(pos.entryPrice ?? 0);
        let daysLeft = null;
        let hoursLeft = null;
        let timeLabel = '—';
        let marketQuestion = String(
          pos.marketQuestion
          ?? payload.marketQuestion
          ?? payload.question
          ?? '',
        );

        const isBadQuestion = ['down', 'up', 'yes', 'no', ''].includes(marketQuestion.toLowerCase().trim());
        if (isBadQuestion) {
          marketQuestion = `Market ${String(pos.marketId ?? '').slice(0, 8) || 'event'}`;
        }

        if (pos.status === 'open' && pos.marketId) {
          let closeMs = Number(payload.closeTimeMs ?? 0) || null;
          try {
            const jupRes = await fetch(`${JUPITER_BASE}/markets/${pos.marketId}`, {
              headers: JUPITER_KEY ? { 'x-api-key': JUPITER_KEY } : {},
              signal: AbortSignal.timeout(4000),
            });
            if (jupRes.ok) {
              const jupData = await jupRes.json();
              const pricing = jupData.pricing ?? {};
              if (pos.side === 'YES') {
                currentPrice = Number(pricing.buyYesPriceUsd ?? pricing.buyYesCost ?? 0) / 1_000_000;
              } else {
                currentPrice = Number(pricing.buyNoPriceUsd ?? pricing.buyNoCost ?? 0) / 1_000_000;
              }

              if (!closeMs) {
                closeMs = extractCloseTimeMs(jupData);
              }
              if (DEBUG_JUPITER_TIME) {
                console.log('[positions] jup market time payload', {
                  marketId: pos.marketId,
                  closeTime: jupData?.closeTime,
                  marketCloseTime: jupData?.market?.closeTime,
                  metadataCloseTime: jupData?.metadata?.closeTime,
                  eventCloseTime: jupData?.event?.closeTime,
                  eventMetadataCloseTime: jupData?.event?.metadata?.closeTime,
                  extractedCloseMs: closeMs,
                });
              }

              if (jupData.title && jupData.title.length > 10) marketQuestion = jupData.title;
              else if (jupData.question && jupData.question.length > 10) marketQuestion = jupData.question;
            }
          } catch (jupErr) {
            console.error(`[positions] Jupiter fetch failed for ${pos.marketId}:`, jupErr.message);
          }

          if (!closeMs) {
            closeMs = deriveCloseTimeFromQuestion(marketQuestion);
          }

          if (closeMs) {
            const msLeft = closeMs - Date.now();
            if (msLeft > 0) {
              const totalMins = Math.ceil(msLeft / 60000);
              if (totalMins < 60) {
                timeLabel = `${totalMins}m`;
                hoursLeft = 0;
                daysLeft = 0;
              } else if (totalMins < 1440) {
                hoursLeft = Math.ceil(totalMins / 60);
                timeLabel = `${hoursLeft}h`;
                daysLeft = 0;
              } else {
                daysLeft = Math.ceil(totalMins / 1440);
                timeLabel = `${daysLeft}d`;
              }
            } else {
              timeLabel = 'Ended';
              hoursLeft = 0;
              daysLeft = 0;
            }
          }
        }

        const totalCost = Number(pos.totalCost ?? 0);
        const contracts = Number(
          payload.contracts
          ?? (Number(pos.entryPrice ?? 0) > 0 ? Math.floor(totalCost / Number(pos.entryPrice)) : 0),
        );
        const currentValue = currentPrice * contracts;
        const pnl = pos.status === 'open'
          ? currentValue - totalCost
          : Number(pos.pnl ?? payload.pnl ?? 0);
        const pnlPercent = totalCost > 0 ? (pnl / totalCost) * 100 : 0;

        return {
          ...payload,
          id: pos.id,
          status: pos.status,
          marketId: pos.marketId,
          side: pos.side,
          entryPrice: pos.entryPrice,
          totalCost: pos.totalCost,
          pnl: Math.round(pnl * 100) / 100,
          pnlPercent: Math.round(pnlPercent * 100) / 100,
          currentPrice: Math.round(currentPrice * 1000) / 1000,
          currentValue: Math.round(currentValue * 100) / 100,
          contracts,
          eventName: buildPositionEventName(marketQuestion, pos.side),
          marketQuestion,
          daysLeft,
          hoursLeft,
          timeLabel,
          exitReason: pos.exitReason,
          openedAt: pos.openedAt,
          closedAt: pos.closedAt,
          closePrice: pos.closePrice ?? payload.closePrice ?? null,
          finalPnl: pos.pnl,
        };
      }),
    );

    res.json({ positions: formatted, total });
  } catch (err) {
    console.error('[positions]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id', requireDb, requireAuth, async (req, res) => {
  try {
    const pos = await req.prisma.paperPosition.findFirst({
      where: { id: req.params.id, userId: req.user.userId },
    });
    if (!pos) return res.status(404).json({ error: 'Not found' });
    res.json({ ...asObjectPayload(pos.payload), id: pos.id, status: pos.status });
  } catch (err) {
    console.error('[positions/:id]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', requireDb, requireAuth, async (req, res) => {
  try {
    const idempotencyKey = normalizeIdempotencyKey(
      req.headers['x-idempotency-key'] ?? req.body?.idempotencyKey ?? null,
    );
    if (idempotencyKey) {
      const existing = await getIdempotentResult(
        req.prisma,
        `idem:positions:create:${req.user.userId}:${idempotencyKey}`,
      );
      if (existing) return res.status(200).json(existing);
    }

    const { marketId, marketQuestion, category, side, entryPrice, amount } = req.body;
    if (!marketId || !side || entryPrice == null || amount == null) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (!['YES', 'NO'].includes(side)) return res.status(400).json({ error: 'Invalid side' });
    if (Number(amount) < 1) return res.status(400).json({ error: 'Min bet $1' });

    // Never allow opening a position on an already-ended market.
    let closeMs = null;
    try {
      const jupRes = await fetch(`${JUPITER_BASE}/markets/${marketId}`, {
        headers: JUPITER_KEY ? { 'x-api-key': JUPITER_KEY } : {},
        signal: AbortSignal.timeout(4000),
      });
      if (jupRes.ok) {
        const jupData = await jupRes.json();
        closeMs = extractCloseTimeMs(jupData);
        if (DEBUG_JUPITER_TIME) {
          console.log('[positions POST] jup market time payload', {
            marketId,
            closeTime: jupData?.closeTime,
            marketCloseTime: jupData?.market?.closeTime,
            metadataCloseTime: jupData?.metadata?.closeTime,
            eventCloseTime: jupData?.event?.closeTime,
            eventMetadataCloseTime: jupData?.event?.metadata?.closeTime,
            extractedCloseMs: closeMs,
          });
        }
        if (closeMs && Date.now() >= closeMs) {
          return res.status(400).json({
            error: 'This alert already ended. Choose a live alert.',
          });
        }
      }
    } catch (jupErr) {
      console.warn('[positions POST] Jupiter close-time check failed:', jupErr?.message || jupErr);
    }

    const wallet = await req.prisma.wallet.findUnique({
      where: { userId: req.user.userId },
      select: { balance: true },
    });
    if (!wallet || wallet.balance < amount) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    const openCount = await req.prisma.paperPosition.count({
      where: { userId: req.user.userId, status: 'open' },
    });
    if (openCount >= 10) return res.status(400).json({ error: 'Max 10 open positions' });

    const ep = Number(entryPrice);
    const amt = Number(amount);
    const contracts = Math.floor(amt / ep);
    const actualCost = contracts * ep;
    const now = new Date();
    // id is globally unique across all users (PaperPosition @id) — never use only Date.now()
    const positionId = `pos_${crypto.randomUUID().replace(/-/g, '')}`;

    const payload = {
      id: positionId,
      userId: req.user.userId,
      marketId,
      marketQuestion: marketQuestion ?? '',
      category: category ?? 'unknown',
      side,
      contracts,
      entryPrice: ep,
      totalCost: actualCost,
      potentialPayout: contracts,
      potentialProfit: contracts - actualCost,
      status: 'open',
      openedAt: now.toISOString(),
      closeTimeMs: closeMs,
      source: 'dashboard',
    };

    await req.prisma.$transaction([
      req.prisma.paperPosition.create({
        data: {
          id: positionId,
          userId: req.user.userId,
          status: 'open',
          marketId,
          side,
          entryPrice: ep,
          totalCost: actualCost,
          openedAt: now,
          payload,
        },
      }),
      req.prisma.wallet.update({
        where: { userId: req.user.userId },
        data: { balance: { decrement: actualCost }, totalBets: { increment: 1 } },
      }),
    ]);

    const result = { position: payload };
    if (idempotencyKey) {
      await saveIdempotentResult(
        req.prisma,
        `idem:positions:create:${req.user.userId}:${idempotencyKey}`,
        result,
      );
    }
    res.status(201).json(result);
  } catch (err) {
    console.error('[positions POST]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/:id', requireDb, requireAuth, async (req, res) => {
  try {
    const idempotencyKey = normalizeIdempotencyKey(
      req.headers['x-idempotency-key'] ?? req.body?.idempotencyKey ?? null,
    );
    if (idempotencyKey) {
      const existing = await getIdempotentResult(
        req.prisma,
        `idem:positions:close:${req.user.userId}:${req.params.id}:${idempotencyKey}`,
      );
      if (existing) return res.status(200).json(existing);
    }

    const { closePrice, exitReason = 'manual' } = req.body;
    const cp = Number(closePrice);
    if (!Number.isFinite(cp) || cp < 0 || cp > 1) {
      return res.status(400).json({ error: 'closePrice must be 0-1' });
    }

    const position = await req.prisma.paperPosition.findFirst({
      where: { id: req.params.id, userId: req.user.userId, status: 'open' },
    });
    if (!position) return res.status(404).json({ error: 'Position not found or already closed' });

    const payload = asObjectPayload(position.payload);
    const contracts = Number(payload.contracts ?? 0);
    const side = position.side ?? 'YES';
    const entry = Number(position.entryPrice ?? 0);
    const exitValue = cp * contracts;
    const pnl =
      side === 'YES' ? (cp - entry) * contracts : (entry - cp) * contracts;

    const now = new Date();
    const mergedPayload = {
      ...payload,
      status: 'closed',
      closePrice: cp,
      pnl,
      exitReason,
      closedAt: now.toISOString(),
    };

    await req.prisma.$transaction([
      req.prisma.paperPosition.update({
        where: { id: req.params.id },
        data: {
          status: 'closed',
          pnl,
          exitReason,
          closedAt: now,
          payload: mergedPayload,
        },
      }),
      req.prisma.wallet.update({
        where: { userId: req.user.userId },
        data: {
          balance: { increment: exitValue },
          totalPnl: { increment: pnl },
          ...(pnl >= 0 ? { wins: { increment: 1 } } : { losses: { increment: 1 } }),
        },
      }),
      req.prisma.positionAlertDedup.deleteMany({
        where: { userId: req.user.userId, positionId: req.params.id },
      }),
    ]);

    const result = {
      id: req.params.id,
      status: 'closed',
      pnl,
      closePrice: cp,
      exitValue,
      exitReason,
    };
    if (idempotencyKey) {
      await saveIdempotentResult(
        req.prisma,
        `idem:positions:close:${req.user.userId}:${req.params.id}:${idempotencyKey}`,
        result,
      );
    }
    res.json(result);
  } catch (err) {
    console.error('[positions PATCH]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
