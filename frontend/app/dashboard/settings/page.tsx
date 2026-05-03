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
    emoji: '🛡️',
    tagline: 'Small bets, play it safe',
    description: 'The bot will suggest small bet sizes. Lower risk, lower reward.',
  },
  {
    id: 'moderate',
    label: 'Moderate',
    emoji: '⚖️',
    tagline: 'Balanced — our recommendation',
    description: 'A good balance of risk and reward for most people.',
  },
  {
    id: 'aggressive',
    label: 'Aggressive',
    emoji: '🚀',
    tagline: 'Bigger bets, higher reward',
    description: 'Larger bet sizes. Higher potential gains, but also higher losses.',
  },
] as const

export default function SettingsPage() {
  const { user, logout, refetchUser } = useAuth()
  const updateSettings = useUpdateSettings()
  const pauseBot = usePauseBot()
  const testTelegram = useTestTelegram()
  const resetWallet = useResetWallet()
  const { data: walletApi } = usePaperWallet()

  const baseline = useRef({
    categories: [] as string[],
    riskMode: 'moderate' as string,
    autoTakeProfitPct: null as number | null,
    autoStopLossPct: null as number | null,
  })
  const [categories, setCategories] = useState<string[]>([])
  const [riskMode, setRiskMode] = useState<string>('moderate')
  const [autoTpPct, setAutoTpPct] = useState<number | null>(null)
  const [autoSlPct, setAutoSlPct] = useState<number | null>(null)
  const [changed, setChanged] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)

  useEffect(() => {
    if (!user) return
    const cats = [...(user.categories ?? [])]
    const rm = user.riskMode ?? 'moderate'
    const tp = user.autoTakeProfitPct ?? null
    const sl = user.autoStopLossPct ?? null
    baseline.current = { categories: [...cats], riskMode: rm, autoTakeProfitPct: tp, autoStopLossPct: sl }
    setCategories(cats)
    setRiskMode(rm)
    setAutoTpPct(tp)
    setAutoSlPct(sl)
    setChanged(false)
  }, [user])

  const resetChanges = () => {
    const b = baseline.current
    setCategories([...b.categories])
    setRiskMode(b.riskMode)
    setAutoTpPct(b.autoTakeProfitPct)
    setAutoSlPct(b.autoStopLossPct)
    setChanged(false)
  }

  const saveChanges = async () => {
    try {
      await updateSettings.mutateAsync({
        categories,
        riskMode,
        autoTakeProfitPct: autoTpPct,
        autoStopLossPct: autoSlPct,
      })
      baseline.current = { categories: [...categories], riskMode, autoTakeProfitPct: autoTpPct, autoStopLossPct: autoSlPct }
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
  const walletTotalPnl = walletApi?.totalPnl ?? 0

  const displayName = user?.firstName || user?.username || user?.walletAddress?.slice(0, 8) || 'Account'
  const initial =
    (user?.firstName?.[0] || user?.username?.[0] || user?.walletAddress?.[0] || '?').toUpperCase()

  return (
    <div className="flex flex-1 flex-col">
      <Topbar title="Settings" subtitle="Customize how the bot works for you" />

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
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Bot</h3>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={pauseBot.isPending}
                  onClick={() => pauseBot.mutate(undefined)}
                >
                  {user?.isPaused ? '▶ Resume bot' : '⏸ Pause bot'}
                </Button>
              </div>
              <p className="text-xs text-[var(--text-muted)]">
                Pausing the bot stops new bet signals until you resume.
              </p>
            </Card>
          </motion.div>

          <motion.div variants={staggerItem}>
            <Card className="p-5">
              <h3 className="mb-4 text-sm font-semibold text-[var(--text-primary)]">Topics I care about</h3>
              <p className="mb-3 text-[10px] text-[var(--text-muted)]">
                The bot will focus signals on these topics.
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
              <h3 className="mb-1 text-sm font-semibold text-[var(--text-primary)]">Risk Appetite</h3>
              <p className="mb-4 text-xs text-[var(--text-muted)]">How much should the bot suggest you bet?</p>
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
                      <p className="mb-1 text-lg">{mode.emoji}</p>
                      <p
                        className={`mb-1 text-sm font-semibold ${active ? 'text-[var(--accent-bright)]' : 'text-[var(--text-primary)]'}`}
                      >
                        {mode.label}
                      </p>
                      <p className={`mb-2 text-xs font-medium ${active ? 'text-[var(--accent-bright)]' : 'text-[var(--text-secondary)]'}`}>
                        {mode.tagline}
                      </p>
                      <p className="text-[10px] text-[var(--text-muted)]">{mode.description}</p>
                    </button>
                  )
                })}
              </div>
            </Card>
          </motion.div>

          <motion.div variants={staggerItem}>
            <Card className="p-5">
              <h3 className="mb-1 text-sm font-semibold text-[var(--text-primary)]">Auto-exit Rules</h3>
              <p className="mb-4 text-xs text-[var(--text-muted)]">
                The bot will automatically close your bet when it hits these thresholds. Leave blank to manage exits yourself.
              </p>

              {/* Auto take-profit */}
              <div className="mb-4">
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-xs font-medium text-[var(--text-secondary)]">
                    💰 Auto take-profit at
                  </label>
                  <span className="font-mono text-xs text-[var(--accent-bright)]">
                    {autoTpPct != null ? `${autoTpPct}% gain` : 'Off'}
                  </span>
                </div>
                <p className="mb-2 text-[10px] text-[var(--text-muted)]">
                  e.g. 100% = exit when your $50 bet is worth $100 (2×). Recommended: 80–200%.
                </p>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={10}
                    max={400}
                    step={10}
                    value={autoTpPct ?? 100}
                    disabled={autoTpPct == null}
                    onChange={(e) => { setAutoTpPct(Number(e.target.value)); setChanged(true) }}
                    className="h-1.5 flex-1 cursor-pointer accent-[var(--accent)]"
                  />
                  <button
                    type="button"
                    onClick={() => { setAutoTpPct(autoTpPct == null ? 100 : null); setChanged(true) }}
                    className={`shrink-0 rounded-md border px-3 py-1 text-xs font-medium transition-colors ${
                      autoTpPct != null
                        ? 'border-[var(--accent)]/50 bg-[var(--accent-glow)] text-[var(--accent-bright)]'
                        : 'border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-muted)]'
                    }`}
                  >
                    {autoTpPct != null ? 'On' : 'Off'}
                  </button>
                </div>
              </div>

              {/* Auto stop-loss */}
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-xs font-medium text-[var(--text-secondary)]">
                    🛑 Auto stop-loss at
                  </label>
                  <span className="font-mono text-xs text-[var(--danger)]">
                    {autoSlPct != null ? `${autoSlPct}% loss` : 'Off'}
                  </span>
                </div>
                <p className="mb-2 text-[10px] text-[var(--text-muted)]">
                  e.g. 50% = exit when your $50 bet drops to $25. Recommended: 40–60%.
                </p>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={5}
                    max={95}
                    step={5}
                    value={autoSlPct ?? 50}
                    disabled={autoSlPct == null}
                    onChange={(e) => { setAutoSlPct(Number(e.target.value)); setChanged(true) }}
                    className="h-1.5 flex-1 cursor-pointer accent-[var(--danger)]"
                  />
                  <button
                    type="button"
                    onClick={() => { setAutoSlPct(autoSlPct == null ? 50 : null); setChanged(true) }}
                    className={`shrink-0 rounded-md border px-3 py-1 text-xs font-medium transition-colors ${
                      autoSlPct != null
                        ? 'border-[var(--danger)]/50 bg-[var(--danger-dim)] text-[var(--danger)]'
                        : 'border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-muted)]'
                    }`}
                  >
                    {autoSlPct != null ? 'On' : 'Off'}
                  </button>
                </div>
              </div>
            </Card>
          </motion.div>

          <motion.div variants={staggerItem}>
            <Card className="p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Your Paper Wallet</h3>
                <Badge variant={walletTotalPnl >= 0 ? 'success' : 'danger'}>{formatPct(walletRoi)} ROI</Badge>
              </div>
              <div className="mb-4 grid grid-cols-2 gap-3">
                {[
                  ['Balance', formatUSD(walletBalance)],
                  ['Total Profit / Loss', `${walletTotalPnl >= 0 ? '+' : ''}${formatUSD(walletTotalPnl)}`],
                  ['Win Rate', `${walletWinRate}%`],
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
