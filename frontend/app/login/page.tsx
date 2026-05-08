'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Shield, TestTube2, KeyRound } from 'lucide-react'
import { useWallet as useSolanaWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import toast from 'react-hot-toast'
import { NightAgentLogoMark } from '@/components/brand/night-agent-logo-mark'
import { useAuth } from '@/hooks/useAuth'

function WalletIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
      <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
      <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
    </svg>
  )
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  bytes.forEach((b) => {
    bin += String.fromCharCode(b)
  })
  return btoa(bin)
}

export default function LoginPage() {
  const router = useRouter()
  const { setVisible } = useWalletModal()
  const { publicKey, signMessage, connected } = useSolanaWallet()
  const { loginWithWallet, user, isLoading } = useAuth()

  useEffect(() => {
    if (!isLoading && user) {
      router.replace('/dashboard')
    }
  }, [user, isLoading, router])

  async function handleWalletLogin() {
    if (!publicKey || !signMessage) {
      toast.error('Connect a wallet that supports message signing.')
      return
    }
    try {
      const message = `NightAgent Login\nWallet: ${publicKey.toString()}\nTimestamp: ${Date.now()}`
      const encoded = new TextEncoder().encode(message)
      const signature = await signMessage(encoded)
      await loginWithWallet(publicKey.toString(), bytesToBase64(signature), message)
      router.push('/dashboard')
    } catch {
      toast.error('Wallet sign-in failed')
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--bg-primary)]">
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            'linear-gradient(var(--border-bright) 1px, transparent 1px), linear-gradient(90deg, var(--border-bright) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-[600px] w-[600px] rounded-full bg-[var(--accent-glow)] opacity-30 blur-[120px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.0, 0.0, 0.2, 1] }}
        className="relative z-10 mx-4 w-full max-w-sm"
      >
        <div className="rounded-2xl border border-[var(--border-bright)] bg-[var(--bg-card)] p-8 shadow-2xl">
          <div className="mb-8 flex flex-col items-center">
            <div className="mb-4 h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-[var(--bg-secondary)] shadow-[0_0_30px_var(--accent-glow)] ring-1 ring-[var(--border-bright)]">
              <NightAgentLogoMark />
            </div>
            <h1 className="mb-1 text-xl font-bold text-[var(--text-primary)]">NightAgent</h1>
            <p className="max-w-[220px] text-center text-xs text-[var(--text-muted)]">
              AI quant layer for Jupiter Prediction Markets
            </p>
          </div>

          <div className="mb-6 space-y-3">
            <button
              type="button"
              onClick={() => {
                if (!connected) {
                  setVisible(true)
                  return
                }
                void handleWalletLogin()
              }}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--border-bright)] bg-[var(--bg-secondary)] px-4 py-3 text-[var(--text-primary)] transition-all hover:border-[var(--accent)]/40"
            >
              <WalletIcon className="h-5 w-5" />
              <span className="text-sm font-semibold">Connect Wallet</span>
            </button>
          </div>

          <div className="mb-5 space-y-2">
            {[
              { icon: Shield, text: 'No password needed' },
              { icon: TestTube2, text: 'Paper trading — no real money' },
              { icon: KeyRound, text: 'Your keys never leave your wallet' },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-2 text-[10px] text-[var(--text-muted)]">
                <Icon className="h-3 w-3 flex-shrink-0 text-[var(--accent-dim)]" />
                <span>{text}</span>
              </div>
            ))}
          </div>

          <p className="text-center text-[12px] leading-relaxed text-[var(--text-muted)]">
            After connecting, you&apos;ll be taken directly to your dashboard with $1,000 paper USDC ready to trade. No
            credit card. No email. No password.
          </p>
        </div>
      </motion.div>
    </div>
  )
}
