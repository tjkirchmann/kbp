import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@clerk/react'
import { apiFetch } from '../lib/api'

// Named, reusable notification destinations (Discord webhooks, etc). Independent
// of the sync/run-history surface — used by the ESPN and channel-manager panels.

export interface NotificationChannel {
  name: string
  strategy: string
  config: Record<string, unknown>
}

const CHANNELS_KEY = ['admin', 'notify', 'channels'] as const

export function useChannels() {
  const { getToken } = useAuth()
  return useQuery<NotificationChannel[]>({
    queryKey: CHANNELS_KEY,
    queryFn: async () => {
      const token = await getToken()
      return apiFetch(token!, '/admin/notify/channels')
    },
  })
}

export function useUpsertChannel() {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation<NotificationChannel, Error, NotificationChannel>({
    mutationFn: async ({ name, strategy, config }) => {
      const token = await getToken()
      return apiFetch(token!, `/admin/notify/channels/${encodeURIComponent(name)}`, {
        method: 'PUT',
        body: JSON.stringify({ strategy, config }),
      })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CHANNELS_KEY }),
  })
}

export function useDeleteChannel() {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation<{ ok: boolean }, Error, string>({
    mutationFn: async (name) => {
      const token = await getToken()
      return apiFetch(token!, `/admin/notify/channels/${encodeURIComponent(name)}`, {
        method: 'DELETE',
      })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CHANNELS_KEY }),
  })
}

export function useTestChannel() {
  const { getToken } = useAuth()
  return useMutation<{ ok: boolean }, Error, string>({
    mutationFn: async (name) => {
      const token = await getToken()
      return apiFetch(token!, `/admin/notify/channels/${encodeURIComponent(name)}/test`, {
        method: 'POST',
      })
    },
  })
}
