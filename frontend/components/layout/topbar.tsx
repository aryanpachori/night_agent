'use client'
import { Bell, RefreshCw } from 'lucide-react'
import { mockWallet } from '@/data/mock'
import { formatUSD, formatPct } from '@/lib/utils'

interface TopbarProps {
  title: string
  subtitle?: string
}

export function Topbar({ title, subtitle }: TopbarProps) {
  const pnlPositive = mockWallet.totalPnl >= 0

  return (
    <header className="h-14 border-b border-[var(--border)] bg-[var(--bg-secondary)]/80 backdrop-blur-sm flex items-center justify-between px-6 sticky top-0 z-40">
      <div>
        <h1 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h1>
        {subtitle && <p className="text-xs text-[var(--text-muted)]">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-4">
        {/* Live balance */}
        <div className="flex items-center gap-3 px-3 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border)]">
          <div>
            <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Balance</p>
            <p className="text-sm font-mono font-semibold text-[var(--text-primary)]">
              {formatUSD(mockWallet.balance)}
            </p>
          </div>
          <div className="w-px h-8 bg-[var(--border)]" />
          <div>
            <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">P&L</p>
            <p className={`text-sm font-mono font-semibold ${pnlPositive ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
              {formatPct(mockWallet.roi)}
            </p>
          </div>
        </div>

        {/* Notifications */}
        <button className="relative p-2 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)] transition-all">
          <Bell className="w-4 h-4" />
          <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
        </button>

        {/* Refresh */}
        <button className="p-2 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)] transition-all">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>
    </header>
  )
}
