'use client'
import { motion } from 'framer-motion'
import { useInView } from 'react-intersection-observer'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { formatVolume, formatPrice, formatPct } from '@/lib/utils'
import { Clock, BarChart2, Sparkles } from 'lucide-react'

interface Market {
  id: string
  question: string
  category: string
  volume: number
  daysLeft: number
  yesPrice: number
  noPrice: number
  myProbability?: number
  edge?: number
  confidence?: string
  isNew?: boolean
}

const confidenceVariant: Record<string, 'success' | 'warning' | 'muted'> = {
  high:   'success',
  medium: 'warning',
  low:    'muted',
}

const categoryColors: Record<string, string> = {
  politics:  'text-[var(--warning)]',
  crypto:    'text-[var(--accent-bright)]',
  economics: 'text-[var(--success)]',
  sports:    'text-[var(--text-secondary)]',
}

function getEdgeColor(edge: number): string {
  if (edge >= 0.15) return 'var(--success)'
  if (edge >= 0.08) return 'var(--accent-cyan)'
  return 'var(--text-muted)'
}

export function MarketCard({ market, index }: { market: Market; index: number }) {
  const router = useRouter()
  const { ref, inView } = useInView({ triggerOnce: true, threshold: 0.1, rootMargin: '0px 0px -40px 0px' })

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.4, delay: (index % 3) * 0.08, ease: [0.0, 0.0, 0.2, 1] }}
      whileHover={{ y: -3, transition: { duration: 0.15 } }}
      onClick={() => router.push(`/dashboard/markets/${market.id}`)}
      className="relative cursor-pointer overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 transition-colors hover:border-[var(--accent)]/40 hover:shadow-[0_8px_30px_rgba(148,137,121,0.1)]"
    >
      {market.isNew && (
        <span className="absolute right-3 top-3 z-10 animate-pulse rounded-full border border-[var(--accent)]/30 bg-[var(--accent-glow)] px-2 py-0.5 text-[10px] font-bold text-[var(--accent)]">
          NEW
        </span>
      )}
      {/* Header */}
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-xs font-medium capitalize ${categoryColors[market.category] || 'text-[var(--text-secondary)]'}`}>
            {market.category}
          </span>
          {market.confidence && (
            <Badge variant={confidenceVariant[market.confidence] || 'muted'} size="sm" className="capitalize">
              {market.confidence}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] flex-shrink-0">
          <Clock className="w-3 h-3" />
          <span className="font-mono">{market.daysLeft}d</span>
        </div>
      </div>

      {/* Question */}
      <p className="text-sm text-[var(--text-primary)] font-medium leading-snug mb-3 line-clamp-2">
        {market.question}
      </p>

      {/* YES/NO prices */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-[var(--success-dim)] border border-[var(--success)]/25 rounded-lg px-3 py-2 text-center">
          <p className="text-[10px] text-[var(--success)] font-medium mb-0.5">YES</p>
          <p className="text-sm font-mono font-bold text-[var(--success)]">{formatPrice(market.yesPrice)}</p>
        </div>
        <div className="bg-[var(--danger-dim)] border border-[var(--danger)]/25 rounded-lg px-3 py-2 text-center">
          <p className="text-[10px] text-[var(--danger)] font-medium mb-0.5">NO</p>
          <p className="text-sm font-mono font-bold text-[var(--danger)]">{formatPrice(market.noPrice)}</p>
        </div>
      </div>

      {/* AI Analysis row */}
      {market.myProbability && market.edge !== undefined && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-[var(--accent)]/20 bg-[var(--accent-glow)] p-2">
          <Sparkles className="h-3 w-3 text-[var(--accent)]" />
          <div className="flex items-center gap-3 text-[10px]">
            <span className="text-[var(--text-muted)]">
              AI:{' '}
              <span className="font-mono font-semibold text-[var(--accent-bright)]">{Math.round(market.myProbability * 100)}%</span>
            </span>
            <span className="text-[var(--text-muted)]">
              Edge:{' '}
              <span style={{ color: getEdgeColor(market.edge) }} className="font-mono font-semibold">
                {formatPct(market.edge * 100, 0)}
              </span>
            </span>
          </div>
        </div>
      )}

      {/* Volume */}
      <div className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
        <BarChart2 className="w-3 h-3" />
        <span className="font-mono">{formatVolume(market.volume)} volume</span>
      </div>
    </motion.div>
  )
}
