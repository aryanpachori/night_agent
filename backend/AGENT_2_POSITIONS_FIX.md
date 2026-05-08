# AGENT 2 — Fix My Bets Page + Jupiter API Position Sync
> Run this AFTER Agent 1.
> Fixes: broken positions, P&L stuck at $0, Days Left showing "—",
> event names showing "Down/Up" instead of full name.
> Core fix: fetch live data from Jupiter API for each open position.

---

## ROOT CAUSE

The My Bets page shows positions from the DB but the DB
has stale/missing data:
- `marketQuestion` stored as just "Down" or "Up" — too short
- `currentPrice` not being fetched from Jupiter
- `daysLeft` not computed from Jupiter closeTime
- `pnl` not recalculated against live price

Everything is stuck at entry values because Jupiter API
is not being called to enrich position data.

---

## BACKEND FIX — Enrich positions with live Jupiter data

### In src/api/routes/positions.js — GET route

Replace the existing GET handler with this enriched version:

```javascript
const JUPITER_BASE = process.env.JUPITER_PREDICTION_BASE_URL
  ?? 'https://api.jup.ag/prediction/v1'
const JUPITER_KEY = process.env.JUPITER_PREDICTION_API_KEY ?? ''

router.get('/', requireAuth, async (req, res) => {
  try {
    const { status, limit = '50', offset = '0' } = req.query
    const userId = req.user.userId

    const where = {
      userId,
      ...(status && status !== 'all' ? { status } : {}),
    }

    const [positions, total] = await Promise.all([
      prisma.paperPosition.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take: Math.min(parseInt(limit), 100),
        skip: parseInt(offset),
      }),
      prisma.paperPosition.count({ where }),
    ])

    // Enrich open positions with live Jupiter data
    const enriched = await Promise.all(
      positions.map(async (pos) => {
        const payload = pos.payload ?? {}

        // Base data from DB
        let currentPrice = pos.entryPrice ?? 0
        let daysLeft = null
        let hoursLeft = null
        let timeLabel = '—'
        let marketQuestion = pos.marketQuestion
          ?? payload.marketQuestion
          ?? payload.question
          ?? ''

        // Clean up bad market questions
        // If stored question is just "Down", "Up", "YES", "NO" — it's wrong
        const isBadQuestion = ['down', 'up', 'yes', 'no', ''].includes(
          marketQuestion.toLowerCase().trim()
        )
        if (isBadQuestion) {
          marketQuestion = `Market ${pos.marketId?.slice(0, 8) ?? 'event'}`
        }

        // Only fetch Jupiter data for open positions
        if (pos.status === 'open' && pos.marketId) {
          try {
            const jupRes = await fetch(
              `${JUPITER_BASE}/markets/${pos.marketId}`,
              {
                headers: { 'x-api-key': JUPITER_KEY },
                signal: AbortSignal.timeout(4000),
              }
            )

            if (jupRes.ok) {
              const jupData = await jupRes.json()

              // Get current price based on side
              const pricing = jupData.pricing ?? {}
              if (pos.side === 'YES') {
                currentPrice = Number(pricing.buyYesPriceUsd ?? 0) / 1_000_000
              } else {
                currentPrice = Number(pricing.buyNoPriceUsd ?? 0) / 1_000_000
              }

              // Compute time remaining
              const closeTime = jupData.closeTime
              if (closeTime) {
                const closeMs = closeTime > 1e12
                  ? closeTime
                  : closeTime * 1000
                const msLeft = closeMs - Date.now()

                if (msLeft > 0) {
                  const totalMins = Math.ceil(msLeft / 60000)
                  if (totalMins < 60) {
                    timeLabel = `${totalMins}m`
                    hoursLeft = 0
                    daysLeft = 0
                  } else if (totalMins < 1440) {
                    hoursLeft = Math.ceil(totalMins / 60)
                    timeLabel = `${hoursLeft}h`
                    daysLeft = 0
                  } else {
                    daysLeft = Math.ceil(totalMins / 1440)
                    timeLabel = `${daysLeft}d`
                  }
                } else {
                  timeLabel = 'Ended'
                }
              }

              // Use better question from Jupiter if available
              if (jupData.title && jupData.title.length > 10) {
                marketQuestion = jupData.title
              } else if (jupData.question && jupData.question.length > 10) {
                marketQuestion = jupData.question
              }
            }
          } catch (jupErr) {
            // Jupiter fetch failed — use DB values
            console.error(`[positions] Jupiter fetch failed for ${pos.marketId}:`, jupErr.message)
          }
        }

        // Build event name for display
        const eventName = buildPositionEventName(marketQuestion, pos.side)

        // Calculate P&L
        const contracts = payload.contracts
          ?? Math.floor((pos.totalCost ?? 0) / (pos.entryPrice ?? 1))
        const currentValue = currentPrice * contracts
        const pnl = currentValue - (pos.totalCost ?? 0)
        const pnlPercent = (pos.totalCost ?? 0) > 0
          ? (pnl / pos.totalCost) * 100
          : 0

        return {
          id: pos.id,
          status: pos.status,
          marketId: pos.marketId,
          marketQuestion,
          eventName,
          category: pos.category ?? payload.category ?? 'crypto',
          side: pos.side,
          contracts,
          entryPrice: pos.entryPrice,
          totalCost: pos.totalCost,
          potentialPayout: contracts,
          currentPrice: Math.round(currentPrice * 1000) / 1000,
          currentValue: Math.round(currentValue * 100) / 100,
          pnl: Math.round(pnl * 100) / 100,
          pnlPercent: Math.round(pnlPercent * 100) / 100,
          daysLeft,
          hoursLeft,
          timeLabel,
          openedAt: pos.openedAt,
          closedAt: pos.closedAt,
          closePrice: pos.closePrice,
          exitReason: pos.exitReason,
          finalPnl: pos.pnl,
        }
      })
    )

    res.json({ positions: enriched, total })
  } catch (err) {
    console.error('[positions GET]', err)
    res.status(500).json({ error: 'Server error' })
  }
})

function buildPositionEventName(question, side) {
  if (!question || question.length < 5) return 'Market event'

  const q = question.toLowerCase()
  let token = null

  if (q.includes('bitcoin') || q.includes('btc')) token = 'Bitcoin'
  else if (q.includes('ethereum') || q.includes('eth')) token = 'Ethereum'
  else if (q.includes('solana') || q.includes('sol')) token = 'Solana'
  else if (q.includes('bnb')) token = 'BNB'
  else if (q.includes('xrp')) token = 'XRP'
  else if (q.includes('doge')) token = 'Dogecoin'
  else if (q.includes('hyper')) token = 'Hyperliquid'

  if (!token) {
    // Not a crypto market — return cleaned question
    return question
      .replace(/This market will resolve.*?if /gi, '')
      .replace(/the .* price at.*$/gi, '')
      .trim()
      .slice(0, 60) || question.slice(0, 60)
  }

  // Extract time window
  const timeMatch = question.match(/(\d+)\s*(min|minute|hour|hr)/i)
  const timeStr = timeMatch ? ` in ${timeMatch[1]}${timeMatch[2][0]}` : ''

  // Determine direction from question content + side
  // Jupiter markets: "Up" variant = YES, "Down" variant = NO
  const isUpMarket = q.includes(' up') || q.includes('upper') || q.includes('above')
  const isDownMarket = q.includes(' down') || q.includes('lower') || q.includes('below')

  let direction = ''
  if (side === 'YES') {
    direction = isUpMarket ? '↑ UP' : isDownMarket ? '↓ DOWN' : '↑ UP'
  } else {
    direction = isUpMarket ? '↓ DOWN' : isDownMarket ? '↑ UP' : '↓ DOWN'
  }

  return `${token} ${direction}${timeStr}`
}
```

---

## FRONTEND FIX — My Bets page display

### In app/dashboard/bets/page.tsx (or positions/page.tsx)

Update the position row to show enriched data:

```tsx
function PositionRow({ position }: { position: Position }) {
  const isWinning = position.pnl > 0
  const isLosing = position.pnl < 0

  return (
    <tr className="border-b border-[var(--border)] hover:bg-[var(--bg-card-hover)]
                   transition-colors">
      {/* EVENT — full name */}
      <td className="py-3 px-4">
        <p className="text-sm font-medium text-[var(--text-primary)]">
          {position.eventName}
        </p>
        <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate max-w-[200px]"
           title={position.marketQuestion}>
          {position.marketQuestion?.slice(0, 50)}
          {position.marketQuestion?.length > 50 ? '...' : ''}
        </p>
      </td>

      {/* SIDE */}
      <td className="py-3 px-4">
        <span className={`text-xs font-bold px-2 py-1 rounded-md ${
          position.side === 'YES'
            ? 'bg-[var(--success-dim)] text-[var(--success)]'
            : 'bg-[var(--danger-dim)] text-[var(--danger)]'
        }`}>
          {position.side}
        </span>
      </td>

      {/* YOU BET */}
      <td className="py-3 px-4">
        <span className="font-mono text-sm text-[var(--text-primary)]">
          ${position.totalCost?.toFixed(2)}
        </span>
      </td>

      {/* NOW WORTH — live value */}
      <td className="py-3 px-4">
        <span className="font-mono text-sm text-[var(--text-primary)]">
          ${position.currentValue?.toFixed(2)}
        </span>
        <p className="text-xs text-[var(--text-muted)] font-mono">
          @ {Math.round((position.currentPrice ?? 0) * 100)}¢
        </p>
      </td>

      {/* STATUS — P&L */}
      <td className="py-3 px-4">
        <div className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${
            isWinning ? 'bg-[var(--success)]'
            : isLosing ? 'bg-[var(--danger)]'
            : 'bg-[var(--text-muted)]'
          }`} />
          <span className={`font-mono text-sm font-semibold ${
            isWinning ? 'text-[var(--success)]'
            : isLosing ? 'text-[var(--danger)]'
            : 'text-[var(--text-muted)]'
          }`}>
            {isWinning ? '+' : ''}{position.pnl?.toFixed(2)}
          </span>
        </div>
        {position.pnlPercent !== 0 && (
          <p className={`text-xs font-mono ${
            isWinning ? 'text-[var(--success)]' : 'text-[var(--danger)]'
          }`}>
            {isWinning ? '+' : ''}{position.pnlPercent?.toFixed(1)}%
          </p>
        )}
      </td>

      {/* DAYS LEFT — show timeLabel from API */}
      <td className="py-3 px-4">
        <span className={`text-xs font-mono px-2 py-1 rounded-md ${
          position.timeLabel === 'Ended'
            ? 'bg-[var(--danger-dim)] text-[var(--danger)]'
            : position.daysLeft === 0 && position.hoursLeft !== null
            ? 'bg-[var(--warning)]/15 text-[var(--warning)]'
            : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)]'
        }`}>
          {position.timeLabel ?? '—'}
        </span>
      </td>

      {/* ACTIONS */}
      <td className="py-3 px-4">
        {position.status === 'open' && (
          <ExitButton position={position} />
        )}
      </td>
    </tr>
  )
}
```

### Update the summary cards at top of My Bets

```tsx
function BetsSummary({ positions }: { positions: Position[] }) {
  const open = positions.filter(p => p.status === 'open')
  
  const totalStaked = open.reduce((s, p) => s + (p.totalCost ?? 0), 0)
  const currentWorth = open.reduce((s, p) => s + (p.currentValue ?? p.totalCost ?? 0), 0)
  const totalGain = currentWorth - totalStaked

  return (
    <div className="grid grid-cols-3 gap-4 mb-6">
      <div className="bg-[var(--bg-card)] rounded-2xl p-4 border border-[var(--border)]">
        <p className="text-xs text-[var(--text-muted)] mb-1">TOTAL STAKED</p>
        <p className="text-2xl font-mono font-bold text-[var(--text-primary)]">
          ${totalStaked.toFixed(2)}
        </p>
      </div>
      <div className="bg-[var(--bg-card)] rounded-2xl p-4 border border-[var(--border)]">
        <p className="text-xs text-[var(--text-muted)] mb-1">CURRENTLY WORTH</p>
        <p className="text-2xl font-mono font-bold text-[var(--text-primary)]">
          ${currentWorth.toFixed(2)}
        </p>
      </div>
      <div className="bg-[var(--bg-card)] rounded-2xl p-4 border border-[var(--border)]">
        <p className="text-xs text-[var(--text-muted)] mb-1">TOTAL GAIN</p>
        <p className={`text-2xl font-mono font-bold ${
          totalGain >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'
        }`}>
          {totalGain >= 0 ? '+' : ''}${totalGain.toFixed(2)}
        </p>
      </div>
    </div>
  )
}
```

### Auto-refresh positions every 30 seconds

```typescript
// In usePositions hook — add refetch interval:
export function usePositions(status?: string) {
  return useQuery({
    queryKey: ['positions', status ?? 'all'],
    queryFn: () => api.get('/api/positions', {
      params: { status: status ?? 'all' }
    }).then(r => r.data),
    refetchInterval: 30_000,  // refresh every 30s for live P&L
    staleTime: 15_000,
  })
}
```
