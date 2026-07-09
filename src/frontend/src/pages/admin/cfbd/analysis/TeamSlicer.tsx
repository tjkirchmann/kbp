import { useState, useMemo } from 'react'
import { Search, Loader2 } from 'lucide-react'
import { useTeamSlicer } from '@/services/cfbd/useCfbdAnalytics'

const METRICS = [
  { key: 'elo', label: 'Elo' },
  { key: 'sp_plus', label: 'SP+' },
  { key: 'fpi', label: 'FPI' },
  { key: 'srs', label: 'SRS' },
  { key: 'ap_poll', label: 'AP Poll' },
] as const

const CONFERENCE_GROUPS = [
  ['All FBS', 'SEC', 'Big Ten', 'ACC', 'Big 12'],
  ['Mountain West', 'AAC', 'Sun Belt', 'MAC', 'Conference USA'],
]

interface Props {
  season: number
  onSelectTeam: (team: string) => void
}

export default function TeamSlicer({ season, onSelectTeam }: Props) {
  const [metric, setMetric] = useState('elo')
  const [conference, setConference] = useState<string | undefined>(undefined)
  const [search, setSearch] = useState('')
  const [groupIdx, setGroupIdx] = useState(0)

  const { data, isLoading } = useTeamSlicer(season, metric, conference)

  const filteredTeams = useMemo(() => {
    if (!data?.teams) return []
    if (!search.trim()) return data.teams
    const q = search.toLowerCase()
    return data.teams.filter(
      (t) => t.team.toLowerCase().includes(q) || t.abbreviation?.toLowerCase().includes(q),
    )
  }, [data, search])

  const currentGroup = CONFERENCE_GROUPS[groupIdx] ?? CONFERENCE_GROUPS[0]

  // Cycle through conference groups
  const handleNextGroup = () => {
    setGroupIdx((i) => (i + 1) % CONFERENCE_GROUPS.length)
  }

  return (
    <div className="glass-panel rounded-xl flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 p-3 pb-2">
        <h3 className="text-xs font-semibold text-foreground mb-2">Team Rankings</h3>

        {/* Metric filter chips */}
        <div className="flex flex-wrap gap-1 mb-2">
          {METRICS.map((m) => (
            <button
              key={m.key}
              onClick={() => setMetric(m.key)}
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
                metric === m.key
                  ? 'bg-primary/15 text-primary border border-primary/20'
                  : 'text-muted-foreground hover:text-foreground border border-transparent'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Conference filter chips + cycle button */}
        <div className="flex items-center gap-1">
          <div className="flex flex-wrap gap-1 flex-1">
            {currentGroup.map((conf) => {
              const isActive = conf === 'All FBS' ? conference === undefined : conference === conf
              return (
                <button
                  key={conf}
                  onClick={() => setConference(conf === 'All FBS' ? undefined : conf)}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
                    isActive
                      ? 'bg-primary/15 text-primary border border-primary/20'
                      : 'text-muted-foreground hover:text-foreground border border-transparent'
                  }`}
                >
                  {conf === 'All FBS' ? 'All' : conf}
                </button>
              )
            })}
          </div>
          <button
            onClick={handleNextGroup}
            className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors border border-transparent hover:border-border/20"
          >
            ···
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="shrink-0 px-3 pb-2">
        <div className="flex items-center gap-1.5 rounded-lg border border-border/20 bg-white/[0.03] px-2 py-1">
          <Search className="size-3 text-muted-foreground shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter teams…"
            className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
          />
        </div>
      </div>

      {/* Team list */}
      <div className="flex-1 min-h-0 overflow-auto scrollbar-themed">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-4 animate-spin text-muted-foreground/40" />
          </div>
        ) : (
          <div className="flex flex-col pb-1">
            {filteredTeams.map((t, i) => (
              <button
                key={t.team}
                onClick={() => onSelectTeam(t.team)}
                className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-white/[0.04] transition-colors text-left"
              >
                {/* Rank number */}
                <span className="w-5 text-right text-[10px] font-semibold text-muted-foreground tabular-nums">
                  {i + 1}
                </span>

                {/* Team logo/color badge */}
                {t.logo ? (
                  <img src={t.logo} alt={t.team} className="size-6 rounded object-contain" />
                ) : (
                  <div
                    className="size-6 rounded flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                    style={{
                      backgroundColor: t.color || '#333',
                    }}
                  >
                    {t.abbreviation?.slice(0, 2) || t.team.slice(0, 2).toUpperCase()}
                  </div>
                )}

                {/* Team name */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">{t.team}</p>
                </div>

                {/* Metric value */}
                <span className="text-xs font-semibold text-primary tabular-nums shrink-0">
                  {t.value != null
                    ? metric === 'ap_poll'
                      ? `#${Math.round(t.value)}`
                      : typeof t.value === 'number'
                        ? t.value < 10
                          ? t.value.toFixed(1)
                          : Math.round(t.value).toLocaleString()
                        : t.value
                    : '—'}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
