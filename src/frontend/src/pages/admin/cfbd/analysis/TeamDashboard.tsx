import { ArrowLeft, Loader2 } from 'lucide-react'
import { useTeamDetail } from '@/services/cfbd/useCfbdAnalytics'
import ExpectedWinsGauge from './ExpectedWinsGauge'
import PercentileDashboard from './PercentileDashboard'
import TeamSchedulePanel from './TeamSchedulePanel'
import TeamPlayerLeaders from './TeamPlayerLeaders'

interface Props {
  season: number
  team: string
  onBack: () => void
}

export default function TeamDashboard({ season, team, onBack }: Props) {
  const { data, isLoading, isError } = useTeamDetail(season, team)

  if (isLoading) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center">
        <div className="flex flex-col items-center gap-2.5 text-muted-foreground/40">
          <Loader2 className="size-6 animate-spin" />
          <span className="text-xs">Loading {team}…</span>
        </div>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center">
        <span className="text-sm text-muted-foreground">Failed to load team data.</span>
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-3.5" />
          <span className="text-xs">{season}</span>
        </button>
        <span className="text-muted-foreground text-xs">›</span>
        <div className="flex items-center gap-2">
          {data.logo ? (
            <img src={data.logo} alt={data.team} className="size-5 rounded object-contain" />
          ) : (
            <div
              className="size-5 rounded flex items-center justify-center text-[8px] font-bold text-white"
              style={{ backgroundColor: data.color || '#333' }}
            >
              {data.team.slice(0, 2).toUpperCase()}
            </div>
          )}
          <span className="font-medium text-foreground">{data.team}</span>
          {data.record && (
            <span className="text-xs text-muted-foreground tabular-nums">{data.record}</span>
          )}
        </div>
      </div>

      {/* 3-column layout */}
      <div className="flex-1 min-h-0 grid grid-cols-[1fr_280px_320px] gap-3">
        {/* Left: Player leaders */}
        <div className="min-h-0 flex flex-col gap-3 overflow-auto">
          <TeamPlayerLeaders leaders={data.player_leaders} />
        </div>

        {/* Center: Expected Wins + Percentiles */}
        <div className="min-h-0 flex flex-col gap-3 overflow-auto">
          <ExpectedWinsGauge expectedWins={data.expected_wins} record={data.record} />
          <PercentileDashboard percentiles={data.percentiles} teamColor={data.color || '#009cde'} />
        </div>

        {/* Right: Schedule */}
        <div className="min-h-0">
          <TeamSchedulePanel schedule={data.schedule} team={data.team} />
        </div>
      </div>
    </div>
  )
}
