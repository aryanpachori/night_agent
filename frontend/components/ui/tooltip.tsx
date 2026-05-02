'use client'

import { cn } from '@/lib/utils'

interface TooltipProps {
  content: string
  children: React.ReactNode
  className?: string
}

export function Tooltip({ content, children, className }: TooltipProps) {
  return (
    <span className={cn('group relative inline-flex max-w-full', className)}>
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 bottom-full z-50 mb-2 w-max max-w-[min(280px,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-[var(--border-bright)] bg-[var(--bg-card)] px-3 py-2 text-[11px] leading-snug text-[var(--text-secondary)] opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
      >
        {content}
      </span>
    </span>
  )
}
