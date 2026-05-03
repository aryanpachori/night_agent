import { cn } from '@/lib/utils'

/** NightAgent wordmark companion — fills its parent; parent should set size + rounded overflow. */
export function NightAgentLogoMark({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static asset from /public
    <img
      src="/logo.png"
      alt=""
      aria-hidden
      draggable={false}
      className={cn(
        'pointer-events-none block h-full w-full select-none rounded-[inherit] object-cover object-center',
        className
      )}
    />
  )
}
