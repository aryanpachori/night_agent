import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export function useMarkets(category?: string, filter = 'live') {
  return useQuery({
    queryKey: ['markets', category ?? 'all', filter],
    queryFn: () => api.get('/api/markets', { params: { category, filter } }).then((r) => r.data),
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  })
}

export function useMarket(id: string) {
  return useQuery({
    queryKey: ['markets', id],
    queryFn: () => api.get(`/api/markets/${id}`).then((r) => r.data),
    enabled: !!id,
    staleTime: 30 * 1000,
  })
}
