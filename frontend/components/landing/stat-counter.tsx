'use client'
import { useInView } from 'react-intersection-observer'
import { useEffect, useState } from 'react'

interface StatCounterProps {
  end: number
  suffix?: string
  prefix?: string
  duration?: number
  label: string
  sublabel?: string
}

export function StatCounter({ end, suffix = '', prefix = '', duration = 2000, label, sublabel }: StatCounterProps) {
  const [count, setCount] = useState(0)
  const { ref, inView } = useInView({ triggerOnce: true, threshold: 0.5 })

  useEffect(() => {
    if (!inView) return
    let startTime: number | null = null

    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp
      const progress = Math.min((timestamp - startTime) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setCount(Math.floor(eased * end))
      if (progress < 1) requestAnimationFrame(step)
      else setCount(end)
    }

    requestAnimationFrame(step)
  }, [inView, end, duration])

  return (
    <div ref={ref} className="text-center">
      <p className="text-3xl font-mono font-bold text-[var(--text-primary)] sm:text-4xl">
        {prefix}{count.toLocaleString()}{suffix}
      </p>
      <p className="text-sm text-[var(--text-primary)] font-medium mt-1">{label}</p>
      {sublabel && <p className="text-xs text-[var(--text-muted)] mt-0.5">{sublabel}</p>}
    </div>
  )
}
