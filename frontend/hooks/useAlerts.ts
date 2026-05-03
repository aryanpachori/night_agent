import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export function useAlerts(type?: 'bet' | 'skipped' | 'all', limit = 20) {
  return useQuery({
    queryKey: ['alerts', type ?? 'all', limit],
    queryFn: () => api.get('/api/alerts', { params: { type, limit } }).then((r) => r.data),
  })
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
