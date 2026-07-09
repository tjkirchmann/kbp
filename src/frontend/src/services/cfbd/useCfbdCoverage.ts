import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@clerk/react'
import { apiFetch } from '../../lib/api'

export interface CoverageSeasonItem {
  year: number
  complete: boolean
  row_count: number
  last_synced_at: string | null
}

export interface CoverageFactEndpoint {
  endpoint: string
  label: string
  group: string
  seasons: CoverageSeasonItem[]
}

export interface CoverageGameSeason {
  season_year: number
  total: number
  completed: number
  last_synced_at: string | null
}

export interface CoverageDimension {
  name: string
  label: string
  count: number
  last_synced_at: string | null
}

export interface CoverageData {
  facts: CoverageFactEndpoint[]
  games: CoverageGameSeason[]
  dimensions: CoverageDimension[]
  plays: { seasons: { season: number; play_count: number; games_with_plays: number }[] }
}

export function useCfbdCoverage() {
  const { getToken } = useAuth()

  return useQuery<CoverageData>({
    queryKey: ['admin', 'cfbd', 'coverage'],
    queryFn: async () => {
      const token = await getToken()
      return apiFetch(token!, '/admin/cfbd/coverage')
    },
  })
}
