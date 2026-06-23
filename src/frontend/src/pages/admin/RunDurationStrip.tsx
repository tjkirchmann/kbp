import type { SyncRun } from '@/services/useAdminSync'
import { formatDuration } from '@/lib/utils'

/** Percentile of a pre-sorted-ascending array, matching the backend's index math. */
function percentile(sortedAsc: number[], q: number): number {
  const idx = Math.min(sortedAsc.length - 1, Math.round(q * (sortedAsc.length - 1)))
  return sortedAsc[idx]
}

// Number of vertical frequency bins across the strip.
const BINS = 48

export default function RunDurationStrip({ runs }: { runs: SyncRun[] }) {
  const durations = runs
    .map((r) => r.duration_seconds)
    .filter((d): d is number => d != null && d > 0)
    .sort((a, b) => a - b)

  const body =
    durations.length < 2 ? (
      <p className="text-xs text-muted-foreground/60 py-3">Not enough completed runs.</p>
    ) : (
      <Strip durations={durations} />
    )

  return (
    <div className="rounded-lg p-3.5 bg-white/[0.03] border border-border/20">
      <h3 className="text-sm font-semibold text-foreground mb-2">Duration distribution</h3>
      {body}
    </div>
  )
}

function Strip({ durations }: { durations: number[] }) {
  const min = durations[0]
  const max = durations[durations.length - 1]
  const p50 = percentile(durations, 0.5)
  const p95 = percentile(durations, 0.95)

  // Log scale: durations commonly span orders of magnitude. Position is the
  // fractional offset of log(v) within [log(min), log(max)].
  const lmin = Math.log(min)
  const lmax = Math.log(max)
  const span = lmax - lmin
  const pos = (v: number) => (span === 0 ? 50 : ((Math.log(v) - lmin) / span) * 100)

  // Bin the log range and count runs per bin -> a frequency histogram.
  const counts = new Array(BINS).fill(0)
  for (const d of durations) {
    const frac = span === 0 ? 0 : (Math.log(d) - lmin) / span
    const b = Math.min(BINS - 1, Math.floor(frac * BINS))
    counts[b]++
  }
  const peak = Math.max(...counts)

  return (
    <div>
      {/* p50 / p95 marker labels */}
      <div className="relative h-4 text-[10px] text-muted-foreground">
        <Marker pct={pos(p50)} label={`p50 ${formatDuration(p50)}`} />
        <Marker pct={pos(p95)} label={`p95 ${formatDuration(p95)}`} />
      </div>

      {/* Frequency bars: one vertical line per bin. Denser bins are taller AND
          brighter — the color ramps from dim primary to a hot cyan-white at the
          peak, so high-frequency regions read as intense bright columns. */}
      <div className="relative h-10 rounded-md bg-white/[0.03] overflow-hidden flex items-end">
        {counts.map((c, i) => {
          const intensity = peak === 0 ? 0 : c / peak // 0..1
          return (
            <span
              key={i}
              className="flex-1"
              style={{
                height: c === 0 ? '0%' : `${15 + intensity * 85}%`,
                background: c === 0 ? 'transparent' : barColor(intensity),
                boxShadow: c === 0 ? 'none' : `0 0 ${intensity * 6}px ${barGlow(intensity)}`,
              }}
            />
          )
        })}

        {/* Percentile guide lines sit on top of the bars. */}
        <Line pct={pos(p50)} className="bg-foreground/50" />
        <Line pct={pos(p95)} className="bg-warning/70" />
      </div>

      {/* min / max endpoints */}
      <div className="flex justify-between text-[10px] text-muted-foreground mt-1 tabular-nums">
        <span>{formatDuration(min)}</span>
        <span>{formatDuration(max)}</span>
      </div>
    </div>
  )
}

// Color ramp: dim blue (#009CDE, low) -> hot cyan-white (high). Lerp in RGB and
// lift alpha so peak columns glow.
function barColor(t: number): string {
  const lo = [0, 156, 222] // #009CDE primary
  const hi = [180, 245, 255] // hot cyan-white
  const c = lo.map((v, i) => Math.round(v + (hi[i] - v) * t))
  const alpha = 0.45 + t * 0.55
  return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alpha})`
}

function barGlow(t: number): string {
  return `rgba(120, 220, 255, ${t * 0.7})`
}

function Line({ pct, className }: { pct: number; className: string }) {
  return (
    <span
      className={`absolute inset-y-0 w-px -translate-x-1/2 ${className}`}
      style={{ left: `${pct}%` }}
    />
  )
}

function Marker({ pct, label }: { pct: number; label: string }) {
  // Clamp the horizontal anchor so end-of-range labels don't clip off the track.
  const left = Math.min(92, Math.max(8, pct))
  return (
    <span
      className="absolute -translate-x-1/2 whitespace-nowrap tabular-nums"
      style={{ left: `${left}%` }}
    >
      {label}
    </span>
  )
}
