'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Shield, TestTube2, Clock } from 'lucide-react'
import { useWallet as useSolanaWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import toast from 'react-hot-toast'
import { NightAgentLogoMark } from '@/components/brand/night-agent-logo-mark'
import { useAuth } from '@/hooks/useAuth'

function TelegramIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width={20} height={20} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z" />
    </svg>
  )
}

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

  const handleWalletLogin = async () => {
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

  useEffect(() => {
    // Clear container first
    const container = document.getElementById('tg-login')
    if (!container) return
    container.innerHTML = ''

    // Script 1 — widget
    const widgetScript = document.createElement('script')
    widgetScript.async = true
    widgetScript.src = 'https://telegram.org/js/telegram-widget.js?23'
    widgetScript.setAttribute('data-telegram-login', 'nightagentt_bot')
    widgetScript.setAttribute('data-size', 'large')
    widgetScript.setAttribute('data-auth-url', '/api/auth/telegram-callback')
    widgetScript.setAttribute('data-request-access', 'write')
    container.appendChild(widgetScript)
  }, [])

  const telegramBtnStyle: React.CSSProperties = {
    background: 'var(--bg-card)',
    border: '1px solid var(--border-bright)',
    color: 'var(--text-primary)',
    borderRadius: '10px',
    padding: '12px 24px',
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    cursor: 'pointer',
    transition: 'border-color 0.15s',
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
            <div id="tg-login" className="w-full flex justify-center min-h-[50px]" />

            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-[var(--border)]" />
              <span className="text-[10px] text-[var(--text-muted)]">OR</span>
              <div className="h-px flex-1 bg-[var(--border)]" />
            </div>

            {!connected ? (
              <button
                type="button"
                onClick={() => setVisible(true)}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--border-bright)] bg-[var(--bg-secondary)] px-4 py-3 text-[var(--text-primary)] transition-all hover:border-[var(--accent)]/40"
              >
                <WalletIcon className="h-5 w-5" />
                <span className="text-sm font-semibold">Connect Wallet</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleWalletLogin()}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--border-bright)] bg-[var(--bg-secondary)] px-4 py-3 text-[var(--text-primary)] transition-all hover:border-[var(--accent)]/40"
              >
                <WalletIcon className="h-5 w-5" />
                <span className="text-sm font-semibold">Sign in with Wallet</span>
              </button>
            )}
          </div>

          <div className="mb-5 space-y-2">
            {[
              { icon: Shield, text: 'No password needed' },
              { icon: TestTube2, text: 'Paper trading — no real money' },
              { icon: Clock, text: 'Your keys never leave your wallet' },
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
