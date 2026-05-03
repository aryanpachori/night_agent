'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { Sidebar } from '@/components/layout/sidebar'
import { MobileBottomNav } from '@/components/layout/mobile-bottom-nav'
import { PageTransition } from '@/components/ui/page-transition'

export function DashboardAuthShell({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/login')
    }
  }, [user, isLoading, router])

  if (isLoading) {
    return <div className="min-h-screen bg-[var(--bg-primary)]" />
  }

  if (!user) {
    return null
  }

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
