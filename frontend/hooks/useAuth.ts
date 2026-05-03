import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { useAuthContext } from '@/providers/AuthProvider'
import { api } from '@/lib/api'

export function useAuth() {
  return useAuthContext()
}

export function useUpdateSettings() {
  const { refetchUser } = useAuthContext()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.patch('/api/user', data).then((r) => r.data),
    onSuccess: async () => {
      await refetchUser()
      await qc.invalidateQueries({ queryKey: ["stats"] })
    },
    onError: () => {
      toast.error('Failed to save settings')
    },
  })
}

export function usePauseBot() {
  const { refetchUser } = useAuthContext()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (paused?: boolean) => api.post('/api/user/pause', { paused }).then((r) => r.data),
    onSuccess: async () => {
      await refetchUser()
      await qc.invalidateQueries({ queryKey: ["stats"] })
    },
  })
}

export function useTestTelegram() {
  return useMutation({
    mutationFn: () => api.post('/api/user/test-telegram').then((r) => r.data),
  })
}
