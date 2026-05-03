import type { Metadata } from 'next'
import { SolanaWalletProvider } from '@/components/wallet/solana-wallet-provider'

export const metadata: Metadata = {
  title: 'Login',
  description:
    'Sign in with Telegram or connect a Solana wallet to access NightAgent paper trading.',
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <SolanaWalletProvider>{children}</SolanaWalletProvider>
}
