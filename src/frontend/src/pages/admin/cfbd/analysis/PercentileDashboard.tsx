import type { TeamPercentile } from '@/services/cfbd/useCfbdAnalytics'

interface Props {
  percentiles: TeamPercentile[]
  teamColor: string
}

function percentileColor(pct: number | null): string {
  if (pct == null) return 'rgba(255,255,255,0.06)'
  if (pct >= 90) return '#3fb950'
  if (pct >= 75) return '#56bf6b'
  if (pct >= 60) return '#009cde'
  if (pct >= 40) return '#7a8099'
  if (pct >= 25) return '#f0a429'
  return '#e5534b'
}

export default function PercentileDashboard({
  percentiles,
  teamColor,
}: Props) {
  if (percentiles.length === 0) return null

  return (
    <div className="glass-panel rounded-xl p-3">
      <h3 className="text-xs font-semibold text-foreground mb-2">
        National Percentiles
      </h3>
      <p className="text-[10px] text-muted-foreground mb-2">
        Percentile rank among all FBS teams
      </p>

      <div className="flex flex-col gap-1.5">
        {percentiles.map((p) => {
          const barColor = percentileColor(p.percentile)
          return (
            <div key={p.stat} className="flex items-center gap-2">
              {/* Label */}
              <span className="w-28 shrink-0 text-[10px] text-muted-foreground truncate">
                {p.label}
              </span>

              {/* Bar */}
              <div className="flex-1 h-3 rounded-full bg-white/[0.06] overflow-hidden relative">
                <div
                  className="absolute inset-y-0 left-0 rounded-full transition-all"
                  style={{
                    width: `${p.percentile ?? 0}%`,
                    backgroundColor: barColor,
                  }}
                />
              </div>

              {/* Percentile */}
              <span
                className="w-10 shrink-0 text-right text-[10px] font-semibold tabular-nums"
                style={{ color: barColor }}
              >
                {p.percentile != null ? `P${Math.round(p.percentile)}` : '—'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
