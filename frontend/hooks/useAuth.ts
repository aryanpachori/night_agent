import { useMutation } from '@tanstack/react-query'
import { useAuthContext } from '@/providers/AuthProvider'
import { api } from '@/lib/api'

export function useAuth() {
  return useAuthContext()
}

export function useUpdateSettings() {
  const { refetchUser } = useAuthContext()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.patch('/api/user', data).then((r) => r.data),
    onSuccess: () => refetchUser(),
  })
}

export function usePauseBot() {
  const { refetchUser } = useAuthContext()
  return useMutation({
    mutationFn: (paused?: boolean) => api.post('/api/user/pause', { paused }).then((r) => r.data),
    onSuccess: () => refetchUser(),
  })
}

export function useTestTelegram() {
  return useMutation({
    mutationFn: () => api.post('/api/user/test-telegram').then((r) => r.data),
  })
}
