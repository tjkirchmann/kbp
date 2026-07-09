import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@clerk/react'
import { apiFetch } from '../../lib/api'

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
  week: number | null
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

export function useAdminPools() {
  const { getToken } = useAuth()
  return useQuery<AdminPool[]>({
    queryKey: ['admin', 'pools'],
    queryFn: async () => {
      const token = await getToken()
      return apiFetch(token!, '/admin/pools')
    },
  })
}

export function useCreatePool() {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: { name: string; season_year: number }) => {
      const token = await getToken()
      return apiFetch(token!, '/admin/pools', {
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
      return apiFetch(token!, `/admin/pools/cfbd-games/${year}`)
    },
    enabled: year !== null,
  })
}

export interface PoolGameDetail {
  id: number
  cfbd_game_id: number
  sort_order: number
  multiplier: number
  playoff_slot: string | null
  home_team: string
  away_team: string
  start_date: string
  start_time_tbd: boolean
  week: number | null
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
      return apiFetch(token!, `/admin/pools/${poolId}`)
    },
    enabled: poolId !== null,
  })
}

export function usePatchPool() {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      poolId,
      patch,
    }: {
      poolId: number
      patch: { is_featured?: boolean; submissions_open?: boolean }
    }) => {
      const token = await getToken()
      return apiFetch(token!, `/admin/pools/${poolId}`, {
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
      return apiFetch(token!, `/admin/pools/${poolId}`, { method: 'DELETE' })
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
      return apiFetch(token!, `/admin/pools/${poolId}/games`, {
        method: 'POST',
        body: JSON.stringify({ cfbd_game_ids: cfbdGameIds }),
      }) as Promise<PoolGameDetail[]>
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'pools'] }),
  })
}

export function useRemovePoolGame() {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ poolId, poolGameId }: { poolId: number; poolGameId: number }) => {
      const token = await getToken()
      return apiFetch(token!, `/admin/pools/${poolId}/games/${poolGameId}`, { method: 'DELETE' })
    },
    onSuccess: (_data, { poolId }) => {
      qc.invalidateQueries({ queryKey: ['admin', 'pools'] })
      qc.invalidateQueries({ queryKey: ['admin', 'pools', poolId] })
    },
  })
}

export interface BracketAssignmentItem {
  pool_game_id: number
  playoff_slot: string | null
}

export function useUpdateBracket() {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      poolId,
      assignments,
    }: {
      poolId: number
      assignments: BracketAssignmentItem[]
    }) => {
      const token = await getToken()
      return apiFetch(token!, `/admin/pools/${poolId}/games/bracket`, {
        method: 'PATCH',
        body: JSON.stringify({ assignments }),
      }) as Promise<PoolGameDetail[]>
    },
    onSuccess: (_data, { poolId }) => {
      qc.invalidateQueries({ queryKey: ['admin', 'pools', poolId] })
    },
  })
}

export interface MultiplierItem {
  pool_game_id: number
  multiplier: number
}

export function useUpdateMultipliers() {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      poolId,
      multipliers,
    }: {
      poolId: number
      multipliers: MultiplierItem[]
    }) => {
      const token = await getToken()
      return apiFetch(token!, `/admin/pools/${poolId}/games/multipliers`, {
        method: 'PATCH',
        body: JSON.stringify({ multipliers }),
      }) as Promise<PoolGameDetail[]>
    },
    onSuccess: (_data, { poolId }) => {
      qc.invalidateQueries({ queryKey: ['admin', 'pools', poolId] })
    },
  })
}

export interface AdminSubmissionRow {
  id: number
  submitted_by_name: string
  submitted_by_email: string
  on_behalf_of_name: string
  is_locked: boolean
  submitted_at: string | null
  pick_count: number
  created_at: string
}

export function usePoolSubmissions(poolId: number | null) {
  const { getToken } = useAuth()
  return useQuery<AdminSubmissionRow[]>({
    queryKey: ['admin', 'pools', poolId, 'submissions'],
    queryFn: async () => {
      const token = await getToken()
      return apiFetch(token!, `/admin/pools/${poolId}/submissions`)
    },
    enabled: poolId !== null,
  })
}
