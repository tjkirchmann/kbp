import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@clerk/react'

const API = import.meta.env.VITE_API_URL

export interface AdminConfig {
  espn_rate_limit_per_minute: number
  discord_webhook_url: string
}

async function authFetch(token: string, path: string, init?: RequestInit) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!res.ok) throw new Error(`${res.status}`)
  return res.json()
}

export function useAdminConfig() {
  const { getToken } = useAuth()
  return useQuery<AdminConfig>({
    queryKey: ['admin', 'config'],
    queryFn: async () => {
      const token = await getToken()
      return authFetch(token!, '/admin/config')
    },
  })
}

export function useTestDiscordWebhook() {
  const { getToken } = useAuth()
  return useMutation({
    mutationFn: async () => {
      const token = await getToken()
      return authFetch(token!, '/admin/config/test-webhook', { method: 'POST' })
    },
  })
}

export function useUpdateAdminConfig() {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: Partial<AdminConfig>) => {
      const token = await getToken()
      return authFetch(token!, '/admin/config', {
        method: 'PUT',
        body: JSON.stringify(body),
      })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'config'] }),
  })
}
