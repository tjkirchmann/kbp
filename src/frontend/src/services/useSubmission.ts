import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@clerk/react'
import { apiFetch } from '../lib/api'

export interface OpenPool {
  id: number
  name: string
  season_year: number
  is_featured: boolean
  submissions_open: boolean
  submissions_due_at: string | null
  requires_password: boolean
}

export interface TeamMeta {
  school: string
  mascot: string | null
  color: string | null
  alt_color: string | null
  logos: string[] | null
}

export interface PoolGame {
  id: number
  cfbd_game_id: number
  sort_order: number
  home_team: string
  away_team: string
  start_date: string
  start_time_tbd: boolean
  bowl_name: string | null
  season_type: string
  neutral_site: boolean
  conference_game: boolean
  home_classification: string | null
  away_classification: string | null
  home_conference: string | null
  away_conference: string | null
  completed: boolean
  home_score: number | null
  away_score: number | null
  home_team_meta: TeamMeta | null
  away_team_meta: TeamMeta | null
}

export interface GamePick {
  id: number
  pool_game_id: number
  picked_winner: string
  picked_margin: number
}

export interface MySubmission {
  id: number
  on_behalf_of_name: string // '' = self-submission
  created_at: string
  submitted_at: string | null
}

export function isSubmitted(sub: MySubmission): boolean {
  return sub.submitted_at !== null
}

export function useOpenPools() {
  return useQuery<OpenPool[]>({
    queryKey: ['submission', 'pools'],
    queryFn: () => apiFetch(null, '/submission/pools'),
  })
}

export function usePoolGames(poolId: number | null) {
  return useQuery<PoolGame[]>({
    queryKey: ['submission', 'pools', poolId, 'games'],
    queryFn: () => apiFetch(null, `/submission/pools/${poolId}/games`),
    enabled: poolId !== null,
  })
}

export function useVerifyPassword(poolId: number) {
  const { getToken } = useAuth()
  return useMutation({
    mutationFn: async (password: string) => {
      const token = await getToken()
      return apiFetch(token, `/submission/pools/${poolId}/verify`, {
        method: 'POST',
        body: JSON.stringify({ password }),
      })
    },
  })
}

export function useEnterPool(poolId: number) {
  const { getToken } = useAuth()
  return useMutation({
    mutationFn: async (body: {
      on_behalf_of_name: string
      on_behalf_of_email: string | null
      password: string | null
    }) => {
      const token = await getToken()
      return apiFetch(token, `/submission/pools/${poolId}/enter`, {
        method: 'POST',
        body: JSON.stringify(body),
      }) as Promise<{ submission_id: number }>
    },
  })
}

export function useSubmissionPicks(submissionId: number | null) {
  const { getToken } = useAuth()
  return useQuery<GamePick[]>({
    queryKey: ['submission', submissionId, 'picks'],
    queryFn: async () => {
      const token = await getToken()
      return apiFetch(token, `/submission/${submissionId}/picks`)
    },
    enabled: submissionId !== null,
  })
}

export function useMySubmissions(poolId: number | null) {
  const { getToken } = useAuth()
  return useQuery<MySubmission[]>({
    queryKey: ['submission', 'pools', poolId, 'my-submissions'],
    queryFn: async () => {
      const token = await getToken()
      return apiFetch(token, `/submission/pools/${poolId}/my-submissions`)
    },
    enabled: poolId !== null,
  })
}

export function useSavePick(submissionId: number) {
  const { getToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      poolGameId,
      pickedWinner,
      pickedMargin,
    }: {
      poolGameId: number
      pickedWinner: string
      pickedMargin: number
    }) => {
      const token = await getToken()
      return apiFetch(token, `/submission/${submissionId}/picks/${poolGameId}`, {
        method: 'PUT',
        body: JSON.stringify({ picked_winner: pickedWinner, picked_margin: pickedMargin }),
      }) as Promise<GamePick>
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['submission', submissionId, 'picks'] })
    },
  })
}

export function useSubmitEntry(submissionId: number) {
  const { getToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const token = await getToken()
      return apiFetch(token, `/submission/${submissionId}/submit`, {
        method: 'POST',
      }) as Promise<MySubmission>
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['submission', submissionId, 'picks'] })
      queryClient.invalidateQueries({ queryKey: ['submission', 'pools'] })
    },
  })
}
