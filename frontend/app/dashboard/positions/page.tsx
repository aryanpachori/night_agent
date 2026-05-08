'use client'

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Topbar } from '@/components/layout/topbar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs } from '@/components/ui/tabs'
import { ExitModal } from '@/components/positions/exit-modal'
import { Tooltip } from '@/components/ui/tooltip'
import { formatUSD } from '@/lib/utils'
import { staggerContainer, tableRow } from '@/lib/animations'
import { TrendingUp, TrendingDown, DollarSign } from 'lucide-react'
import { usePositions, useExitPosition } from '@/hooks/usePositions'
import { normalizeClosedPosition, normalizeOpenPosition, type UiOpenPosition } from '@/lib/normalize-position'

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

  const totalStaked = openRows.reduce((s, p) => s + p.totalCost, 0)
  const totalWorth = openRows.reduce((s, p) => s + p.currentValue, 0)
  const totalPnl = openRows.reduce((s, p) => s + p.pnl, 0)

  return (
    <div className="flex flex-1 flex-col">
      <Topbar title="My Bets" subtitle="Your open and closed bets" />

      <div className="space-y-5 p-4 pb-6 sm:p-6">
        {isLoading && (
          <p className="text-xs text-[var(--text-muted)]">Loading bets…</p>
        )}

        {/* Summary strip */}
        <motion.div
          className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          {[
            {
              icon: DollarSign,
              label: 'Total Staked',
              value: formatUSD(totalStaked),
              color: 'text-[var(--text-primary)]',
            },
            {
              icon: TrendingUp,
              label: 'Currently Worth',
              value: formatUSD(totalWorth),
              color: 'text-[var(--text-primary)]',
            },
            {
              icon: totalPnl >= 0 ? TrendingUp : TrendingDown,
              label: totalPnl >= 0 ? 'Total Gain' : 'Total Loss',
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

        {/* Open bets table */}
        {activeTab === 'open' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)]"
          >
            <div className="overflow-x-auto overscroll-x-contain">
              <div className="min-w-[720px]">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[var(--border)]">
                      {['Event', 'Side', 'You bet', 'Now worth', 'Status', 'Days Left', 'Actions'].map((h) => (
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
                      const winning = pos.pnl >= 0
                      return (
                        <motion.tr
                          key={pos.id}
                          variants={tableRow}
                          className="border-b border-[var(--border)] transition-colors hover:bg-[var(--bg-card-hover)]"
                        >
                          <td className="max-w-[260px] px-4 py-3 md:max-w-[min(380px,34vw)]">
                            <p className="text-sm font-medium text-[var(--text-primary)]">{pos.eventName}</p>
                            <Tooltip content={pos.marketQuestion}>
                              <span className="mt-0.5 block truncate text-xs text-[var(--text-muted)]">
                                {pos.marketQuestion}
                              </span>
                            </Tooltip>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={pos.side === 'YES' ? 'success' : 'danger'} size="sm">
                              {pos.side}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-[var(--text-primary)]">
                            {formatUSD(pos.totalCost)}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-[var(--text-primary)]">
                            {formatUSD(pos.currentValue)}
                            <p className="text-[10px] text-[var(--text-muted)]">
                              @ {Math.round((pos.currentPrice ?? 0) * 100)}¢
                            </p>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`text-xs font-semibold ${winning ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}
                            >
                              {winning ? '🟢 ' : '🔴 '}
                              {winning ? '+' : ''}
                              {formatUSD(pos.pnl)}
                            </span>
                            {pos.pnlPercent !== 0 && (
                              <p className={`font-mono text-[10px] ${winning ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                                {winning ? '+' : ''}
                                {pos.pnlPercent.toFixed(1)}%
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-[var(--text-secondary)]">
                            <span className={`rounded-md px-2 py-1 ${
                              pos.timeLabel === 'Ended'
                                ? 'bg-[var(--danger-dim)] text-[var(--danger)]'
                                : pos.daysLeft === 0 && pos.hoursLeft !== null
                                  ? 'bg-[var(--warning)]/15 text-[var(--warning)]'
                                  : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)]'
                            }`}>
                              {pos.timeLabel ?? '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <Button variant="danger" size="sm" onClick={() => setExitPos(pos)}>
                              Exit
                            </Button>
                          </td>
                        </motion.tr>
                      )
                    })}
                    {openRows.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-xs text-[var(--text-muted)]">
                          No open bets — tap <strong>Bet →</strong> on an alert to place your first bet.
                        </td>
                      </tr>
                    )}
                  </motion.tbody>
                </table>

                {openRows.length > 0 && (
                  <div className="flex items-center gap-6 border-t border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3 sm:gap-8">
                    <span className="text-xs text-[var(--text-muted)]">Totals</span>
                    <span className="font-mono text-xs text-[var(--text-primary)]">{formatUSD(totalStaked)}</span>
                    <span className="font-mono text-xs text-[var(--text-primary)]">{formatUSD(totalWorth)}</span>
                    <span
                      className={`font-mono text-xs font-semibold ${totalPnl >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}
                    >
                      {totalPnl >= 0 ? '+' : ''}
                      {formatUSD(totalPnl)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* Closed bets table */}
        {activeTab === 'closed' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)]"
          >
            <div className="overflow-x-auto overscroll-x-contain">
              <table className="min-w-[620px] w-full">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    {['Event', 'Side', 'Staked', 'Returned', 'Profit / Loss', 'Result', 'Date'].map((h) => (
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
                  {closedRows.map((pos) => {
                    const win = pos.pnl >= 0
                    // totalCost = staked; totalCost + pnl = returned
                    const returned = pos.totalCost + pos.pnl
                    return (
                      <motion.tr
                        key={pos.id}
                        variants={tableRow}
                        className="border-b border-[var(--border)] transition-colors hover:bg-[var(--bg-card-hover)]"
                      >
                        <td className="px-4 py-3">
                          <p className="max-w-[220px] truncate text-xs text-[var(--text-primary)]">{pos.marketQuestion}</p>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={pos.side === 'YES' ? 'success' : 'danger'} size="sm">
                            {pos.side}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-[var(--text-primary)]">
                          {formatUSD(pos.totalCost)}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-[var(--text-primary)]">
                          {formatUSD(returned)}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`font-mono text-xs font-semibold ${win ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                            {win ? '+' : ''}
                            {formatUSD(pos.pnl)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={win ? 'success' : 'danger'} size="sm">
                            {win ? '🎉 Won' : '😔 Lost'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-[var(--text-muted)]">
                          {pos.closedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </td>
                      </motion.tr>
                    )
                  })}
                  {closedRows.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-xs text-[var(--text-muted)]">
                        No closed bets yet.
                      </td>
                    </tr>
                  )}
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
