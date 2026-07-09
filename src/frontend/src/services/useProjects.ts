import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@clerk/react'
import { apiFetch } from '../lib/api'
import type { PipelineRun } from './usePipelines'
import type { LibraryFile } from './useAdminLibrary'
import { isTerminal } from './usePipelineRun'

// ── types (mirror app/routers/projects.py schemas) ───────────────────────────

export interface Project {
  id: number
  name: string
  description: string | null
  owner_id: number
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface ProjectRun extends PipelineRun {
  pipeline_name: string
}

// ── keys ─────────────────────────────────────────────────────────────────────

export const projectKeys = {
  all: ['admin', 'projects'] as const,
  detail: (id: number) => ['admin', 'projects', id] as const,
  files: (id: number) => ['admin', 'projects', id, 'files'] as const,
  runs: (id: number) => ['admin', 'projects', id, 'runs'] as const,
}

// ── hooks ────────────────────────────────────────────────────────────────────

export function useProjects() {
  const { getToken } = useAuth()
  return useQuery<Project[]>({
    queryKey: projectKeys.all,
    queryFn: async () => {
      const token = await getToken()
      return apiFetch(token!, '/admin/projects/')
    },
  })
}

export function useProject(id: number | null) {
  const { getToken } = useAuth()
  return useQuery<Project>({
    queryKey: projectKeys.detail(id ?? -1),
    enabled: id !== null,
    queryFn: async () => {
      const token = await getToken()
      return apiFetch(token!, `/admin/projects/${id}`)
    },
  })
}

export function useCreateProject() {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (name: string): Promise<Project> => {
      const token = await getToken()
      return apiFetch(token!, '/admin/projects/', {
        method: 'POST',
        body: JSON.stringify({ name }),
      })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKeys.all }),
  })
}

export function useUpdateProject() {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: {
      id: number
      name?: string
      description?: string
    }): Promise<Project> => {
      const token = await getToken()
      return apiFetch(token!, `/admin/projects/${args.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: args.name, description: args.description }),
      })
    },
    onSuccess: (project) => {
      qc.setQueryData(projectKeys.detail(project.id), project)
      qc.invalidateQueries({ queryKey: projectKeys.all })
    },
  })
}

export function useDeleteProject() {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const token = await getToken()
      return apiFetch(token!, `/admin/projects/${id}`, { method: 'DELETE' })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKeys.all }),
  })
}

export function useProjectFiles(id: number | null) {
  const { getToken } = useAuth()
  return useQuery<LibraryFile[]>({
    queryKey: projectKeys.files(id ?? -1),
    enabled: id !== null,
    queryFn: async () => {
      const token = await getToken()
      return apiFetch(token!, `/admin/projects/${id}/files`)
    },
  })
}

/** Polls while any run in the project is still active, stops once all are terminal. */
export function useProjectRuns(id: number | null) {
  const { getToken } = useAuth()
  return useQuery<ProjectRun[]>({
    queryKey: projectKeys.runs(id ?? -1),
    enabled: id !== null,
    refetchInterval: (query) =>
      query.state.data?.some((run) => !isTerminal(run.status)) ? 2000 : false,
    queryFn: async () => {
      const token = await getToken()
      return apiFetch(token!, `/admin/projects/${id}/runs`)
    },
  })
}
