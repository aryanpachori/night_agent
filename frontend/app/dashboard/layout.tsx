import type { Metadata } from 'next'
import { DashboardAuthShell } from '@/components/layout/dashboard-auth-shell'

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'Monitor your AI-powered prediction market paper trading performance.',
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <DashboardAuthShell>{children}</DashboardAuthShell>
}
