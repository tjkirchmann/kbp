import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@clerk/react'
import { apiFetch } from '../lib/api'

export interface EventPayload {
  [key: string]: unknown
}

export interface LogEvent {
  event: string
  source: string
  payload: EventPayload
}

export interface EventBucket {
  minute: string
  count: number
  events: LogEvent[]
}

export interface EspnStatus {
  live_games: number
  effective_interval_seconds: number
  rate_limit_per_minute: number
}

export function useEventLog(source?: string, minutes = 30) {
  const { getToken } = useAuth()
  const params = new URLSearchParams({ minutes: String(minutes) })
  if (source) params.set('source', source)
  return useQuery<EventBucket[]>({
    queryKey: ['admin', 'events', source, minutes],
    queryFn: async () => {
      const token = await getToken()
      return apiFetch(token!, `/admin/events?${params}`)
    },
    refetchInterval: 30_000,
  })
}

export function useEspnStatus() {
  const { getToken } = useAuth()
  return useQuery<EspnStatus>({
    queryKey: ['admin', 'espn', 'status'],
    queryFn: async () => {
      const token = await getToken()
      return apiFetch(token!, '/admin/espn/status')
    },
    refetchInterval: 10_000,
  })
}
