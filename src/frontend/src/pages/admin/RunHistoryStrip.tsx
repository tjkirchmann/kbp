import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
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

// Fixed coords for the hovered capsule's tooltip. `below` flips it under the
// strip when there isn't room above (e.g. the top card, near the header).
type Pos = { left: number; top: number; below: boolean }

function Capsule({ run, taskName }: { run: SyncRun; taskName?: string }) {
  const when = run.started_at ?? run.ended_at
  const ref = useRef<HTMLAnchorElement>(null)
  const [pos, setPos] = useState<Pos | null>(null)

  const show = () => {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    const below = r.top < 120 // not enough room above -> render below the capsule
    setPos({
      left: r.left + r.width / 2,
      top: below ? r.bottom + 8 : r.top - 8,
      below,
    })
  }

  return (
    <Link
      ref={ref}
      to={`/admin/sync/runs/${run.id}`}
      state={taskName ? { taskName } : undefined}
      onMouseEnter={show}
      onMouseLeave={() => setPos(null)}
      className="relative flex-1 min-w-0"
    >
      <div className={`h-6 w-full rounded-full transition-colors ${statusColor(run.status)}`} />
      {pos && createPortal(
        <div
          className={`pointer-events-none fixed z-50 -translate-x-1/2 ${pos.below ? '' : '-translate-y-full'}`}
          style={{ left: pos.left, top: pos.top }}
        >
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
        </div>,
        document.body,
      )}
    </Link>
  )
}

export default function RunHistoryStrip({ runs, taskName }: { runs: SyncRun[]; taskName?: string }) {
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
        <Capsule key={run.id} run={run} taskName={taskName} />
      ))}
    </div>
  )
}
