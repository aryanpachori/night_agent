import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Market',
  description: 'Market detail, AI factors, and paper betting.',
}

export default function MarketDetailLayout({ children }: { children: React.ReactNode }) {
  return children
}
