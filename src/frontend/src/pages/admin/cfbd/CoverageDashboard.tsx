import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Database } from 'lucide-react'
import { useCfbdCoverage, type CoverageData } from '@/services/cfbd/useCfbdCoverage'
import type { CoverageFactEndpoint, CoverageSeasonItem } from '@/services/cfbd/useCfbdCoverage'
import CoverageHeatmap from './CoverageHeatmap'
import TemporalSyncPanel from './TemporalSyncPanel'

const GROUPS = [
  'Ratings',
  'Season',
  'Recruiting',
  'Games',
  'Drives',
  'Players',
  'Dimensions',
] as const

/**
Merge games rows and dimension rows into the fact heatmap so the Coverage
Dashboard is one unified view — no separate bar charts or warning sections.
 */
function mergedRows(data: CoverageData, allSeasons: number[]): CoverageFactEndpoint[] {
  const rows: CoverageFactEndpoint[] = [...data.facts]

  // Games → one row in the Games group
  rows.push({
    endpoint: 'games',
    label: 'Games',
    group: 'Games',
    seasons: data.games.map(
      (g): CoverageSeasonItem => ({
        year: g.season_year,
        complete: true,
        row_count: g.total,
        last_synced_at: g.last_synced_at,
      }),
    ),
  })

  // Dimensions → one row per dimension entity, count repeated across all seasons
  for (const d of data.dimensions) {
    rows.push({
      endpoint: `dim:${d.name}`,
      label: d.label,
      group: 'Dimensions',
      seasons: allSeasons.map(
        (year): CoverageSeasonItem => ({
          year,
          complete: true,
          row_count: d.count,
          last_synced_at: d.last_synced_at,
        }),
      ),
    })
  }

  return rows
}

export default function CoverageDashboard() {
  const { data, isLoading } = useCfbdCoverage()
  const navigate = useNavigate()
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)

  const allSeasons = useMemo(() => {
    if (!data) return []
    const years = new Set<number>()
    for (const f of data.facts) for (const s of f.seasons) years.add(s.year)
    return [...years].sort((a, b) => b - a)
  }, [data])

  if (isLoading || !data) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-12 justify-center">
        <Loader2 className="size-4 animate-spin" />
        Loading coverage data…
      </div>
    )
  }

  const rows = mergedRows(data, allSeasons)

  const filteredRows = rows.filter((r) => {
    if (selectedGroup && r.group !== selectedGroup) return false
    return true
  })

  return (
    <div className="h-full flex gap-4 overflow-y-auto pr-1">
      {/* Left: Coverage heatmap — facts + games + dimensions */}
      <div className="flex-1 min-w-0 glass-panel rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Database className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
              Coverage
            </h2>
            {/* Group pills */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setSelectedGroup(null)}
                className={`px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors ${
                  !selectedGroup
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                All
              </button>
              {GROUPS.map((g) => (
                <button
                  key={g}
                  onClick={() => setSelectedGroup(selectedGroup === g ? null : g)}
                  className={`px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors ${
                    selectedGroup === g
                      ? 'bg-primary/15 text-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mb-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded bg-success/80" />
            Complete
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded bg-amber-400/80" />
            In Progress
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded bg-destructive/60" />
            Missing
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded bg-muted-foreground/20" />
            No Data
          </span>
        </div>

        <CoverageHeatmap
          facts={filteredRows}
          allSeasons={allSeasons}
          onCellClick={(endpoint, year) => {
            // Dimensions use a `dim:` prefix; strip it to get the real slug.
            const slug = endpoint.startsWith('dim:')
              ? endpoint.slice(4).replace(/_/g, '-')
              : endpoint.replace(/_/g, '-')
            navigate(`/admin/cfbd/${slug}?season=${year}`)
          }}
        />
      </div>

      {/* Right: Temporal sync status panel */}
      <TemporalSyncPanel />
    </div>
  )
}
