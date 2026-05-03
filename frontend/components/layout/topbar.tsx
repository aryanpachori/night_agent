'use client'

import { Bell, RefreshCw } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { NightAgentLogoMark } from '@/components/brand/night-agent-logo-mark'
import { formatUSD, formatPct } from '@/lib/utils'
import { useSummaryStats } from '@/hooks/useStats'

interface TopbarProps {
  title: string
  subtitle?: string
}

export function Topbar({ title, subtitle }: TopbarProps) {
  const qc = useQueryClient()
  const { data: stats, isLoading } = useSummaryStats()
  const pnlPositive = (stats?.totalPnl ?? 0) >= 0
  const balance = stats?.balance
  const roi = stats?.roi

  return (
    <header className="sticky top-0 z-40 flex min-h-14 flex-wrap items-center justify-between gap-x-2 gap-y-2 border-b border-[var(--border)] bg-[var(--bg-secondary)]/80 px-3 py-2 backdrop-blur-sm sm:flex-nowrap sm:gap-4 sm:px-6 sm:py-0">
      <div className="flex min-w-0 flex-1 basis-[min(100%,12rem)] items-center gap-2 sm:basis-auto">
        <div className="flex h-7 w-7 shrink-0 overflow-hidden rounded-lg ring-1 ring-[var(--border-bright)] md:hidden">
          <NightAgentLogoMark />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold text-[var(--text-primary)]">{title}</h1>
          {subtitle && (
            <p className="hidden text-xs text-[var(--text-muted)] sm:block sm:truncate">{subtitle}</p>
          )}
        </div>
      </div>

      <div className="flex flex-shrink-0 items-center gap-1.5 sm:gap-4">
        {/* Compact balance — mobile */}
        <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-2 py-1 sm:hidden">
          <span className="font-mono text-[11px] font-semibold leading-tight text-[var(--text-primary)]">
            {isLoading || balance == null ? '—' : formatUSD(balance)}
          </span>
          <span
            className={`font-mono text-[11px] font-semibold leading-tight ${pnlPositive ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}
          >
            {isLoading || roi == null ? '—' : formatPct(roi)}
          </span>
        </div>

        {/* Full balance — sm+ */}
        <div className="hidden items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1.5 sm:flex">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Balance</p>
            <p className="font-mono text-sm font-semibold text-[var(--text-primary)]">
              {isLoading || balance == null ? '—' : formatUSD(balance)}
            </p>
          </div>
          <div className="h-8 w-px bg-[var(--border)]" />
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">P&L</p>
            <p
              className={`font-mono text-sm font-semibold ${pnlPositive ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}
            >
              {isLoading || roi == null ? '—' : formatPct(roi)}
            </p>
          </div>
        </div>

        <button
          type="button"
          className="relative rounded-lg p-2 text-[var(--text-secondary)] transition-all hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)]"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
        </button>

        <button
          type="button"
          className="rounded-lg p-2 text-[var(--text-secondary)] transition-all hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)]"
          aria-label="Refresh"
          onClick={() => void qc.invalidateQueries()}
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>
    </header>
  )
}
