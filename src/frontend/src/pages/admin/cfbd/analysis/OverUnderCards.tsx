import { TrendingUp, TrendingDown } from 'lucide-react'
import type { OverUnderTeam } from '@/services/cfbd/useCfbdAnalytics'

function TeamRow({
  team,
  label,
  icon,
}: {
  team: OverUnderTeam
  label: string
  icon: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-white/[0.04] transition-colors">
      {team.logo ? (
        <img
          src={team.logo}
          alt={team.team}
          className="size-7 rounded object-contain"
        />
      ) : (
        <div
          className="size-7 rounded flex items-center justify-center text-[9px] font-bold text-white"
          style={{ backgroundColor: team.color || '#333' }}
        >
          {team.team.slice(0, 2).toUpperCase()}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground truncate">{team.team}</p>
        <p className="text-[10px] text-muted-foreground">
          exp {team.expected_wins} · act {team.actual_wins}
        </p>
      </div>
      <div className="flex items-center gap-1 text-xs font-semibold tabular-nums">
        {icon}
        <span className={label === 'Over' ? 'text-emerald-400' : 'text-rose-400'}>
          {team.delta > 0 ? '+' : ''}
          {team.delta}
        </span>
      </div>
    </div>
  )
}

interface Props {
  overachievers: OverUnderTeam[]
  underachievers: OverUnderTeam[]
}

export default function OverUnderCards({ overachievers, underachievers }: Props) {
  return (
    <div className="flex flex-col gap-3">
      {/* Overachievers */}
      <div className="glass-panel rounded-xl p-3">
        <div className="flex items-center gap-1.5 mb-2">
          <TrendingUp className="size-3.5 text-emerald-400" />
          <h3 className="text-xs font-semibold text-foreground">Overachievers</h3>
        </div>
        <div className="flex flex-col">
          {overachievers.map((t) => (
            <TeamRow key={t.team} team={t} label="Over" icon={<TrendingUp className="size-3 text-emerald-400/60" />} />
          ))}
        </div>
      </div>

      {/* Underachievers */}
      <div className="glass-panel rounded-xl p-3">
        <div className="flex items-center gap-1.5 mb-2">
          <TrendingDown className="size-3.5 text-rose-400" />
          <h3 className="text-xs font-semibold text-foreground">Underachievers</h3>
        </div>
        <div className="flex flex-col">
          {underachievers.map((t) => (
            <TeamRow key={t.team} team={t} label="Under" icon={<TrendingDown className="size-3 text-rose-400/60" />} />
          ))}
        </div>
      </div>
    </div>
  )
}
