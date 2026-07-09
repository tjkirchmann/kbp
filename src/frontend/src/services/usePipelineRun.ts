import { useQuery, useMutation } from '@tanstack/react-query'
import { useAuth } from '@clerk/react'
import { apiFetch } from '../lib/api'
import type { PipelineRun } from './usePipelines'

export interface NodeRun {
  node_id: string
  step_type: string
  status: string // queued | running | succeeded | failed | canceled | skipped
  progress: number | null
  log_tail: string | null
  error: string | null
  attempt: number
  started_at: string | null
  finished_at: string | null
  updated_at: string
}

export interface Artifact {
  id: number
  node_id: string
  output_port: string
  library_file_id: number | null
  name: string
  kind: string
  content_type: string | null
  size_bytes: number | null
  meta: Record<string, unknown>
  created_at: string
}

export interface RunStatus {
  run: PipelineRun
  node_runs: NodeRun[]
  artifacts: Artifact[]
}

export const TERMINAL_RUN_STATUSES = ['succeeded', 'failed', 'canceled']

export function isTerminal(status: string | undefined): boolean {
  return status !== undefined && TERMINAL_RUN_STATUSES.includes(status)
}

/** Live run observability: polls every second while the run is active, stops
 * on its own once the run reaches a terminal status. */
export function useRunStatus(runId: number | null) {
  const { getToken } = useAuth()
  return useQuery<RunStatus>({
    queryKey: ['admin', 'pipelines', 'runs', runId],
    enabled: runId !== null,
    refetchInterval: (query) => (isTerminal(query.state.data?.run.status) ? false : 1000),
    queryFn: async () => {
      const token = await getToken()
      return apiFetch(token!, `/admin/pipelines/runs/${runId}`)
    },
  })
}

export function useRunHistory(pipelineId: number | null) {
  const { getToken } = useAuth()
  return useQuery<PipelineRun[]>({
    queryKey: ['admin', 'pipelines', pipelineId, 'runs'],
    enabled: pipelineId !== null,
    queryFn: async () => {
      const token = await getToken()
      return apiFetch(token!, `/admin/pipelines/${pipelineId}/runs`)
    },
  })
}

export function useCancelRun() {
  const { getToken } = useAuth()
  return useMutation({
    mutationFn: async (runId: number) => {
      const token = await getToken()
      return apiFetch(token!, `/admin/pipelines/runs/${runId}/cancel`, {
        method: 'POST',
      })
    },
  })
}

/** Presigned preview URL — fetched on demand and never cached (URLs expire). */
export function useArtifactPreview() {
  const { getToken } = useAuth()
  return useMutation({
    mutationFn: async (artifactId: number): Promise<{ url: string }> => {
      const token = await getToken()
      return apiFetch(token!, `/admin/pipelines/artifacts/${artifactId}/preview`)
    },
  })
}

export function useArtifactDownload() {
  const { getToken } = useAuth()
  return useMutation({
    mutationFn: async (artifactId: number) => {
      const token = await getToken()
      const { url } = await apiFetch(token!, `/admin/pipelines/artifacts/${artifactId}/download`)
      window.open(url, '_blank')
    },
  })
}
