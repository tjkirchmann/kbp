import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { SyncJobStatus } from '@/services/useAdminSync'
import { relativeTime } from '@/lib/utils'
import RunHistoryStrip from './RunHistoryStrip'
import TagBar from './TagBar'
import SyncControlRows from './SyncControlRows'
import { prettyTaskName } from './syncUtils'

export default function SyncJobCard({ job }: { job: SyncJobStatus }) {
  // Re-render every second so the relative deltas tick between the 5s data polls.
  const [, force] = useState(0)
  useEffect(() => {
    const t = setInterval(() => force(n => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="bg-white/[0.03] border border-border/20 rounded-xl p-3.5 flex flex-col gap-2.5">
      {/* Row 1: name · tags (fill) · last/next run */}
      <div className="flex items-center gap-3">
        <Link
          to={`/admin/sync/tasks/${job.task_name}`}
          className="text-sm font-semibold tracking-tight text-foreground truncate shrink-0 hover:text-primary transition-colors"
        >
          {prettyTaskName(job.task_name)}
        </Link>
        <TagBar entityType="sync_task" entityId={job.task_name} />
        <div className="flex items-center gap-4 text-[11px] shrink-0">
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

      {/* Row 2: run history visualizer */}
      <RunHistoryStrip runs={job.runs} taskName={job.task_name} />

      {/* Rows 3 & 4: cron / run config + channel / alerts / run now */}
      <SyncControlRows
        taskName={job.task_name}
        cron={job.cron}
        schedulable={job.schedulable}
        notify={job.notify}
      />
    </div>
  )
}
