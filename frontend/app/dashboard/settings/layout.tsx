import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Settings',
  description: 'NightAgent categories, risk mode, and notification settings.',
}

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return children
}
