import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { SyncRun } from '@/services/useAdminSync'
import { formatDuration, absoluteTime } from '@/lib/utils'
import { statusLabel } from './syncUtils'

interface Point {
  t: number
  duration: number
  status: string
  id: number
}

// Status -> dot color. Failed/aborted/cancelled share red; running/queued share
// blue (and have no duration, so they drop out of the chart entirely).
const COLORS: { color: string; statuses: string[] }[] = [
  { color: '#3FB950', statuses: ['succeeded'] },
  { color: '#E5534B', statuses: ['failed', 'aborted', 'cancelled'] },
  { color: '#009CDE', statuses: ['doing', 'todo'] },
]

// Vertical plot insets shared by the scatter and the histogram so the duration
// (Y) axis lines up across both panels.
const M_TOP = 4
const M_BOTTOM = 22 // room for the scatter's x-axis tick labels
const HIST_W = 72   // the histogram panel's own width, in px
const HIST_GAP = 16 // breathing room between the scatter and the histogram
const BINS = 40     // vertical frequency bins
// Width of the recharts Y-axis label gutter (e.g. "17m", "1.0s"); guide lines and
// their labels start here so they sit over the plot, not over the axis labels.
const PLOT_LEFT = 38

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const p: Point = payload[0]?.payload
  return (
    <div className="bg-white/[0.03] border border-border/20 rounded-lg px-3 py-2.5 text-xs">
      <p className="font-medium text-foreground mb-0.5">{statusLabel(p.status)}</p>
      <p className="text-muted-foreground">took {formatDuration(p.duration)}</p>
      <p className="text-muted-foreground/80">{absoluteTime(new Date(p.t).toISOString())}</p>
    </div>
  )
}

export default function RunScatterChart({ runs }: { runs: SyncRun[] }) {
  const points: Point[] = runs
    .map(r => {
      const when = r.started_at ?? r.ended_at
      if (!when || r.duration_seconds == null || r.duration_seconds <= 0) return null
      return { t: new Date(when).getTime(), duration: r.duration_seconds, status: r.status, id: r.id }
    })
    .filter((p): p is Point => p != null)

  return (
    <div className="rounded-lg p-3.5 bg-white/[0.03] border border-border/20">
      <h3 className="text-sm font-semibold text-foreground mb-2">Runs over time</h3>
      {points.length === 0 ? (
        <p className="text-xs text-muted-foreground/60 py-3">No completed runs in this window.</p>
      ) : (
        <Plot points={points} height={200} />
      )}
    </div>
  )
}

function Plot({ points, height }: { points: Point[]; height: number }) {
  const durations = points.map(p => p.duration)
  const dMin = Math.min(...durations)
  const dMax = Math.max(...durations)
  // Pad the log domain a touch so extreme points aren't clipped at the edges.
  const lo = dMin / 1.15
  const hi = dMax * 1.15

  const llo = Math.log(lo)
  const lhi = Math.log(hi)
  const span = lhi - llo || 1
  const plotH = height - M_TOP - M_BOTTOM
  // Duration -> px from the top of the panel (shared by both panels).
  const yOf = (v: number) => M_TOP + (1 - (Math.log(v) - llo) / span) * plotH

  const sorted = [...durations].sort((a, b) => a - b)
  const pct = (q: number) => sorted[Math.min(sorted.length - 1, Math.round(q * (sorted.length - 1)))]
  const p50 = pct(0.5)
  const p95 = pct(0.95)

  return (
    <div className="relative flex" style={{ height }}>
      {/* Scatter (its own space, takes the remaining width) */}
      <div className="flex-1 min-w-0">
        <ResponsiveContainer width="100%" height={height}>
          <ScatterChart margin={{ top: M_TOP, right: 4, left: -24, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis
              type="number"
              dataKey="t"
              domain={['dataMin', 'dataMax']}
              tickFormatter={(t) => absoluteTime(new Date(t).toISOString())}
              tick={{ fill: 'hsl(220,10%,55%)', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              type="number"
              dataKey="duration"
              scale="log"
              domain={[lo, hi]}
              allowDataOverflow
              tickFormatter={(d) => formatDuration(d)}
              tick={{ fill: 'hsl(220,10%,55%)', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.1)' }} />
            {COLORS.map(({ color, statuses }) => {
              const data = points.filter(p => statuses.includes(p.status))
              if (data.length === 0) return null
              return <Scatter key={color} data={data} fill={color} fillOpacity={0.6} />
            })}
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {/* Frequency histogram — its own column, set off from the scatter. */}
      <div className="shrink-0" style={{ width: HIST_GAP }} />
      <FrequencyHistogram
        durations={durations}
        llo={llo}
        span={span}
        plotTop={M_TOP}
        plotH={plotH}
      />

      {/* Percentile guide lines — horizontal, starting at the plot's left edge
          (clear of the Y-axis labels) and spanning the scatter + histogram. */}
      <Guide y={yOf(p50)} color="rgba(232,234,240,0.5)" label="p50" />
      <Guide y={yOf(p95)} color="rgba(240,164,41,0.7)" label="p95" />
    </div>
  )
}

/**
 * The duration-frequency histogram as its own fixed-width column. Bins run along
 * the shared log Y axis; each bar grows RIGHTWARD from the panel's left edge,
 * longer and brighter where runs cluster.
 */
function FrequencyHistogram({ durations, llo, span, plotTop, plotH }: {
  durations: number[]; llo: number; span: number; plotTop: number; plotH: number
}) {
  const counts = new Array(BINS).fill(0)
  for (const d of durations) {
    const frac = (Math.log(d) - llo) / span
    const b = Math.min(BINS - 1, Math.max(0, Math.floor(frac * BINS)))
    counts[b]++
  }
  const peak = Math.max(...counts)
  const binH = plotH / BINS

  return (
    <div className="relative shrink-0 border-l border-border/20" style={{ width: HIST_W }}>
      {counts.map((c, i) => {
        if (c === 0) return null
        const intensity = peak === 0 ? 0 : c / peak
        const top = plotTop + (BINS - 1 - i) * binH
        return (
          <div
            key={i}
            className="absolute left-0"
            style={{
              top,
              height: Math.max(1, binH - 1),
              width: `${(0.12 + intensity * 0.88) * (HIST_W - 1)}px`,
              background: barColor(intensity),
              boxShadow: `0 0 ${intensity * 6}px ${barGlow(intensity)}`,
            }}
          />
        )
      })}
    </div>
  )
}

function Guide({ y, color, label }: { y: number; color: string; label: string }) {
  return (
    <>
      <div
        className="pointer-events-none absolute right-0"
        style={{ top: y, left: PLOT_LEFT, height: 1, background: color }}
      />
      <div
        className="pointer-events-none absolute text-[9px] tabular-nums"
        style={{ top: y - 12, left: PLOT_LEFT + 6, color }}
      >
        {label}
      </div>
    </>
  )
}

// Color ramp: dim blue (#009CDE, low) -> hot cyan-white (high).
function barColor(t: number): string {
  const loC = [0, 156, 222]
  const hiC = [180, 245, 255]
  const c = loC.map((v, i) => Math.round(v + (hiC[i] - v) * t))
  return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${0.45 + t * 0.55})`
}

function barGlow(t: number): string {
  return `rgba(120, 220, 255, ${t * 0.7})`
}
