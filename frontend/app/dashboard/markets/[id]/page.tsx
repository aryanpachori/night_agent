'use client'
import { useMemo, useState } from 'react'
import { use } from 'react'
import { motion } from 'framer-motion'
import { Topbar } from '@/components/layout/topbar'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MarketPriceChart } from '@/components/markets/market-price-chart'
import { mockMarkets } from '@/data/mock'
import { cn, formatUSD, formatVolume, formatPrice, formatPct } from '@/lib/utils'
import { Sparkles, TrendingUp, TrendingDown, BarChart2, Clock, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

const confidenceVariant: Record<string, 'success' | 'warning' | 'muted'> = {
  high: 'success', medium: 'warning', low: 'muted',
}

const mockKeyFactors: Record<string, { label: string; delta: number }[]> = {
  'POLY-108634': [
    { label: 'Coalition instability', delta: 12 },
    { label: 'Corruption trial', delta: -4 },
    { label: 'Tel Aviv protests', delta: 9 },
    { label: 'Opposition bloc', delta: 6 },
  ],
  'POLY-209841': [
    { label: 'ETF inflows', delta: 14 },
    { label: 'Fed pause', delta: 8 },
    { label: '$82k breakout', delta: 11 },
    { label: 'Miner flows', delta: -3 },
  ],
  'POLY-301920': [
    { label: 'IRGC cohesion', delta: -9 },
    { label: 'Elite defections', delta: -2 },
    { label: 'Economic pressure', delta: 4 },
    { label: 'Opposition splits', delta: -6 },
  ],
}

export default function MarketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const market = mockMarkets.find(m => m.id === id) || mockMarkets[0]

  const [side, setSide] = useState<'YES' | 'NO'>('YES')
  const [amount, setAmount] = useState('50')

  const price = side === 'YES' ? market.yesPrice : market.noPrice
  const contracts = amount ? Math.floor(Number(amount) / price) : 0
  const payout = contracts
  const profit = payout - Number(amount)

  const keyFactors = useMemo(() => {
    return (
      mockKeyFactors[id as keyof typeof mockKeyFactors] || [
        { label: 'Market sentiment', delta: 5 },
        { label: 'Recent news', delta: -3 },
        { label: 'Technical tone', delta: 7 },
        { label: 'Volume skew', delta: 2 },
      ]
    )
  }, [id])

  const amountNum = Number(amount)

  return (
    <div className="flex flex-col flex-1">
      <Topbar title="Market Detail" subtitle={market.id} />

      <div className="space-y-5 p-4 pb-6 sm:p-6">
        <Link href="/dashboard/markets" className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
          <ArrowLeft className="w-3 h-3" /> Back to Markets
        </Link>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {/* Left column */}
          <div className="space-y-4 lg:col-span-2">
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
              <Card className="p-5">
                {/* Market header */}
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div className="min-w-0">
                    <h2 className="mb-2 text-base font-semibold leading-snug text-[var(--text-primary)] sm:text-lg">
                      {market.question}
                    </h2>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
                      <span className="flex items-center gap-1">
                        <BarChart2 className="w-3 h-3" />
                        <span className="font-mono">{formatVolume(market.volume)}</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span className="font-mono">{market.daysLeft} days left</span>
                      </span>
                      <span className="capitalize text-[var(--text-secondary)]">{market.category}</span>
                    </div>
                  </div>
                  {market.isNew && (
                    <Badge variant="accent" className="w-fit shrink-0">
                      NEW
                    </Badge>
                  )}
                </div>

                {/* Price boxes */}
                <div className="grid grid-cols-2 gap-3 mb-5">
                  <div className="bg-[var(--success-dim)] border border-[var(--success)]/30 rounded-xl p-4 text-center">
                    <p className="text-xs text-[var(--success)] font-medium mb-1">YES</p>
                    <p className="text-2xl font-mono font-bold text-[var(--success)]">{formatPrice(market.yesPrice)}</p>
                  </div>
                  <div className="bg-[var(--danger-dim)] border border-[var(--danger)]/30 rounded-xl p-4 text-center">
                    <p className="text-xs text-[var(--danger)] font-medium mb-1">NO</p>
                    <p className="text-2xl font-mono font-bold text-[var(--danger)]">{formatPrice(market.noPrice)}</p>
                  </div>
                </div>

                {/* Chart */}
                <div>
                  <MarketPriceChart />
                </div>
              </Card>
            </motion.div>

            {/* AI Analysis */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }}>
              <Card className="p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles className="w-4 h-4 text-[var(--accent)]" />
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">AI Analysis</h3>
                  {market.confidence && (
                    <Badge variant={confidenceVariant[market.confidence]} size="sm" className="capitalize ml-auto">
                      {market.confidence} confidence
                    </Badge>
                  )}
                </div>

                <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
                  <div className="bg-[var(--bg-secondary)] rounded-xl p-3 text-center">
                    <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-1">Market Price</p>
                    <p className="text-xl font-mono font-bold text-[var(--text-primary)]">{formatPrice(market.yesPrice)}</p>
                    <p className="text-[10px] text-[var(--text-muted)]">YES</p>
                  </div>
                  <div className="bg-[var(--accent-glow)] border border-[var(--accent)]/25 rounded-xl p-3 text-center">
                    <p className="text-[10px] text-[var(--accent)] uppercase tracking-wider mb-1">AI Estimate</p>
                    <p className="text-xl font-mono font-bold text-[var(--accent-bright)]">
                      {market.myProbability ? Math.round(market.myProbability * 100) + '¢' : 'N/A'}
                    </p>
                    <p className="text-[10px] text-[var(--accent-dim)]">model output</p>
                  </div>
                  <div className="bg-[var(--bg-secondary)] rounded-xl p-3 text-center">
                    <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-1">Edge</p>
                    <p className={`text-xl font-mono font-bold ${(market.edge || 0) > 0.1 ? 'text-[var(--success)]' : 'text-[var(--warning)]'}`}>
                      {market.edge ? formatPct(market.edge * 100, 0) : 'N/A'}
                    </p>
                    <p className="text-[10px] text-[var(--text-muted)]">vs market</p>
                  </div>
                </div>

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
                            delta > 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'
                          )}
                        >
                          {delta > 0 ? '+' : ''}
                          {delta}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            </motion.div>
          </div>

          {/* Right column */}
          <div className="space-y-4">
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.15 }}>
              <Card className="p-5">
                <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Place Paper Bet</h3>

                {/* Side toggle */}
                <div className="grid grid-cols-2 gap-2 mb-4">
                  {(['YES', 'NO'] as const).map(s => (
                    <button
                      key={s}
                      onClick={() => setSide(s)}
                      className={`py-2 rounded-xl text-sm font-semibold transition-all border ${
                        side === s
                          ? s === 'YES'
                            ? 'bg-[var(--success-dim)] border-[var(--success)]/40 text-[var(--success)]'
                            : 'bg-[var(--danger-dim)] border-[var(--danger)]/40 text-[var(--danger)]'
                          : 'bg-[var(--bg-secondary)] border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-bright)]'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>

                <div className="mb-4 space-y-3">
                  <Input label="Amount" prefix="$" value={amount} onChange={e => setAmount(e.target.value)} type="number" min="1" />
                  {amountNum > 0 && amountNum < 5 && (
                    <p className="text-xs text-[var(--warning)] mt-1">
                      Minimum bet size is $5 (Jupiter requirement for live trading)
                    </p>
                  )}
                </div>

                {/* Calculated values */}
                <div className="space-y-2 text-xs mb-4">
                  {[
                    ['Price', formatPrice(price)],
                    ['Contracts', contracts.toString()],
                    ['Potential Payout', formatUSD(payout)],
                    ['Potential Profit', `+${formatUSD(profit)}`],
                    ['Max Loss', formatUSD(Number(amount))],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between items-center py-1.5 border-b border-[var(--border)]">
                      <span className="text-[var(--text-muted)]">{label}</span>
                      <span className={`font-mono font-semibold ${label === 'Potential Profit' ? 'text-[var(--success)]' : label === 'Max Loss' ? 'text-[var(--danger)]' : 'text-[var(--text-primary)]'}`}>
                        {value}
                      </span>
                    </div>
                  ))}
                </div>

                <Button variant="primary" size="md" className="w-full" icon={side === 'YES' ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}>
                  Buy {side} — {formatUSD(Number(amount) || 0)}
                </Button>
              </Card>
            </motion.div>

            {/* Market Info */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.2 }}>
              <Card className="p-5">
                <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Market Info</h3>
                <div className="space-y-2.5 text-xs">
                  {[
                    ['Volume', formatVolume(market.volume)],
                    ['Category', market.category],
                    ['Days Left', `${market.daysLeft} days`],
                    ['Market ID', market.id],
                    ['Platform', 'Polymarket / Jupiter'],
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
