import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Login',
  description:
    'Sign in with Telegram or connect a Solana wallet to access NightAgent paper trading.',
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children
}
