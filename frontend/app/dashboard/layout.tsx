import type { Metadata } from 'next'
import { Sidebar } from '@/components/layout/sidebar'
import { MobileBottomNav } from '@/components/layout/mobile-bottom-nav'
import { PageTransition } from '@/components/ui/page-transition'

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'Monitor your AI-powered prediction market paper trading performance.',
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <Sidebar />
      <main className="flex min-h-screen min-w-0 flex-col pb-[calc(76px+env(safe-area-inset-bottom,0px))] md:ml-[220px] md:pb-0">
        <PageTransition>{children}</PageTransition>
      </main>
      <MobileBottomNav />
    </div>
  )
}
