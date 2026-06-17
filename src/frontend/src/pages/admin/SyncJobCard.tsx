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
    // One card visually, but the header and body surfaces are bridged only at the
    // left/right edges — leaving a transparent notch in the middle where the page
    // background shines through. The notch is inset to line up horizontally with
    // the run-history strip below it (matching the body's px-3.5 padding), so the
    // cut stops exactly where the strip stops rather than spanning the full width.
    <div className="relative flex flex-col">
      {/* Header surface: name · tags (fill) · last/next run */}
      <div className="bg-white/[0.03] border border-border/20 border-b-0 rounded-t-xl px-3.5 py-2.5">
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
      </div>

      {/* Notch row: card fill only at the edges (left/right borders continue the
          card sides), transparent in the middle aligned to the strip. The 6px
          height is the visible cut where the background shows through. */}
      <div className="flex h-1.5 items-stretch">
        <div className="w-3.5 shrink-0 bg-white/[0.03] border-l border-border/20" />
        <div className="flex-1" />
        <div className="w-3.5 shrink-0 bg-white/[0.03] border-r border-border/20" />
      </div>

      {/* Body surface: run history visualizer + controls. The surface keeps the
          card's px-3.5 so its border/notch stay flush with the edges, but the
          content is inset further (px-6) on both sides so it reads as
          subordinate to the header name above it. */}
      <div className="bg-white/[0.03] border border-border/20 border-t-0 rounded-b-xl px-3.5 pt-3 pb-5">
        <div className="flex flex-col gap-2.5 px-6">
          <RunHistoryStrip runs={job.runs} taskName={job.task_name} />
          <SyncControlRows
            taskName={job.task_name}
            cron={job.cron}
            schedulable={job.schedulable}
            notify={job.notify}
          />
        </div>
      </div>
    </div>
  )
}
