'use client'
import NumberFlow, { type Format } from '@number-flow/react'
import { cn } from '@/lib/utils'

interface AnimatedNumberProps {
  value: number
  format?: Format
  prefix?: string
  suffix?: string
  className?: string
  colorBySign?: boolean
}

export function AnimatedNumber({
  value,
  format = { minimumFractionDigits: 2, maximumFractionDigits: 2 } as Format,
  prefix,
  suffix,
  className,
  colorBySign,
}: AnimatedNumberProps) {
  const colorClass = colorBySign
    ? value >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'
    : ''

  return (
    <span className={cn('font-mono inline-flex items-baseline gap-0.5', colorClass, className)}>
      {prefix && <span>{prefix}</span>}
      <NumberFlow
        value={value}
        format={format}
        spinTiming={{ duration: 600, easing: 'ease-out' }}
        opacityTiming={{ duration: 300, easing: 'ease-out' }}
      />
      {suffix && <span>{suffix}</span>}
    </span>
  )
}
