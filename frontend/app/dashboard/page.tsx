'use client'

import { motion } from 'framer-motion'
import { Wallet, TrendingUp, Target, Bell } from 'lucide-react'
import { Topbar } from '@/components/layout/topbar'
import { StatCard } from '@/components/dashboard/stat-card'
import { PnlChart } from '@/components/dashboard/pnl-chart'
import { BotStatusPanel } from '@/components/dashboard/bot-status-panel'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import DashboardSkeleton from '@/app/dashboard/loading'

import { useSummaryStats, useBotStatus } from '@/hooks/useStats'
import { useWalletHistory } from '@/hooks/useWallet'
import { usePositions } from '@/hooks/usePositions'
import { useAlerts, useAlertStream } from '@/hooks/useAlerts'
import { usePauseBot } from '@/hooks/useAuth'
import { normalizeOpenPosition, type UiOpenPosition } from '@/lib/normalize-position'
import { formatUSD, formatPct, formatTimeAgo } from '@/lib/utils'
import Link from 'next/link'

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
}

function currentPriceTrend(pos: UiOpenPosition): 'up' | 'down' {
  if (pos.side === 'YES') return pos.currentPrice >= pos.entryPrice ? 'up' : 'down'
  return pos.currentPrice <= pos.entryPrice ? 'up' : 'down'
}

export default function DashboardPage() {
  const { data: stats, isLoading: statsLoading } = useSummaryStats()
  const { data: walletHistory } = useWalletHistory()
  const { data: positionsData } = usePositions('open')
  const { data: alertsData } = useAlerts('all', 5)
  const { data: botStatus } = useBotStatus()
  useAlertStream(true)
  const pauseBot = usePauseBot()

  const openPositions: UiOpenPosition[] = (positionsData?.positions ?? []).map((row: Record<string, unknown>) =>
    normalizeOpenPosition(row),
  )

  if (statsLoading || !stats) {
    return (
      <div className="flex flex-1 flex-col">
        <Topbar title="Dashboard" subtitle="Paper trading overview" />
        <DashboardSkeleton />
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col">
      <Topbar title="Dashboard" subtitle="Paper trading overview" />

      <div className="space-y-6 p-4 pb-6 sm:p-6">
        <motion.div
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
          initial={fadeUp.initial}
          animate={fadeUp.animate}
          transition={{ duration: 0.4 }}
        >
          <StatCard
            icon={Wallet}
            label="Paper Balance"
            value={formatUSD(stats.balance)}
            change={formatPct(stats.roi)}
            changePositive={stats.totalPnl >= 0}
            subtitle={`Starting ${formatUSD(stats.startingBalance)}`}
            glow
          />
          <StatCard
            icon={TrendingUp}
            label="Total P&L"
            value={formatUSD(stats.totalPnl)}
            change={formatPct(stats.roi)}
            changePositive={stats.totalPnl >= 0}
          />
          <StatCard
            icon={Target}
            label="Win Rate"
            value={`${stats.winRate}%`}
            subtitle={`${stats.wins}W / ${stats.losses}L`}
          />
          <Card className="p-5">
            <div className="mb-3 flex items-start justify-between">
              <div className="rounded-lg bg-[var(--accent-glow)] p-2">
                <Bell className="h-4 w-4 text-[var(--accent)]" />
              </div>
            </div>
            <p className="mb-1 text-xs uppercase tracking-wider text-[var(--text-muted)]">Alerts Today</p>
            <motion.p
              className="font-mono text-2xl font-bold text-[var(--text-primary)]"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
            >
              {stats.alertsTodayCount ?? 0}
              {stats.maxAlertsPerDay ? (
                <span className="ml-1 font-mono text-sm font-normal text-[var(--text-muted)]">
                  / {stats.maxAlertsPerDay}
                </span>
              ) : null}
            </motion.p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">Bot signals sent to you today</p>
          </Card>
        </motion.div>

        <motion.div
          className="grid grid-cols-1 gap-4 lg:grid-cols-3"
          initial={fadeUp.initial}
          animate={fadeUp.animate}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <Card className="p-5 lg:col-span-2">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Portfolio Performance</h3>
                <p className="text-xs text-[var(--text-muted)]">30-day paper trading balance</p>
              </div>
              <Badge variant="success">{formatPct(stats.roi)}</Badge>
            </div>
            <PnlChart data={walletHistory?.history} />
          </Card>

          <BotStatusPanel
            isActive={botStatus?.isActive}
            isPaused={botStatus?.isPaused}
            lastScanAt={botStatus?.lastScanAt}
            marketsWatching={botStatus?.marketsWatching}
            alertsToday={stats.alertsTodayCount}
            maxAlerts={stats.maxAlertsPerDay}
            categories={stats.categories}
            scanIntervalSeconds={botStatus?.scanIntervalSeconds}
            secondsSinceLastScan={botStatus?.secondsSinceLastScan}
            onPause={() => pauseBot.mutate(undefined)}
            pausePending={pauseBot.isPending}
          />
        </motion.div>

        <motion.div
          className="grid grid-cols-1 gap-4 xl:grid-cols-2"
          initial={fadeUp.initial}
          animate={fadeUp.animate}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <Card className="p-5">
            <h3 className="mb-4 text-sm font-semibold text-[var(--text-primary)]">
              Open Positions ({openPositions.length})
            </h3>
            <div className="space-y-2">
              {openPositions.map((pos) => {
                const winning = pos.pnl >= 0
                return (
                  <div
                    key={pos.id}
                    className="flex flex-col gap-2 rounded-lg bg-[var(--bg-secondary)] p-3 transition-colors hover:bg-[var(--bg-card-hover)] sm:flex-row sm:items-center sm:gap-3"
                  >
                    <Badge variant={pos.side === 'YES' ? 'success' : 'danger'} size="sm" className="w-fit shrink-0">
                      {pos.side}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs text-[var(--text-primary)]">{pos.marketQuestion}</p>
                      <p className="text-[10px] text-[var(--text-muted)]">
                        Bet {formatUSD(pos.totalCost)} → now worth{' '}
                        <span className="font-mono font-semibold text-[var(--text-primary)]">
                          {formatUSD(pos.currentValue)}
                        </span>
                        {pos.daysLeft ? ` · ${pos.daysLeft}d left` : ''}
                      </p>
                    </div>
                    <div className="ml-auto shrink-0 border-t border-[var(--border)] pt-2 text-right sm:border-t-0 sm:pt-0">
                      <p
                        className={`font-mono text-xs font-semibold ${winning ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}
                      >
                        {winning ? '🟢 +' : '🔴 '}
                        {formatUSD(pos.pnl)}
                      </p>
                    </div>
                  </div>
                )
              })}
              {openPositions.length === 0 && (
                <p className="text-xs text-[var(--text-muted)]">No open positions — browse Markets to trade.</p>
              )}
            </div>
          </Card>

          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Recent Alerts</h3>
              <Link href="/dashboard/alerts" className="text-[10px] text-[var(--text-muted)] hover:text-[var(--accent-bright)] transition-colors">
                View all →
              </Link>
            </div>
            <div className="space-y-2">
              {(alertsData?.alerts ?? []).map((alert: Record<string, unknown>) => {
                const action = String(alert.actionTaken ?? '')
                const hasActed = action !== ''
                const isBet = action === 'bet_full' || action === 'bet_half'
                const createdAt = alert.createdAt ? new Date(String(alert.createdAt)) : new Date()
                const side = String(alert.side ?? 'YES')
                const marketId = String(alert.marketId ?? '')
                const alertId = String(alert.id ?? '')
                const stake = Math.round(Number(alert.suggestedAmount ?? 50))
                const winAmount = Math.round(Number(alert.suggestedContracts ?? 0))
                const profit = winAmount - stake
                // Use pre-computed eventName from API, or fallback
                const eventName = String(alert.eventName ?? alert.marketQuestion ?? 'Market event')
                const dir = side === 'YES' ? '↑ UP' : '↓ DOWN'
                const dirColor = side === 'YES' ? 'text-[var(--success)]' : 'text-[var(--danger)]'
                return (
                  <div key={alertId} className="flex items-start gap-3 rounded-lg bg-[var(--bg-secondary)] p-3">
                    <div className={`mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full ${isBet ? 'bg-[var(--success)]' : hasActed ? 'bg-[var(--text-muted)]' : 'bg-[var(--accent)]'}`} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-[var(--text-primary)]">{eventName}</p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        <span className={`text-[10px] font-semibold ${dirColor}`}>{dir}</span>
                        {profit > 0 && (
                          <span className="font-mono text-[10px] text-[var(--text-secondary)]">
                            ${stake} → win +${profit}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-shrink-0 flex-col items-end gap-1">
                      <span className="text-[10px] text-[var(--text-muted)]">{formatTimeAgo(createdAt)}</span>
                      {hasActed ? (
                        <span className={`rounded-full border px-2 py-0.5 text-[9px] font-medium ${
                          isBet
                            ? 'border-[var(--success)]/30 bg-[var(--success-dim)] text-[var(--success)]'
                            : 'border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-muted)]'
                        }`}>
                          {isBet ? '✅ Bet' : '⏭ Skipped'}
                        </span>
                      ) : marketId ? (
                        <Link
                          href={`/dashboard/markets/${marketId}?side=${side}&amount=${stake}&alertId=${alertId}`}
                          className="rounded border border-[var(--accent)]/40 bg-[var(--accent-glow)] px-2 py-0.5 font-mono text-[9px] font-semibold text-[var(--accent-bright)] transition-all hover:border-[var(--accent)]/70"
                        >
                          Bet →
                        </Link>
                      ) : null}
                    </div>
                  </div>
                )
              })}
              {(alertsData?.alerts ?? []).length === 0 && (
                <p className="text-xs text-[var(--text-muted)]">No alerts yet — bot scans every 2 min.</p>
              )}
            </div>
          </Card>
        </motion.div>
      </div>
    </div>
  )
}
