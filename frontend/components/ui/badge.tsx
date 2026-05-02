import { cn } from '@/lib/utils'

interface BadgeProps {
  children: React.ReactNode
  variant?: 'default' | 'success' | 'danger' | 'warning' | 'accent' | 'muted'
  size?: 'sm' | 'md'
  className?: string
}

const variants = {
  default:  'bg-[var(--bg-primary)] text-[var(--text-secondary)] border border-[var(--border-bright)]',
  success:  'bg-[var(--success-dim)] text-[var(--success)] border border-[var(--success)]/30',
  danger:   'bg-[var(--danger-dim)] text-[var(--danger)] border border-[var(--danger)]/30',
  warning:  'bg-[var(--warning)]/15 text-[var(--warning)] border border-[var(--warning)]/30',
  accent:   'bg-[var(--accent-glow)] text-[var(--accent-bright)] border border-[var(--accent)]/40',
  muted:    'bg-[var(--border)] text-[var(--text-muted)]',
}

export function Badge({ children, variant = 'default', size = 'sm', className }: BadgeProps) {
  return (
    <span className={cn(
      'inline-flex items-center font-medium rounded-md',
      size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm',
      variants[variant],
      className
    )}>
      {children}
    </span>
  )
}
