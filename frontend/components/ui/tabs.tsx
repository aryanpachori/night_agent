'use client'
import { cn } from '@/lib/utils'

interface Tab {
  id: string
  label: string
  count?: number
}

interface TabsProps {
  tabs: Tab[]
  active: string
  onChange: (id: string) => void
  className?: string
}

export function Tabs({ tabs, active, onChange, className }: TabsProps) {
  return (
    <div
      className={cn(
        'flex max-w-full gap-1 overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className
      )}
    >
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-150',
            active === tab.id
              ? 'bg-[var(--accent-glow)] text-[var(--accent-bright)] border border-[var(--accent)]/25'
              : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
          )}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span className={cn(
              'text-[10px] font-bold px-1.5 py-0.5 rounded-full',
              active === tab.id ? 'bg-[var(--accent)]/20 text-[var(--accent-bright)]' : 'bg-[var(--border)] text-[var(--text-muted)]'
            )}>
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
