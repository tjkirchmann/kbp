import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import type { SyncJobStatus } from '@/services/useAdminSync'
import { useRunSyncTask } from '@/services/useAdminSync'
import { relativeTime } from '@/lib/utils'
import RunHistoryStrip from './RunHistoryStrip'

function prettyName(taskName: string): string {
  return taskName
    .split('_')
    .map(w => (w.toLowerCase() === 'cfbd' ? 'CFBD' : w.toLowerCase() === 'espn' ? 'ESPN'
      : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
}

export default function SyncJobCard({ job }: { job: SyncJobStatus }) {
  const run = useRunSyncTask(job.task_name)

  // Re-render every second so the relative deltas tick between the 5s data polls.
  const [, force] = useState(0)
  useEffect(() => {
    const t = setInterval(() => force(n => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const feedback = run.isPending ? null
    : run.error ? 'Failed to queue'
    : run.data?.already_queued ? 'Already queued'
    : run.data?.deferred ? 'Queued'
    : null

  // Subtitle: cron for periodic jobs, else the task's one-line description.
  const subtitle = job.cron ?? job.description ?? 'Run-only task'

  return (
    <div className="glass-panel rounded-xl p-3.5 flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2 min-w-0">
          <h3 className="text-sm font-semibold tracking-tight text-foreground truncate">
            {prettyName(job.task_name)}
          </h3>
          <p className={`text-[10px] text-muted-foreground truncate ${job.cron ? 'font-mono' : ''}`}>
            {subtitle}
          </p>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          {feedback && (
            <span className={`text-[11px] ${run.error ? 'text-destructive' : 'text-success'}`}>{feedback}</span>
          )}
          <button
            onClick={() => run.mutate()}
            disabled={run.isPending}
            className="flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-primary/15 text-primary border border-primary/40 hover:bg-primary/25 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`size-3 ${run.isPending ? 'animate-spin' : ''}`} />
            {run.isPending ? 'Running' : 'Run now'}
          </button>
        </div>
      </div>

      <RunHistoryStrip runs={job.runs} />

      <div className="flex items-center gap-4 text-[11px]">
        <span className="text-muted-foreground">
          Last run <span className="text-foreground/90">{relativeTime(job.last_run_at)}</span>
        </span>
        {job.cron && (
          <>
            <span className="h-2.5 w-px bg-border/50" />
            <span className="text-muted-foreground">
              Next run <span className="text-foreground/90">{relativeTime(job.next_run_at)}</span>
            </span>
          </>
        )}
      </div>
    </div>
  )
}
