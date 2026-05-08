'use client'

import { useEffect, useMemo, useState } from 'react'
import { Pause, Play } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

function formatCountdown(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}m ${s.toString().padStart(2, '0')}s`
}

export interface BotStatusPanelProps {
  isActive?: boolean
  isPaused?: boolean
  lastScanAt?: string | null
  marketsWatching?: number
  alertsToday?: number
  maxAlerts?: number
  categories?: string[]
  scanIntervalSeconds?: number
  secondsSinceLastScan?: number | null
  onPause?: () => void
  pausePending?: boolean
}

export function BotStatusPanel({
  isActive = false,
  isPaused = false,
  lastScanAt,
  marketsWatching = 0,
  alertsToday = 0,
  maxAlerts = 3,
  categories = [],
  scanIntervalSeconds = 300,
  secondsSinceLastScan,
  onPause,
  pausePending,
}: BotStatusPanelProps) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const remainingSec = useMemo(() => {
    if (!lastScanAt) return scanIntervalSeconds
    const last = new Date(lastScanAt).getTime()
    if (Number.isNaN(last)) return scanIntervalSeconds
    const elapsed = Math.floor((now - last) / 1000)
    const mod = elapsed % scanIntervalSeconds
    return Math.max(0, scanIntervalSeconds - mod)
  }, [lastScanAt, scanIntervalSeconds, now])

  const lastScanLabel =
    secondsSinceLastScan != null
      ? secondsSinceLastScan < 90
        ? `${secondsSinceLastScan}s ago`
        : `${Math.floor(secondsSinceLastScan / 60)}m ago`
      : '—'

  const categoriesLabel =
    categories.length > 0 ? categories.map((c) => c.charAt(0).toUpperCase() + c.slice(1)).join(', ') : '—'

  const alertPct = maxAlerts > 0 ? Math.min(100, (alertsToday / maxAlerts) * 100) : 0

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div>
        <h3 className="mb-2 text-sm font-semibold text-[var(--text-primary)]">Bot Status</h3>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              {isActive && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--success)] opacity-75" />
              )}
              <span
                className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                  isActive ? 'bg-[var(--success)]' : 'bg-[var(--text-muted)]'
                }`}
              />
            </span>
            <span
              className={`text-sm font-medium ${isActive ? 'text-[var(--success)]' : 'text-[var(--text-muted)]'}`}
            >
              {isPaused ? 'Paused' : isActive ? 'Scanning markets' : 'Idle'}
            </span>
          </div>
          {!isPaused && (
            <span className="text-xs text-[var(--text-muted)]">
              Next scan in{' '}
              <span className="font-mono text-[var(--text-secondary)]">{formatCountdown(remainingSec)}</span>
            </span>
          )}
        </div>
      </div>

      <div className="space-y-2.5 text-xs">
        {[
          ['Last scan', lastScanLabel],
          ['Markets being scanned', marketsWatching > 0 ? String(marketsWatching) : 'Updating...'],
          ['Alerts today', `${alertsToday} / ${maxAlerts}`],
          ['Categories', categoriesLabel],
        ].map(([label, value]) => (
          <div key={label} className="flex justify-between gap-2">
            <span className="text-[var(--text-muted)]">{label}</span>
            <span className="text-right font-mono text-[var(--text-secondary)]">{value}</span>
          </div>
        ))}
      </div>

      <div>
        <div className="mb-1 flex justify-between text-[10px] text-[var(--text-muted)]">
          <span>Daily alerts used</span>
          <span>
            {alertsToday}/{maxAlerts}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-[var(--border)]">
          <div className="h-full rounded-full bg-[var(--accent)] transition-all" style={{ width: `${alertPct}%` }} />
        </div>
      </div>

      <div className="mt-auto flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          icon={isPaused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
          className="flex-1"
          disabled={pausePending}
          onClick={() => onPause?.()}
        >
          {isPaused ? 'Resume' : 'Pause'}
        </Button>
      </div>
    </Card>
  )
}
