'use client'

import { useMemo, useRef, useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { Topbar } from '@/components/layout/topbar'
import { Card } from '@/components/ui/card'
import { Toggle } from '@/components/ui/toggle'
import { formatUSD, formatTimeAgo } from '@/lib/utils'
import { Tooltip } from '@/components/ui/tooltip'
import { staggerContainer, tableRow } from '@/lib/animations'
import { useAuth, useUpdateSettings } from '@/hooks/useAuth'
import { useAlerts, useAlertStream, useRecordAlertAction } from '@/hooks/useAlerts'
import { useQueryClient } from '@tanstack/react-query'
import { BetModal } from '@/components/alerts/BetModal'

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Build a plain-English event name from the raw market question + side. */
function buildEventName(question: string, side: string): string {
  if (!question) return 'Market event'
  const q = question.toLowerCase()
  const dir = side === 'YES' ? '↑ UP' : '↓ DOWN'

  if (q.includes('bitcoin') || q.includes('btc')) return `Bitcoin ${dir}`
  if (q.includes('ethereum') || q.includes('eth')) return `Ethereum ${dir}`
  if (q.includes('solana') || q.includes('sol')) return `Solana ${dir}`
  if (q.includes('bnb')) return `BNB ${dir}`
  if (q.includes('xrp')) return `XRP ${dir}`
  if (q.includes('doge') || q.includes('dogecoin')) return `Dogecoin ${dir}`
  if (q.includes('hyper') || q.includes('hype')) return `Hyperliquid ${dir}`
  if (q.includes('pepe')) return `PEPE ${dir}`
  if (q.includes('trump')) return `Trump market ${dir}`

  // Generic — strip Jupiter boilerplate
  const cleaned = question
    .replace(/this market will resolve.*?if\s+/gi, '')
    .replace(/the .* price at.*$/gi, '')
    .replace(/otherwise.*$/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
  return (cleaned.slice(0, 55) || question.slice(0, 55)) + (cleaned.length > 55 ? '…' : '')
}

function getDisplayReason(reason: string, confidence: string): string {
  if (!reason) return ''
  if (
    reason.includes('LLM unavailable') ||
    reason.includes('quota') ||
    reason.includes('rate limit') ||
    reason.includes('API error') ||
    reason.includes('Using techni')
  ) {
    return confidence === 'high'
      ? 'Strong price movement detected'
      : confidence === 'medium'
        ? 'Moderate signal detected'
        : 'Price pattern detected — verify before betting'
  }
  return reason
}

const CONFIDENCE_LABELS: Record<string, { label: string; color: string }> = {
  high:   { label: '✅ High confidence',   color: 'text-[var(--success)]' },
  medium: { label: '⚡ Moderate signal', color: 'text-[var(--warning)]' },
  low:    { label: '⚠️ Lower confidence',     color: 'text-[var(--text-muted)]' },
}

const DIRECTION_LABELS: Record<string, { label: string; color: string }> = {
  YES: { label: '↑ Going UP',   color: 'text-[var(--success)]' },
  NO:  { label: '↓ Going DOWN', color: 'text-[var(--danger)]' },
}

export default function AlertsPage() {
  const { user, refetchUser } = useAuth()
  const qc = useQueryClient()
  const updateSettings = useUpdateSettings()
  const recordAction = useRecordAlertAction()

  const [maxAlerts, setMaxAlerts] = useState(10)
  const [minTime, setMinTime] = useState('5min')
  const [telegramOn, setTelegramOn] = useState(true)
  const [webNotif, setWebNotif] = useState(false)
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default')
  const [actingOn, setActingOn] = useState<string | null>(null)
  const [bettingAlert, setBettingAlert] = useState<Record<string, unknown> | null>(null)

  const { data: alertsPayload } = useAlerts('pending', 50)
  const prevAlertCountRef = useRef<number | null>(null)
  useAlertStream(true)

  useEffect(() => {
    if (!user) return
    setMaxAlerts(user.maxAlertsPerDay ?? 10)
    const aim = user.alertIntervalMin ?? 5
    setMinTime(aim <= 5 ? '5min' : aim <= 15 ? '15min' : aim <= 30 ? '30min' : '1hr')
    setTelegramOn(user.telegramAlerts ?? false)
  }, [user])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof Notification === 'undefined') return
    const perm = Notification.permission
    setNotificationPermission(perm)
    if (perm === 'granted') setWebNotif(true)
  }, [])

  useEffect(() => {
    const count = (alertsPayload?.alerts ?? []).length
    prevAlertCountRef.current = count
  }, [alertsPayload])

  const handleWebNotif = async (next: boolean) => {
    if (typeof window === 'undefined') return
    if (!next) { setWebNotif(false); return }
    if (typeof Notification === 'undefined') return
    let permission = Notification.permission
    if (permission === 'default') permission = await Notification.requestPermission()
    setNotificationPermission(permission)
    setWebNotif(permission === 'granted')
  }

  const persistPrefs = async (partial: Record<string, unknown>) => {
    try {
      await updateSettings.mutateAsync(partial)
      await refetchUser()
      toast.success('Saved')
    } catch {
      toast.error('Failed to save')
    }
  }

  /** Inline SKIP — record actionTaken without navigating away */
  const handleSkip = async (alertId: string) => {
    setActingOn(alertId)
    try {
      await recordAction.mutateAsync({ id: alertId, actionTaken: 'skipped' })
      qc.invalidateQueries({ queryKey: ['alerts'] })
      toast.success('Skipped')
    } catch {
      toast.error('Failed to skip')
    } finally {
      setActingOn(null)
    }
  }

  const handleBet = (alert: Record<string, unknown>) => {
    setBettingAlert(alert)
  }

  const alerts = (alertsPayload?.alerts ?? []) as Array<Record<string, unknown>>

  const filtered = useMemo(() => alerts.filter((a) => Boolean(a.isActionable)), [alerts])

  return (
    <div className="flex flex-1 flex-col">
      <Topbar title="Live Alerts" subtitle="Fresh signals you can still act on" />

      <div className="space-y-5 p-4 pb-6 sm:p-6">
        {/* ── Settings card ─────────────────────────────────────────────── */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <Card className="p-4 sm:p-5">
            <h3 className="mb-5 text-sm font-semibold text-[var(--text-primary)]">Alert Settings</h3>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <p className="mb-2 text-xs uppercase tracking-wider text-[var(--text-muted)]">Max Alerts / Day</p>
                <div className="flex flex-wrap gap-1.5">
                  {[3, 5, 10, '∞'].map((v) => (
                    <button
                      key={String(v)}
                      type="button"
                      disabled={updateSettings.isPending}
                      onClick={() => {
                        const next = v === '∞' ? 999 : Number(v)
                        setMaxAlerts(next)
                        void persistPrefs({ maxAlertsPerDay: next })
                      }}
                      className={`rounded-lg border px-3 py-1.5 font-mono text-xs transition-all ${
                        (v === '∞' ? maxAlerts >= 999 : maxAlerts === Number(v))
                          ? 'border-[var(--accent)]/40 bg-[var(--accent-glow)] text-[var(--accent-bright)]'
                          : 'border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:border-[var(--border-bright)]'
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs uppercase tracking-wider text-[var(--text-muted)]">How often?</p>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { label: 'Fast', value: '5min', mins: 5 },
                    { label: 'Normal', value: '15min', mins: 15 },
                    { label: 'Slow', value: '30min', mins: 30 },
                    { label: 'Rare', value: '1hr', mins: 60 },
                  ].map(({ label, value, mins }) => (
                    <button
                      key={value}
                      type="button"
                      disabled={updateSettings.isPending}
                      onClick={() => {
                        setMinTime(value)
                        void persistPrefs({ alertIntervalMin: mins })
                      }}
                      className={`rounded-lg border px-3 py-1.5 text-xs transition-all ${
                        minTime === value
                          ? 'border-[var(--accent)]/40 bg-[var(--accent-glow)] text-[var(--accent-bright)]'
                          : 'border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:border-[var(--border-bright)]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-xl bg-[var(--bg-secondary)] p-4">
                <Toggle
                  checked={telegramOn}
                  onChange={(next) => {
                    setTelegramOn(next)
                    void persistPrefs({ telegramAlerts: next })
                  }}
                  label="Telegram Alerts"
                  description={
                    user?.username
                      ? `Connected as @${user.username}`
                      : user?.telegramId
                        ? `Telegram ID ${user.telegramId}`
                        : 'Login with Telegram to enable'
                  }
                />
              </div>

              <div className="rounded-xl bg-[var(--bg-secondary)] p-4">
                <Toggle
                  checked={webNotif}
                  onChange={handleWebNotif}
                  label="Web Notifications"
                  description="Browser push notifications"
                />
                {typeof Notification !== 'undefined' && notificationPermission === 'granted' && (
                  <p className="mt-1 text-xs text-[var(--success)]">Browser notifications enabled ✓</p>
                )}
                {typeof Notification !== 'undefined' && notificationPermission === 'denied' && (
                  <p className="mt-1 text-xs text-[var(--danger)]">Blocked by browser — check site settings</p>
                )}
                {typeof Notification !== 'undefined' && notificationPermission === 'default' && (
                  <p className="mt-1 text-xs text-[var(--text-muted)]">Click to enable browser notifications</p>
                )}
              </div>
            </div>
          </Card>
        </motion.div>

        {/* ── Signal history ─────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <Card className="overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-[var(--border)] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Live Alerts</h3>
              <span className="inline-flex items-center rounded-full border border-[var(--accent)]/30 bg-[var(--accent-glow)] px-2.5 py-1 text-xs font-medium text-[var(--accent-bright)]">
                Live Alerts: {filtered.length}
              </span>
            </div>

            <div className="overflow-x-auto overscroll-x-contain">
              <table className="min-w-[680px] w-full">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    {['Time', 'Event', 'Direction', 'Stake → Win', 'Signal', 'Reason', ''].map((h) => (
                      <th
                        key={h}
                        className="whitespace-nowrap px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <motion.tbody variants={staggerContainer} initial="hidden" animate="visible">
                  {filtered.map((alert) => {
                    const confidence = String(alert.confidence ?? 'medium')
                    const reasoning = String(alert.reasoning ?? '')
                    const side = String(alert.side ?? 'YES')
                    const marketId = String(alert.marketId ?? '')
                    const alertId = String(alert.id ?? '')
                    const createdAt = alert.createdAt ? new Date(String(alert.createdAt)) : new Date()
                    const stake = Math.round(Number(alert.suggestedAmount ?? 50))
                    const winAmount = Math.round(Number(alert.suggestedContracts ?? 0))
                    const isBetting = actingOn === alertId
                    const isActionable = Boolean(alert.isActionable)

                    const marketQuestion = String(alert.marketQuestion ?? '')
                    const eventName = String(alert.eventName ?? '') || buildEventName(marketQuestion, side)
                    const conf = CONFIDENCE_LABELS[confidence] ?? CONFIDENCE_LABELS.low
                    const dir = DIRECTION_LABELS[side] ?? DIRECTION_LABELS.YES
                    const displayReason = getDisplayReason(reasoning, confidence)

                    return (
                      <motion.tr
                        key={alertId}
                        variants={tableRow}
                        className="border-b border-[var(--border)] transition-colors hover:bg-[var(--bg-card-hover)]"
                      >
                        {/* Time */}
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-[var(--text-muted)]">
                          {formatTimeAgo(createdAt)}
                        </td>

                        {/* Event name — no category badge */}
                        <td className="px-4 py-3">
                          <div title={marketQuestion} className="cursor-help">
                            <p className="max-w-[300px] whitespace-nowrap overflow-hidden text-ellipsis text-xs font-medium text-[var(--text-primary)] md:max-w-none md:whitespace-normal">
                              {eventName}
                            </p>
                          </div>
                        </td>

                        {/* Direction — plain English, no YES/NO jargon */}
                        <td className="whitespace-nowrap px-4 py-3">
                          <span className={`text-xs font-semibold ${dir.color}`}>{dir.label}</span>
                        </td>

                        {/* Stake → Win */}
                        <td className="px-4 py-3">
                          {winAmount > 0 ? (
                            <span className="font-mono text-xs text-[var(--text-primary)]">
                              {formatUSD(stake)}
                              <span className="mx-1 text-[var(--text-muted)]">→</span>
                              <span className="font-semibold text-[var(--success)]">{formatUSD(winAmount)}</span>
                            </span>
                          ) : (
                            <span className="font-mono text-xs text-[var(--text-primary)]">{formatUSD(stake)}</span>
                          )}
                        </td>

                        {/* Signal strength */}
                        <td className="whitespace-nowrap px-4 py-3">
                          <span className={`text-xs font-medium ${conf.color}`}>{conf.label}</span>
                        </td>

                        {/* Reason */}
                        <td className="max-w-[200px] px-4 py-3">
                          <Tooltip content={displayReason}>
                            <span className="block truncate text-xs italic text-[var(--text-muted)]">{displayReason}</span>
                          </Tooltip>
                        </td>

                        {/* Action column — only actionable alerts can be acted on */}
                        <td className="px-4 py-3">
                          {isActionable && marketId ? (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                disabled={isBetting}
                                onClick={() => handleBet(alert)}
                                className="inline-flex items-center gap-1 rounded-lg border border-[var(--accent)]/40 bg-[var(--accent-glow)] px-2.5 py-1 font-mono text-[10px] font-semibold text-[var(--accent-bright)] transition-all hover:border-[var(--accent)]/70 hover:bg-[var(--accent)]/15 disabled:opacity-50"
                              >
                                Bet →
                              </button>
                              <button
                                type="button"
                                disabled={isBetting}
                                onClick={() => void handleSkip(alertId)}
                                className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-2 py-1 text-[10px] text-[var(--text-muted)] transition-all hover:border-[var(--border-bright)] hover:text-[var(--text-secondary)] disabled:opacity-50"
                              >
                                {isBetting ? '…' : 'Skip'}
                              </button>
                            </div>
                          ) : null}
                        </td>
                      </motion.tr>
                    )
                  })}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-xs text-[var(--text-muted)]">
                        No live alerts right now.
                      </td>
                    </tr>
                  )}
                </motion.tbody>
              </table>
            </div>
          </Card>
        </motion.div>
      </div>
      <BetModal
        alert={
          bettingAlert
            ? {
                id: String(bettingAlert.id ?? ''),
                marketId: String(bettingAlert.marketId ?? ''),
                marketQuestion: String(bettingAlert.marketQuestion ?? ''),
                category: String(bettingAlert.category ?? ''),
                side: bettingAlert.side === 'NO' ? 'NO' : 'YES',
                marketPrice: Number(bettingAlert.marketPrice ?? 0.5),
                aiConfidencePct: Number(bettingAlert.aiConfidencePct ?? 50),
                eventName: String(bettingAlert.eventName ?? ''),
                betAmountUsd: Number(bettingAlert.betAmountUsd ?? bettingAlert.suggestedAmount ?? 10),
              }
            : null
        }
        onClose={() => setBettingAlert(null)}
        onSuccess={() => setBettingAlert(null)}
      />
    </div>
  )
}
