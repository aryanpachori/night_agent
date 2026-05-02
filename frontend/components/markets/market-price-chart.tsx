'use client'
import { useState, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Area, AreaChart } from 'recharts'
import { mockPriceHistory } from '@/data/mock'

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name: string }>; label?: string }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-3 shadow-xl">
      <p className="text-xs text-[var(--text-muted)] mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.name} className={`text-xs font-mono font-semibold ${p.name === 'yesPrice' ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
          {p.name === 'yesPrice' ? 'YES' : 'NO'}: {Math.round(p.value * 100)}¢
        </p>
      ))}
    </div>
  )
}

export function MarketPriceChart() {
  const [visibleData, setVisibleData] = useState(mockPriceHistory.slice(0, 1))

  useEffect(() => {
    const total = mockPriceHistory.length
    let frame = 1
    const timer = setInterval(() => {
      frame++
      const count = Math.min(Math.ceil(frame * (total / 20)), total)
      setVisibleData(mockPriceHistory.slice(0, count))
      if (count >= total) clearInterval(timer)
    }, 800 / 20)
    return () => clearInterval(timer)
  }, [])

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={visibleData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="yesGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--success)" stopOpacity={0.25} />
            <stop offset="95%" stopColor="var(--success)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="time" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} interval={7} />
        <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} tickFormatter={v => `${Math.round(v * 100)}¢`} domain={[0, 1]} />
        <Tooltip content={<CustomTooltip />} />
        <Area type="monotone" dataKey="yesPrice" stroke="var(--success)" strokeWidth={2} fill="url(#yesGradient)" dot={false} activeDot={{ r: 3, fill: 'var(--success)' }} />
        <Line type="monotone" dataKey="noPrice" stroke="var(--danger)" strokeWidth={1.5} dot={false} strokeDasharray="4 2" activeDot={{ r: 3, fill: 'var(--danger)' }} />
      </AreaChart>
    </ResponsiveContainer>
  )
}
