'use client'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Zap, MessageCircle, Wallet, Shield, TestTube2, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function LoginPage() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center relative overflow-hidden">
      {/* Subtle grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: 'linear-gradient(var(--border-bright) 1px, transparent 1px), linear-gradient(90deg, var(--border-bright) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      {/* Radial gradient glow */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-[600px] h-[600px] rounded-full bg-[var(--accent-glow)] blur-[120px] opacity-30" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.0, 0.0, 0.2, 1] }}
        className="relative z-10 w-full max-w-sm mx-4"
      >
        <div className="bg-[var(--bg-card)] border border-[var(--border-bright)] rounded-2xl p-8 shadow-2xl">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-12 h-12 rounded-2xl bg-[var(--accent)] flex items-center justify-center mb-4 shadow-[0_0_30px_var(--accent-glow)]">
              <Zap className="w-6 h-6 text-[var(--bg-primary)]" />
            </div>
            <h1 className="text-xl font-bold text-[var(--text-primary)] mb-1">NightAgent</h1>
            <p className="text-xs text-[var(--text-muted)] text-center max-w-[200px]">
              AI quant layer for Jupiter Prediction Markets
            </p>
          </div>

          {/* Login options */}
          <div className="space-y-3 mb-6">
            <button
              onClick={() => router.push('/dashboard')}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-[#2AABEE]/30 bg-[#2AABEE]/10 text-[var(--text-primary)] hover:bg-[#2AABEE]/15 transition-all group"
            >
              <div className="w-8 h-8 rounded-lg bg-[#2AABEE]/20 flex items-center justify-center flex-shrink-0">
                <MessageCircle className="w-4 h-4 text-[#2AABEE]" />
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold">Login with Telegram</p>
                <p className="text-[10px] text-[var(--text-muted)]">One-click auth via Telegram bot</p>
              </div>
            </button>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-[var(--border)]" />
              <span className="text-[10px] text-[var(--text-muted)]">OR</span>
              <div className="flex-1 h-px bg-[var(--border)]" />
            </div>

            <button
              onClick={() => router.push('/dashboard')}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-[var(--border-bright)] bg-[var(--bg-secondary)] text-[var(--text-primary)] hover:border-[var(--accent)]/40 transition-all"
            >
              <div className="w-8 h-8 rounded-lg bg-[var(--accent-glow)] flex items-center justify-center flex-shrink-0">
                <Wallet className="w-4 h-4 text-[var(--accent)]" />
              </div>
              <div className="text-left flex-1">
                <p className="text-sm font-semibold">Connect Wallet</p>
                <p className="text-[10px] text-[var(--text-muted)]">Phantom · Backpack · Solflare</p>
              </div>
            </button>
          </div>

          {/* Trust indicators */}
          <div className="space-y-2">
            {[
              { icon: Shield,   text: 'No password needed' },
              { icon: TestTube2, text: 'Paper trading — no real money' },
              { icon: Clock,    text: 'Your keys never leave your wallet' },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-2 text-[10px] text-[var(--text-muted)]">
                <Icon className="w-3 h-3 text-[var(--accent-dim)] flex-shrink-0" />
                <span>{text}</span>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  )
}
