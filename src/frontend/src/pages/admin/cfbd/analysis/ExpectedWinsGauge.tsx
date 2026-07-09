import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'

interface Props {
  expectedWins: number | null
  record: string | null
}

export default function ExpectedWinsGauge({ expectedWins, record }: Props) {
  if (expectedWins == null) {
    return (
      <div className="glass-panel rounded-xl p-3">
        <h3 className="text-xs font-semibold text-foreground mb-1">Expected Wins</h3>
        <p className="text-xs text-muted-foreground">No data</p>
      </div>
    )
  }

  // Parse actual wins from record (e.g. "11-4" → 11)
  const actualWins = record ? parseInt(record.split('-')[0], 10) || 0 : 0

  // Gauge: filled = expected / total, remainder = unfilled
  // Total = expected + some buffer for visual context
  const maxWins = Math.max(expectedWins, actualWins) + 4 // buffer
  const fill = expectedWins / maxWins

  // Pie data: half-circle gauge
  const data = [
    { name: 'filled', value: fill },
    { name: 'empty', value: 1 - fill },
  ]

  const tier =
    expectedWins >= 10
      ? 'Title Contender'
      : expectedWins >= 8
        ? 'Bowl Team'
        : expectedWins >= 6
          ? 'Bubble'
          : expectedWins >= 4
            ? 'Rebuilding'
            : 'Bottom Tier'

  const tierColor =
    expectedWins >= 10
      ? '#3fb950'
      : expectedWins >= 8
        ? '#009cde'
        : expectedWins >= 6
          ? '#f0a429'
          : '#e5534b'

  return (
    <div className="glass-panel rounded-xl p-3">
      <h3 className="text-xs font-semibold text-foreground mb-2">Expected Wins</h3>

      {/* Gauge */}
      <div className="relative h-28">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="100%"
              startAngle={180}
              endAngle={0}
              innerRadius="75%"
              outerRadius="100%"
              dataKey="value"
              strokeWidth={0}
            >
              <Cell fill={tierColor} />
              <Cell fill="rgba(255,255,255,0.06)" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        {/* Center text overlay */}
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center justify-end pb-1 pointer-events-none">
          <span className="text-lg font-bold text-foreground tabular-nums leading-tight">
            {expectedWins.toFixed(1)}
          </span>
          <span className="text-[10px] text-muted-foreground">expected wins</span>
        </div>
      </div>

      {/* Stats below gauge */}
      <div className="flex items-center justify-between mt-1">
        <div className="flex flex-col items-center">
          <span className="text-[10px] text-muted-foreground">Actual</span>
          <span className="text-xs font-semibold tabular-nums text-foreground">{actualWins}</span>
        </div>
        <div className="flex flex-col items-center">
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
            style={{
              backgroundColor: `${tierColor}20`,
              color: tierColor,
            }}
          >
            {tier}
          </span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-[10px] text-muted-foreground">Diff</span>
          <span
            className={`text-xs font-semibold tabular-nums ${
              actualWins >= expectedWins ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {actualWins >= expectedWins ? '+' : ''}
            {(actualWins - expectedWins).toFixed(1)}
          </span>
        </div>
      </div>
    </div>
  )
}
