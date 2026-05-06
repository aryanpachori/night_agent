'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Shield, TestTube2, Clock } from 'lucide-react'
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

const API_URL = (process.env.NEXT_PUBLIC_API_URL || '').trim()
type LoginStep = 'phone' | 'otp' | 'success'

export default function LoginPage() {
  const router = useRouter()
  const { setVisible } = useWalletModal()
  const { publicKey, signMessage, connected } = useSolanaWallet()
  const { loginWithWallet, user, isLoading } = useAuth()
  const [step, setStep] = useState<LoginStep>('phone')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [countdown, setCountdown] = useState(0)

  useEffect(() => {
    if (!isLoading && user) {
      router.replace('/dashboard')
    }
  }, [user, isLoading, router])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')
    const error = params.get('error')
    if (token) {
      localStorage.setItem('nightagent_token', token)
      window.history.replaceState({}, '', '/login')
      router.push('/dashboard')
    }
    if (error) {
      toast.error(error === 'expired' ? 'Login link expired' : 'Login failed')
    }
  }, [router])

  useEffect(() => {
    if (countdown <= 0) return
    const timer = window.setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [countdown])

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

  async function handleSendOTP() {
    if (!phone.trim()) {
      toast.error('Please enter your phone number')
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setStep('otp')
      setCountdown(60)
      toast.success('OTP sent to your Telegram app')
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Failed to send OTP')
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyOTP() {
    if (code.length < 4) {
      toast.error('Please enter the full OTP code')
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim(), code: code.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      localStorage.setItem('nightagent_token', data.token)
      setStep('success')
      window.setTimeout(() => router.push('/dashboard'), 1000)
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Invalid OTP')
    } finally {
      setLoading(false)
    }
  }

  async function handleResendOTP() {
    if (countdown > 0) return
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/auth/resend-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setCountdown(60)
      toast.success('New OTP sent')
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Failed to resend')
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent, action: () => void) {
    if (e.key === 'Enter') action()
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
            {step === 'phone' && (
              <div className="space-y-3">
                <div>
                  <h2 className="text-sm font-semibold text-[var(--text-primary)]">Log in with Telegram</h2>
                  <p className="text-xs text-[var(--text-muted)]">
                    Enter your Telegram phone number to receive a code.
                  </p>
                </div>
                <input
                  type="tel"
                  placeholder="+91 98765 43210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, handleSendOTP)}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]/50 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => void handleSendOTP()}
                  disabled={loading || !phone.trim()}
                  className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#2AABEE] py-3 text-sm font-semibold text-white transition-colors hover:bg-[#229ED9] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? 'Sending...' : 'Send code via Telegram'}
                </button>
              </div>
            )}

            {step === 'otp' && (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => {
                    setStep('phone')
                    setCode('')
                  }}
                  className="text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--text-secondary)]"
                >
                  ← Back
                </button>
                <p className="text-xs text-[var(--text-muted)]">
                  Enter the code sent in Telegram for <span className="text-[var(--text-secondary)]">{phone}</span>.
                </p>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="12345"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={(e) => handleKeyDown(e, handleVerifyOTP)}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3 text-center font-mono text-2xl tracking-[0.45em] text-[var(--text-primary)] placeholder:tracking-normal focus:border-[var(--accent)]/50 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => void handleVerifyOTP()}
                  disabled={loading || code.length < 4}
                  className="flex min-h-11 w-full items-center justify-center rounded-xl bg-[var(--accent)] py-3 text-sm font-semibold text-[var(--bg-primary)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? 'Verifying...' : 'Verify & Login'}
                </button>
                <div className="text-center text-xs text-[var(--text-muted)]">
                  {countdown > 0 ? (
                    <span>Resend code in {countdown}s</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleResendOTP()}
                      disabled={loading}
                      className="text-[var(--accent)] transition-opacity hover:opacity-80 disabled:opacity-50"
                    >
                      Didn&apos;t get the code? Resend
                    </button>
                  )}
                </div>
              </div>
            )}

            {step === 'success' && (
              <div className="py-4 text-center">
                <p className="text-3xl">✅</p>
                <p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">Logged in!</p>
                <p className="text-xs text-[var(--text-muted)]">Redirecting to your dashboard...</p>
              </div>
            )}

            {step === 'phone' && (
              <>
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
              </>
            )}
          </div>

          {step === 'phone' && <div className="mb-5 space-y-2">
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
          </div>}

          <p className="text-center text-[12px] leading-relaxed text-[var(--text-muted)]">
            After connecting, you&apos;ll be taken directly to your dashboard with $1,000 paper USDC ready to trade. No
            credit card. No email. No password.
          </p>
        </div>
      </motion.div>
    </div>
  )
}
