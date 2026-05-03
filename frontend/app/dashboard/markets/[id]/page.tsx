'use client'

import { useState } from 'react'
import { use } from 'react'
import { motion } from 'framer-motion'
import { Topbar } from '@/components/layout/topbar'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MarketPriceChart, type PriceHistoryPoint } from '@/components/markets/market-price-chart'
import { cn, formatUSD, formatVolume, formatPrice, formatPct } from '@/lib/utils'
import { daysLeftFromClose } from '@/lib/market-utils'
import { Sparkles, TrendingUp, TrendingDown, BarChart2, Clock, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { useMarket } from '@/hooks/useMarkets'
import { usePlaceBet } from '@/hooks/usePositions'

const confidenceVariant: Record<string, 'success' | 'warning' | 'muted'> = {
  high: 'success',
  medium: 'warning',
  low: 'muted',
}

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

function pickKeyFactors(analysis: unknown): { label: string; delta: number }[] {
  if (!analysis || typeof analysis !== 'object') return []
  const o = analysis as Record<string, unknown>
  const kf = o.keyFactors
  if (!Array.isArray(kf)) return []
  return kf.map((item) => {
    if (typeof item === 'string') return { label: item, delta: 0 }
    if (item && typeof item === 'object') {
      const x = item as Record<string, unknown>
      return {
        label: String(x.label ?? x.factor ?? 'Factor'),
        delta: Number(x.delta ?? x.weight ?? 0),
      }
    }
    return { label: '?', delta: 0 }
  })
}

function pickModelProbability(analysis: unknown): number | undefined {
  if (!analysis || typeof analysis !== 'object') return undefined
  const o = analysis as Record<string, unknown>
  const v = o.myProbability ?? o.modelProbability ?? o.probability
  if (typeof v === 'number') return v
  if (typeof v === 'string') return Number(v)
  return undefined
}

function pickEdge(analysis: unknown): number | undefined {
  if (!analysis || typeof analysis !== 'object') return undefined
  const o = analysis as Record<string, unknown>
  const v = o.edge
  if (typeof v === 'number') return v
  if (typeof v === 'string') return Number(v)
  return undefined
}

export default function MarketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data, isLoading, isError } = useMarket(id)
  const placeBet = usePlaceBet()

  const market = data?.market as Record<string, unknown> | undefined
  const analysis = data?.analysis
  const priceHistory = (data?.priceHistory ?? []) as PriceHistoryPoint[]

  const question = String(market?.question ?? '')
  const category = String(market?.category ?? '')
  const volume = Number(market?.volume ?? 0)
  const yesPrice = Number(market?.yesPrice ?? 0)
  const noPrice = Number(market?.noPrice ?? 0)
  const daysLeft = daysLeftFromClose(market?.closeTime)

  const reasoning = pickReasoning(analysis)
  const confidence = pickConfidence(analysis)
  const keyFactors = pickKeyFactors(analysis)
  const modelProb = pickModelProbability(analysis)
  const edge = pickEdge(analysis)

  const [side, setSide] = useState<'YES' | 'NO'>('YES')
  const [amount, setAmount] = useState('50')

  const price = side === 'YES' ? yesPrice : noPrice
  const amountNum = Number(amount)
  const contracts = amountNum > 0 && price > 0 ? Math.floor(amountNum / price) : 0
  const payout = contracts
  const profit = payout - amountNum

  async function handlePlaceBet() {
    if (!market || contracts <= 0 || amountNum < 1) return
    await placeBet.mutateAsync({
      marketId: id,
      marketQuestion: question,
      category,
      side,
      entryPrice: price,
      amount: amountNum,
    })
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col">
        <Topbar title="Market Detail" subtitle={id} />
        <p className="p-6 text-xs text-[var(--text-muted)]">Loading market…</p>
      </div>
    )
  }

  if (isError || !market) {
    return (
      <div className="flex flex-1 flex-col">
        <Topbar title="Market Detail" subtitle={id} />
        <p className="p-6 text-xs text-[var(--danger)]">Market not found.</p>
        <Link href="/dashboard/markets" className="px-6 text-xs text-[var(--accent)] hover:underline">
          Back to Markets
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col">
      <Topbar title="Market Detail" subtitle={id} />

      <div className="space-y-5 p-4 pb-6 sm:p-6">
        <Link
          href="/dashboard/markets"
          className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
        >
          <ArrowLeft className="h-3 w-3" /> Back to Markets
        </Link>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
              <Card className="p-5">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div className="min-w-0">
                    <h2 className="mb-2 text-base font-semibold leading-snug text-[var(--text-primary)] sm:text-lg">
                      {question}
                    </h2>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
                      <span className="flex items-center gap-1">
                        <BarChart2 className="h-3 w-3" />
                        <span className="font-mono">{formatVolume(volume)}</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        <span className="font-mono">{daysLeft} days left</span>
                      </span>
                      <span className="capitalize text-[var(--text-secondary)]">{category}</span>
                    </div>
                  </div>
                  {Boolean(market?.isNew) && (
                    <Badge variant="accent" className="w-fit shrink-0">
                      NEW
                    </Badge>
                  )}
                </div>

                <div className="mb-5 grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-[var(--success)]/30 bg-[var(--success-dim)] p-4 text-center">
                    <p className="mb-1 text-xs font-medium text-[var(--success)]">YES</p>
                    <p className="font-mono text-2xl font-bold text-[var(--success)]">{formatPrice(yesPrice)}</p>
                  </div>
                  <div className="rounded-xl border border-[var(--danger)]/30 bg-[var(--danger-dim)] p-4 text-center">
                    <p className="mb-1 text-xs font-medium text-[var(--danger)]">NO</p>
                    <p className="font-mono text-2xl font-bold text-[var(--danger)]">{formatPrice(noPrice)}</p>
                  </div>
                </div>

                <MarketPriceChart points={priceHistory} />
              </Card>
            </motion.div>

            {(reasoning || modelProb != null || edge != null || keyFactors.length > 0) && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }}>
                <Card className="p-5">
                  <div className="mb-4 flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-[var(--accent)]" />
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">AI Analysis</h3>
                    {confidence && (
                      <Badge variant={confidenceVariant[confidence] ?? 'muted'} size="sm" className="ml-auto capitalize">
                        {confidence} confidence
                      </Badge>
                    )}
                  </div>

                  <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
                    <div className="rounded-xl bg-[var(--bg-secondary)] p-3 text-center">
                      <p className="mb-1 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Market Price</p>
                      <p className="font-mono text-xl font-bold text-[var(--text-primary)]">{formatPrice(yesPrice)}</p>
                      <p className="text-[10px] text-[var(--text-muted)]">YES</p>
                    </div>
                    <div className="rounded-xl border border-[var(--accent)]/25 bg-[var(--accent-glow)] p-3 text-center">
                      <p className="mb-1 text-[10px] uppercase tracking-wider text-[var(--accent)]">AI Estimate</p>
                      <p className="font-mono text-xl font-bold text-[var(--accent-bright)]">
                        {modelProb != null ? `${Math.round(modelProb * 100)}¢` : 'N/A'}
                      </p>
                      <p className="text-[10px] text-[var(--accent-dim)]">model output</p>
                    </div>
                    <div className="rounded-xl bg-[var(--bg-secondary)] p-3 text-center">
                      <p className="mb-1 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Edge</p>
                      <p
                        className={`font-mono text-xl font-bold ${(edge ?? 0) > 0.1 ? 'text-[var(--success)]' : 'text-[var(--warning)]'}`}
                      >
                        {edge != null ? formatPct(edge * 100, 0) : 'N/A'}
                      </p>
                      <p className="text-[10px] text-[var(--text-muted)]">vs market</p>
                    </div>
                  </div>

                  {reasoning && <p className="mb-4 text-xs leading-relaxed text-[var(--text-secondary)]">{reasoning}</p>}

                  {keyFactors.length > 0 && (
                    <div className="mb-4">
                      <p className="mb-2 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Key Factors</p>
                      <div className="flex flex-wrap gap-1.5">
                        {keyFactors.map(({ label, delta }) => (
                          <div
                            key={label}
                            className="flex items-center gap-1.5 rounded-full border border-[var(--border-bright)] bg-[var(--bg-secondary)] px-2.5 py-1"
                          >
                            <span className="text-xs text-[var(--text-secondary)]">{label}</span>
                            <span
                              className={cn(
                                'font-mono text-xs font-semibold',
                                delta > 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]',
                              )}
                            >
                              {delta > 0 ? '+' : ''}
                              {delta}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </Card>
              </motion.div>
            )}
          </div>

          <div className="space-y-4">
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.15 }}>
              <Card className="p-5">
                <h3 className="mb-4 text-sm font-semibold text-[var(--text-primary)]">Place Paper Bet</h3>

                <div className="mb-4 grid grid-cols-2 gap-2">
                  {(['YES', 'NO'] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSide(s)}
                      className={`rounded-xl border py-2 text-sm font-semibold transition-all ${
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

                <div className="mb-4 space-y-3">
                  <Input label="Amount" prefix="$" value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min="1" />
                  {amountNum > 0 && amountNum < 1 && (
                    <p className="mt-1 text-xs text-[var(--warning)]">Minimum paper bet is $1.</p>
                  )}
                </div>

                <div className="mb-4 space-y-2 text-xs">
                  {[
                    ['Price', formatPrice(price)],
                    ['Contracts', contracts.toString()],
                    ['Potential Payout', formatUSD(payout)],
                    ['Potential Profit', `+${formatUSD(profit)}`],
                    ['Max Loss', formatUSD(amountNum)],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between border-b border-[var(--border)] py-1.5">
                      <span className="text-[var(--text-muted)]">{label}</span>
                      <span
                        className={`font-mono font-semibold ${
                          label === 'Potential Profit'
                            ? 'text-[var(--success)]'
                            : label === 'Max Loss'
                              ? 'text-[var(--danger)]'
                              : 'text-[var(--text-primary)]'
                        }`}
                      >
                        {value}
                      </span>
                    </div>
                  ))}
                </div>

                <Button
                  variant="primary"
                  size="md"
                  className="w-full"
                  disabled={placeBet.isPending || contracts <= 0 || amountNum < 1}
                  icon={side === 'YES' ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                  onClick={() => void handlePlaceBet()}
                >
                  Buy {side} — {formatUSD(Number(amount) || 0)}
                </Button>
              </Card>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.2 }}>
              <Card className="p-5">
                <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Market Info</h3>
                <div className="space-y-2.5 text-xs">
                  {[
                    ['Volume', formatVolume(volume)],
                    ['Category', category],
                    ['Days Left', `${daysLeft} days`],
                    ['Market ID', id],
                    ['Platform', 'Jupiter Prediction'],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-3">
                      <span className="shrink-0 text-[var(--text-muted)]">{label}</span>
                      <span className="break-all text-right font-mono capitalize text-[var(--text-secondary)]">{value}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  )
}
