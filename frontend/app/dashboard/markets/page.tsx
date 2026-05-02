'use client'
import { useState } from 'react'
import { motion } from 'framer-motion'
import { Topbar } from '@/components/layout/topbar'
import { MarketCard } from '@/components/markets/market-card'
import { mockMarkets } from '@/data/mock'
import { Search } from 'lucide-react'

const categories = ['All', 'Crypto', 'Politics', 'Economics', 'Sports']

export default function MarketsPage() {
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('All')

  const filtered = mockMarkets.filter(m => {
    const matchSearch = m.question.toLowerCase().includes(search.toLowerCase())
    const matchCat = activeCategory === 'All' || m.category === activeCategory.toLowerCase()
    return matchSearch && matchCat
  })

  return (
    <div className="flex flex-col flex-1">
      <Topbar title="Markets" subtitle="Browse and analyze prediction markets" />

      <div className="p-6 space-y-5">
        {/* Search + filters */}
        <motion.div
          className="flex items-center gap-3"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)]" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search markets…"
              className="w-full bg-[var(--bg-card)] border border-[var(--border)] rounded-lg pl-9 pr-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)] transition-colors"
            />
          </div>

          <div className="flex items-center gap-1.5">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                  activeCategory === cat
                    ? 'bg-[var(--accent-glow)] border-[var(--accent)]/40 text-[var(--accent-bright)]'
                    : 'bg-[var(--bg-card)] border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:border-[var(--border-bright)]'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="ml-auto text-xs text-[var(--text-muted)]">
            <span className="font-mono text-[var(--accent-bright)]">{filtered.length}</span> markets
          </div>
        </motion.div>

        {/* Market grid */}
        <div className="grid grid-cols-3 gap-4">
          {filtered.map((market, index) => (
            <MarketCard key={market.id} market={market} index={index} />
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-[var(--text-muted)] text-sm">No markets match your filters</p>
            <button onClick={() => { setSearch(''); setActiveCategory('All') }} className="text-xs text-[var(--accent)] mt-2 hover:underline">
              Clear filters
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
