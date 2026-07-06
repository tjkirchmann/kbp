import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@clerk/react'
import { apiFetch } from '../lib/api'

export interface TemporalWorkflowStatus {
  id: string
  label: string
  kind: 'scheduled' | 'manual'
  schedule_cron: string | null
  workflow_status: string | null
  last_run_at: string | null
  last_run_duration_seconds: number | null
  next_run_at: string | null
  result: Record<string, unknown> | null
  error: string | null
}

export interface CfbdTemporalStatus {
  temporal_reachable: boolean
  workflows: TemporalWorkflowStatus[]
}

export function useTemporalSyncStatus() {
  const { getToken } = useAuth()

  return useQuery<CfbdTemporalStatus>({
    queryKey: ['admin', 'temporal', 'cfbd-sync-status'],
    queryFn: async () => {
      const token = await getToken()
      return apiFetch(token!, '/admin/temporal/cfbd-sync-status')
    },
    refetchInterval: 30_000, // poll every 30s
  })
}
