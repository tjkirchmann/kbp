import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@clerk/react'

const API = import.meta.env.VITE_API_URL

async function authFetch(token: string, path: string, init?: RequestInit) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!res.ok) throw new Error(`${res.status}`)
  return res.json()
}

export interface SyncRunResult {
  deferred: boolean
  job_id?: number
  already_queued?: boolean
}

export interface SyncRun {
  id: number
  status: string
  started_at: string | null
  ended_at: string | null
  duration_seconds: number | null
}

export interface SyncJobStatus {
  task_name: string
  description: string | null
  cron: string | null
  last_run_at: string | null
  next_run_at: string | null
  runs: SyncRun[]
}

const SYNC_STATUS_KEY = ['admin', 'sync', 'status']

export function useSyncStatus() {
  const { getToken } = useAuth()
  return useQuery<SyncJobStatus[]>({
    queryKey: SYNC_STATUS_KEY,
    queryFn: async () => {
      const token = await getToken()
      return authFetch(token!, '/admin/sync/status')
    },
    refetchInterval: 5000,
  })
}

/** Run-now for any registered task, by name. */
export function useRunSyncTask(taskName: string) {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation<SyncRunResult>({
    mutationFn: async () => {
      const token = await getToken()
      return authFetch(token!, `/admin/sync/run/${taskName}`, { method: 'POST' })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: SYNC_STATUS_KEY }),
  })
}

export type RunMutation = ReturnType<typeof useRunSyncTask>
