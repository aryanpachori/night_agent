import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Markets',
  description: 'Browse AI-scored Jupiter prediction markets with edge estimates.',
}

export default function MarketsLayout({ children }: { children: React.ReactNode }) {
  return children
}
