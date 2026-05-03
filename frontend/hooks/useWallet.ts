import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import toast from 'react-hot-toast'

export function useWallet() {
  return useQuery({
    queryKey: ['wallet'],
    queryFn: () => api.get('/api/wallet').then((r) => r.data),
    refetchInterval: 30 * 1000,
  })
}

export function useWalletHistory() {
  return useQuery({
    queryKey: ['wallet', 'history'],
    queryFn: () => api.get('/api/wallet/history').then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  })
}

export function useResetWallet() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post('/api/wallet/reset', { confirm: true }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wallet'] })
      qc.invalidateQueries({ queryKey: ['positions'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
      toast.success('Wallet reset to $1,000 USDC')
    },
    onError: () => toast.error('Reset failed'),
  })
}
