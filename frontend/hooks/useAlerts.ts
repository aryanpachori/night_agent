import { useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

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
 */
export function useAlertStream(enabled = true) {
  const qc = useQueryClient()
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return

    const token = localStorage.getItem('nightagent_token')
    if (!token) return

    const url = `${API_BASE}/api/alerts/stream?token=${encodeURIComponent(token)}`
    const es = new EventSource(url)
    esRef.current = es

    es.addEventListener('new_alert', (e: MessageEvent) => {
      // Instantly refresh the alerts cache
      void qc.invalidateQueries({ queryKey: ['alerts'] })

      // Fire a browser push notification if permission granted
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

    return () => {
      es.close()
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
