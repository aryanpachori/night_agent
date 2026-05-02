import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Alerts',
  description: 'Alert history and notification preferences for NightAgent signals.',
}

export default function AlertsLayout({ children }: { children: React.ReactNode }) {
  return children
}
