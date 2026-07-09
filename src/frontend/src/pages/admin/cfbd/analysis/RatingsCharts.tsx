import { useState } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ScatterChart,
  Scatter,
  ZAxis,
  LabelList,
} from 'recharts'
import type { SeasonSummary } from '@/services/cfbd/useCfbdAnalytics'

type ChartTab = 'elo' | 'sp_plus' | 'srs' | 'fpi'

const TABS: { key: ChartTab; label: string }[] = [
  { key: 'elo', label: 'Elo' },
  { key: 'sp_plus', label: 'SP+' },
  { key: 'srs', label: 'SRS' },
  { key: 'fpi', label: 'FPI' },
]

function mapToChartData(
  summary: SeasonSummary,
  tab: ChartTab,
) {
  const raw =
    tab === 'elo'
      ? summary.ratings.elo
      : tab === 'sp_plus'
        ? summary.ratings.sp_plus
        : tab === 'srs'
          ? summary.ratings.srs
          : summary.ratings.fpi

  return raw
    .filter((r) => r.rating != null)
    .map((r) => ({
      name: r.team,
      rating: r.rating!,
      rank: r.ranking,
      color: r.color || '#009cde',
      logo: r.logo,
      conference: r.conference,
    }))
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  return (
    <div className="rounded-lg border border-border/30 bg-card px-3 py-2 shadow-lg">
      <p className="text-xs font-medium text-foreground">{d?.name}</p>
      <p className="text-[10px] text-muted-foreground">
        {d?.conference} · Rank #{d?.rank}
      </p>
      <p className="text-xs font-semibold text-primary tabular-nums mt-0.5">
        {typeof d?.rating === 'number' ? d.rating.toFixed(1) : d?.rating}
      </p>
    </div>
  )
}

interface Props {
  season: number
  summary: SeasonSummary
}

export default function RatingsCharts({ season, summary }: Props) {
  const [tab, setTab] = useState<ChartTab>('elo')

  const chartData = mapToChartData(summary, tab).slice(0, 50) // top 50
  const reversed = [...chartData].reverse()

  return (
    <div className="glass-panel rounded-xl flex flex-col h-full">
      {/* Header with tabs */}
      <div className="shrink-0 flex items-center justify-between px-3 pt-3 pb-1">
        <h3 className="text-xs font-semibold text-foreground">
          Ratings
        </h3>
        <div className="flex gap-0.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors ${
                tab === t.key
                  ? 'bg-primary/15 text-primary border border-primary/20'
                  : 'text-muted-foreground hover:text-foreground border border-transparent'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart area */}
      <div className="flex-1 min-h-0 px-2 pb-2 min-h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={reversed}
            layout="vertical"
            margin={{ top: 4, right: 16, bottom: 4, left: 4 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.06)"
              horizontal={false}
            />
            <XAxis
              type="number"
              tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={false}
              axisLine={false}
              tickLine={false}
              width={4}
            />
            <ZAxis type="number" />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
            <Bar dataKey="rating" radius={[0, 2, 2, 0]} maxBarSize={12}>
              {reversed.map((entry, i) => (
                <Cell key={i} fill={entry.color} fillOpacity={0.75} />
              ))}
              <LabelList
                dataKey="name"
                position="insideLeft"
                style={{
                  fontSize: 9,
                  fill: '#e8eaf0',
                  fontWeight: 500,
                }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
