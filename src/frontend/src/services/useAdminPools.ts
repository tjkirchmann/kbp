import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@clerk/react'

const API = import.meta.env.VITE_API_URL

export interface AdminPool {
  id: number
  name: string
  season_year: number
  is_featured: boolean
  submissions_open: boolean
  game_count: number
  created_at: string
}

export interface CfbdGame {
  id: number
  home_team: string
  away_team: string
  start_date: string
  start_time_tbd: boolean
  bowl_name: string | null
  season_type: string
  home_classification: string | null
  away_classification: string | null
  home_conference: string | null
  away_conference: string | null
  conference_game: boolean
  neutral_site: boolean
  completed: boolean
  home_score: number | null
  away_score: number | null
}

async function authFetch(token: string, path: string, init?: RequestInit) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!res.ok) throw new Error(`${res.status}`)
  return res.json()
}

export function useAdminPools() {
  const { getToken } = useAuth()
  return useQuery<AdminPool[]>({
    queryKey: ['admin', 'pools'],
    queryFn: async () => {
      const token = await getToken()
      return authFetch(token!, '/admin/pools')
    },
  })
}

export function useCreatePool() {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: { name: string; season_year: number }) => {
      const token = await getToken()
      return authFetch(token!, '/admin/pools', {
        method: 'POST',
        body: JSON.stringify(body),
      }) as Promise<AdminPool>
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'pools'] }),
  })
}

export function useCfbdGames(year: number | null) {
  const { getToken } = useAuth()
  return useQuery<CfbdGame[]>({
    queryKey: ['admin', 'cfbd-games', year],
    queryFn: async () => {
      const token = await getToken()
      return authFetch(token!, `/admin/pools/cfbd-games/${year}`)
    },
    enabled: year !== null,
  })
}

export interface PoolGameDetail {
  id: number
  cfbd_game_id: number
  sort_order: number
  home_team: string
  away_team: string
  start_date: string
  start_time_tbd: boolean
  bowl_name: string | null
  season_type: string
  home_classification: string | null
  away_classification: string | null
  home_conference: string | null
  away_conference: string | null
  conference_game: boolean
  neutral_site: boolean
  completed: boolean
  home_score: number | null
  away_score: number | null
}

export interface PoolDetail extends AdminPool {
  submissions_due_at: string | null
  games: PoolGameDetail[]
}

export function usePoolDetail(poolId: number | null) {
  const { getToken } = useAuth()
  return useQuery<PoolDetail>({
    queryKey: ['admin', 'pools', poolId],
    queryFn: async () => {
      const token = await getToken()
      return authFetch(token!, `/admin/pools/${poolId}`)
    },
    enabled: poolId !== null,
  })
}

export function usePatchPool() {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ poolId, patch }: { poolId: number; patch: { is_featured?: boolean; submissions_open?: boolean } }) => {
      const token = await getToken()
      return authFetch(token!, `/admin/pools/${poolId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      })
    },
    onSuccess: (_data, { poolId }) => {
      qc.invalidateQueries({ queryKey: ['admin', 'pools'] })
      qc.invalidateQueries({ queryKey: ['admin', 'pools', poolId] })
    },
  })
}

export function useDeletePool() {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (poolId: number) => {
      const token = await getToken()
      return authFetch(token!, `/admin/pools/${poolId}`, { method: 'DELETE' })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'pools'] }),
  })
}

export function useAddPoolGames() {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ poolId, cfbdGameIds }: { poolId: number; cfbdGameIds: number[] }) => {
      const token = await getToken()
      return authFetch(token!, `/admin/pools/${poolId}/games`, {
        method: 'POST',
        body: JSON.stringify({ cfbd_game_ids: cfbdGameIds }),
      })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'pools'] }),
  })
}
