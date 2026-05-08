import { useEffect, useRef } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api, PUBLIC_API_BASE_URL } from "@/lib/api"

export function useAlerts(type?: "bet" | "skipped" | "pending" | "all", limit = 20) {
  return useQuery({
    queryKey: ["alerts", type ?? "all", limit],
    queryFn: () => api.get("/api/alerts", { params: { type, limit } }).then((r) => r.data),
    refetchInterval: 10 * 1000,
    staleTime: 5 * 1000,
  })
}

/**
 * Opens an SSE connection to /api/alerts/stream using same-origin auth cookies.
 */
export function useAlertStream(enabled = true) {
  const qc = useQueryClient()
  const esRef = useRef<EventSource | null>(null)
  const seenAlertIds = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return

    let mounted = true
    const poll = window.setInterval(async () => {
      try {
        const { data } = await api.get("/api/alerts", { params: { limit: 10 } })
        const alerts = Array.isArray(data?.alerts) ? data.alerts : []
        for (const alert of alerts) {
          const id = String(alert?.id ?? "")
          if (!id) continue
          if (!seenAlertIds.current.has(id)) {
            seenAlertIds.current.add(id)
            if (typeof Notification !== "undefined" && Notification.permission === "granted") {
              const side = String(alert?.side ?? "YES")
              const stake = Math.round(Number(alert?.suggestedAmount ?? 0))
              const win = Math.round(Number(alert?.suggestedContracts ?? 0))
              const question = String(alert?.eventName ?? alert?.marketQuestion ?? "").slice(0, 80)
              new Notification("New NightAgent alert", {
                body: `${question} • ${side}${win > 0 ? ` • Bet $${stake} → Win $${win}` : ""}`,
                icon: "/logo.png",
              })
            }
          }
        }
      } catch {
        /* polling best effort */
      }
    }, 10_000)

    void api
      .get("/api/alerts", { params: { limit: 50 } })
      .then(({ data }) => {
        if (!mounted) return
        const alerts = Array.isArray(data?.alerts) ? data.alerts : []
        for (const alert of alerts) {
          const id = String(alert?.id ?? "")
          if (id) seenAlertIds.current.add(id)
        }
      })
      .catch(() => {})

    return () => {
      mounted = false
      window.clearInterval(poll)
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return

    const url = `${PUBLIC_API_BASE_URL}/api/alerts/stream`
    const es = new EventSource(url, { withCredentials: true })
    esRef.current = es

    es.addEventListener("new_alert", (e: MessageEvent) => {
      void qc.invalidateQueries({ queryKey: ["alerts"] })

      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        try {
          const alert = JSON.parse(e.data) as Record<string, unknown>
          const side = String(alert.side ?? "YES")
          const stake = Math.round(Number(alert.suggestedAmount ?? 50))
          const win = Math.round(Number(alert.suggestedContracts ?? 0))
          const question = String(alert.marketQuestion ?? "").slice(0, 80)
          new Notification("📣 New Bet Signal", {
            body: `Bet ${side} on ${question}${win > 0 ? ` — put in $${stake}, win $${win}` : ""}`,
            icon: "/logo.png",
          })
        } catch {
          /* ignore parse errors */
        }
      }
    })

    es.onerror = () => {
      // Browser auto-reconnects
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
      actionTaken: "bet_full" | "bet_half" | "skipped" | "expired"
      positionId?: string
    }) => api.patch(`/api/alerts/${id}`, { actionTaken, positionId }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts"] }),
  })
}
