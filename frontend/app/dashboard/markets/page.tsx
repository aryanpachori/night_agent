'use client'

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Topbar } from '@/components/layout/topbar'
import { MarketCard } from '@/components/markets/market-card'
import { daysLeftFromClose } from '@/lib/market-utils'
import { Search } from 'lucide-react'
import { useMarkets } from '@/hooks/useMarkets'

const categories = ['All', 'Crypto', 'Politics', 'Economics', 'Sports']

export default function MarketsPage() {
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('All')

  const apiCategory = activeCategory === 'All' ? undefined : activeCategory.toLowerCase()
  const { data, isLoading, isError } = useMarkets(apiCategory)

  const marketsWithDays = useMemo(() => {
    const raw = (data?.markets ?? []) as Array<Record<string, unknown>>
    return raw.map((m, idx) => {
      const baseId = String(m.id ?? m.marketId ?? m.eventId ?? m.uuid ?? '').trim()
      // Jupiter sometimes omits id; list keys and links need a stable per-row value.
      const id = baseId || `synthetic-${idx}`
      return {
        id,
        question: String(m.question ?? ''),
        category: String(m.category ?? ''),
        volume: Number(m.volume ?? 0),
        daysLeft: daysLeftFromClose(m.closeTime),
        yesPrice: Number(m.yesPrice ?? 0),
        noPrice: Number(m.noPrice ?? 0),
        myProbability: m.myProbability != null ? Number(m.myProbability) : undefined,
        edge: m.edge != null ? Number(m.edge) : undefined,
        confidence: m.confidence != null ? String(m.confidence) : undefined,
        isNew: Boolean(m.isNew),
      }
    })
  }, [data])

  const categoryCounts = useMemo(() => {
    return marketsWithDays.reduce<Record<string, number>>((acc, m) => {
      const c = m.category || ''
      acc[c] = (acc[c] || 0) + 1
      return acc
    }, {})
  }, [marketsWithDays])

  const filtered = marketsWithDays.filter((m) => {
    const q = String(m.question ?? '').toLowerCase()
    const matchSearch = q.includes(search.toLowerCase())
    const matchCat =
      activeCategory === 'All' || String(m.category ?? '').toLowerCase() === activeCategory.toLowerCase()
    return matchSearch && matchCat
  })

  return (
    <div className="flex flex-1 flex-col">
      <Topbar title="Markets" subtitle="Browse and analyze prediction markets" />

      <div className="space-y-5 p-4 pb-6 sm:p-6">
        {isLoading && <p className="text-xs text-[var(--text-muted)]">Loading markets…</p>}
        {isError && (
          <p className="text-xs text-[var(--danger)]">Could not load markets — check API keys on the server.</p>
        )}

        <motion.div
          className="flex flex-col gap-4 xl:flex-row xl:items-center xl:gap-3"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          <div className="relative w-full max-w-none xl:max-w-sm xl:flex-1">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search markets…"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-card)] py-2 pl-9 pr-3 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {categories.map((cat) => {
              const slug = cat.toLowerCase()
              const displayCount =
                cat === 'All' ? (data?.markets?.length ?? 0) : categoryCounts[slug] ?? categoryCounts[slug.toLowerCase()] ?? 0
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActiveCategory(cat)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                    activeCategory === cat
                      ? 'border-[var(--accent)]/40 bg-[var(--accent-glow)] text-[var(--accent-bright)]'
                      : 'border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-muted)] hover:border-[var(--border-bright)] hover:text-[var(--text-secondary)]'
                  }`}
                >
                  {cat} <span className="ml-1 opacity-60">{displayCount}</span>
                </button>
              )
            })}
          </div>

          <div className="text-xs text-[var(--text-muted)] xl:ml-auto xl:shrink-0">
            <span className="font-mono text-[var(--accent-bright)]">{filtered.length}</span> markets
          </div>
        </motion.div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((market, index) => (
            <MarketCard key={`${market.id}-${index}`} market={market} index={index} />
          ))}
        </div>

        {filtered.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-sm text-[var(--text-muted)]">No markets match your filters</p>
            <button
              type="button"
              onClick={() => {
                setSearch('')
                setActiveCategory('All')
              }}
              className="mt-2 text-xs text-[var(--accent)] hover:underline"
            >
              Clear filters
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
