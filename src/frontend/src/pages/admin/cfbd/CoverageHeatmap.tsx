import { type CoverageFactEndpoint } from '@/services/useCfbdCoverage'

interface Props {
  facts: CoverageFactEndpoint[]
  allSeasons: number[]
  selectedSeason?: number
  onCellClick: (endpoint: string, year: number) => void
}

function cellColor(complete: boolean, rowCount: number): string {
  if (complete && rowCount > 0) return 'bg-success/80'
  if (rowCount > 0) return 'bg-amber-400/80'
  if (complete && rowCount === 0) return 'bg-muted-foreground/20' // no data from API
  return 'bg-destructive/60'
}

function cellTooltip(endpoint: string, year: number, complete: boolean, rowCount: number): string {
  const status =
    complete && rowCount > 0
      ? 'Complete'
      : rowCount > 0
        ? 'In Progress'
        : complete
          ? 'No data available'
          : 'Missing'
  return `${endpoint} · ${year}\n${status}\n${rowCount.toLocaleString()} rows`
}

export default function CoverageHeatmap({ facts, allSeasons, selectedSeason, onCellClick }: Props) {
  if (facts.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-4 text-center">
        No endpoints match the selected group.
      </p>
    )
  }

  // Show all seasons, but highlight the selected one
  const seasons = allSeasons

  return (
    <div className="overflow-x-auto">
      <div className="inline-flex flex-col gap-px min-w-max">
        {/* Header row: season years */}
        <div className="flex gap-px mb-px">
          {/* Empty corner cell for endpoint labels */}
          <div className="w-40 shrink-0" />
          {seasons.map((year) => (
            <div
              key={year}
              className={`w-8 text-center text-[10px] font-medium tabular-nums ${
                year === selectedSeason ? 'text-foreground' : 'text-muted-foreground/60'
              }`}
            >
              {String(year).slice(2)}
            </div>
          ))}
        </div>

        {/* Data rows */}
        {facts.map((fact) => {
          const seasonMap = new Map(fact.seasons.map((s) => [s.year, s]))
          return (
            <div key={fact.endpoint} className="flex gap-px group">
              {/* Endpoint label */}
              <div className="w-40 shrink-0 flex items-center pr-3">
                <span className="text-[11px] text-muted-foreground truncate group-hover:text-foreground transition-colors">
                  {fact.label}
                </span>
              </div>

              {/* Season cells */}
              {seasons.map((year) => {
                const season = seasonMap.get(year)
                const bg = season ? cellColor(season.complete, season.row_count) : 'bg-transparent'
                return (
                  <button
                    key={year}
                    onClick={() => onCellClick(fact.endpoint, year)}
                    title={
                      season
                        ? cellTooltip(fact.endpoint, year, season.complete, season.row_count)
                        : `${fact.endpoint} · ${year}\nNo data`
                    }
                    className={`w-8 h-5 rounded-sm transition-all hover:scale-110 hover:z-10 ${
                      season ? bg : 'border border-muted-foreground/15'
                    }`}
                  >
                    {season ? (
                      <span className="sr-only">
                        {season.complete ? 'Complete' : 'Missing'} — {season.row_count} rows
                      </span>
                    ) : null}
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
