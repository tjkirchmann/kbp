import { useState, useEffect, useCallback } from 'react'
import { ChevronDown, ChevronLeft, Loader2 } from 'lucide-react'
import {
  useAvailableSeasons,
  useSeasonSummary,
} from '@/services/cfbd/useCfbdAnalytics'
import RatingsCharts from './analysis/RatingsCharts'
import OverUnderCards from './analysis/OverUnderCards'
import ConferenceStandings from './analysis/ConferenceStandings'
import PlayerLeaders from './analysis/PlayerLeaders'
import TeamSlicer from './analysis/TeamSlicer'
import TeamDashboard from './analysis/TeamDashboard'

export default function SeasonDashboard() {
  // ── Season selection ──
  const { data: seasons } = useAvailableSeasons()
  const [season, setSeason] = useState<number | null>(null)

  useEffect(() => {
    if (seasons && seasons.length > 0 && season === null) {
      setSeason(seasons[0])
    }
  }, [seasons, season])

  const { data: summary, isLoading, isError } = useSeasonSummary(season)

  // ── Team drill-down ──
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null)

  const handleSelectTeam = useCallback((team: string) => {
    setSelectedTeam(team)
  }, [])

  const handleBackToSeason = useCallback(() => {
    setSelectedTeam(null)
  }, [])

  // ── Team Dashboard mode ──
  if (selectedTeam && season) {
    return (
      <TeamDashboard
        season={season}
        team={selectedTeam}
        onBack={handleBackToSeason}
      />
    )
  }

  // ── Loading state ──
  if (isLoading || !summary) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center">
        <div className="flex flex-col items-center gap-2.5 text-muted-foreground/40">
          <Loader2 className="size-6 animate-spin" />
          <span className="text-xs">Loading season data…</span>
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center">
        <span className="text-sm text-muted-foreground">
          Failed to load season data.
        </span>
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3">
      {/* Navigation row: season selector + breadcrumb */}
      <div className="flex items-center gap-3 text-sm">
        <div className="relative">
          <select
            value={season ?? ''}
            onChange={(e) => setSeason(Number(e.target.value))}
            className="appearance-none rounded-lg border border-border/20 bg-white/[0.03] px-3 py-1.5 pr-8 text-sm font-medium text-foreground outline-none transition-colors focus:ring-1 focus:ring-primary/40 cursor-pointer"
          >
            {seasons?.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
        </div>

        <div className="flex items-center gap-2 text-muted-foreground">
          <ChevronLeft className="size-3.5" />
          <span className="font-medium text-foreground">
            {season} Season
          </span>
        </div>

        <span className="text-xs text-muted-foreground ml-auto">
          {summary.team_count} teams
        </span>
      </div>

      {/* 3-column dashboard layout */}
      <div className="flex-1 min-h-0 grid grid-cols-[1fr_280px_320px] gap-3">
        {/* Left column: Charts + Player Leaders */}
        <div className="min-h-0 flex flex-col gap-3">
          <div className="flex-1 min-h-0">
            <RatingsCharts season={season!} summary={summary} />
          </div>
          <div className="shrink-0">
            <PlayerLeaders season={season!} />
          </div>
        </div>

        {/* Center column: Over/Under + Conference Standings */}
        <div className="min-h-0 flex flex-col gap-3 overflow-auto">
          <OverUnderCards
            overachievers={summary.overachievers}
            underachievers={summary.underachievers}
          />
          <ConferenceStandings standings={summary.standings} />
        </div>

        {/* Right column: Team Slicer */}
        <div className="min-h-0">
          <TeamSlicer
            season={season!}
            onSelectTeam={handleSelectTeam}
          />
        </div>
      </div>
    </div>
  )
}
