# AGENT 3 — Fix Position Data Saving from Jupiter API
> Run this AFTER Agent 2.
> Fixes: positions saved with wrong/missing data from Jupiter.
> Core fix: when bot places a bet and saves to DB, it must
> fetch and store the FULL market data from Jupiter first.

---

## ROOT CAUSE

When the bot places a paper bet, it saves incomplete data:
- marketQuestion saved as just "Down" or "Up" (the resolution label)
- marketId might be wrong format
- contracts not calculated correctly
- closeTime not stored

This happens because the bot is saving the raw Jupiter
response without extracting the right fields.

---

## BACKEND — Fix position creation in bot

### In your bot's paper trading / bet placement code

Find wherever paperPosition is created (likely in
src/paperTrading.js or similar) and update:

```javascript
async function placePaperBet(userId, market, analysis, kelly) {
  // market object should have these fields from Jupiter:
  // market.id, market.question, market.title, market.category
  // market.yesPrice, market.noPrice, market.closeTime

  const side = kelly.side  // 'YES' or 'NO'
  const entryPrice = side === 'YES' ? market.yesPrice : market.noPrice
  const betAmount = kelly.amount
  const contracts = Math.floor(betAmount / entryPrice)
  const actualCost = contracts * entryPrice
  const potentialPayout = contracts * 1  // each contract pays $1

  // Get the best question text available
  const marketQuestion = market.title
    ?? market.question
    ?? market.marketQuestion
    ?? `Market ${market.id}`

  // Compute closeTime
  const closeTimeMs = market.closeTime > 1e12
    ? market.closeTime
    : (market.closeTime ?? 0) * 1000

  const now = new Date()
  const positionId = `pos_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

  const payload = {
    id: positionId,
    userId,
    marketId: market.id,
    marketQuestion,        // ← FULL question, not just "Down"
    category: market.category ?? 'crypto',
    side,
    contracts,
    entryPrice,
    totalCost: actualCost,
    potentialPayout,
    potentialProfit: potentialPayout - actualCost,
    myProbability: analysis.probability,
    edge: analysis.edge,
    ev: analysis.ev,
    confidence: analysis.confidence,
    status: 'open',
    openedAt: now.toISOString(),
    closeTime: closeTimeMs,    // ← store closeTime
    source: 'bot',
  }

  // Save to DB
  await prisma.$transaction([
    prisma.paperPosition.create({
      data: {
        id: positionId,
        userId,
        status: 'open',
        marketId: market.id,
        marketQuestion,          // ← store full question
        side,
        entryPrice,
        totalCost: actualCost,
        openedAt: now,
        payload,
      },
    }),
    prisma.wallet.update({
      where: { userId },
      data: {
        balance: { decrement: actualCost },
        totalBets: { increment: 1 },
      },
    }),
  ])

  console.log(`[paper] Placed ${side} bet on "${marketQuestion.slice(0, 50)}"`)
  console.log(`[paper] Amount: $${actualCost.toFixed(2)} | Contracts: ${contracts} | Entry: ${entryPrice}`)

  return { positionId, actualCost, contracts }
}
```

---

## BACKEND — Fix how market data is passed to bet function

### Find where the bot calls placePaperBet

The market object being passed might have wrong field names.
Log what's available and make sure question is extracted:

```javascript
// In scanner/alert code — before calling placePaperBet:
console.log('[debug] Market object keys:', Object.keys(market))
console.log('[debug] Market title:', market.title)
console.log('[debug] Market question:', market.question)
console.log('[debug] Market id:', market.id)

// Normalize market object before passing to bet function:
const normalizedMarket = {
  id: market.id ?? market.marketId,
  title: market.title ?? market.question ?? market.marketQuestion,
  question: market.question ?? market.title ?? market.marketQuestion,
  category: market.category ?? 'crypto',
  yesPrice: market.yesPrice,
  noPrice: market.noPrice ?? (1 - market.yesPrice),
  closeTime: market.closeTime ?? market.endTime ?? market.resolutionTime,
}
```

---

## BACKEND — Fix alert creation to store full question

### In sendOpportunityAlert or wherever alerts are created:

```javascript
async function sendOpportunityAlert(user, opportunity) {
  const { market, analysis, kelly } = opportunity

  // Get FULL market question — never use just "Down" or "Up"
  const marketQuestion = market.title
    ?? market.question
    ?? market.marketQuestion
    ?? `Market ${market.id}`

  // Validate — if question is too short it's wrong
  const validQuestion = marketQuestion.length > 10
    ? marketQuestion
    : `${market.category ?? 'Crypto'} market ${market.id?.slice(0, 8)}`

  const side = kelly.side
  const betAmount = kelly.amount
  const contracts = kelly.contracts
    ?? Math.floor(betAmount / (market.yesPrice ?? 0.5))
  const winAmount = contracts * 1
  const profitAmount = winAmount - betAmount

  // Build plain English name
  const eventName = buildEventName(validQuestion, side)

  // Store alert in DB
  try {
    await prisma.alert.create({
      data: {
        userId: user.id,
        marketId: market.id,
        marketQuestion: validQuestion,   // ← full question
        category: market.category ?? 'crypto',
        marketPrice: side === 'YES' ? market.yesPrice : market.noPrice,
        myProbability: analysis.probability,
        edge: analysis.edge,
        ev: analysis.ev,
        confidence: analysis.confidence,
        reasoning: analysis.reasoning,
        keyFactors: analysis.keyFactors ?? [],
        suggestedAmount: betAmount,
        suggestedContracts: contracts,
        side,
        sentViaTelegram: false,
      }
    })
  } catch (err) {
    console.error('[alert] DB save failed:', err.message)
  }

  // Send Telegram if user has it linked
  if (user.telegramAlerts && user.telegramId) {
    const msg = formatAlertMessage(eventName, analysis, kelly, market)
    await bot.sendMessage(user.telegramId.toString(), msg, {
      parse_mode: 'Markdown',
    })
  }
}
```

---

## BACKEND — Add migration to fix existing bad positions

Run this once to fix positions already saved with wrong data:

```javascript
// scripts/fixPositions.js — run once: node scripts/fixPositions.js
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const BAD_QUESTIONS = ['down', 'up', 'yes', 'no', 'true', 'false']

async function fixPositions() {
  const positions = await prisma.paperPosition.findMany({
    where: { status: 'open' }
  })

  console.log(`Found ${positions.length} open positions to check`)

  for (const pos of positions) {
    const q = (pos.marketQuestion ?? '').toLowerCase().trim()
    const isBad = BAD_QUESTIONS.includes(q) || q.length < 5

    if (isBad && pos.marketId) {
      console.log(`Fixing position ${pos.id} — bad question: "${pos.marketQuestion}"`)

      try {
        // Try to fetch from Jupiter
        const res = await fetch(
          `https://api.jup.ag/prediction/v1/markets/${pos.marketId}`,
          { headers: { 'x-api-key': process.env.JUPITER_PREDICTION_API_KEY ?? '' } }
        )

        if (res.ok) {
          const data = await res.json()
          const question = data.title ?? data.question ?? pos.marketQuestion

          if (question && question.length > 10) {
            await prisma.paperPosition.update({
              where: { id: pos.id },
              data: {
                marketQuestion: question,
                payload: {
                  ...(pos.payload ?? {}),
                  marketQuestion: question,
                }
              }
            })
            console.log(`  Fixed: "${question.slice(0, 60)}"`)
          }
        }
      } catch (err) {
        console.error(`  Failed to fix ${pos.id}:`, err.message)
      }

      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 500))
    }
  }

  console.log('Done fixing positions')
  await prisma.$disconnect()
}

fixPositions().catch(console.error)
```

Run it:
```bash
cd backend
node scripts/fixPositions.js
```

---

## FRONTEND — Update usePositions to handle new fields

```typescript
// In hooks/usePositions.ts
export function usePositions(status?: string) {
  return useQuery({
    queryKey: ['positions', status ?? 'all'],
    queryFn: () => api.get('/api/positions', {
      params: { status: status ?? 'all' }
    }).then(r => r.data),
    refetchInterval: 30_000,
    select: (data) => ({
      ...data,
      positions: (data.positions ?? []).map((p: Record<string, unknown>) => ({
        ...p,
        // Ensure numbers
        entryPrice: Number(p.entryPrice ?? 0),
        currentPrice: Number(p.currentPrice ?? p.entryPrice ?? 0),
        totalCost: Number(p.totalCost ?? 0),
        currentValue: Number(p.currentValue ?? p.totalCost ?? 0),
        pnl: Number(p.pnl ?? 0),
        pnlPercent: Number(p.pnlPercent ?? 0),
        contracts: Number(p.contracts ?? 0),
        // Time display
        timeLabel: p.timeLabel ?? '—',
        daysLeft: p.daysLeft ?? null,
        hoursLeft: p.hoursLeft ?? null,
        // Names
        eventName: p.eventName ?? p.marketQuestion ?? 'Market event',
        marketQuestion: p.marketQuestion ?? '',
      }))
    })
  })
}
```

---

## VERIFICATION — After running all 3 agents

Check these things work:

1. My Bets page shows real event names (not "Down"/"Up")
2. P&L updates every 30 seconds from Jupiter prices
3. Days Left / Hours Left shows correctly (not "—")
4. Alert history shows full event names
5. Bet button hidden on acted alerts
6. LLM error not shown to users

Run on server:
```bash
cd backend
node scripts/fixPositions.js  # fix existing bad data
# Then restart bot
pkill -f "node index.js"
nohup node index.js > bot.log 2>&1 &
tail -f bot.log
```
