import { useEffect } from 'react'
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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

export interface SyncNotify {
  start: boolean
  success: boolean
  failure: boolean
  strategy: string
  has_override: boolean
  channel: string | null
  run_catchup: boolean
  run_on_startup: boolean
  startup_stale_seconds: number | null
  hide_in_history: boolean
}

export interface SyncJobStatus {
  task_name: string
  description: string | null
  cron: string | null
  schedulable: boolean
  last_run_at: string | null
  next_run_at: string | null
  runs: SyncRun[]
  notify: SyncNotify
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

export interface GlobalRun {
  id: number
  task_name: string
  status: string
  started_at: string | null
  ended_at: string | null
  duration_seconds: number | null
}

export interface UpcomingRun {
  task_name: string
  cron: string
  next_run_at: string
}

export const RECENT_LIMIT = 20
export const UPCOMING_LIMIT = 5
const UPCOMING_MAX_PAGES = 10 // stop runaway upward paging (~50 future fires)
// Only surface scheduled runs within this window ahead of now.
export const UPCOMING_WINDOW_MS = 4 * 60 * 60 * 1000 // 4 hours

export const RECENT_KEY = ['admin', 'sync', 'recent'] as const
export const UPCOMING_KEY = ['admin', 'sync', 'upcoming'] as const

// recent: pageParam = before_id (smallest id seen). Short page => no more history => stop.
export function useRecentRuns() {
  const { getToken } = useAuth()
  return useInfiniteQuery({
    queryKey: RECENT_KEY,
    queryFn: async ({ pageParam }): Promise<GlobalRun[]> => {
      const token = await getToken()
      const q = pageParam
        ? `?before_id=${pageParam}&limit=${RECENT_LIMIT}`
        : `?limit=${RECENT_LIMIT}`
      return authFetch(token!, `/admin/sync/recent${q}`)
    },
    initialPageParam: undefined as number | undefined,
    getNextPageParam: last =>
      last.length < RECENT_LIMIT ? undefined : last[last.length - 1].id,
    // No refetchInterval: an infinite-query poll refetches EVERY loaded page. The rail
    // does targeted first-page liveness instead (see SyncActivityRail).
  })
}

// upcoming: pageParam = after (ISO ts of furthest fire). Capped by UPCOMING_MAX_PAGES.
export function useUpcomingRuns() {
  const { getToken } = useAuth()
  return useInfiniteQuery({
    queryKey: UPCOMING_KEY,
    queryFn: async ({ pageParam }): Promise<UpcomingRun[]> => {
      const token = await getToken()
      const q = pageParam
        ? `?after=${encodeURIComponent(pageParam)}&limit=${UPCOMING_LIMIT}`
        : `?limit=${UPCOMING_LIMIT}`
      return authFetch(token!, `/admin/sync/upcoming${q}`)
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last, all) => {
      if (last.length === 0 || all.length >= UPCOMING_MAX_PAGES) return undefined
      // Stop paging once the furthest fire we have is already past the window —
      // the next page would be entirely beyond +4h.
      const furthest = last[last.length - 1].next_run_at
      if (new Date(furthest).getTime() > Date.now() + UPCOMING_WINDOW_MS) return undefined
      return furthest
    },
    // No refetchInterval: the rail refreshes upcoming's first page on a slow (60s) cadence.
  })
}

type Infinite<T> = { pages: T[][]; pageParams: unknown[] }

/**
 * Recent liveness without refetching loaded history: every `intervalMs`, fetch only
 * the newest page and merge rows with id > current max into page 0. Existing pages
 * (and scroll) are untouched, so this can't drop loaded data.
 */
export function useRecentLiveness(intervalMs = 5000) {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  useEffect(() => {
    const tick = async () => {
      const token = await getToken()
      if (!token) return
      let fresh: GlobalRun[]
      try {
        fresh = await authFetch(token, `/admin/sync/recent?limit=${RECENT_LIMIT}`)
      } catch { return }
      qc.setQueryData<Infinite<GlobalRun>>(RECENT_KEY, old => {
        if (!old) return old
        const maxId = old.pages[0]?.[0]?.id ?? -Infinity
        const incoming = fresh.filter(r => r.id > maxId)
        if (!incoming.length) return old // nothing new -> no re-render
        const pages = [...old.pages]
        pages[0] = [...incoming, ...(pages[0] ?? [])]
        return { ...old, pages }
      })
    }
    const id = setInterval(tick, intervalMs)
    return () => clearInterval(id)
  }, [qc, getToken, intervalMs])
}

/**
 * Upcoming liveness on a slow cadence: cron fire times only shift minute-to-minute,
 * so refresh just the soonest page (page 0) to catch schedule / registry changes.
 */
export function useUpcomingLiveness(intervalMs = 60000) {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  useEffect(() => {
    const tick = async () => {
      const token = await getToken()
      if (!token) return
      let fresh: UpcomingRun[]
      try {
        fresh = await authFetch(token, `/admin/sync/upcoming?limit=${UPCOMING_LIMIT}`)
      } catch { return }
      qc.setQueryData<Infinite<UpcomingRun>>(UPCOMING_KEY, old => {
        if (!old) return old
        const page0 = old.pages[0] ?? []
        const same = fresh.length === page0.length &&
          fresh.every((r, i) => r.task_name === page0[i]?.task_name && r.next_run_at === page0[i]?.next_run_at)
        if (same) return old // unchanged -> no re-render
        const pages = [...old.pages]
        pages[0] = fresh
        return { ...old, pages }
      })
    }
    const id = setInterval(tick, intervalMs)
    return () => clearInterval(id)
  }, [qc, getToken, intervalMs])
}

// ---- Run & task detail ----

export interface RunEvent {
  type: string
  at: string | null
}

export interface RunDetail {
  id: number
  task_name: string
  status: string
  queue_name: string
  priority: number
  attempts: number
  lock: string | null
  queueing_lock: string | null
  scheduled_at: string | null
  abort_requested: boolean
  worker_id: number | null
  args: Record<string, unknown>
  started_at: string | null
  ended_at: string | null
  duration_seconds: number | null
  events: RunEvent[]
}

export interface TaskStats {
  total: number
  succeeded: number
  failed: number
  success_rate: number | null
  avg_duration_seconds: number | null
  p95_duration_seconds: number | null
}

export interface TaskDetail {
  task_name: string
  description: string | null
  cron: string | null
  schedulable: boolean
  last_run_at: string | null
  next_run_at: string | null
  upcoming: string[]
  runs: SyncRun[]
  stats: TaskStats
  notify: SyncNotify
}

export function useRunDetail(jobId: string | undefined) {
  const { getToken } = useAuth()
  return useQuery<RunDetail>({
    queryKey: ['admin', 'sync', 'run', jobId],
    enabled: !!jobId,
    queryFn: async () => {
      const token = await getToken()
      return authFetch(token!, `/admin/sync/runs/${jobId}`)
    },
    refetchInterval: 5000,
  })
}

export function useTaskDetail(taskName: string | undefined) {
  const { getToken } = useAuth()
  return useQuery<TaskDetail>({
    queryKey: ['admin', 'sync', 'task', taskName],
    enabled: !!taskName,
    queryFn: async () => {
      const token = await getToken()
      return authFetch(token!, `/admin/sync/tasks/${taskName}`)
    },
    refetchInterval: 5000,
  })
}

export type RunWindow = '3h' | '1d' | '3d' | '7d' | '30d'

/** Runs for a task within a time window — feeds the detail-page charts. */
export function useTaskRuns(taskName: string | undefined, window: RunWindow) {
  const { getToken } = useAuth()
  return useQuery<SyncRun[]>({
    queryKey: ['admin', 'sync', 'task', taskName, 'runs', window],
    enabled: !!taskName,
    queryFn: async () => {
      const token = await getToken()
      return authFetch(token!, `/admin/sync/tasks/${taskName}/runs?window=${window}`)
    },
    refetchInterval: 5000,
    // Keep the prior window's data on screen while the new window loads, so the
    // chart updates in place instead of blinking through the empty state.
    placeholderData: keepPreviousData,
  })
}

/** cancel | abort | retry a job; refreshes the run + the lists it appears in. */
function useRunAction(jobId: string | undefined, action: 'cancel' | 'abort' | 'retry') {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation<{ ok: boolean }>({
    mutationFn: async () => {
      const token = await getToken()
      return authFetch(token!, `/admin/sync/runs/${jobId}/${action}`, { method: 'POST' })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'sync', 'run', jobId] })
      qc.invalidateQueries({ queryKey: RECENT_KEY })
      qc.invalidateQueries({ queryKey: SYNC_STATUS_KEY })
    },
  })
}

export const useCancelRun = (jobId: string | undefined) => useRunAction(jobId, 'cancel')
export const useAbortRun = (jobId: string | undefined) => useRunAction(jobId, 'abort')
export const useRetryRun = (jobId: string | undefined) => useRunAction(jobId, 'retry')

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

export type NotifyEvent = 'start' | 'success' | 'failure'

export interface NotifyConfigUpdate {
  notify_on_start?: boolean
  notify_on_success?: boolean
  notify_on_failure?: boolean
  channel_name?: string      // "" clears the channel
  run_catchup?: boolean
  run_on_startup?: boolean
  startup_stale_seconds?: number   // -1 clears to null ("Always")
  hide_in_history?: boolean
}

/** Update a task's notification settings (events, channel, catch-up). */
export function useSetNotifyConfig(taskName: string) {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation<SyncNotify, Error, NotifyConfigUpdate>({
    mutationFn: async (body) => {
      const token = await getToken()
      return authFetch(token!, `/admin/sync/notify/${taskName}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SYNC_STATUS_KEY })
      // hide_in_history changes which tasks the rail returns — refetch both sides.
      qc.invalidateQueries({ queryKey: RECENT_KEY })
      qc.invalidateQueries({ queryKey: UPCOMING_KEY })
    },
  })
}

export interface CronResult {
  task_name: string
  cron: string | null
  next_run_at: string | null
}

/** Set or clear (pause) a task's cron. Empty string => pause. Rejects invalid crons. */
export function useSetCron(taskName: string) {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation<CronResult, Error, string | null>({
    mutationFn: async (cron) => {
      const token = await getToken()
      return authFetch(token!, `/admin/sync/cron/${taskName}`, {
        method: 'PUT',
        body: JSON.stringify({ cron }),
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SYNC_STATUS_KEY })
      // A schedule change shifts upcoming fires.
      qc.invalidateQueries({ queryKey: UPCOMING_KEY })
    },
  })
}

// ---- Notification channels (named, reusable destinations) ----

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
      return authFetch(token!, '/admin/notify/channels')
    },
  })
}

export function useUpsertChannel() {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation<NotificationChannel, Error, NotificationChannel>({
    mutationFn: async ({ name, strategy, config }) => {
      const token = await getToken()
      return authFetch(token!, `/admin/notify/channels/${encodeURIComponent(name)}`, {
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
      return authFetch(token!, `/admin/notify/channels/${encodeURIComponent(name)}`, {
        method: 'DELETE',
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CHANNELS_KEY })
      qc.invalidateQueries({ queryKey: SYNC_STATUS_KEY })
    },
  })
}

export function useTestChannel() {
  const { getToken } = useAuth()
  return useMutation<{ ok: boolean }, Error, string>({
    mutationFn: async (name) => {
      const token = await getToken()
      return authFetch(token!, `/admin/notify/channels/${encodeURIComponent(name)}/test`, {
        method: 'POST',
      })
    },
  })
}
