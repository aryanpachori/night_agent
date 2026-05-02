'use client'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Topbar } from '@/components/layout/topbar'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Toggle } from '@/components/ui/toggle'
import { Tabs } from '@/components/ui/tabs'
import { mockAlerts } from '@/data/mock'
import { formatPct, formatTimeAgo } from '@/lib/utils'
import { Tooltip } from '@/components/ui/tooltip'
import { staggerContainer, tableRow } from '@/lib/animations'

const confidenceVariant: Record<string, 'success' | 'warning' | 'muted'> = {
  high:   'success',
  medium: 'warning',
  low:    'muted',
}

function categoryBadgeVariant(cat: string): 'accent' | 'warning' | 'success' | 'muted' {
  if (cat === 'crypto') return 'accent'
  if (cat === 'politics') return 'warning'
  if (cat === 'economics') return 'success'
  return 'muted'
}

function alertTypeLabel(alert: (typeof mockAlerts)[number]) {
  if (alert.actionTaken.startsWith('bet')) return `BET ${alert.side}`
  return 'SKIPPED'
}

export default function AlertsPage() {
  const [maxAlerts, setMaxAlerts] = useState(3)
  const [minTime, setMinTime] = useState('1hr')
  const [telegramOn, setTelegramOn] = useState(true)
  const [webNotif, setWebNotif] = useState(false)
  const [filterTab, setFilterTab] = useState('all')
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default')

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

  const filtered = mockAlerts.filter(a => {
    if (filterTab === 'bet') return a.actionTaken.startsWith('bet')
    if (filterTab === 'skipped') return a.actionTaken === 'skipped'
    return true
  })

  return (
    <div className="flex flex-col flex-1">
      <Topbar title="Alerts" subtitle="Alert history and notification settings" />

      <div className="space-y-5 p-4 pb-6 sm:p-6">
        {/* Settings card */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <Card className="p-4 sm:p-5">
            <h3 className="mb-5 text-sm font-semibold text-[var(--text-primary)]">Alert Settings</h3>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {/* Max alerts per day */}
              <div>
                <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-2">Max Alerts / Day</p>
                <div className="flex gap-1.5">
                  {[1, 3, 5, '∞'].map(v => (
                    <button
                      key={v}
                      onClick={() => setMaxAlerts(v === '∞' ? 999 : Number(v))}
                      className={`px-3 py-1.5 text-xs font-mono rounded-lg border transition-all ${
                        (v === '∞' ? maxAlerts === 999 : maxAlerts === Number(v))
                          ? 'bg-[var(--accent-glow)] border-[var(--accent)]/40 text-[var(--accent-bright)]'
                          : 'bg-[var(--bg-secondary)] border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-bright)]'
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>

              {/* Min time between alerts */}
              <div>
                <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-2">Min Time Between Alerts</p>
                <div className="flex gap-1.5">
                  {['30min', '1hr', '2hr'].map(v => (
                    <button
                      key={v}
                      onClick={() => setMinTime(v)}
                      className={`px-3 py-1.5 text-xs font-mono rounded-lg border transition-all ${
                        minTime === v
                          ? 'bg-[var(--accent-glow)] border-[var(--accent)]/40 text-[var(--accent-bright)]'
                          : 'bg-[var(--bg-secondary)] border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-bright)]'
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>

              {/* Telegram toggle */}
              <div className="bg-[var(--bg-secondary)] rounded-xl p-4">
                <Toggle
                  checked={telegramOn}
                  onChange={setTelegramOn}
                  label="Telegram Alerts"
                  description="Connected as @aryanpachori"
                />
              </div>

              {/* Web notifications toggle */}
              <div className="bg-[var(--bg-secondary)] rounded-xl p-4">
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

        {/* Alert history */}
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
                  { id: 'all', label: 'All', count: mockAlerts.length },
                  { id: 'bet', label: 'Bet', count: mockAlerts.filter(a => a.actionTaken.startsWith('bet')).length },
                  { id: 'skipped', label: 'Skipped', count: mockAlerts.filter(a => a.actionTaken === 'skipped').length },
                ]}
                active={filterTab}
                onChange={setFilterTab}
              />
            </div>

            <div className="overflow-x-auto overscroll-x-contain">
              <table className="w-full min-w-[720px]">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  {['Time', 'Market', 'Category', 'Type', 'Confidence', 'Edge', 'Reason'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <motion.tbody variants={staggerContainer} initial="hidden" animate="visible" key={filterTab}>
                {filtered.map(alert => (
                  <motion.tr
                    key={alert.id}
                    variants={tableRow}
                    className="border-b border-[var(--border)] hover:bg-[var(--bg-card-hover)] transition-colors"
                  >
                    <td className="px-4 py-3 text-xs text-[var(--text-muted)] font-mono whitespace-nowrap">
                      {formatTimeAgo(alert.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs text-[var(--text-primary)] max-w-[180px] truncate">{alert.marketQuestion}</p>
                      <p className="text-[10px] text-[var(--text-muted)] mt-0.5 truncate max-w-[180px]">{alert.reasoning}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={categoryBadgeVariant(alert.category)} size="sm" className="capitalize">
                        {alert.category}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-[var(--text-secondary)]">
                      {alertTypeLabel(alert)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={confidenceVariant[alert.confidence] || 'muted'} size="sm" className="capitalize">
                        {alert.confidence}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-[var(--accent-bright)]">
                      {formatPct(alert.edge * 100, 0)}
                    </td>
                    <td className="max-w-[220px] px-4 py-3">
                      <Tooltip content={alert.reasoning}>
                        <span className="block truncate text-xs text-[var(--text-muted)]">{alert.reasoning}</span>
                      </Tooltip>
                    </td>
                  </motion.tr>
                ))}
              </motion.tbody>
            </table>
            </div>
          </Card>
        </motion.div>
      </div>
    </div>
  )
}
