import { useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, PUBLIC_API_BASE_URL } from '@/lib/api'

/** Long-lived SSE through the same-origin /api proxy competes with parallel REST on Vercel (conn limits, function duration). */
const VERCEL_BUILD = process.env.NEXT_PUBLIC_VERCEL_DEPLOY === '1'
const ALERT_SSE_ENABLED_ON_VERCEL = process.env.NEXT_PUBLIC_ALERT_SSE === '1'

export function useAlerts(type?: 'bet' | 'skipped' | 'all', limit = 20) {
  return useQuery({
    queryKey: ['alerts', type ?? 'all', limit],
    queryFn: () => api.get('/api/alerts', { params: { type, limit } }).then((r) => r.data),
    // Still poll every 60s as a safety net; SSE handles instant delivery
    refetchInterval: 60 * 1000,
    staleTime: 30 * 1000,
  })
}

/**
 * Opens an SSE connection to /api/alerts/stream.
 * On new_alert event: invalidates all alerts queries instantly and fires a browser notification.
 *
 * On Vercel, SSE is **off by default** (useAlerts still polls). Set `NEXT_PUBLIC_ALERT_SSE=1` and a
 * long enough function `maxDuration` on your plan if you need live push through the BFF proxy.
 */
export function useAlertStream(enabled = true) {
  const qc = useQueryClient()
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return
    if (VERCEL_BUILD && !ALERT_SSE_ENABLED_ON_VERCEL) return

    const token = localStorage.getItem('nightagent_token')
    if (!token) return

    const url = `${PUBLIC_API_BASE_URL}/api/alerts/stream?token=${encodeURIComponent(token)}`
    let es: EventSource | null = null

    const open = () => {
      es = new EventSource(url)
      esRef.current = es

      es.addEventListener('new_alert', (e: MessageEvent) => {
        void qc.invalidateQueries({ queryKey: ['alerts'] })

        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          try {
            const alert = JSON.parse(e.data) as Record<string, unknown>
            const side = String(alert.side ?? 'YES')
            const stake = Math.round(Number(alert.suggestedAmount ?? 50))
            const win = Math.round(Number(alert.suggestedContracts ?? 0))
            const question = String(alert.marketQuestion ?? '').slice(0, 80)
            new Notification('📣 New Bet Signal', {
              body: `Bet ${side} on ${question}${win > 0 ? ` — put in $${stake}, win $${win}` : ''}`,
              icon: '/logo.png',
            })
          } catch { /* ignore parse errors */ }
        }
      })

      es.onerror = () => {
        // Browser auto-reconnects; nothing to do here
      }
    }

    // Let parallel REST calls to /api/* finish first (same host; avoids “pending” storms).
    const delayMs = VERCEL_BUILD ? 400 : 200
    const t = window.setTimeout(open, delayMs)

    return () => {
      window.clearTimeout(t)
      es?.close()
      esRef.current = null
    }
  }, [enabled, qc])
}

export function useRecordAlertAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      actionTaken,
      positionId,
    }: {
      id: string
      actionTaken: 'bet_full' | 'bet_half' | 'skipped' | 'expired'
      positionId?: string
    }) => api.patch(`/api/alerts/${id}`, { actionTaken, positionId }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  })
}
