import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@clerk/react'
import { apiFetch } from '../../lib/api'

export interface AdminConfig {
  espn_rate_limit_per_minute: number
  espn_alert_channel: string // notification channel name; "" = none channel (silence)
  discord_bot_enabled: boolean
  discord_bot_listen_channels: string // comma-separated channel ids
  discord_bot_command_channel: string
}

export function useAdminConfig() {
  const { getToken } = useAuth()
  return useQuery<AdminConfig>({
    queryKey: ['admin', 'config'],
    queryFn: async () => {
      const token = await getToken()
      return apiFetch(token!, '/admin/config')
    },
  })
}

export function useTestDiscordBot() {
  const { getToken } = useAuth()
  return useMutation({
    mutationFn: async () => {
      const token = await getToken()
      return apiFetch(token!, '/admin/config/test-bot', { method: 'POST' })
    },
  })
}

export function useUpdateAdminConfig() {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: Partial<AdminConfig>) => {
      const token = await getToken()
      return apiFetch(token!, '/admin/config', {
        method: 'PUT',
        body: JSON.stringify(body),
      })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'config'] }),
  })
}
