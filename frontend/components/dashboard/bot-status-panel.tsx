'use client'

import { useEffect, useState } from 'react'
import { Pause, RotateCcw } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

const SCAN_INTERVAL_SEC = 5 * 60

function formatCountdown(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}m ${s.toString().padStart(2, '0')}s`
}

export function BotStatusPanel() {
  const [nextScanSec, setNextScanSec] = useState(154)

  useEffect(() => {
    const id = window.setInterval(() => {
      setNextScanSec(prev => {
        if (prev <= 1) return SCAN_INTERVAL_SEC
        return prev - 1
      })
    }, 1000)
    return () => window.clearInterval(id)
  }, [])

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div>
        <h3 className="mb-2 text-sm font-semibold text-[var(--text-primary)]">Bot Status</h3>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--success)] opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[var(--success)]" />
            </span>
            <span className="text-sm font-medium text-[var(--success)]">Scanning markets</span>
          </div>
          <span className="text-xs text-[var(--text-muted)]">
            Next scan in <span className="font-mono text-[var(--text-secondary)]">{formatCountdown(nextScanSec)}</span>
          </span>
        </div>
      </div>

      <div className="space-y-2.5 text-xs">
        {[
          ['Last scan', '2 minutes ago'],
          ['Markets watching', '847'],
          ['Alerts today', '3 / 3'],
          ['Categories', 'Crypto, Politics'],
        ].map(([label, value]) => (
          <div key={label} className="flex justify-between">
            <span className="text-[var(--text-muted)]">{label}</span>
            <span className="font-mono text-[var(--text-secondary)]">{value}</span>
          </div>
        ))}
      </div>

      <div>
        <div className="mb-1 flex justify-between text-[10px] text-[var(--text-muted)]">
          <span>Daily alerts used</span>
          <span>3/3</span>
        </div>
        <div className="h-1.5 rounded-full bg-[var(--border)]">
          <div className="h-full w-full rounded-full bg-[var(--accent)]" />
        </div>
      </div>

      <div className="mt-auto flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" icon={<Pause className="h-3 w-3" />} className="flex-1">
          Pause
        </Button>
        <Button variant="ghost" size="sm" icon={<RotateCcw className="h-3 w-3" />}>
          Reset
        </Button>
      </div>
    </Card>
  )
}
