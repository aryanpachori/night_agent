import { useEffect, useRef } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api, PUBLIC_API_BASE_URL } from "@/lib/api"

type UseAlertsOptions = {
  /**
   * Disable this when EventSource stream is active to avoid duplicate polling.
   */
  refetchIntervalMs?: number | false
}

export function useAlerts(
  type?: "bet" | "skipped" | "pending" | "all",
  limit = 20,
  options?: UseAlertsOptions,
) {
  const refetchIntervalMs = options?.refetchIntervalMs ?? 10_000
  return useQuery({
    queryKey: ["alerts", type ?? "all", limit],
    queryFn: () => api.get("/api/alerts", { params: { type, limit } }).then((r) => r.data),
    refetchInterval: refetchIntervalMs,
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

    const url = `${PUBLIC_API_BASE_URL}/api/alerts/stream`
    const es = new EventSource(url, { withCredentials: true })
    esRef.current = es

    es.addEventListener("new_alert", (e: MessageEvent) => {
      try {
        const alert = JSON.parse(e.data) as Record<string, unknown>
        const id = String(alert?.id ?? "")
        if (!id) return

        // Keep all active alerts query variants hot without triggering network refetches.
        qc.setQueriesData({ queryKey: ["alerts"] }, (oldData: unknown) => {
          const oldObj = (oldData ?? {}) as Record<string, unknown>
          const oldAlerts = Array.isArray(oldObj?.alerts)
            ? (oldObj.alerts as Array<Record<string, unknown>>)
            : []
          if (oldAlerts.some((a) => String(a?.id ?? "") === id)) return oldObj
          return { ...oldObj, alerts: [alert, ...oldAlerts] }
        })

        if (!seenAlertIds.current.has(id) && typeof Notification !== "undefined" && Notification.permission === "granted") {
          seenAlertIds.current.add(id)
          const side = String(alert.side ?? "YES")
          const stake = Math.round(Number(alert.suggestedAmount ?? 50))
          const win = Math.round(Number(alert.suggestedContracts ?? 0))
          const question = String(alert.eventName ?? alert.marketQuestion ?? "").slice(0, 80)
          new Notification("📣 New Bet Signal", {
            body: `Bet ${side} on ${question}${win > 0 ? ` — put in $${stake}, win $${win}` : ""}`,
            icon: "/logo.png",
          })
        }
      } catch {
        /* ignore parse errors */
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
