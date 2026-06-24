import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@clerk/react'

const API = import.meta.env.VITE_API_URL

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
  is_locked: boolean
  submitted_at: string | null
}

export type QuestionType = 'text' | 'number' | 'boolean'

export interface PoolQuestion {
  id: number
  prompt: string
  question_type: QuestionType
  sort_order: number
  required: boolean
}

export interface SubmissionAnswer {
  question_id: number
  answer_text: string | null
}

async function apiFetch(token: string | null, path: string, init?: RequestInit) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${API}${path}`, { ...init, headers: { ...headers, ...init?.headers } })
  if (!res.ok) throw new Error(`${res.status}`)
  return res.json()
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
    mutationFn: async (body: { on_behalf_of_name: string; on_behalf_of_email: string | null }) => {
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

export async function getAnswers(
  token: string | null,
  submissionId: number,
): Promise<SubmissionAnswer[]> {
  return apiFetch(token, `/submission/${submissionId}/answers`)
}

// Imperative save — the entry flow only has a submission id mid-handler (after
// entering the pool), which a hook bound to an id can't cleanly cover.
export async function putAnswers(
  token: string | null,
  submissionId: number,
  answers: SubmissionAnswer[],
): Promise<SubmissionAnswer[]> {
  return apiFetch(token, `/submission/${submissionId}/answers`, {
    method: 'PUT',
    body: JSON.stringify({ answers }),
  })
}

export function usePoolQuestions(poolId: number | null) {
  return useQuery<PoolQuestion[]>({
    queryKey: ['submission', 'pools', poolId, 'questions'],
    queryFn: () => apiFetch(null, `/submission/pools/${poolId}/questions`),
    enabled: poolId !== null,
  })
}

export function useSubmissionAnswers(submissionId: number | null) {
  const { getToken } = useAuth()
  return useQuery<SubmissionAnswer[]>({
    queryKey: ['submission', submissionId, 'answers'],
    queryFn: async () => {
      const token = await getToken()
      return apiFetch(token, `/submission/${submissionId}/answers`)
    },
    enabled: submissionId !== null,
  })
}

export function useSaveAnswers(submissionId: number) {
  const { getToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (answers: SubmissionAnswer[]) => {
      const token = await getToken()
      return apiFetch(token, `/submission/${submissionId}/answers`, {
        method: 'PUT',
        body: JSON.stringify({ answers }),
      }) as Promise<SubmissionAnswer[]>
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['submission', submissionId, 'answers'] })
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
