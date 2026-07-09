import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@clerk/react'
import { apiFetch } from '../../lib/api'

export interface CfbdTableFilters {
  season?: number
  season_type?: string
  week?: number
  team?: string
  school?: string
  conference?: string
  classification?: string
  game_id?: number
  provider?: string
  poll?: string
  position?: string
  category?: string
  stat_name?: string
  stars?: number
  search?: string
  sort?: string
  order?: string
  coach_id?: number
  limit?: number
  offset?: number
}

export interface CfbdDistinctValuesResponse {
  values: string[]
}

export interface CfbdTableResponse {
  rows: Record<string, unknown>[]
  total: number
  seasonMax: number | null
  teamLogos: Record<string, string | null>
}

interface CfbdTableApiResponse {
  rows: Record<string, unknown>[]
  total: number
  season_max: number | null
  team_logos: Record<string, string | null>
}

function toQueryString(filters?: CfbdTableFilters): string {
  if (!filters) return ''

  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue
    params.set(key, String(value))
  }

  const query = params.toString()
  return query ? `?${query}` : ''
}

export function useCfbdTable(slug: string, filters?: CfbdTableFilters, enabled = true) {
  const { getToken } = useAuth()

  return useQuery<CfbdTableResponse>({
    queryKey: ['admin', 'cfbd', slug, filters ?? {}],
    enabled: Boolean(slug) && enabled,
    queryFn: async () => {
      const token = await getToken()
      const query = toQueryString(filters)
      const data = await apiFetch(token!, `/admin/cfbd/${slug}${query}`)
      const response = data as CfbdTableApiResponse

      return {
        rows: response.rows,
        total: response.total,
        seasonMax: response.season_max,
        teamLogos: response.team_logos,
      }
    },
  })
}

export function useCfbdDistinctValues(slug: string, column: string, enabled = true) {
  const { getToken } = useAuth()

  return useQuery<string[]>({
    queryKey: ['admin', 'cfbd', slug, 'distinct', column],
    enabled: Boolean(slug) && Boolean(column) && enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const token = await getToken()
      const data = await apiFetch(token!, `/admin/cfbd/${slug}/distinct/${column}`)
      const response = data as CfbdDistinctValuesResponse
      return response.values
    },
  })
}
