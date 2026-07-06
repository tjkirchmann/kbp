import {
  Clock,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Circle,
  CalendarClock,
  Timer,
} from 'lucide-react'
import { useTemporalSyncStatus, type TemporalWorkflowStatus } from '@/services/useTemporalSyncStatus'

// ── helpers ──────────────────────────────────────────────────────────────

function statusIcon(status: string | null) {
  switch (status) {
    case 'COMPLETED':
      return <CheckCircle2 className="size-3.5 text-success" />
    case 'FAILED':
    case 'TERMINATED':
    case 'TIMED_OUT':
      return <XCircle className="size-3.5 text-destructive" />
    case 'RUNNING':
      return <RefreshCw className="size-3.5 text-amber-400 animate-spin" />
    case 'CANCELED':
      return <AlertTriangle className="size-3.5 text-muted-foreground" />
    default:
      return <Circle className="size-3.5 text-muted-foreground/40" />
  }
}

function statusLabel(status: string | null): string {
  if (!status) return 'No history'
  const map: Record<string, string> = {
    COMPLETED: 'OK',
    FAILED: 'Failed',
    RUNNING: 'Running',
    TERMINATED: 'Terminated',
    TIMED_OUT: 'Timed out',
    CANCELED: 'Canceled',
    CONTINUED_AS_NEW: 'Running',
  }
  return map[status] ?? status
}

function statusColor(status: string | null): string {
  switch (status) {
    case 'COMPLETED':
      return 'text-success'
    case 'FAILED':
    case 'TERMINATED':
    case 'TIMED_OUT':
      return 'text-destructive'
    case 'RUNNING':
    case 'CONTINUED_AS_NEW':
      return 'text-amber-400'
    default:
      return 'text-muted-foreground'
  }
}

function relativeTime(iso: string | null): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function durationLabel(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return '—'
  if (seconds < 60) return `${Math.round(seconds)}s`
  const mins = Math.floor(seconds / 60)
  const secs = Math.round(seconds % 60)
  if (mins < 60) return `${mins}m ${secs}s`
  const hrs = Math.floor(mins / 60)
  const rmin = mins % 60
  return `${hrs}h ${rmin}m`
}

// ── result summary ───────────────────────────────────────────────────────

function ResultSummary({ result }: { result: Record<string, unknown> | null }) {
  if (!result) return null

  // Dims: {"teams": {"processed": 130, "changed": 5}, ...}
  const keys = Object.keys(result)
  if (keys.length === 0) return null

  // Compact: show changed/processed totals
  let totalProcessed = 0
  let totalChanged = 0
  let endpointCount = 0

  for (const v of Object.values(result)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const obj = v as Record<string, unknown>
      if (typeof obj.processed === 'number') totalProcessed += obj.processed
      if (typeof obj.changed === 'number') totalChanged += obj.changed
      endpointCount++
    }
  }

  if (endpointCount === 0) {
    // Maybe a single-object result like games: {"processed":..., "changed":..., "year":...}
    const single = result as Record<string, unknown>
    if (typeof single.processed === 'number') totalProcessed = single.processed as number
    if (typeof single.changed === 'number') totalChanged = single.changed as number
    endpointCount = 1
  }

  return (
    <div className="text-[10px] text-muted-foreground mt-1 space-y-0.5">
      {endpointCount > 0 && (
        <div>
          <span className="tabular-nums font-medium text-foreground">
            {totalProcessed.toLocaleString()}
          </span>{' '}
          processed
          {totalChanged > 0 && (
            <>
              {' · '}
              <span className="tabular-nums font-medium text-amber-600">
                {totalChanged.toLocaleString()}
              </span>{' '}
              changed
            </>
          )}
        </div>
      )}
      <div className="truncate">
        {keys.slice(0, 3).join(', ')}
        {keys.length > 3 && ` +${keys.length - 3} more`}
      </div>
    </div>
  )
}

// ── single workflow card ─────────────────────────────────────────────────

function WorkflowCard({
  wf,
  temporalReachable,
}: {
  wf: TemporalWorkflowStatus
  temporalReachable: boolean
}) {
  return (
    <div className="glass-panel rounded-xl p-3 space-y-1.5">
      {/* Header row: label + status */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-foreground uppercase tracking-wide">
          {wf.label}
        </span>
        <span
          className={`flex items-center gap-1 text-[10px] font-medium ${
            temporalReachable
              ? statusColor(wf.workflow_status)
              : 'text-muted-foreground/40'
          }`}
        >
          {temporalReachable
            ? statusIcon(wf.workflow_status)
            : statusIcon(null)}
          {temporalReachable
            ? statusLabel(wf.workflow_status)
            : 'Unreachable'}
        </span>
      </div>

      {/* Schedule info */}
      {wf.schedule_cron && (
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <CalendarClock className="size-3 shrink-0" />
          <code className="text-[10px] font-mono">{wf.schedule_cron}</code>
        </div>
      )}
      {wf.kind === 'manual' && (
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <CalendarClock className="size-3 shrink-0" />
          <span>Manual trigger only</span>
        </div>
      )}

      {/* Last run */}
      <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Clock className="size-3 shrink-0" />
          Last: {relativeTime(wf.last_run_at)}
        </span>
        {wf.last_run_duration_seconds !== null && (
          <span className="flex items-center gap-1 tabular-nums">
            <Timer className="size-3 shrink-0" />
            {durationLabel(wf.last_run_duration_seconds)}
          </span>
        )}
      </div>

      {/* Next run */}
      {wf.next_run_at && wf.workflow_status !== 'RUNNING' && (
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Clock className="size-3 shrink-0" />
          Next: {new Date(wf.next_run_at).toLocaleString()}
        </div>
      )}

      {/* Error */}
      {wf.error && (
        <div className="text-[10px] text-destructive mt-1 truncate" title={wf.error}>
          {wf.error}
        </div>
      )}

      {/* Result summary */}
      {wf.workflow_status === 'COMPLETED' && wf.result && (
        <ResultSummary result={wf.result} />
      )}
    </div>
  )
}

// ── panel ────────────────────────────────────────────────────────────────

export default function TemporalSyncPanel() {
  const { data, isLoading, isError } = useTemporalSyncStatus()

  return (
    <div className="w-72 shrink-0 space-y-3">
      <div className="flex items-center gap-2 text-muted-foreground">
        <RefreshCw className="size-3.5" />
        <span className="text-[11px] font-semibold uppercase tracking-wide">Sync Status</span>
      </div>

      {isLoading && (
        <div className="text-[10px] text-muted-foreground animate-pulse">
          Loading Temporal status…
        </div>
      )}

      {isError && (
        <div className="glass-panel rounded-xl p-3 text-[10px] text-destructive flex items-center gap-1.5">
          <XCircle className="size-3 shrink-0" />
          Temporal unavailable
        </div>
      )}

      {data && !data.temporal_reachable && !isError && (
        <div className="glass-panel rounded-xl p-3 text-[10px] text-amber-600 flex items-center gap-1.5">
          <AlertTriangle className="size-3 shrink-0" />
          Temporal unreachable — showing last-known state
        </div>
      )}

      {data?.workflows.map((wf) => (
        <WorkflowCard
          key={wf.id}
          wf={wf}
          temporalReachable={data.temporal_reachable}
        />
      ))}

      {data && data.workflows.length === 0 && (
        <p className="text-[10px] text-muted-foreground">No sync workflows found.</p>
      )}
    </div>
  )
}
