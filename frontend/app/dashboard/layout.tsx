import { Sidebar } from '@/components/layout/sidebar'
import { PageTransition } from '@/components/ui/page-transition'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <Sidebar />
      <main className="ml-[220px] min-h-screen flex flex-col">
        <PageTransition>{children}</PageTransition>
      </main>
    </div>
  )
}
