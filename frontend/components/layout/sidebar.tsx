'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import { LayoutDashboard, TrendingUp, Bell, Globe, Settings, LogOut } from 'lucide-react'
import { NightAgentLogoMark } from '@/components/brand/night-agent-logo-mark'
import { cn } from '@/lib/utils'
import { mockUser, mockWallet } from '@/data/mock'

export type DashboardNavItem = {
  href: string
  icon: LucideIcon
  label: string
  badge?: string
}

export const dashboardNavItems: DashboardNavItem[] = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/dashboard/positions', icon: TrendingUp, label: 'Positions', badge: '3' },
  { href: '/dashboard/alerts', icon: Bell, label: 'Alerts', badge: '3' },
  { href: '/dashboard/markets', icon: Globe, label: 'Markets' },
  { href: '/dashboard/settings', icon: Settings, label: 'Settings' },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="fixed left-0 top-0 z-50 hidden h-screen w-[220px] flex-col border-r border-[var(--border)] bg-[var(--bg-secondary)] md:flex">

      {/* Logo */}
      <div className="p-5 border-b border-[var(--border)]">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 overflow-hidden rounded-lg bg-[var(--bg-card)] ring-1 ring-[var(--border-bright)]">
            <NightAgentLogoMark />
          </div>
          <span className="font-bold text-base text-[var(--text-primary)]">NightAgent</span>
        </div>
      </div>

      {/* Bot status pill */}
      <div className="px-4 py-3 border-b border-[var(--border)]">
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[var(--success-dim)] border border-[var(--success)]/30">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--success)] opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--success)]" />
          </span>
          <span className="text-xs font-medium text-[var(--success)]">Scanning markets</span>
        </div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 p-3 space-y-0.5">
        {dashboardNavItems.map(({ href, icon: Icon, label, badge }) => {
          const isActive = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150 group relative',
                isActive
                  ? 'text-[var(--accent-bright)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)]'
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="activeNavBg"
                  className="absolute inset-0 rounded-lg bg-[var(--accent-glow)] border border-[var(--accent)]/25"
                  transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
                />
              )}
              {isActive && (
                <motion.div
                  layoutId="activeNavBar"
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-[var(--accent)] rounded-r-full"
                  transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
                />
              )}
              <Icon className={cn(
                'w-4 h-4 flex-shrink-0 relative z-10',
                isActive ? 'text-[var(--accent)]' : 'text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]'
              )} />
              <span className="flex-1 relative z-10">{label}</span>
              {badge && (
                <span className="relative z-10 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[var(--accent-glow)] text-[var(--accent-bright)]">
                  {badge}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* User section */}
      <div className="p-3 border-t border-[var(--border)]">
        <div className="flex items-center gap-2.5 px-2 py-2">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-dim)] flex items-center justify-center text-[var(--bg-primary)] text-xs font-bold flex-shrink-0">
            {mockUser.firstName[0]}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-[var(--text-primary)] truncate">{mockUser.firstName}</p>
            <p className="text-[10px] text-[var(--text-muted)] font-mono truncate">${mockWallet.balance.toFixed(2)}</p>
          </div>
          <button className="text-[var(--text-muted)] hover:text-[var(--danger)] transition-colors">
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  )
}
