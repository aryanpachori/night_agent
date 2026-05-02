'use client'
import { useState } from 'react'
import { motion } from 'framer-motion'
import { Topbar } from '@/components/layout/topbar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs } from '@/components/ui/tabs'
import { ExitModal } from '@/components/positions/exit-modal'
import { Tooltip } from '@/components/ui/tooltip'
import { mockPositions, mockClosedPositions } from '@/data/mock'
import { formatUSD, formatPct, formatPrice } from '@/lib/utils'
import { staggerContainer, tableRow } from '@/lib/animations'
import { TrendingUp, TrendingDown, DollarSign } from 'lucide-react'

const tabs = [
  { id: 'open',   label: 'Open',   count: mockPositions.length },
  { id: 'closed', label: 'Closed', count: mockClosedPositions.length },
]

const categoryColors: Record<string, string> = {
  politics:  'text-[var(--warning)]',
  crypto:    'text-[var(--accent-bright)]',
  economics: 'text-[var(--success)]',
  sports:    'text-[var(--text-secondary)]',
}

export default function PositionsPage() {
  const [activeTab, setActiveTab] = useState('open')
  const [exitPos, setExitPos] = useState<typeof mockPositions[0] | null>(null)

  const totalCost  = mockPositions.reduce((s, p) => s + p.totalCost, 0)
  const totalValue = mockPositions.reduce((s, p) => s + p.currentValue, 0)
  const totalPnl   = mockPositions.reduce((s, p) => s + p.pnl, 0)

  return (
    <div className="flex flex-col flex-1">
      <Topbar title="Positions" subtitle="Your open and closed paper trades" />

      <div className="space-y-5 p-4 pb-6 sm:p-6">
        {/* Summary row */}
        <motion.div
          className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          {[
            { icon: DollarSign, label: 'Total Cost', value: formatUSD(totalCost), color: 'text-[var(--text-primary)]' },
            { icon: TrendingUp, label: 'Current Value', value: formatUSD(totalValue), color: 'text-[var(--text-primary)]' },
            { icon: totalPnl >= 0 ? TrendingUp : TrendingDown, label: 'Unrealized P&L', value: (totalPnl >= 0 ? '+' : '') + formatUSD(totalPnl), color: totalPnl >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]' },
          ].map(({ icon: Icon, label, value, color }) => (
            <div key={label} className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
              <div className="p-2 rounded-lg bg-[var(--accent-glow)]">
                <Icon className="w-4 h-4 text-[var(--accent)]" />
              </div>
              <div>
                <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">{label}</p>
                <p className={`font-mono text-base font-bold sm:text-lg ${color}`}>{value}</p>
              </div>
            </div>
          ))}
        </motion.div>

        <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} className="w-fit" />

        {/* Open positions table */}
        {activeTab === 'open' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)]"
          >
            <div className="overflow-x-auto overscroll-x-contain">
              <div className="min-w-[920px]">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  {['Market', 'Category', 'Side', 'Contracts', 'Entry', 'Current', 'Cost', 'Value', 'P&L', 'Days Left', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <motion.tbody variants={staggerContainer} initial="hidden" animate="visible">
                {mockPositions.map(pos => {
                  const pnlPos = pos.pnl >= 0
                  return (
                    <motion.tr
                      key={pos.id}
                      variants={tableRow}
                      className="border-b border-[var(--border)] hover:bg-[var(--bg-card-hover)] transition-colors"
                    >
                      <td className="max-w-[200px] px-4 py-3 md:max-w-[min(320px,28vw)]">
                        <Tooltip content={pos.marketQuestion}>
                          <span className="block truncate text-xs text-[var(--text-primary)]">{pos.marketQuestion}</span>
                        </Tooltip>
                        <p className="text-[10px] text-[var(--text-muted)] font-mono">{pos.marketId}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium capitalize ${categoryColors[pos.category] || 'text-[var(--text-secondary)]'}`}>
                          {pos.category}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={pos.side === 'YES' ? 'success' : 'danger'} size="sm">{pos.side}</Badge>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-[var(--text-primary)]">{pos.contracts}</td>
                      <td className="px-4 py-3 font-mono text-xs text-[var(--text-primary)]">{formatPrice(pos.entryPrice)}</td>
                      <td className="px-4 py-3 font-mono text-xs text-[var(--text-primary)]">{formatPrice(pos.currentPrice)}</td>
                      <td className="px-4 py-3 font-mono text-xs text-[var(--text-primary)]">{formatUSD(pos.totalCost)}</td>
                      <td className="px-4 py-3 font-mono text-xs text-[var(--text-primary)]">{formatUSD(pos.currentValue)}</td>
                      <td className="px-4 py-3">
                        <p className={`font-mono text-xs font-semibold ${pnlPos ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                          {pnlPos ? '+' : ''}{formatUSD(pos.pnl)}
                        </p>
                        <p className={`font-mono text-[10px] ${pnlPos ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                          {formatPct(pos.pnlPercent)}
                        </p>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-[var(--text-secondary)]">{pos.daysLeft}d</td>
                      <td className="px-4 py-3">
                        <Button variant="danger" size="sm" onClick={() => setExitPos(pos)}>Exit</Button>
                      </td>
                    </motion.tr>
                  )
                })}
              </motion.tbody>
            </table>

            {/* Totals row */}
            <div className="flex items-center justify-end gap-6 border-t border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3 sm:gap-8">
              <span className="text-xs text-[var(--text-muted)]">Totals</span>
              <span className="text-xs font-mono text-[var(--text-primary)]">{formatUSD(totalCost)}</span>
              <span className="text-xs font-mono text-[var(--text-primary)]">{formatUSD(totalValue)}</span>
              <span className={`text-xs font-mono font-semibold ${totalPnl >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                {totalPnl >= 0 ? '+' : ''}{formatUSD(totalPnl)}
              </span>
              <span className="w-12 sm:w-16" />
            </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Closed positions */}
        {activeTab === 'closed' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)]"
          >
            <div className="overflow-x-auto overscroll-x-contain">
              <table className="w-full min-w-[760px]">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  {['Market', 'Category', 'Side', 'Contracts', 'Entry', 'Exit', 'P&L', 'Result', 'Closed'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <motion.tbody variants={staggerContainer} initial="hidden" animate="visible">
                {mockClosedPositions.map(pos => {
                  const win = pos.exitReason === 'resolved_win'
                  return (
                    <motion.tr
                      key={pos.id}
                      variants={tableRow}
                      className="border-b border-[var(--border)] hover:bg-[var(--bg-card-hover)] transition-colors"
                    >
                      <td className="px-4 py-3">
                        <p className="text-xs text-[var(--text-primary)] max-w-[200px] truncate">{pos.marketQuestion}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium capitalize ${categoryColors[pos.category] || 'text-[var(--text-secondary)]'}`}>
                          {pos.category}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={pos.side === 'YES' ? 'success' : 'danger'} size="sm">{pos.side}</Badge>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-[var(--text-primary)]">{pos.contracts}</td>
                      <td className="px-4 py-3 font-mono text-xs text-[var(--text-primary)]">{formatPrice(pos.entryPrice)}</td>
                      <td className="px-4 py-3 font-mono text-xs text-[var(--text-primary)]">{formatPrice(pos.closePrice)}</td>
                      <td className="px-4 py-3">
                        <p className={`font-mono text-xs font-semibold ${win ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                          {win ? '+' : ''}{formatUSD(pos.pnl)}
                        </p>
                        <p className={`font-mono text-[10px] ${win ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                          {formatPct(pos.pnlPercent)}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={win ? 'success' : 'danger'} size="sm">
                          {win ? 'WON' : 'LOST'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-[var(--text-muted)] font-mono">
                        {pos.closedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </td>
                    </motion.tr>
                  )
                })}
              </motion.tbody>
            </table>
            </div>
          </motion.div>
        )}
      </div>

      <ExitModal isOpen={!!exitPos} onClose={() => setExitPos(null)} position={exitPos} />
    </div>
  )
}
