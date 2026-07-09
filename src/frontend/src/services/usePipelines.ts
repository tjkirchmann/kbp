import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@clerk/react'
import { apiFetch } from '../lib/api'

// ── types (mirror app/routers/pipelines.py schemas) ──────────────────────────

export interface PortSpec {
  name: string
  kind: string // video | image | audio | json | text
}

/** One property in a Pydantic model_json_schema() output. */
export interface JsonSchemaProp {
  type?: string
  title?: string
  description?: string
  default?: unknown
  enum?: string[]
  minimum?: number
  maximum?: number
  exclusiveMinimum?: number
  anyOf?: JsonSchemaProp[]
  $ref?: string
}

export interface ParamsSchema {
  properties?: Record<string, JsonSchemaProp>
  required?: string[]
  $defs?: Record<string, JsonSchemaProp>
}

export interface StepDef {
  name: string
  label: string
  category: string // source | transform | analyze | escape hatch
  params_schema: ParamsSchema
  inputs: PortSpec[]
  outputs: PortSpec[]
}

export interface GraphNode {
  id: string
  type: string
  position: { x: number; y: number }
  params: Record<string, unknown>
}

export interface GraphEdge {
  id: string
  source: string
  source_port: string
  target: string
  target_port: string
}

export interface PipelineGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
  viewport: { x: number; y: number; zoom: number }
}

export interface Pipeline {
  id: number
  name: string
  description: string | null
  graph: PipelineGraph
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface PipelineSaveResult {
  pipeline: Pipeline
  warnings: string[]
}

export interface PipelineRun {
  id: number
  pipeline_id: number
  project_id: number
  workflow_id: string
  status: string // queued | running | succeeded | failed | canceled
  error: string | null
  created_at: string
  started_at: string | null
  finished_at: string | null
}

// ── keys ─────────────────────────────────────────────────────────────────────

export const pipelineKeys = {
  all: ['admin', 'pipelines'] as const,
  detail: (id: number) => ['admin', 'pipelines', id] as const,
  steps: ['admin', 'pipelines', 'steps'] as const,
}

// ── hooks ────────────────────────────────────────────────────────────────────

export function useStepPalette() {
  const { getToken } = useAuth()
  return useQuery<StepDef[]>({
    queryKey: pipelineKeys.steps,
    // The palette is code-defined on the backend — it only changes on deploy.
    staleTime: Infinity,
    queryFn: async () => {
      const token = await getToken()
      return apiFetch(token!, '/admin/pipelines/steps')
    },
  })
}

export function usePipelines() {
  const { getToken } = useAuth()
  return useQuery<Pipeline[]>({
    queryKey: pipelineKeys.all,
    queryFn: async () => {
      const token = await getToken()
      return apiFetch(token!, '/admin/pipelines/')
    },
  })
}

export function usePipeline(id: number | null) {
  const { getToken } = useAuth()
  return useQuery<Pipeline>({
    queryKey: pipelineKeys.detail(id ?? -1),
    enabled: id !== null,
    queryFn: async () => {
      const token = await getToken()
      return apiFetch(token!, `/admin/pipelines/${id}`)
    },
  })
}

export function useCreatePipeline() {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (name: string): Promise<Pipeline> => {
      const token = await getToken()
      return apiFetch(token!, '/admin/pipelines/', {
        method: 'POST',
        body: JSON.stringify({ name }),
      })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: pipelineKeys.all }),
  })
}

export function useSavePipeline() {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: {
      id: number
      graph: PipelineGraph
      name?: string
    }): Promise<PipelineSaveResult> => {
      const token = await getToken()
      return apiFetch(token!, `/admin/pipelines/${args.id}`, {
        method: 'PUT',
        body: JSON.stringify({ graph: args.graph, name: args.name }),
      })
    },
    onSuccess: (result) => {
      qc.setQueryData(pipelineKeys.detail(result.pipeline.id), result.pipeline)
      qc.invalidateQueries({ queryKey: pipelineKeys.all })
    },
  })
}

export function useDeletePipeline() {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const token = await getToken()
      return apiFetch(token!, `/admin/pipelines/${id}`, { method: 'DELETE' })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: pipelineKeys.all }),
  })
}

export function useStartRun() {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: {
      pipelineId: number
      projectId: number
    }): Promise<PipelineRun> => {
      const token = await getToken()
      return apiFetch(token!, `/admin/pipelines/${args.pipelineId}/run`, {
        method: 'POST',
        body: JSON.stringify({ project_id: args.projectId }),
      })
    },
    onSuccess: (run) =>
      qc.invalidateQueries({ queryKey: ['admin', 'projects', run.project_id, 'runs'] }),
  })
}
