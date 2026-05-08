'use client'

import { useState } from 'react'
import { use } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import toast from 'react-hot-toast'
import { Card } from '@/components/ui/card'
import { useMarket } from '@/hooks/useMarkets'
import { usePlaceBet } from '@/hooks/usePositions'
import { useRecordAlertAction } from '@/hooks/useAlerts'
import { useWallet } from '@/hooks/useWallet'

function simplifyQuestion(question: string): string {
  if (!question) return 'Market event'
  const q = question
    .replace(/This market will resolve.*?if /gi, '')
    .replace(/otherwise.*$/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
  return q || question
}

export default function MarketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const { id } = use(params)
  const searchParams = useSearchParams()
  const { data, isLoading, isError } = useMarket(id)
  const placeBet = usePlaceBet()
  const recordAlertAction = useRecordAlertAction()
  const { data: wallet } = useWallet()

  const alertId = searchParams.get('alertId') ?? ''
  const paramSide = searchParams.get('side')
  const paramAmount = searchParams.get('amount')

  const market = data?.market as Record<string, unknown> | undefined
  const analysis = (data?.analysis ?? {}) as Record<string, unknown>
  const question = String(market?.question ?? market?.marketQuestion ?? '')
  const eventName = String(market?.eventName ?? '') || simplifyQuestion(question)
  const yesPrice = Number(market?.yesPrice ?? 0)
  const noPrice = Number(market?.noPrice ?? 0)
  const side: 'YES' | 'NO' = paramSide === 'NO' ? 'NO' : 'YES'
  const [amount, setAmount] = useState<number>(paramAmount && Number(paramAmount) > 0 ? Number(paramAmount) : 10)

  const price = side === 'YES' ? yesPrice : noPrice
  const contracts = price > 0 ? Math.floor(amount / price) : 0
  const actualCost = contracts * price
  const potentialPayout = contracts
  const potentialProfit = potentialPayout - actualCost
  const aiConfidencePct = Number(analysis.aiConfidencePct ?? analysis.probability ? Math.round(Number(analysis.probability ?? 0) * 100) : 0)
  const winChancePct = aiConfidencePct > 0 ? aiConfidencePct : Math.round(price * 100)
  const walletBalance = Number(wallet?.balance ?? 0)
  const amountExceedsWallet = amount > walletBalance

  async function handlePlaceBet() {
    if (!market || contracts <= 0 || amount <= 0 || amountExceedsWallet) return
    try {
      const result = await placeBet.mutateAsync({
        marketId: id,
        marketQuestion: question,
        category: String(market?.category ?? 'crypto'),
        side,
        entryPrice: price,
        amount,
      })
      if (alertId) {
        const res = result as { position?: { id?: string } } | null
        const positionId = res?.position?.id ?? ''
        await recordAlertAction.mutateAsync({ id: alertId, actionTaken: 'bet_full', positionId: positionId || undefined })
      }
      toast.success('Bet placed')
      router.push('/dashboard/positions')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg ?? 'Failed to place bet')
    }
  }

  if (isLoading) {
    return <p className="p-6 text-xs text-[var(--text-muted)]">Loading…</p>
  }

  if (isError || !market) {
    return (
      <div className="p-6">
        <p className="text-xs text-[var(--danger)]">Could not load this market.</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 p-5">
      <button
        onClick={() => router.back()}
        className="flex min-h-10 items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
      >
        ← Back to Alerts
      </button>

      <Card className="rounded-2xl border border-[var(--border)] p-5">
        <p className="mb-2 text-xs uppercase tracking-wider text-[var(--text-muted)]">You are betting on</p>
        <h1 className="mb-1 text-xl font-bold text-[var(--text-primary)]">{eventName}</h1>
        <p className="line-clamp-2 text-xs text-[var(--text-muted)]">{question}</p>

        {winChancePct > 0 && (
          <div className="mt-4 space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-[var(--text-muted)]">AI thinks this happens</span>
              <span
                className={`font-mono font-semibold ${
                  winChancePct >= 65
                    ? 'text-[var(--success)]'
                    : winChancePct >= 50
                      ? 'text-[var(--warning)]'
                      : 'text-[var(--text-secondary)]'
                }`}
              >
                {winChancePct}% chance
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[var(--bg-secondary)]">
              <div
                className={`h-full rounded-full transition-all ${
                  winChancePct >= 65
                    ? 'bg-[var(--success)]'
                    : winChancePct >= 50
                      ? 'bg-[var(--warning)]'
                      : 'bg-[var(--text-muted)]'
                }`}
                style={{ width: `${Math.max(0, Math.min(100, winChancePct))}%` }}
              />
            </div>
          </div>
        )}
      </Card>

      <Card className="space-y-4 rounded-2xl border border-[var(--border)] p-5">
        <div>
          <p className="mb-3 text-sm font-semibold text-[var(--text-primary)]">How much do you want to bet?</p>
          <div className="mb-3 grid grid-cols-4 gap-2">
            {[5, 10, 20, 50].map((amt) => (
              <button
                key={amt}
                onClick={() => setAmount(amt)}
                className={`min-h-10 rounded-xl border text-sm font-medium transition-colors ${
                  amount === amt
                    ? 'border-[var(--accent)]/30 bg-[var(--accent-glow)] text-[var(--accent)]'
                    : 'border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-secondary)]'
                }`}
              >
                ${amt}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3 transition-colors focus-within:border-[var(--accent)]/50">
            <span className="text-sm text-[var(--text-muted)]">$</span>
            <input
              type="number"
              min={1}
              max={walletBalance || 1000}
              value={Number.isFinite(amount) ? amount : 1}
              onChange={(e) => setAmount(Math.max(1, Number(e.target.value || 1)))}
              className="flex-1 bg-transparent font-mono text-lg font-bold text-[var(--text-primary)] outline-none"
            />
            <span className="text-xs text-[var(--text-muted)]">USDC</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-[var(--success)]/20 bg-[var(--success-dim)] p-3 text-center">
            <p className="mb-1 text-xs text-[var(--success)]">✅ If you&apos;re right</p>
            <p className="font-mono text-xl font-bold text-[var(--success)]">
              +${potentialProfit > 0 ? potentialProfit.toFixed(2) : '0.00'}
            </p>
            <p className="mt-0.5 text-xs text-[var(--success)]/70">get back ${potentialPayout.toFixed(2)}</p>
          </div>
          <div className="rounded-xl border border-[var(--danger)]/20 bg-[var(--danger-dim)] p-3 text-center">
            <p className="mb-1 text-xs text-[var(--danger)]">❌ If you&apos;re wrong</p>
            <p className="font-mono text-xl font-bold text-[var(--danger)]">-${actualCost.toFixed(2)}</p>
            <p className="mt-0.5 text-xs text-[var(--danger)]/70">you lose your bet</p>
          </div>
        </div>

        {amountExceedsWallet && (
          <p className="text-center text-xs text-[var(--danger)]">
            ⚠ Not enough balance. You have ${walletBalance.toFixed(2)}.
          </p>
        )}
      </Card>

      <button
        onClick={() => void handlePlaceBet()}
        disabled={placeBet.isPending || amount <= 0 || amountExceedsWallet || actualCost <= 0}
        className="flex w-full min-h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] py-4 text-base font-bold text-[var(--bg-primary)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {placeBet.isPending ? (
          <>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current" />
            Placing bet...
          </>
        ) : (
          `Bet $${actualCost.toFixed(2)} →`
        )}
      </button>

      <p className="text-center text-xs text-[var(--text-muted)]">Paper trading — no real money involved</p>
    </div>
  )
}
