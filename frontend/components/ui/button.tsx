'use client'
import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  icon?: React.ReactNode
}

const variants = {
  primary:   'bg-[var(--accent)] text-[var(--bg-primary)] font-semibold hover:bg-[var(--accent-bright)] shadow-[0_0_20px_var(--accent-glow)]',
  secondary: 'bg-[var(--bg-card)] text-[var(--text-primary)] border border-[var(--border-bright)] hover:border-[var(--accent)] hover:bg-[var(--bg-card-hover)]',
  ghost:     'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)]',
  danger:    'bg-[var(--danger-dim)] text-[var(--danger)] border border-[var(--danger)]/30 hover:bg-[var(--danger)]/20',
  success:   'bg-[var(--success-dim)] text-[var(--success)] border border-[var(--success)]/30 hover:bg-[var(--success)]/20',
}

const sizes = {
  sm: 'px-3 py-1.5 text-xs rounded-md',
  md: 'px-4 py-2 text-sm rounded-lg',
  lg: 'px-6 py-3 text-base rounded-xl',
}

export function Button({
  variant = 'primary', size = 'md', loading, icon, children, className, disabled, ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center gap-2 font-medium transition-all duration-150 cursor-pointer',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        variants[variant], sizes[size], className
      )}
      {...props}
    >
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : icon}
      {children}
    </button>
  )
}
