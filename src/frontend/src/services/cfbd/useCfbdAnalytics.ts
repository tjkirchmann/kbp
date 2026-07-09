import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@clerk/react'
import { apiFetch } from '../../lib/api'

// ── Response types ─────────────────────────────────────────────────

export interface SeasonListItem {
  season: number
}

export interface TeamRatingRow {
  team: string
  conference: string | null
  rating: number | null
  ranking: number | null
  logo: string | null
  color: string | null
}

export interface OverUnderTeam {
  team: string
  logo: string | null
  color: string | null
  expected_wins: number
  actual_wins: number
  delta: number
}

export interface StandingsRow {
  team: string
  logo: string | null
  conf_wins: number
  conf_losses: number
  overall_wins: number
  overall_losses: number
}

export interface SeasonSummary {
  season: number
  team_count: number
  ratings: {
    elo: TeamRatingRow[]
    sp_plus: TeamRatingRow[]
    srs: TeamRatingRow[]
    fpi: TeamRatingRow[]
  }
  overachievers: OverUnderTeam[]
  underachievers: OverUnderTeam[]
  standings: Record<string, StandingsRow[]>
}

export interface PlayerLeader {
  player: string
  team: string
  logo: string | null
  stat_value: string
}

export interface PlayerLeaders {
  season: number
  category: string
  leaders: PlayerLeader[]
}

export interface TeamSlicerEntry {
  team: string
  conference: string | null
  logo: string | null
  color: string | null
  abbreviation: string | null
  value: number | null
}

export interface TeamSlicer {
  season: number
  metric: string
  teams: TeamSlicerEntry[]
}

export interface TeamScheduleGame {
  game_id: number
  opponent: string
  opponent_logo: string | null
  date: string | null
  home_away: string
  team_score: number | null
  opponent_score: number | null
  result: string
  bowl_name: string | null
}

export interface TeamPercentile {
  stat: string
  label: string
  value: string | null
  percentile: number | null
  rank: number | null
  total: number
}

export interface TeamDetail {
  season: number
  team: string
  logo: string | null
  color: string | null
  conference: string | null
  record: string | null
  expected_wins: number | null
  schedule: TeamScheduleGame[]
  player_leaders: Record<string, PlayerLeader[]>
  percentiles: TeamPercentile[]
}

// ── Hooks ──────────────────────────────────────────────────────────

export function useAvailableSeasons() {
  const { getToken } = useAuth()
  return useQuery<number[]>({
    queryKey: ['admin', 'cfbd', 'analytics', 'seasons'],
    queryFn: async () => {
      const token = await getToken()
      const data = await apiFetch(token!, '/admin/cfbd/analytics/seasons')
      return (data as { seasons: number[] }).seasons
    },
    staleTime: 10 * 60 * 1000,
  })
}

export function useSeasonSummary(season: number | null) {
  const { getToken } = useAuth()
  return useQuery<SeasonSummary>({
    queryKey: ['admin', 'cfbd', 'analytics', 'season-summary', season],
    enabled: season != null,
    queryFn: async () => {
      const token = await getToken()
      return apiFetch(token!, `/admin/cfbd/analytics/season-summary?season=${season}`)
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function usePlayerLeaders(season: number | null, category: string) {
  const { getToken } = useAuth()
  return useQuery<PlayerLeaders>({
    queryKey: ['admin', 'cfbd', 'analytics', 'player-leaders', season, category],
    enabled: season != null,
    queryFn: async () => {
      const token = await getToken()
      return apiFetch(
        token!,
        `/admin/cfbd/analytics/player-leaders?season=${season}&category=${category}`,
      )
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useTeamSlicer(season: number | null, metric: string, conference?: string | null) {
  const { getToken } = useAuth()
  return useQuery<TeamSlicer>({
    queryKey: ['admin', 'cfbd', 'analytics', 'team-slicer', season, metric, conference ?? 'all'],
    enabled: season != null,
    queryFn: async () => {
      const token = await getToken()
      const params = new URLSearchParams()
      params.set('season', String(season))
      params.set('metric', metric)
      if (conference) params.set('conference', conference)
      return apiFetch(token!, `/admin/cfbd/analytics/team-slicer?${params}`)
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useTeamDetail(season: number | null, team: string | null) {
  const { getToken } = useAuth()
  return useQuery<TeamDetail>({
    queryKey: ['admin', 'cfbd', 'analytics', 'team-detail', season, team],
    enabled: season != null && team != null,
    queryFn: async () => {
      const token = await getToken()
      return apiFetch(
        token!,
        `/admin/cfbd/analytics/team-detail?season=${season}&team=${encodeURIComponent(team!)}`,
      )
    },
    staleTime: 5 * 60 * 1000,
  })
}
