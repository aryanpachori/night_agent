'use client'
import { useState } from 'react'
import { use } from 'react'
import { motion } from 'framer-motion'
import { Topbar } from '@/components/layout/topbar'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MarketPriceChart } from '@/components/markets/market-price-chart'
import { mockMarkets } from '@/data/mock'
import { formatUSD, formatVolume, formatPrice, formatPct } from '@/lib/utils'
import { Sparkles, TrendingUp, TrendingDown, BarChart2, Clock, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

const confidenceVariant: Record<string, 'success' | 'warning' | 'muted'> = {
  high: 'success', medium: 'warning', low: 'muted',
}

const mockKeyFactors = {
  'POLY-108634': ['Coalition instability', 'Ongoing corruption trial', 'Protest surge in Tel Aviv', 'Opposition bloc growing'],
  'POLY-209841': ['ETF inflows $450M last week', 'Fed rate pause confirmed', 'Technical breakout at $82k', 'Miner capitulation ending'],
  'POLY-301920': ['IRGC loyalty intact', 'No elite defections', 'Economic pressure stable', 'Opposition fragmented'],
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

  const keyFactors = mockKeyFactors[id as keyof typeof mockKeyFactors] || ['Market sentiment', 'Recent news', 'Technical analysis', 'Volume trends']

  return (
    <div className="flex flex-col flex-1">
      <Topbar title="Market Detail" subtitle={market.id} />

      <div className="p-6 space-y-5">
        <Link href="/dashboard/markets" className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
          <ArrowLeft className="w-3 h-3" /> Back to Markets
        </Link>

        <div className="grid grid-cols-3 gap-5">
          {/* Left column */}
          <div className="col-span-2 space-y-4">
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
              <Card className="p-5">
                {/* Market header */}
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <h2 className="text-lg font-semibold text-[var(--text-primary)] leading-snug mb-2">
                      {market.question}
                    </h2>
                    <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
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
                  {market.isNew && <Badge variant="accent">NEW</Badge>}
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
                  <p className="text-xs text-[var(--text-muted)] mb-3">Price History (48h)</p>
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

                <div className="grid grid-cols-3 gap-4 mb-4">
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
                  <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-2">Key Factors</p>
                  <div className="flex flex-wrap gap-1.5">
                    {keyFactors.map(f => (
                      <span key={f} className="text-xs px-2.5 py-1 rounded-lg bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border)]">{f}</span>
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

                <div className="space-y-3 mb-4">
                  <Input label="Amount" prefix="$" value={amount} onChange={e => setAmount(e.target.value)} type="number" min="1" />
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
                    <div key={label} className="flex justify-between">
                      <span className="text-[var(--text-muted)]">{label}</span>
                      <span className="font-mono text-[var(--text-secondary)] capitalize">{value}</span>
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
