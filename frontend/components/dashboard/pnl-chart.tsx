'use client'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { mockPnlHistory } from '@/data/mock'
import { formatUSD } from '@/lib/utils'

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) => {
  if (!active || !payload?.length) return null
  const pnl = payload[0].value - 1000
  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-3 shadow-xl">
      <p className="text-xs text-[var(--text-muted)] mb-1">{label}</p>
      <p className="text-sm font-mono font-bold text-[var(--text-primary)]">{formatUSD(payload[0].value)}</p>
      <p className={`text-xs font-mono ${pnl >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
        {pnl >= 0 ? '+' : ''}{formatUSD(pnl)}
      </p>
    </div>
  )
}

export function PnlChart() {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={mockPnlHistory} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="pnlGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#00C2FF" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#00C2FF" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
          axisLine={false}
          tickLine={false}
          interval={6}
        />
        <YAxis
          tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `$${v}`}
        />
        <Tooltip content={<CustomTooltip />} />
        <Area
          type="monotone"
          dataKey="balance"
          stroke="#00C2FF"
          strokeWidth={2}
          fill="url(#pnlGradient)"
          dot={false}
          activeDot={{ r: 4, fill: '#00C2FF', stroke: '#0A0E1A', strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
