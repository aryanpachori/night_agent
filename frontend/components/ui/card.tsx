import { cn } from '@/lib/utils'

interface CardProps {
  children: React.ReactNode
  className?: string
  glow?: boolean
  onClick?: () => void
}

export function Card({ children, className, glow, onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'rounded-xl border bg-[var(--bg-card)] border-[var(--border)]',
        'transition-all duration-200',
        glow && 'hover:border-[var(--accent)]/40 hover:shadow-[0_0_20px_var(--accent-glow)]',
        onClick && 'cursor-pointer',
        className
      )}
    >
      {children}
    </div>
  )
}
