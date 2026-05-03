'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Topbar } from '@/components/layout/topbar'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Toggle } from '@/components/ui/toggle'
import { Tabs } from '@/components/ui/tabs'
import { formatPct, formatTimeAgo } from '@/lib/utils'
import { Tooltip } from '@/components/ui/tooltip'
import { staggerContainer, tableRow } from '@/lib/animations'
import { useAuth, useUpdateSettings } from '@/hooks/useAuth'
import { useAlerts } from '@/hooks/useAlerts'

const confidenceVariant: Record<string, 'success' | 'warning' | 'muted'> = {
  high: 'success',
  medium: 'warning',
  low: 'muted',
}

function categoryBadgeVariant(cat: string): 'accent' | 'warning' | 'success' | 'muted' {
  if (cat === 'crypto') return 'accent'
  if (cat === 'politics') return 'warning'
  if (cat === 'economics') return 'success'
  return 'muted'
}

function alertTypeLabel(alert: { actionTaken?: string | null; side?: string }) {
  const a = alert.actionTaken ?? ''
  if (a.startsWith('bet')) return `BET ${alert.side ?? ''}`
  return 'SKIPPED'
}

export default function AlertsPage() {
  const { user, refetchUser } = useAuth()
  const updateSettings = useUpdateSettings()
  const [maxAlerts, setMaxAlerts] = useState(3)
  const [minTime, setMinTime] = useState('1hr')
  const [telegramOn, setTelegramOn] = useState(true)
  const [webNotif, setWebNotif] = useState(false)
  const [filterTab, setFilterTab] = useState('all')
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default')

  const { data: alertsPayload } = useAlerts('all', 50)

  useEffect(() => {
    if (!user) return
    setMaxAlerts(user.maxAlertsPerDay ?? 3)
    const aim = user.alertIntervalMin ?? 60
    setMinTime(aim <= 30 ? '30min' : aim <= 60 ? '1hr' : '2hr')
    setTelegramOn(user.telegramAlerts ?? false)
  }, [user])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof Notification === 'undefined') return
    setNotificationPermission(Notification.permission)
  }, [])

  const handleWebNotif = async (next: boolean) => {
    if (typeof window === 'undefined') return
    if (!next) {
      setWebNotif(false)
      return
    }
    if (typeof Notification === 'undefined') return

    let permission = Notification.permission
    if (permission === 'default') {
      permission = await Notification.requestPermission()
    }

    setNotificationPermission(permission)
    setWebNotif(permission === 'granted')
  }

  const alerts = (alertsPayload?.alerts ?? []) as Array<Record<string, unknown>>

  const filtered = useMemo(() => {
    return alerts.filter((a) => {
      const action = String(a.actionTaken ?? '')
      if (filterTab === 'bet') return action.startsWith('bet')
      if (filterTab === 'skipped') return action === 'skipped'
      return true
    })
  }, [alerts, filterTab])

  const persistPrefs = async (partial: Record<string, unknown>) => {
    await updateSettings.mutateAsync(partial)
    await refetchUser()
  }

  const tabCounts = useMemo(() => {
    const bets = alerts.filter((a) => String(a.actionTaken ?? '').startsWith('bet')).length
    const skipped = alerts.filter((a) => String(a.actionTaken ?? '') === 'skipped').length
    return { all: alerts.length, bet: bets, skipped }
  }, [alerts])

  return (
    <div className="flex flex-1 flex-col">
      <Topbar title="Alerts" subtitle="Alert history and notification settings" />

      <div className="space-y-5 p-4 pb-6 sm:p-6">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <Card className="p-4 sm:p-5">
            <h3 className="mb-5 text-sm font-semibold text-[var(--text-primary)]">Alert Settings</h3>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <p className="mb-2 text-xs uppercase tracking-wider text-[var(--text-muted)]">Max Alerts / Day</p>
                <div className="flex gap-1.5">
                  {[1, 3, 5, '∞'].map((v) => (
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
                <p className="mb-2 text-xs uppercase tracking-wider text-[var(--text-muted)]">Min Time Between Alerts</p>
                <div className="flex gap-1.5">
                  {['30min', '1hr', '2hr'].map((v) => (
                    <button
                      key={v}
                      type="button"
                      disabled={updateSettings.isPending}
                      onClick={() => {
                        setMinTime(v)
                        const mins = v === '30min' ? 30 : v === '1hr' ? 60 : 120
                        void persistPrefs({ alertIntervalMin: mins })
                      }}
                      className={`rounded-lg border px-3 py-1.5 font-mono text-xs transition-all ${
                        minTime === v
                          ? 'border-[var(--accent)]/40 bg-[var(--accent-glow)] text-[var(--accent-bright)]'
                          : 'border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:border-[var(--border-bright)]'
                      }`}
                    >
                      {v}
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

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <Card className="overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-[var(--border)] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Alert History</h3>
              <Tabs
                className="w-full max-w-full sm:w-auto"
                tabs={[
                  { id: 'all', label: 'All', count: tabCounts.all },
                  { id: 'bet', label: 'Bet', count: tabCounts.bet },
                  { id: 'skipped', label: 'Skipped', count: tabCounts.skipped },
                ]}
                active={filterTab}
                onChange={setFilterTab}
              />
            </div>

            <div className="overflow-x-auto overscroll-x-contain">
              <table className="min-w-[720px] w-full">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    {['Time', 'Market', 'Category', 'Type', 'Confidence', 'Edge', 'Reason'].map((h) => (
                      <th
                        key={h}
                        className="whitespace-nowrap px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <motion.tbody variants={staggerContainer} initial="hidden" animate="visible" key={filterTab}>
                  {filtered.map((alert) => {
                    const confidence = String(alert.confidence ?? 'medium')
                    const category = String(alert.category ?? '')
                    const reasoning = String(alert.reasoning ?? '')
                    const edge = Number(alert.edge ?? 0)
                    const createdAt = alert.createdAt ? new Date(String(alert.createdAt)) : new Date()
                    return (
                      <motion.tr
                        key={String(alert.id)}
                        variants={tableRow}
                        className="border-b border-[var(--border)] transition-colors hover:bg-[var(--bg-card-hover)]"
                      >
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-[var(--text-muted)]">
                          {formatTimeAgo(createdAt)}
                        </td>
                        <td className="px-4 py-3">
                          <p className="max-w-[180px] truncate text-xs text-[var(--text-primary)]">
                            {String(alert.marketQuestion ?? '')}
                          </p>
                          <p className="mt-0.5 max-w-[180px] truncate text-[10px] text-[var(--text-muted)]">
                            {reasoning}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={categoryBadgeVariant(category)} size="sm" className="capitalize">
                            {category}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs font-semibold text-[var(--text-secondary)]">
                          {alertTypeLabel({
                            actionTaken: alert.actionTaken != null ? String(alert.actionTaken) : undefined,
                            side: alert.side != null ? String(alert.side) : undefined,
                          })}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={confidenceVariant[confidence] || 'muted'} size="sm" className="capitalize">
                            {confidence}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs font-semibold text-[var(--accent-bright)]">
                          {formatPct(edge * 100, 0)}
                        </td>
                        <td className="max-w-[220px] px-4 py-3">
                          <Tooltip content={reasoning}>
                            <span className="block truncate text-xs text-[var(--text-muted)]">{reasoning}</span>
                          </Tooltip>
                        </td>
                      </motion.tr>
                    )
                  })}
                </motion.tbody>
              </table>
            </div>
          </Card>
        </motion.div>
      </div>
    </div>
  )
}
