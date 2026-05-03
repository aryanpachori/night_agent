'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { Topbar } from '@/components/layout/topbar'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatUSD, formatPct } from '@/lib/utils'
import { staggerItem, staggerContainer } from '@/lib/animations'
import { RotateCcw, LogOut, MessageCircle, Send } from 'lucide-react'
import { useAuth, useUpdateSettings, usePauseBot, useTestTelegram } from '@/hooks/useAuth'
import { useWallet as usePaperWallet, useResetWallet } from '@/hooks/useWallet'

const allCategories = ['Crypto', 'Politics', 'Economics', 'Sports', 'Entertainment', 'Science', 'Climate']

const riskModes = [
  {
    id: 'conservative',
    label: 'Conservative',
    kelly: '0.25×',
    maxBet: '2%',
    consequence: 'Smallest bets, slowest growth, lowest drawdown risk',
  },
  {
    id: 'moderate',
    label: 'Moderate',
    kelly: '0.5×',
    maxBet: '5%',
    consequence: 'Balanced approach — recommended for new users',
  },
  {
    id: 'aggressive',
    label: 'Aggressive',
    kelly: '1.0×',
    maxBet: '10%',
    consequence: 'Larger bets, faster gains, higher variance',
  },
] as const

export default function SettingsPage() {
  const { user, logout, refetchUser } = useAuth()
  const updateSettings = useUpdateSettings()
  const pauseBot = usePauseBot()
  const testTelegram = useTestTelegram()
  const resetWallet = useResetWallet()
  const { data: walletApi } = usePaperWallet()

  const baseline = useRef({ categories: [] as string[], riskMode: 'moderate' as string })
  const [categories, setCategories] = useState<string[]>([])
  const [riskMode, setRiskMode] = useState<string>('moderate')
  const [changed, setChanged] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)

  useEffect(() => {
    if (!user) return
    const cats = [...(user.categories ?? [])]
    const rm = user.riskMode ?? 'moderate'
    baseline.current = { categories: [...cats], riskMode: rm }
    setCategories(cats)
    setRiskMode(rm)
    setChanged(false)
  }, [user])

  const resetChanges = () => {
    const b = baseline.current
    setCategories([...b.categories])
    setRiskMode(b.riskMode)
    setChanged(false)
  }

  const saveChanges = async () => {
    try {
      await updateSettings.mutateAsync({
        categories,
        riskMode,
      })
      baseline.current = { categories: [...categories], riskMode }
      setChanged(false)
      toast.success('Settings saved')
    } catch {
      toast.error('Save failed')
    }
  }

  const toggleCategory = (cat: string) => {
    const lower = cat.toLowerCase()
    const VALID = ['crypto', 'politics', 'economics', 'sports', 'tech', 'culture', 'us elections']
    if (!VALID.includes(lower)) {
      toast.error('Category not supported by API yet')
      return
    }
    setCategories((prev) => (prev.includes(lower) ? prev.filter((c) => c !== lower) : [...prev, lower]))
    setChanged(true)
  }

  const walletBalance = walletApi?.balance ?? user?.wallet?.balance ?? 1000
  const walletRoi = walletApi?.roi ?? 0
  const walletWinRate = walletApi?.winRate ?? 0
  const walletBrier = walletApi?.avgBrierScore ?? null
  const walletTotalPnl = walletApi?.totalPnl ?? 0

  const displayName = user?.firstName || user?.username || user?.walletAddress?.slice(0, 8) || 'Account'
  const initial =
    (user?.firstName?.[0] || user?.username?.[0] || user?.walletAddress?.[0] || '?').toUpperCase()

  return (
    <div className="flex flex-1 flex-col">
      <Topbar title="Settings" subtitle="Configure your NightAgent preferences" />

      <div className="p-4 pb-32 sm:p-6 md:pb-6">
        <motion.div
          className="mx-auto max-w-2xl space-y-5 md:mx-0"
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
        >
          <motion.div variants={staggerItem}>
            <Card className="p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Scanner</h3>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={pauseBot.isPending}
                  onClick={() => pauseBot.mutate(undefined)}
                >
                  {user?.isPaused ? 'Resume scanner' : 'Pause scanner'}
                </Button>
              </div>
              <p className="text-xs text-[var(--text-muted)]">
                Pause stops new alerts until you resume (toggle also affects dashboard bot status).
              </p>
            </Card>
          </motion.div>

          <motion.div variants={staggerItem}>
            <Card className="p-5">
              <h3 className="mb-4 text-sm font-semibold text-[var(--text-primary)]">Market Categories</h3>
              <p className="mb-3 text-[10px] text-[var(--text-muted)]">
                Supported API categories: crypto, politics, economics, sports, tech, culture, us elections.
              </p>
              <div className="flex flex-wrap gap-2">
                {allCategories.map((cat) => {
                  const lower = cat.toLowerCase()
                  const supported = ['crypto', 'politics', 'economics', 'sports'].includes(lower)
                  const active = categories.includes(lower)
                  return (
                    <button
                      key={cat}
                      type="button"
                      disabled={!supported}
                      title={supported ? undefined : 'Use Crypto/Politics/Economics/Sports for now'}
                      onClick={() => toggleCategory(cat)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                        !supported
                          ? 'cursor-not-allowed opacity-40 border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-muted)]'
                          : active
                            ? 'border-[var(--accent)]/50 bg-[var(--accent-glow)] text-[var(--accent-bright)] shadow-[0_0_12px_var(--accent-glow)]'
                            : 'border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:border-[var(--border-bright)] hover:text-[var(--text-secondary)]'
                      }`}
                    >
                      {cat}
                    </button>
                  )
                })}
              </div>
            </Card>
          </motion.div>

          <motion.div variants={staggerItem}>
            <Card className="p-5">
              <h3 className="mb-4 text-sm font-semibold text-[var(--text-primary)]">Risk Mode</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {riskModes.map((mode) => {
                  const active = riskMode === mode.id
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => {
                        setRiskMode(mode.id)
                        setChanged(true)
                      }}
                      className={`rounded-xl border p-4 text-left transition-all ${
                        active
                          ? 'border-[var(--accent)]/50 bg-[var(--accent-glow)] shadow-[0_0_20px_var(--accent-glow)]'
                          : 'border-[var(--border)] bg-[var(--bg-secondary)] hover:border-[var(--border-bright)]'
                      }`}
                    >
                      <p
                        className={`mb-2 text-sm font-semibold ${active ? 'text-[var(--accent-bright)]' : 'text-[var(--text-primary)]'}`}
                      >
                        {mode.label}
                      </p>
                      <div className="space-y-1 font-mono text-[10px]">
                        <div className="flex justify-between">
                          <span className="text-[var(--text-muted)]">Kelly</span>
                          <span className={active ? 'text-[var(--accent-bright)]' : 'text-[var(--text-secondary)]'}>
                            {mode.kelly}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[var(--text-muted)]">Max bet</span>
                          <span className={active ? 'text-[var(--accent-bright)]' : 'text-[var(--text-secondary)]'}>
                            {mode.maxBet}
                          </span>
                        </div>
                      </div>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">{mode.consequence}</p>
                    </button>
                  )
                })}
              </div>
            </Card>
          </motion.div>

          <motion.div variants={staggerItem}>
            <Card className="p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Paper Wallet</h3>
                <Badge variant={walletTotalPnl >= 0 ? 'success' : 'danger'}>{formatPct(walletRoi)}</Badge>
              </div>
              <div className="mb-4 grid grid-cols-2 gap-3">
                {[
                  ['Balance', formatUSD(walletBalance)],
                  ['Total P&L', `${walletTotalPnl >= 0 ? '+' : ''}${formatUSD(walletTotalPnl)}`],
                  ['Win Rate', `${walletWinRate}%`],
                  ['Brier Score', walletBrier != null ? walletBrier.toFixed(2) : '—'],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg bg-[var(--bg-secondary)] p-3">
                    <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{label}</p>
                    <p className="mt-0.5 font-mono text-sm font-bold text-[var(--text-primary)]">{value}</p>
                  </div>
                ))}
              </div>
              {!showResetConfirm ? (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<RotateCcw className="h-3 w-3" />}
                  onClick={() => setShowResetConfirm(true)}
                >
                  Reset to $1,000
                </Button>
              ) : (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--danger)]/30 bg-[var(--danger-dim)] p-3">
                  <p className="min-w-[140px] flex-1 text-xs text-[var(--danger)]">Reset balance and close open positions?</p>
                  <Button
                    variant="danger"
                    size="sm"
                    loading={resetWallet.isPending}
                    onClick={() => {
                      resetWallet.mutate(undefined, {
                        onSuccess: async () => {
                          setShowResetConfirm(false)
                          await refetchUser()
                        },
                      })
                    }}
                  >
                    Confirm
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setShowResetConfirm(false)}>
                    Cancel
                  </Button>
                </div>
              )}
            </Card>
          </motion.div>

          <motion.div variants={staggerItem}>
            <Card className="p-5">
              <h3 className="mb-4 text-sm font-semibold text-[var(--text-primary)]">Telegram</h3>
              <div className="flex items-center gap-3 rounded-xl border border-[var(--success)]/30 bg-[var(--success-dim)] p-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[#2AABEE]/30 bg-[#2AABEE]/20">
                  <MessageCircle className="h-4 w-4 text-[#2AABEE]" />
                </div>
                <div className="flex-1">
                  <p className="text-xs font-medium text-[var(--text-primary)]">
                    {user?.telegramId ? 'Linked' : 'Not linked'}
                  </p>
                  <p className="font-mono text-xs text-[var(--text-muted)]">
                    {user?.username ? `@${user.username}` : user?.telegramId ?? 'Use Telegram login'}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Send className="h-3 w-3" />}
                  loading={testTelegram.isPending}
                  disabled={!user?.telegramId}
                  onClick={() =>
                    testTelegram.mutate(undefined, {
                      onSuccess: () => toast.success('Test message sent'),
                      onError: () => toast.error('Telegram test failed'),
                    })
                  }
                >
                  Test
                </Button>
              </div>
            </Card>
          </motion.div>

          <motion.div variants={staggerItem}>
            <Card className="p-5">
              <h3 className="mb-4 text-sm font-semibold text-[var(--text-primary)]">Account</h3>
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-dim)] text-sm font-bold text-[var(--bg-primary)]">
                  {initial}
                </div>
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">{displayName}</p>
                  <p className="font-mono text-xs text-[var(--text-muted)]">{user?.authMethod ?? '—'}</p>
                </div>
              </div>
              <Button variant="danger" size="sm" icon={<LogOut className="h-3 w-3" />} onClick={() => void logout()}>
                Sign Out
              </Button>
            </Card>
          </motion.div>
        </motion.div>
      </div>

      <AnimatePresence>
        {changed && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.0, 0.0, 0.2, 1] }}
            className="fixed bottom-[calc(76px+env(safe-area-inset-bottom,0px))] left-0 right-0 z-50 flex flex-col gap-3 border-t border-[var(--border-bright)] bg-[var(--bg-secondary)]/90 px-4 py-4 backdrop-blur-md sm:flex-row sm:items-center sm:justify-between sm:px-6 md:bottom-0 md:left-[220px]"
          >
            <p className="text-sm text-[var(--text-secondary)]">You have unsaved changes</p>
            <div className="flex gap-3">
              <Button variant="ghost" size="sm" onClick={resetChanges}>
                Discard
              </Button>
              <Button variant="primary" size="sm" loading={updateSettings.isPending} onClick={() => void saveChanges()}>
                Save Changes
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
