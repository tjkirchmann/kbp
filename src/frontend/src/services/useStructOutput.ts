import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@clerk/react'
import { ApiError } from '@/lib/apiError'

const API = import.meta.env.VITE_API_URL

async function authFetch<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })
  if (!res.ok) throw new ApiError(res.status)
  return res.json() as Promise<T>
}

export type StructTier = 'static' | 'dynamic'

/** List-view summary — one row per definition (uniform across both tiers). */
export interface StructDefinitionSummary {
  name: string
  tier: StructTier
  source: string
  field_count: number
  model: string
  cron: string | null
  enabled: boolean
  locked: boolean
}

/** A single output field. Static detail returns {name,type}; dynamic adds the spec. */
export interface StructField {
  name: string
  type: string
  description?: string
  enum?: string[]
}

/** Definition detail. Tier-specific source columns are optional. */
export interface StructDefinitionDetail {
  name: string
  tier: StructTier
  source?: string // static (resolved table name)
  source_table?: string // dynamic
  source_pk?: string // dynamic
  source_filter?: string // dynamic
  source_label_fields: string[]
  fields: StructField[]
  prompt_template: string
  model: string
  cron: string | null
  enabled: boolean
  locked: boolean
}

/** One generated row. Output columns are flat at the top level (values unknown —
 *  ints, strings, ISO timestamps, etc.); joined source labels nest under _labels. */
export interface StructOutputRow {
  _labels: Record<string, unknown>
  [key: string]: unknown
}

/** Response shape of GET /{name}/outputs (see backend list_outputs). */
export interface StructOutputs {
  label_fields: string[]
  rows: StructOutputRow[]
}

/** All structured-output definitions (static ∪ dynamic). */
export function useStructDefinitions() {
  const { getToken } = useAuth()
  return useQuery<StructDefinitionSummary[]>({
    queryKey: ['admin', 'struct-output', 'definitions'],
    queryFn: async () => {
      const token = await getToken()
      return authFetch<StructDefinitionSummary[]>(token!, '/admin/struct-output/')
    },
  })
}

/** One definition's schema, prompt, and source config. */
export function useStructDefinition(name: string | undefined) {
  const { getToken } = useAuth()
  return useQuery<StructDefinitionDetail>({
    queryKey: ['admin', 'struct-output', 'definition', name],
    enabled: !!name,
    queryFn: async () => {
      const token = await getToken()
      return authFetch<StructDefinitionDetail>(
        token!,
        `/admin/struct-output/${encodeURIComponent(name!)}`,
      )
    },
  })
}

/** A definition's generated rows (read-only; refetches on window focus by default). */
export function useStructOutputs(name: string | undefined) {
  const { getToken } = useAuth()
  return useQuery<StructOutputs>({
    queryKey: ['admin', 'struct-output', 'outputs', name],
    enabled: !!name,
    queryFn: async () => {
      const token = await getToken()
      return authFetch<StructOutputs>(
        token!,
        `/admin/struct-output/${encodeURIComponent(name!)}/outputs`,
      )
    },
  })
}
