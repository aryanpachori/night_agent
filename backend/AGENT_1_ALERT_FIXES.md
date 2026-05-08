# AGENT 1 — Fix Alert Display & Event Names
> Run this in Cursor Agent mode FIRST.
> Fixes: full event names, weak signal LLM errors, bet button on acted alerts.

---

## PROBLEM 1 — Event names are truncated/wrong

Currently showing: "Ethereum ↑ UP"
Should show: "Will ETH price go UP in the next 5 minutes?"

The event name is being built from a simple token extraction
instead of using the actual market question from Jupiter API.

### Fix in backend — buildEventName function

Find the buildEventName function (in routes/alerts.js or
wherever alerts are formatted) and replace with:

```javascript
function buildEventName(question, side) {
  if (!question) return 'Market event'

  // If it's a short-duration crypto market, build a clear name
  const q = question.toLowerCase()

  // Extract token name
  let token = 'Crypto'
  if (q.includes('bitcoin') || q.includes('btc')) token = 'Bitcoin'
  else if (q.includes('ethereum') || q.includes('eth')) token = 'Ethereum'
  else if (q.includes('solana') || q.includes('sol')) token = 'Solana'
  else if (q.includes('bnb')) token = 'BNB'
  else if (q.includes('xrp')) token = 'XRP'
  else if (q.includes('doge')) token = 'Dogecoin'
  else if (q.includes('hyper')) token = 'Hyperliquid'

  // Extract time window from question
  let timeWindow = ''
  const timeMatch = question.match(/(\d+)\s*(min|minute|hour|hr|day)/i)
  if (timeMatch) {
    timeWindow = ` in ${timeMatch[1]} ${timeMatch[2]}`
  }

  // Extract direction
  const dir = side === 'YES' ? 'goes UP ↑' : 'goes DOWN ↓'

  return `${token} ${dir}${timeWindow}`
}
```

### Fix in frontend — alert card event name display

In the alert history table/cards, find where event name
is displayed and ensure it shows the FULL name:

```tsx
// In alert card — show full eventName, no truncation on desktop
// Only truncate on mobile
<p className="text-sm font-semibold text-[var(--text-primary)]
              md:whitespace-normal whitespace-nowrap overflow-hidden
              text-ellipsis max-w-[300px] md:max-w-none">
  {alert.eventName ?? buildEventName(alert.marketQuestion, alert.side)}
</p>
```

Also add a tooltip showing full market question on hover:

```tsx
<div title={alert.marketQuestion} className="cursor-help">
  <p className="...">
    {alert.eventName}
  </p>
</div>
```

---

## PROBLEM 2 — All alerts show "Weak signal — LLM unavailable"

The LLM is hitting rate limits. The alerts are still being
sent but the signal quality shows as weak. Fix two things:

### Fix 1 — Don't show LLM error as the reason

In the alert card, when reason contains "LLM unavailable"
or "quota/rate limit", show a cleaner message:

```tsx
function getDisplayReason(reason: string, confidence: string): string {
  if (!reason) return ''
  
  // Hide technical LLM error messages from users
  if (
    reason.includes('LLM unavailable') ||
    reason.includes('quota') ||
    reason.includes('rate limit') ||
    reason.includes('API error') ||
    reason.includes('Using techni')
  ) {
    // Show confidence-based message instead
    return confidence === 'high'
      ? 'Strong price movement detected'
      : confidence === 'medium'
      ? 'Moderate signal detected'
      : 'Price pattern detected — verify before betting'
  }
  
  return reason
}

// Use in card:
<p className="text-xs text-[var(--text-secondary)] italic">
  {getDisplayReason(alert.reasoning, alert.confidence)}
</p>
```

### Fix 2 — Show confidence badge correctly

When LLM is down, confidence defaults to "low" / "weak".
But the math signals (Black-Scholes, Kelly) still work.
Show the math-based confidence when LLM is unavailable:

In the backend, when creating alerts, if LLM fails
but math signals are strong, set confidence to 'medium'
not 'low'. Find the alert creation code and update:

```javascript
// In scanner/alert creation:
const confidence = llmResult?.confidence
  ?? (mathEdge > 0.15 ? 'medium' : 'low')  // fallback to math
```

---

## PROBLEM 3 — Bet button showing on acted alerts

In the Signal History table, find the action column
and add this check:

```tsx
// In alert row — action column:
const hasActed = alert.actionTaken !== null && 
                 alert.actionTaken !== undefined

{!hasActed ? (
  <div className="flex gap-1">
    <button
      onClick={() => handleBet(alert)}
      className="px-3 py-1 text-xs font-medium rounded-lg
                 bg-[var(--accent-glow)] text-[var(--accent)]
                 border border-[var(--accent)]/30 hover:opacity-80"
    >
      Bet →
    </button>
    <button
      onClick={() => handleSkip(alert)}
      className="px-3 py-1 text-xs font-medium rounded-lg
                 bg-[var(--bg-secondary)] text-[var(--text-muted)]
                 border border-[var(--border)] hover:opacity-80"
    >
      Skip
    </button>
  </div>
) : (
  <span className={`text-xs font-medium px-2 py-1 rounded-lg ${
    alert.actionTaken === 'bet_full' || alert.actionTaken === 'bet_half'
      ? 'bg-[var(--success-dim)] text-[var(--success)]'
      : 'bg-[var(--bg-secondary)] text-[var(--text-muted)]'
  }`}>
    {alert.actionTaken === 'bet_full' ? '✅ Bet placed'
     : alert.actionTaken === 'bet_half' ? '✅ Half bet'
     : alert.actionTaken === 'skipped' ? '⏭ Skipped'
     : '⏰ Expired'}
  </span>
)}
```

Also when user taps BET — immediately record actionTaken:

```typescript
async function handleBet(alert: Alert) {
  try {
    // 1. Place bet
    const position = await placeBet.mutateAsync({
      marketId: alert.marketId,
      marketQuestion: alert.marketQuestion,
      category: alert.category,
      side: alert.side,
      entryPrice: alert.marketPrice,
      amount: Number(alert.betAmountUsd ?? alert.suggestedAmount),
    })

    // 2. Record action — THIS IS CRITICAL
    await api.patch(`/api/alerts/${alert.id}`, {
      actionTaken: 'bet_full',
      positionId: position?.position?.id ?? null,
    })

    // 3. Invalidate to refresh UI
    queryClient.invalidateQueries({ queryKey: ['alerts'] })
    queryClient.invalidateQueries({ queryKey: ['positions'] })
    queryClient.invalidateQueries({ queryKey: ['wallet'] })

    toast.success('Bet placed!')
  } catch (err) {
    toast.error(err?.response?.data?.error ?? 'Failed to place bet')
  }
}

async function handleSkip(alert: Alert) {
  await api.patch(`/api/alerts/${alert.id}`, { actionTaken: 'skipped' })
  queryClient.invalidateQueries({ queryKey: ['alerts'] })
}
```
