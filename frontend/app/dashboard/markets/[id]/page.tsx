'use client'

import { useState, useEffect } from 'react'
import { use } from 'react'
import { useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { Topbar } from '@/components/layout/topbar'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MarketPriceChart, type PriceHistoryPoint } from '@/components/markets/market-price-chart'
import { cn, formatUSD, formatPrice } from '@/lib/utils'
import { daysLeftFromClose } from '@/lib/market-utils'
import { TrendingUp, TrendingDown, Clock, ArrowLeft, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { useMarket } from '@/hooks/useMarkets'
import { usePlaceBet } from '@/hooks/usePositions'
import { useRecordAlertAction } from '@/hooks/useAlerts'

function pickReasoning(analysis: unknown): string | null {
  if (!analysis || typeof analysis !== 'object') return null
  const o = analysis as Record<string, unknown>
  if (typeof o.reasoning === 'string') return o.reasoning
  if (typeof o.summary === 'string') return o.summary
  return null
}

function pickConfidence(analysis: unknown): string | undefined {
  if (!analysis || typeof analysis !== 'object') return undefined
  const o = analysis as Record<string, unknown>
  return typeof o.confidence === 'string' ? o.confidence : undefined
}

function pickKeyFactors(analysis: unknown): string[] {
  if (!analysis || typeof analysis !== 'object') return []
  const o = analysis as Record<string, unknown>
  const kf = o.keyFactors
  if (!Array.isArray(kf)) return []
  return kf.map((item) => {
    if (typeof item === 'string') return item
    if (item && typeof item === 'object') {
      const x = item as Record<string, unknown>
      return String(x.label ?? x.factor ?? '')
    }
    return ''
  }).filter(Boolean)
}

export default function MarketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const searchParams = useSearchParams()
  const { data, isLoading, isError } = useMarket(id)
  const placeBet = usePlaceBet()
  const recordAlertAction = useRecordAlertAction()

  // Pre-fill from alert query params when navigated from an alert
  const alertId = searchParams.get('alertId') ?? ''
  const paramSide = searchParams.get('side')
  const paramAmount = searchParams.get('amount')
  const fromAlert = Boolean(alertId)

  const market = data?.market as Record<string, unknown> | undefined
  const analysis = data?.analysis
  const priceHistory = (data?.priceHistory ?? []) as PriceHistoryPoint[]

  const question = String(market?.question ?? '')
  const yesPrice = Number(market?.yesPrice ?? 0)
  const noPrice = Number(market?.noPrice ?? 0)
  const daysLeft = daysLeftFromClose(market?.closeTime)

  const reasoning = pickReasoning(analysis)
  const confidence = pickConfidence(analysis)
  const keyFactors = pickKeyFactors(analysis)

  const confidenceLabel =
    confidence === 'high' ? '✅ High confidence' :
    confidence === 'medium' ? '⚡ Medium confidence' :
    confidence ? '⚠️ Low confidence' : null

  // Initialize side directly from URL param — no effect delay that causes wrong-side flash
  const [side, setSide] = useState<'YES' | 'NO'>(paramSide === 'NO' ? 'NO' : 'YES')
  const [amount, setAmount] = useState(paramAmount && Number(paramAmount) > 0 ? paramAmount : '50')

  // Keep in sync if params change (e.g. browser back/forward)
  useEffect(() => {
    if (paramSide === 'YES' || paramSide === 'NO') setSide(paramSide)
    if (paramAmount && Number(paramAmount) > 0) setAmount(paramAmount)
  }, [paramSide, paramAmount])

  const price = side === 'YES' ? yesPrice : noPrice
  const amountNum = Number(amount)
  const contracts = amountNum > 0 && price > 0 ? Math.floor(amountNum / price) : 0
  const potentialWin = contracts   // each contract pays $1
  const profit = potentialWin - amountNum

  async function handlePlaceBet() {
    if (!market || contracts <= 0 || amountNum < 1) return
    const result = await placeBet.mutateAsync({
      marketId: id,
      marketQuestion: question,
      category: String(market?.category ?? ''),
      side,
      entryPrice: price,
      amount: amountNum,
    })
    if (alertId) {
      const res = result as { position?: { id?: string } } | null
      const positionId = res?.position?.id ?? ''
      void recordAlertAction.mutateAsync({ id: alertId, actionTaken: 'bet_full', positionId: positionId || undefined })
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col">
        <Topbar title="Place Bet" subtitle={id} />
        <p className="p-6 text-xs text-[var(--text-muted)]">Loading…</p>
      </div>
    )
  }

  if (isError || !market) {
    return (
      <div className="flex flex-1 flex-col">
        <Topbar title="Place Bet" subtitle={id} />
        <p className="p-6 text-xs text-[var(--danger)]">Could not load this market.</p>
        <Link href="/dashboard/alerts" className="px-6 text-xs text-[var(--accent)] hover:underline">
          ← Back to Alerts
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col">
      <Topbar title={fromAlert ? 'Place Bet' : 'Market Detail'} subtitle={fromAlert ? 'Review and confirm your bet' : id} />

      <div className="space-y-5 p-4 pb-6 sm:p-6">
        {/* Back links */}
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={fromAlert ? '/dashboard/alerts' : '/dashboard/markets'}
            className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
          >
            <ArrowLeft className="h-3 w-3" /> {fromAlert ? 'Back to Alerts' : 'Back to Markets'}
          </Link>
        </div>

        {/* Alert context banner */}
        {fromAlert && (
          <div className="flex items-center gap-2 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent-glow)] px-4 py-3 text-xs text-[var(--accent-bright)]">
            <Sparkles className="h-3.5 w-3.5 shrink-0" />
            Bot recommendation — side and amount are pre-filled for you.
          </div>
        )}

        <div className={cn('grid grid-cols-1 gap-5', fromAlert ? '' : 'lg:grid-cols-3')}>
          {/* Left / main column */}
          <div className={cn('space-y-4', fromAlert ? '' : 'lg:col-span-2')}>

            {/* Event card */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
              <Card className="p-5">
                <h2 className="mb-3 text-base font-semibold leading-snug text-[var(--text-primary)] sm:text-lg">
                  {question}
                </h2>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
                  {daysLeft != null && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      <span>{daysLeft} days left to resolve</span>
                    </span>
                  )}
                </div>

                {/* YES / NO prices — simple */}
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-[var(--success)]/30 bg-[var(--success-dim)] p-4 text-center">
                    <p className="mb-1 text-xs font-medium text-[var(--success)]">YES</p>
                    <p className="font-mono text-xl font-bold text-[var(--success)]">{formatPrice(yesPrice)}</p>
                    <p className="mt-0.5 text-[10px] text-[var(--success)]/70">per share</p>
                  </div>
                  <div className="rounded-xl border border-[var(--danger)]/30 bg-[var(--danger-dim)] p-4 text-center">
                    <p className="mb-1 text-xs font-medium text-[var(--danger)]">NO</p>
                    <p className="font-mono text-xl font-bold text-[var(--danger)]">{formatPrice(noPrice)}</p>
                    <p className="mt-0.5 text-[10px] text-[var(--danger)]/70">per share</p>
                  </div>
                </div>

                {/* Only show chart on non-alert full-market view */}
                {!fromAlert && <MarketPriceChart points={priceHistory} />}
              </Card>
            </motion.div>

            {/* Bot analysis card — shown only when NOT from alert (or on full view) */}
            {!fromAlert && (reasoning || confidenceLabel || keyFactors.length > 0) && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }}>
                <Card className="p-5">
                  <div className="mb-4 flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-[var(--accent)]" />
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">Why the bot likes this</h3>
                    {confidenceLabel && (
                      <span className="ml-auto text-xs text-[var(--text-secondary)]">{confidenceLabel}</span>
                    )}
                  </div>

                  {reasoning && <p className="mb-4 text-xs leading-relaxed text-[var(--text-secondary)]">{reasoning}</p>}

                  {keyFactors.length > 0 && (
                    <div>
                      <p className="mb-2 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Key factors</p>
                      <div className="flex flex-wrap gap-1.5">
                        {keyFactors.map((label) => (
                          <span
                            key={label}
                            className="rounded-full border border-[var(--border-bright)] bg-[var(--bg-secondary)] px-2.5 py-1 text-xs text-[var(--text-secondary)]"
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </Card>
              </motion.div>
            )}

            {/* On alert view, show reasoning inline below the event card */}
            {fromAlert && (reasoning || confidenceLabel) && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.05 }}>
                <Card className="p-4">
                  {confidenceLabel && (
                    <p className="mb-2 text-xs font-semibold text-[var(--text-secondary)]">{confidenceLabel}</p>
                  )}
                  {reasoning && <p className="text-xs leading-relaxed text-[var(--text-muted)]">{reasoning}</p>}
                </Card>
              </motion.div>
            )}
          </div>

          {/* Bet form — sidebar on full view, full-width below on alert view */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.15 }}>
            <Card className="p-5">
              <h3 className="mb-4 text-sm font-semibold text-[var(--text-primary)]">
                {fromAlert ? 'Confirm Your Bet' : 'Place a Bet'}
              </h3>

              {/* When from alert: show locked side badge. When manual: show toggle */}
              {fromAlert ? (
                <div className={`mb-4 flex items-center gap-3 rounded-xl border p-3 ${
                  side === 'YES'
                    ? 'border-[var(--success)]/40 bg-[var(--success-dim)]'
                    : 'border-[var(--danger)]/40 bg-[var(--danger-dim)]'
                }`}>
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                    side === 'YES' ? 'bg-[var(--success)]/20 text-[var(--success)]' : 'bg-[var(--danger)]/20 text-[var(--danger)]'
                  }`}>
                    {side === 'YES' ? '↑' : '↓'}
                  </div>
                  <div>
                    <p className={`text-xs font-semibold ${side === 'YES' ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                      Betting {side} on this market
                    </p>
                    <p className="text-[10px] text-[var(--text-muted)]">Side pre-set by the bot</p>
                  </div>
                </div>
              ) : (
                <div className="mb-4 grid grid-cols-2 gap-2">
                  {(['YES', 'NO'] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSide(s)}
                      className={`rounded-xl border py-2.5 text-sm font-semibold transition-all ${
                        side === s
                          ? s === 'YES'
                            ? 'border-[var(--success)]/40 bg-[var(--success-dim)] text-[var(--success)]'
                            : 'border-[var(--danger)]/40 bg-[var(--danger-dim)] text-[var(--danger)]'
                          : 'border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:border-[var(--border-bright)]'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}

              {/* Amount input */}
              <div className="mb-5">
                <Input label="How much to bet?" prefix="$" value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min="1" />
                {amountNum > 0 && amountNum < 1 && (
                  <p className="mt-1 text-xs text-[var(--warning)]">Minimum bet is $1.</p>
                )}
              </div>

              {/* Plain-English payout breakdown */}
              <div className="mb-5 space-y-2.5 rounded-xl bg-[var(--bg-secondary)] p-4 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[var(--text-muted)]">You put in</span>
                  <span className="font-mono font-semibold text-[var(--text-primary)]">{formatUSD(amountNum)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--text-muted)]">If {side} wins</span>
                  <span className="font-mono font-semibold text-[var(--success)]">+{formatUSD(profit)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--text-muted)]">Total payout</span>
                  <span className="font-mono font-semibold text-[var(--text-primary)]">{formatUSD(potentialWin)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--text-muted)]">Win chance (market)</span>
                  <span className="font-mono font-semibold text-[var(--text-secondary)]">
                    {((side === 'YES' ? yesPrice : noPrice) * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-[var(--border)] pt-2">
                  <span className="text-[var(--text-muted)]">Max you can lose</span>
                  <span className="font-mono font-semibold text-[var(--danger)]">{formatUSD(amountNum)}</span>
                </div>
              </div>

              <Button
                variant="primary"
                size="md"
                className="w-full"
                loading={placeBet.isPending}
                disabled={placeBet.isPending || contracts <= 0 || amountNum < 1}
                icon={side === 'YES' ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                onClick={() => void handlePlaceBet()}
              >
                {fromAlert ? `Confirm — Bet ${side} ${formatUSD(amountNum)}` : `Bet ${side} — ${formatUSD(amountNum)}`}
              </Button>
            </Card>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
