import { cn } from '@/lib/utils'

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn(
      'animate-pulse rounded-lg bg-[var(--bg-card-hover)]',
      className
    )} />
  )
}

export function StatCardSkeleton() {
  return (
    <div className="rounded-xl border bg-[var(--bg-card)] border-[var(--border)] p-5">
      <div className="flex items-start justify-between mb-3">
        <Skeleton className="w-8 h-8 rounded-lg" />
        <Skeleton className="w-16 h-5 rounded-full" />
      </div>
      <Skeleton className="w-20 h-3 mb-2" />
      <Skeleton className="w-28 h-7" />
      <Skeleton className="w-24 h-3 mt-2" />
    </div>
  )
}
