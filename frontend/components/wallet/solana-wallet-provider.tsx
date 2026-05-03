'use client'

import '@solana/wallet-adapter-react-ui/styles.css'

import { type ReactNode, useMemo } from 'react'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
} from '@solana/wallet-adapter-wallets'
import { clusterApiUrl } from '@solana/web3.js'

function resolveNetwork(): WalletAdapterNetwork {
  const raw = process.env.NEXT_PUBLIC_SOLANA_NETWORK?.toLowerCase()
  if (raw === 'devnet') return WalletAdapterNetwork.Devnet
  if (raw === 'testnet') return WalletAdapterNetwork.Testnet
  return WalletAdapterNetwork.Mainnet
}

export function SolanaWalletProvider({ children }: { children: ReactNode }) {
  const network = resolveNetwork()

  const endpoint = useMemo(() => {
    const custom = process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim()
    if (custom) return custom
    return clusterApiUrl(network)
  }, [network])

  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    [],
  )

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}
