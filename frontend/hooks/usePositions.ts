import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import toast from 'react-hot-toast'

export function usePositions(status?: 'open' | 'closed' | 'resolved' | 'all') {
  return useQuery({
    queryKey: ['positions', status ?? 'all'],
    queryFn: () => api.get('/api/positions', { params: { status } }).then((r) => r.data),
    refetchInterval: 60 * 1000,
  })
}

export function usePosition(id: string) {
  return useQuery({
    queryKey: ['positions', id],
    queryFn: () => api.get(`/api/positions/${id}`).then((r) => r.data),
    enabled: !!id,
  })
}

export function usePlaceBet() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: {
      marketId: string
      marketQuestion?: string
      category?: string
      side: 'YES' | 'NO'
      entryPrice: number
      amount: number
    }) => api.post('/api/positions', data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['positions'] })
      qc.invalidateQueries({ queryKey: ['wallet'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
      toast.success('Paper bet placed ✅')
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg ?? 'Failed to place bet')
    },
  })
}

export function useExitPosition() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      closePrice,
      exitReason,
    }: {
      id: string
      closePrice: number
      exitReason?: string
    }) => api.patch(`/api/positions/${id}`, { closePrice, exitReason }).then((r) => r.data),
    onSuccess: (data: { pnl?: number }) => {
      qc.invalidateQueries({ queryKey: ['positions'] })
      qc.invalidateQueries({ queryKey: ['wallet'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
      const pnl = data.pnl ?? 0
      toast.success(`Position closed: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`)
    },
    onError: () => toast.error('Failed to close position'),
  })
}
