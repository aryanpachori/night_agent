import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Positions',
  description: 'Open and closed paper positions on Jupiter prediction markets.',
}

export default function PositionsLayout({ children }: { children: React.ReactNode }) {
  return children
}
