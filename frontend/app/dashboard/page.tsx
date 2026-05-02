'use client'
import { motion } from 'framer-motion'
import { Wallet, TrendingUp, Target, Activity, Pause, RotateCcw } from 'lucide-react'
import { Topbar } from '@/components/layout/topbar'
import { StatCard } from '@/components/dashboard/stat-card'
import { PnlChart } from '@/components/dashboard/pnl-chart'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { mockWallet, mockPositions, mockAlerts } from '@/data/mock'
import { formatUSD, formatPct, formatPrice, formatTimeAgo } from '@/lib/utils'

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
}

export default function DashboardPage() {
  return (
    <div className="flex flex-col flex-1">
      <Topbar title="Dashboard" subtitle="Paper trading overview" />

      <div className="p-6 space-y-6">

        {/* Stat cards */}
        <motion.div
          className="grid grid-cols-4 gap-4"
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
          <StatCard
            icon={Activity}
            label="Brier Score"
            value={mockWallet.brierScore.toFixed(2)}
            subtitle="Model accuracy (lower = better)"
          />
        </motion.div>

        {/* Chart + Bot Status */}
        <motion.div
          className="grid grid-cols-3 gap-4"
          initial={fadeUp.initial}
          animate={fadeUp.animate}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <Card className="col-span-2 p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Portfolio Performance</h3>
                <p className="text-xs text-[var(--text-muted)]">30-day paper trading balance</p>
              </div>
              <Badge variant="success">+{formatPct(mockWallet.roi)}</Badge>
            </div>
            <PnlChart />
          </Card>

          {/* Bot Status */}
          <Card className="p-5 flex flex-col gap-4">
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1">Bot Status</h3>
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--success)] opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--success)]" />
                </span>
                <span className="text-xs text-[var(--success)] font-medium">Scanning markets</span>
              </div>
            </div>

            <div className="space-y-2.5 text-xs">
              {[
                ['Last scan', '2 minutes ago'],
                ['Next scan', 'in 3 minutes'],
                ['Markets watching', '847'],
                ['Alerts today', '3 / 3'],
                ['Categories', 'Crypto, Politics'],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between">
                  <span className="text-[var(--text-muted)]">{label}</span>
                  <span className="text-[var(--text-secondary)] font-mono">{value}</span>
                </div>
              ))}
            </div>

            {/* Alert usage bar */}
            <div>
              <div className="flex justify-between text-[10px] text-[var(--text-muted)] mb-1">
                <span>Daily alerts used</span>
                <span>3/3</span>
              </div>
              <div className="h-1.5 bg-[var(--border)] rounded-full">
                <div className="h-full w-full bg-[var(--accent)] rounded-full" />
              </div>
            </div>

            <div className="flex gap-2 mt-auto">
              <Button variant="secondary" size="sm" icon={<Pause className="w-3 h-3" />} className="flex-1">Pause</Button>
              <Button variant="ghost" size="sm" icon={<RotateCcw className="w-3 h-3" />}>Reset</Button>
            </div>
          </Card>
        </motion.div>

        {/* Positions + Recent Alerts */}
        <motion.div
          className="grid grid-cols-2 gap-4"
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
                return (
                  <div key={pos.id} className="flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] transition-colors">
                    <Badge variant={pos.side === 'YES' ? 'success' : 'danger'} size="sm">{pos.side}</Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-[var(--text-primary)] truncate">{pos.marketQuestion}</p>
                      <p className="text-[10px] text-[var(--text-muted)]">{pos.contracts} contracts @ {formatPrice(pos.entryPrice)}</p>
                    </div>
                    <div className="text-right">
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
