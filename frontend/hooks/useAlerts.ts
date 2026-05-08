import { useEffect, useRef } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api, PUBLIC_API_BASE_URL } from "@/lib/api"

export function useAlerts(type?: "bet" | "skipped" | "pending" | "all", limit = 20) {
  return useQuery({
    queryKey: ["alerts", type ?? "all", limit],
    queryFn: () => api.get("/api/alerts", { params: { type, limit } }).then((r) => r.data),
    refetchInterval: 15 * 1000,
    staleTime: 10 * 1000,
  })
}

/**
 * Opens an SSE connection to /api/alerts/stream (JWT via ?token= for EventSource).
 */
export function useAlertStream(enabled = true) {
  const qc = useQueryClient()
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return

    const token = localStorage.getItem("nightagent_token")
    if (!token) return

    const url = `${PUBLIC_API_BASE_URL}/api/alerts/stream?token=${encodeURIComponent(token)}`
    const es = new EventSource(url)
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
