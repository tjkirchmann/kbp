import type { TeamScheduleGame } from '@/services/cfbd/useCfbdAnalytics'

interface Props {
  schedule: TeamScheduleGame[]
  team: string
}

export default function TeamSchedulePanel({ schedule }: Props) {
  if (schedule.length === 0) {
    return (
      <div className="glass-panel rounded-xl p-3">
        <h3 className="text-xs font-semibold text-foreground mb-1">
          Schedule
        </h3>
        <p className="text-xs text-muted-foreground">
          No game data available.
        </p>
      </div>
    )
  }

  return (
    <div className="glass-panel rounded-xl flex flex-col">
      <div className="shrink-0 p-3 pb-2">
        <h3 className="text-xs font-semibold text-foreground">
          Schedule & Results
        </h3>
      </div>

      <div className="flex-1 min-h-0 overflow-auto scrollbar-themed">
        <div className="flex flex-col">
          {schedule.map((g) => (
            <div
              key={g.game_id}
              className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-white/[0.04] transition-colors border-t border-border/10"
            >
              {/* Result badge */}
              <div
                className={`shrink-0 w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold ${
                  g.result === 'W'
                    ? 'bg-emerald-500/15 text-emerald-400'
                    : g.result === 'L'
                      ? 'bg-rose-500/15 text-rose-400'
                      : 'bg-white/[0.04] text-muted-foreground'
                }`}
              >
                {g.result}
              </div>

              {/* Opponent */}
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                {g.opponent_logo ? (
                  <img
                    src={g.opponent_logo}
                    alt={g.opponent}
                    className="size-4 rounded object-contain"
                  />
                ) : (
                  <div className="size-4 rounded bg-white/10" />
                )}
                <span className="text-xs text-foreground truncate">
                  {g.opponent}
                </span>
              </div>

              {/* Home/Away marker */}
              <span className="text-[10px] text-muted-foreground w-8 text-center">
                {g.home_away === 'home' ? 'vs' : '@'}
              </span>

              {/* Score */}
              <span className="text-xs tabular-nums text-foreground font-medium w-14 text-right">
                {g.team_score != null && g.opponent_score != null
                  ? `${g.team_score}-${g.opponent_score}`
                  : '—'}
              </span>

              {/* Bowl indicator */}
              {g.bowl_name && (
                <span className="text-[10px] text-amber-400/80 font-medium">
                  Bowl
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
