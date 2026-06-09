import type { SyncRun } from '@/services/useAdminSync'
import { relativeTime, absoluteTime, formatDuration } from '@/lib/utils'

const SLOTS = 50

function statusColor(status: string): string {
  switch (status) {
    case 'succeeded':
      return 'bg-success/80 hover:bg-success'
    case 'failed':
    case 'aborted':
    case 'cancelled':
      return 'bg-destructive/80 hover:bg-destructive'
    case 'doing':
      return 'bg-primary/80 animate-pulse'
    case 'todo':
      return 'bg-primary/30 animate-pulse'
    default:
      return 'bg-white/10 hover:bg-white/20'
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'succeeded': return 'Success'
    case 'failed': return 'Failed'
    case 'aborted': return 'Aborted'
    case 'cancelled': return 'Cancelled'
    case 'doing': return 'Running'
    case 'todo': return 'Queued'
    default: return status
  }
}

function Capsule({ run }: { run: SyncRun }) {
  const when = run.started_at ?? run.ended_at
  return (
    <div className="group/cap relative flex-1 min-w-0">
      <div className={`h-6 w-full rounded-full transition-colors ${statusColor(run.status)}`} />
      <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden -translate-x-1/2 group-hover/cap:block">
        <div className="rounded-lg border border-border bg-popover px-3 py-2.5 text-xs whitespace-nowrap shadow-xl">
          <p className={`font-medium ${
            run.status === 'succeeded' ? 'text-success'
            : ['failed', 'aborted', 'cancelled'].includes(run.status) ? 'text-destructive'
            : 'text-foreground'
          }`}>
            {statusLabel(run.status)}
          </p>
          <p className="text-muted-foreground mt-0.5">{relativeTime(when)} · {absoluteTime(when)}</p>
          {run.duration_seconds != null && (
            <p className="text-muted-foreground/80 mt-0.5">took {formatDuration(run.duration_seconds)}</p>
          )}
        </div>
      </div>
    </div>
  )
}

export default function RunHistoryStrip({ runs }: { runs: SyncRun[] }) {
  // API gives newest-first; show oldest -> newest (most recent on the right),
  // left-padded with empty slots when there are fewer than 50 runs.
  const ordered = [...runs].reverse()
  const padding = Math.max(0, SLOTS - ordered.length)

  return (
    <div className="flex items-end gap-[2px]">
      {Array.from({ length: padding }).map((_, i) => (
        <div key={`pad-${i}`} className="flex-1 min-w-0">
          <div className="h-6 w-full rounded-full bg-white/[0.04]" />
        </div>
      ))}
      {ordered.map(run => (
        <Capsule key={run.id} run={run} />
      ))}
    </div>
  )
}
