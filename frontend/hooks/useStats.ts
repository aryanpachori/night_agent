import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export function useSummaryStats() {
  return useQuery({
    queryKey: ['stats', 'summary'],
    queryFn: () => api.get('/api/stats/summary').then((r) => r.data),
    refetchInterval: 30 * 1000,
  })
}

export function useBotStatus() {
  return useQuery({
    queryKey: ['stats', 'bot-status'],
    queryFn: () => api.get('/api/stats/bot-status').then((r) => r.data),
    refetchInterval: 15 * 1000,
  })
}
