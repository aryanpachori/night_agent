'use client'

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Topbar } from '@/components/layout/topbar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs } from '@/components/ui/tabs'
import { ExitModal } from '@/components/positions/exit-modal'
import { Tooltip } from '@/components/ui/tooltip'
import { formatUSD, formatPct, formatPrice } from '@/lib/utils'
import { staggerContainer, tableRow } from '@/lib/animations'
import { TrendingUp, TrendingDown, DollarSign } from 'lucide-react'
import { usePositions, useExitPosition } from '@/hooks/usePositions'
import { normalizeClosedPosition, normalizeOpenPosition, type UiOpenPosition } from '@/lib/normalize-position'

const categoryColors: Record<string, string> = {
  politics: 'text-[var(--warning)]',
  crypto: 'text-[var(--accent-bright)]',
  economics: 'text-[var(--success)]',
  sports: 'text-[var(--text-secondary)]',
}

export default function PositionsPage() {
  const [activeTab, setActiveTab] = useState('open')
  const [exitPos, setExitPos] = useState<UiOpenPosition | null>(null)
  const { data, isLoading } = usePositions()
  const exitMutation = useExitPosition()

  const { openRows, closedRows } = useMemo(() => {
    const positions = (data?.positions ?? []) as Record<string, unknown>[]
    const open: UiOpenPosition[] = []
    const closed: ReturnType<typeof normalizeClosedPosition>[] = []
    for (const row of positions) {
      const st = String(row.status ?? '')
      if (st === 'open') open.push(normalizeOpenPosition(row))
      else closed.push(normalizeClosedPosition(row))
    }
    return { openRows: open, closedRows: closed }
  }, [data])

  const tabs = [
    { id: 'open', label: 'Open', count: openRows.length },
    { id: 'closed', label: 'Closed', count: closedRows.length },
  ]

  const totalCost = openRows.reduce((s, p) => s + p.totalCost, 0)
  const totalValue = openRows.reduce((s, p) => s + p.currentValue, 0)
  const totalPnl = openRows.reduce((s, p) => s + p.pnl, 0)

  return (
    <div className="flex flex-1 flex-col">
      <Topbar title="Positions" subtitle="Your open and closed paper trades" />

      <div className="space-y-5 p-4 pb-6 sm:p-6">
        {isLoading && (
          <p className="text-xs text-[var(--text-muted)]">Loading positions…</p>
        )}

        <motion.div
          className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          {[
            {
              icon: DollarSign,
              label: 'Total Cost',
              value: formatUSD(totalCost),
              color: 'text-[var(--text-primary)]',
            },
            {
              icon: TrendingUp,
              label: 'Current Value',
              value: formatUSD(totalValue),
              color: 'text-[var(--text-primary)]',
            },
            {
              icon: totalPnl >= 0 ? TrendingUp : TrendingDown,
              label: 'Unrealized P&L',
              value: (totalPnl >= 0 ? '+' : '') + formatUSD(totalPnl),
              color: totalPnl >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]',
            },
          ].map(({ icon: Icon, label, value, color }) => (
            <div
              key={label}
              className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4"
            >
              <div className="rounded-lg bg-[var(--accent-glow)] p-2">
                <Icon className="h-4 w-4 text-[var(--accent)]" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-[var(--text-muted)]">{label}</p>
                <p className={`font-mono text-base font-bold sm:text-lg ${color}`}>{value}</p>
              </div>
            </div>
          ))}
        </motion.div>

        <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} className="w-fit" />

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
                      {[
                        'Market',
                        'Category',
                        'Side',
                        'Contracts',
                        'Entry',
                        'Current',
                        'Cost',
                        'Value',
                        'P&L',
                        'Days Left',
                        'Actions',
                      ].map((h) => (
                        <th
                          key={h}
                          className="whitespace-nowrap px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <motion.tbody variants={staggerContainer} initial="hidden" animate="visible">
                    {openRows.map((pos) => {
                      const pnlPos = pos.pnl >= 0
                      return (
                        <motion.tr
                          key={pos.id}
                          variants={tableRow}
                          className="border-b border-[var(--border)] transition-colors hover:bg-[var(--bg-card-hover)]"
                        >
                          <td className="max-w-[200px] px-4 py-3 md:max-w-[min(320px,28vw)]">
                            <Tooltip content={pos.marketQuestion}>
                              <span className="block truncate text-xs text-[var(--text-primary)]">
                                {pos.marketQuestion}
                              </span>
                            </Tooltip>
                            <p className="font-mono text-[10px] text-[var(--text-muted)]">{pos.marketId}</p>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`text-xs font-medium capitalize ${categoryColors[pos.category] || 'text-[var(--text-secondary)]'}`}
                            >
                              {pos.category}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={pos.side === 'YES' ? 'success' : 'danger'} size="sm">
                              {pos.side}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-[var(--text-primary)]">{pos.contracts}</td>
                          <td className="px-4 py-3 font-mono text-xs text-[var(--text-primary)]">
                            {formatPrice(pos.entryPrice)}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-[var(--text-primary)]">
                            {formatPrice(pos.currentPrice)}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-[var(--text-primary)]">
                            {formatUSD(pos.totalCost)}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-[var(--text-primary)]">
                            {formatUSD(pos.currentValue)}
                          </td>
                          <td className="px-4 py-3">
                            <p
                              className={`font-mono text-xs font-semibold ${pnlPos ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}
                            >
                              {pnlPos ? '+' : ''}
                              {formatUSD(pos.pnl)}
                            </p>
                            <p
                              className={`font-mono text-[10px] ${pnlPos ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}
                            >
                              {formatPct(pos.pnlPercent)}
                            </p>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-[var(--text-secondary)]">
                            {pos.daysLeft ? `${pos.daysLeft}d` : '—'}
                          </td>
                          <td className="px-4 py-3">
                            <Button variant="danger" size="sm" onClick={() => setExitPos(pos)}>
                              Exit
                            </Button>
                          </td>
                        </motion.tr>
                      )
                    })}
                  </motion.tbody>
                </table>

                <div className="flex items-center justify-end gap-6 border-t border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3 sm:gap-8">
                  <span className="text-xs text-[var(--text-muted)]">Totals</span>
                  <span className="font-mono text-xs text-[var(--text-primary)]">{formatUSD(totalCost)}</span>
                  <span className="font-mono text-xs text-[var(--text-primary)]">{formatUSD(totalValue)}</span>
                  <span
                    className={`font-mono text-xs font-semibold ${totalPnl >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}
                  >
                    {totalPnl >= 0 ? '+' : ''}
                    {formatUSD(totalPnl)}
                  </span>
                  <span className="w-12 sm:w-16" />
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'closed' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)]"
          >
            <div className="overflow-x-auto overscroll-x-contain">
              <table className="min-w-[760px] w-full">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    {['Market', 'Category', 'Side', 'Contracts', 'Entry', 'Exit', 'P&L', 'Result', 'Closed'].map(
                      (h) => (
                        <th
                          key={h}
                          className="whitespace-nowrap px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]"
                        >
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <motion.tbody variants={staggerContainer} initial="hidden" animate="visible">
                  {closedRows.map((pos) => {
                    const win = pos.pnl >= 0
                    return (
                      <motion.tr
                        key={pos.id}
                        variants={tableRow}
                        className="border-b border-[var(--border)] transition-colors hover:bg-[var(--bg-card-hover)]"
                      >
                        <td className="px-4 py-3">
                          <p className="max-w-[200px] truncate text-xs text-[var(--text-primary)]">{pos.marketQuestion}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`text-xs font-medium capitalize ${categoryColors[pos.category] || 'text-[var(--text-secondary)]'}`}
                          >
                            {pos.category}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={pos.side === 'YES' ? 'success' : 'danger'} size="sm">
                            {pos.side}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-[var(--text-primary)]">{pos.contracts}</td>
                        <td className="px-4 py-3 font-mono text-xs text-[var(--text-primary)]">
                          {formatPrice(pos.entryPrice)}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-[var(--text-primary)]">
                          {formatPrice(pos.closePrice)}
                        </td>
                        <td className="px-4 py-3">
                          <p
                            className={`font-mono text-xs font-semibold ${win ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}
                          >
                            {win ? '+' : ''}
                            {formatUSD(pos.pnl)}
                          </p>
                          <p
                            className={`font-mono text-[10px] ${win ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}
                          >
                            {formatPct(pos.pnlPercent)}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={win ? 'success' : 'danger'} size="sm">
                            {win ? 'WIN' : 'LOSS'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-[var(--text-muted)]">
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

      <ExitModal
        isOpen={!!exitPos}
        onClose={() => setExitPos(null)}
        position={exitPos}
        loading={exitMutation.isPending}
        onConfirm={async (closePrice) => {
          if (!exitPos) return
          await exitMutation.mutateAsync({ id: exitPos.id, closePrice, exitReason: 'manual' })
        }}
      />
    </div>
  )
}
