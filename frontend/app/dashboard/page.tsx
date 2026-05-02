'use client'
import { motion } from 'framer-motion'
import { Wallet, TrendingUp, Target, Activity } from 'lucide-react'
import { Topbar } from '@/components/layout/topbar'
import { StatCard } from '@/components/dashboard/stat-card'
import { PnlChart } from '@/components/dashboard/pnl-chart'
import { BotStatusPanel } from '@/components/dashboard/bot-status-panel'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tooltip } from '@/components/ui/tooltip'
import { mockWallet, mockPositions, mockAlerts } from '@/data/mock'
import { formatUSD, formatPct, formatPrice, formatTimeAgo } from '@/lib/utils'

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
}

function currentPriceTrend(pos: (typeof mockPositions)[number]): 'up' | 'down' {
  if (pos.side === 'YES') return pos.currentPrice >= pos.entryPrice ? 'up' : 'down'
  return pos.currentPrice <= pos.entryPrice ? 'up' : 'down'
}

export default function DashboardPage() {
  return (
    <div className="flex flex-col flex-1">
      <Topbar title="Dashboard" subtitle="Paper trading overview" />

      <div className="space-y-6 p-4 pb-6 sm:p-6">

        {/* Stat cards */}
        <motion.div
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
          initial={fadeUp.initial}
          animate={fadeUp.animate}
          transition={{ duration: 0.4 }}
        >
          <StatCard
            icon={Wallet}
            label="Paper Balance"
            value={formatUSD(mockWallet.balance)}
            change={formatPct(mockWallet.roi)}
            changePositive={mockWallet.totalPnl >= 0}
            subtitle="Starting $1,000"
            glow
          />
          <StatCard
            icon={TrendingUp}
            label="Total P&L"
            value={formatUSD(mockWallet.totalPnl)}
            change={formatPct(mockWallet.roi)}
            changePositive={mockWallet.totalPnl >= 0}
          />
          <StatCard
            icon={Target}
            label="Win Rate"
            value={`${mockWallet.winRate}%`}
            subtitle={`${mockWallet.wins}W / ${mockWallet.losses}L`}
          />
          <Card className="p-5">
            <div className="mb-3 flex items-start justify-between">
              <div className="rounded-lg bg-[var(--accent-glow)] p-2">
                <Activity className="h-4 w-4 text-[var(--accent)]" />
              </div>
            </div>
            <div className="mb-1 flex items-center gap-1">
              <p className="text-xs uppercase tracking-wider text-[var(--text-muted)]">Brier Score</p>
              <Tooltip content="Brier Score measures probability calibration. 0.0 = perfect, 0.25 = random guessing. Our model scores 0.11 — roughly 3× better than chance.">
                <button
                  type="button"
                  className="text-[10px] leading-none text-[var(--text-muted)] hover:text-[var(--accent)]"
                  aria-label="About Brier Score"
                >
                  ⓘ
                </button>
              </Tooltip>
            </div>
            <motion.p
              className="font-mono text-2xl font-bold text-[var(--text-primary)]"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
            >
              {mockWallet.brierScore.toFixed(2)}
            </motion.p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">Model accuracy — lower is better (perfect = 0)</p>
          </Card>
        </motion.div>

        {/* Chart + Bot Status */}
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
              <Badge variant="success">+{formatPct(mockWallet.roi)}</Badge>
            </div>
            <PnlChart />
          </Card>

          <BotStatusPanel />
        </motion.div>

        {/* Positions + Recent Alerts */}
        <motion.div
          className="grid grid-cols-1 gap-4 xl:grid-cols-2"
          initial={fadeUp.initial}
          animate={fadeUp.animate}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          {/* Active positions */}
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Open Positions ({mockPositions.length})</h3>
            <div className="space-y-2">
              {mockPositions.map(pos => {
                const pnlPositive = pos.pnl >= 0
                const favorable = currentPriceTrend(pos) === 'up'
                return (
                  <div key={pos.id} className="flex flex-col gap-2 rounded-lg bg-[var(--bg-secondary)] p-3 transition-colors hover:bg-[var(--bg-card-hover)] sm:flex-row sm:items-center sm:gap-3">
                    <Badge variant={pos.side === 'YES' ? 'success' : 'danger'} size="sm" className="w-fit shrink-0">
                      {pos.side}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-[var(--text-primary)] truncate">{pos.marketQuestion}</p>
                      <p className="text-[10px] text-[var(--text-muted)]">
                        {pos.contracts} contracts · Entry {formatPrice(pos.entryPrice)}{' '}
                        · Now{' '}
                        <span className={`font-mono font-semibold ${favorable ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                          {favorable ? '↑' : '↓'} {formatPrice(pos.currentPrice)}
                        </span>
                      </p>
                    </div>
                    <div className="ml-auto shrink-0 border-t border-[var(--border)] pt-2 text-right sm:border-t-0 sm:pt-0">
                      <p className={`text-xs font-mono font-semibold ${pnlPositive ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                        {pnlPositive ? '+' : ''}{formatUSD(pos.pnl)}
                      </p>
                      <p className={`text-[10px] font-mono ${pnlPositive ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                        {formatPct(pos.pnlPercent)}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>

          {/* Recent alerts */}
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Recent Alerts</h3>
            <div className="space-y-2">
              {mockAlerts.map(alert => {
                const isBet = alert.actionTaken?.startsWith('bet')
                return (
                  <div key={alert.id} className="flex items-start gap-3 p-3 rounded-lg bg-[var(--bg-secondary)]">
                    <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${isBet ? 'bg-[var(--success)]' : 'bg-[var(--text-muted)]'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-[var(--text-primary)] truncate">{alert.marketQuestion}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Badge variant={isBet ? 'success' : 'muted'} size="sm">
                          {isBet ? `BET ${alert.side}` : 'SKIPPED'}
                        </Badge>
                        <span className="text-[10px] text-[var(--text-muted)]">Edge {formatPct(alert.edge * 100, 0)}</span>
                      </div>
                    </div>
                    <span className="text-[10px] text-[var(--text-muted)] flex-shrink-0">{formatTimeAgo(alert.createdAt)}</span>
                  </div>
                )
              })}
            </div>
          </Card>
        </motion.div>

      </div>
    </div>
  )
}
