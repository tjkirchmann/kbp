import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@clerk/react'
import { apiFetch } from '../lib/api'

export interface CfbdTeam {
  id: number
  school: string
  mascot: string | null
  abbreviation: string | null
  color: string | null
  alt_color: string | null
  logos: string[] | null
  conference: string | null
  division: string | null
  classification: string | null
  twitter: string | null
  last_synced_at: string
}

export interface SyncResult {
  synced: number
  last_synced_at: string
}

export function useAdminTeams() {
  const { getToken } = useAuth()
  return useQuery<CfbdTeam[]>({
    queryKey: ['admin', 'teams'],
    queryFn: async () => {
      const token = await getToken()
      return apiFetch(token!, '/admin/teams')
    },
  })
}

export function useSyncTeams() {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation<SyncResult>({
    mutationFn: async () => {
      const token = await getToken()
      return apiFetch(token!, '/admin/teams/sync', { method: 'POST' })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'teams'] }),
  })
}
