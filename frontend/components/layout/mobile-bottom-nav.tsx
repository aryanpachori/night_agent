'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { dashboardNavItems } from '@/components/layout/sidebar'

export function MobileBottomNav() {
  const pathname = usePathname()

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around border-t border-[var(--border)] bg-[var(--bg-secondary)] px-2 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-3 md:hidden"
      aria-label="Dashboard navigation"
    >
      {dashboardNavItems.map(({ href, icon: Icon, label }) => {
        const isActive = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex flex-col items-center gap-1',
              isActive ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'
            )}
          >
            <Icon className="h-5 w-5" />
            <span className="text-[9px] font-medium">{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
