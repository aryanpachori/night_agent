'use client'
import { cn } from '@/lib/utils'

interface ToggleProps {
  checked: boolean
  onChange: (val: boolean) => void
  label?: string
  description?: string
}

export function Toggle({ checked, onChange, label, description }: ToggleProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      {(label || description) && (
        <div>
          {label && <p className="text-sm text-[var(--text-primary)] font-medium">{label}</p>}
          {description && <p className="text-xs text-[var(--text-muted)] mt-0.5">{description}</p>}
        </div>
      )}
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent',
          'transition-colors duration-200 focus:outline-none',
          checked ? 'bg-[var(--accent)]' : 'bg-[var(--border-bright)]'
        )}
      >
        <span className={cn(
          'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm',
          'transform transition duration-200',
          checked ? 'translate-x-4' : 'translate-x-0'
        )} />
      </button>
    </div>
  )
}
