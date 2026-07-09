import type { PlayerLeader } from '@/services/cfbd/useCfbdAnalytics'

interface Props {
  leaders: Record<string, PlayerLeader[]>
}

const CATEGORY_LABELS: Record<string, string> = {
  passing: 'Passing',
  rushing: 'Rushing',
  receiving: 'Receiving',
  tackles: 'Tackles',
  interceptions: 'INT',
}

export default function TeamPlayerLeaders({ leaders }: Props) {
  const entries = Object.entries(leaders).filter(([, rows]) => rows.length > 0)

  if (entries.length === 0) return null

  return (
    <div className="glass-panel rounded-xl p-3">
      <h3 className="text-xs font-semibold text-foreground mb-2">Player Leaders</h3>

      <div className="grid grid-cols-2 gap-2">
        {entries.map(([cat, rows]) => (
          <div key={cat} className="rounded-lg bg-white/[0.03] p-2">
            <p className="text-[10px] font-medium text-muted-foreground mb-1">
              {CATEGORY_LABELS[cat] || cat}
            </p>
            {rows.slice(0, 3).map((p, i) => (
              <div key={`${cat}-${p.player}-${i}`} className="flex items-center gap-1.5 py-0.5">
                <span className="w-3 text-[10px] text-muted-foreground tabular-nums">{i + 1}</span>
                <span className="flex-1 text-xs text-foreground truncate">{p.player}</span>
                <span className="text-[10px] font-semibold text-primary tabular-nums">
                  {p.stat_value}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
