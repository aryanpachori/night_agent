import { cn } from '@/lib/utils'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  suffix?: string
  prefix?: string
}

export function Input({ label, suffix, prefix, className, ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider">{label}</label>}
      <div className="relative flex items-center">
        {prefix && (
          <span className="absolute left-3 text-sm text-[var(--text-muted)] font-mono">{prefix}</span>
        )}
        <input
          className={cn(
            'w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg',
            'text-sm text-[var(--text-primary)] font-mono',
            'px-3 py-2 outline-none transition-all duration-150',
            'focus:border-[var(--accent)] focus:shadow-[0_0_0_2px_var(--accent-glow)]',
            'placeholder:text-[var(--text-muted)]',
            prefix && 'pl-7',
            suffix && 'pr-10',
            className
          )}
          {...props}
        />
        {suffix && (
          <span className="absolute right-3 text-sm text-[var(--text-muted)] font-mono">{suffix}</span>
        )}
      </div>
    </div>
  )
}
