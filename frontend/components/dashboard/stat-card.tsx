'use client'
import { motion } from 'framer-motion'
import { LucideIcon } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface StatCardProps {
  icon: LucideIcon
  iconColor?: string
  label: string
  value: string
  change?: string
  changePositive?: boolean
  subtitle?: string
  glow?: boolean
}

export function StatCard({ icon: Icon, iconColor, label, value, change, changePositive, subtitle, glow }: StatCardProps) {
  return (
    <Card glow={glow} className="p-5">
      <div className="flex items-start justify-between mb-3">
        <div className={cn('p-2 rounded-lg', iconColor || 'bg-[var(--accent-glow)]')}>
          <Icon className={cn('w-4 h-4', iconColor ? 'text-white' : 'text-[var(--accent)]')} />
        </div>
        {change && (
          <span className={cn(
            'text-xs font-mono font-medium px-2 py-0.5 rounded-full',
            changePositive
              ? 'text-[var(--success)] bg-[var(--success-dim)]'
              : 'text-[var(--danger)] bg-[var(--danger-dim)]'
          )}>
            {change}
          </span>
        )}
      </div>
      <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-1">{label}</p>
      <motion.p
        className="text-2xl font-mono font-bold text-[var(--text-primary)]"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        {value}
      </motion.p>
      {subtitle && <p className="text-xs text-[var(--text-muted)] mt-1">{subtitle}</p>}
    </Card>
  )
}
