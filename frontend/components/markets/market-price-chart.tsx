'use client'

import { useMemo, useState } from 'react'
import { Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Area, AreaChart } from 'recharts'
import { mockPriceHistory } from '@/data/mock'
import { cn } from '@/lib/utils'

const ranges = ['1H', '6H', '24H', '48H', 'ALL'] as const

export type PriceHistoryPoint = { ts: number; yesPrice: number; noPrice: number }

const CustomTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ value: number; name: string }>
  label?: string
}) => {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3 shadow-xl">
      <p className="mb-1 text-xs text-[var(--text-muted)]">{label}</p>
      {payload.map((p) => (
        <p
          key={p.name}
          className={`font-mono text-xs font-semibold ${p.name === 'yesPrice' ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}
        >
          {p.name === 'yesPrice' ? 'YES' : 'NO'}: {Math.round(p.value * 100)}¢
        </p>
      ))}
    </div>
  )
}

export function MarketPriceChart({ points }: { points?: PriceHistoryPoint[] }) {
  const [activeRange, setActiveRange] = useState<(typeof ranges)[number]>('48H')

  const baseData = useMemo(() => {
    if (!points?.length) return mockPriceHistory
    return points.map((p) => ({
      time: new Date(p.ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      yesPrice: p.yesPrice,
      noPrice: p.noPrice,
    }))
  }, [points])

  const filteredData = useMemo(() => {
    const sliceSizes: Record<(typeof ranges)[number], number> = {
      '1H': 2,
      '6H': 12,
      '24H': 24,
      '48H': 48,
      ALL: 999,
    }
    const n = sliceSizes[activeRange]
    return baseData.slice(-n)
  }, [baseData, activeRange])

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[var(--text-muted)]">Price history</p>
        <div className="flex flex-wrap justify-end gap-1">
          {ranges.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setActiveRange(r)}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs transition-colors',
                activeRange === r
                  ? 'border border-[var(--accent)]/30 bg-[var(--accent-glow)] text-[var(--accent)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={filteredData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="yesGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--success)" stopOpacity={0.25} />
              <stop offset="95%" stopColor="var(--success)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="time"
            tick={{ fontSize: 9, fill: 'var(--text-muted)' }}
            axisLine={false}
            tickLine={false}
            interval={Math.max(1, Math.floor(filteredData.length / 8))}
          />
          <YAxis
            tick={{ fontSize: 9, fill: 'var(--text-muted)' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `${Math.round(v * 100)}¢`}
            domain={[0, 1]}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="yesPrice"
            stroke="var(--success)"
            strokeWidth={2}
            fill="url(#yesGradient)"
            dot={false}
            activeDot={{ r: 3, fill: 'var(--success)' }}
          />
          <Line
            type="monotone"
            dataKey="noPrice"
            stroke="var(--danger)"
            strokeWidth={1.5}
            dot={false}
            strokeDasharray="4 2"
            activeDot={{ r: 3, fill: 'var(--danger)' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
