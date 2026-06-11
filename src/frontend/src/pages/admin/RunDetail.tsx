import { useParams, useNavigate, Link } from 'react-router-dom'
import { useRunDetail, useCancelRun, useAbortRun, useRetryRun } from '@/services/useAdminSync'
import type { RunDetail as RunDetailData } from '@/services/useAdminSync'
import { absoluteTime, relativeTime, formatDuration } from '@/lib/utils'
import { prettyTaskName, statusDotColor, statusLabel } from './syncUtils'

const TERMINAL_FAIL = ['failed', 'aborted']

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4 px-4 py-2.5 text-sm border-t border-border/20 first:border-t-0">
      <span className="text-muted-foreground font-medium shrink-0 w-1/3">{label}</span>
      <span className="text-foreground break-all min-w-0">{children}</span>
    </div>
  )
}

export default function RunDetail() {
  const { jobId } = useParams()
  const navigate = useNavigate()
  const { data: run, isLoading, error } = useRunDetail(jobId)
  const cancel = useCancelRun(jobId)
  const abort = useAbortRun(jobId)
  const retry = useRetryRun(jobId)

  if (isLoading) return <p className="text-muted-foreground text-sm py-8">Loading…</p>
  if (error || !run) {
    return (
      <div className="text-sm text-muted-foreground py-8">
        Run not found.{' '}
        <button onClick={() => navigate('/admin/sync')} className="text-primary hover:underline">Back to Sync</button>
      </div>
    )
  }

  const fields: [string, React.ReactNode][] = [
    ['Task', <Link to={`/admin/sync/tasks/${run.task_name}`} className="text-primary hover:underline">{prettyTaskName(run.task_name)}</Link>],
    ['Status', (
      <span className="inline-flex items-center gap-1.5">
        <span className={`size-2 rounded-full ${statusDotColor(run.status)}`} />
        {statusLabel(run.status)}
      </span>
    )],
    ['Queue', run.queue_name],
    ['Priority', run.priority],
    ['Attempts', run.attempts],
    ['Duration', formatDuration(run.duration_seconds)],
    ['Scheduled', run.scheduled_at ? absoluteTime(run.scheduled_at) : '—'],
    ['Worker', run.worker_id ?? '—'],
    ['Lock', run.lock ?? '—'],
    ['Queueing lock', run.queueing_lock ?? '—'],
    ['Args', <code className="text-xs">{JSON.stringify(run.args)}</code>],
  ]

  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <div className="rounded-xl overflow-hidden bg-white/[0.03] border border-border/20">
        {fields.map(([label, value]) => <Field key={label} label={label}>{value}</Field>)}
      </div>

      {TERMINAL_FAIL.includes(run.status) && (
        <div className="rounded-lg px-4 py-3 text-xs bg-destructive/10 border border-destructive/30 text-muted-foreground">
          This run {run.status}. Procrastinate doesn't store tracebacks — check the worker logs for
          the error after {run.attempts} attempt{run.attempts === 1 ? '' : 's'}.
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold text-foreground mb-2">Event timeline</h3>
        <div className="flex flex-col gap-1.5">
          {run.events.map((e, i) => (
            <div key={i} className="flex items-center gap-2.5 text-xs">
              <span className="size-1.5 rounded-full bg-border shrink-0" />
              <span className="text-foreground/90 w-40 shrink-0">{e.type}</span>
              <span className="text-muted-foreground tabular-nums">
                {absoluteTime(e.at)} · {relativeTime(e.at)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <RunActions run={run} cancel={cancel} abort={abort} retry={retry} />
    </div>
  )
}

function RunActions({ run, cancel, abort, retry }: {
  run: RunDetailData
  cancel: ReturnType<typeof useCancelRun>
  abort: ReturnType<typeof useAbortRun>
  retry: ReturnType<typeof useRetryRun>
}) {
  const canRetry = ['failed', 'aborted'].includes(run.status)
  const canCancel = run.status === 'todo'
  const canAbort = run.status === 'doing' && !run.abort_requested
  if (!canRetry && !canCancel && !canAbort) return null

  const pillBase = 'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors disabled:opacity-50'
  return (
    <div className="flex flex-col gap-2">
      <div className="border-b border-border/40" />
      <div className="flex items-center gap-2 flex-wrap">
        {canRetry && (
          <button onClick={() => retry.mutate()} disabled={retry.isPending}
            className={`${pillBase} text-primary border-primary/40 hover:bg-primary/10`}>Retry</button>
        )}
        {canCancel && (
          <button onClick={() => cancel.mutate()} disabled={cancel.isPending}
            className={`${pillBase} text-destructive border-destructive/40 hover:bg-destructive/10`}>Cancel</button>
        )}
        {canAbort && (
          <button onClick={() => abort.mutate()} disabled={abort.isPending}
            className={`${pillBase} text-destructive border-destructive/40 hover:bg-destructive/10`}>Abort</button>
        )}
        {cancel.data?.ok === false && (
          <span className="text-[11px] text-muted-foreground">Job was not in a cancellable state.</span>
        )}
      </div>
    </div>
  )
}
