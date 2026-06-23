import { Link } from 'react-router-dom'
import type { GlobalRun, UpcomingRun } from '@/services/useAdminSync'
import { relativeTime } from '@/lib/utils'
import { prettyTaskName, statusDotColor, statusLabel } from './syncUtils'

export function RecentRow({ run, now, index }: { run: GlobalRun; now: number; index: number }) {
  const when = run.ended_at ?? run.started_at
  return (
    <Link
      to={`/admin/sync/runs/${run.id}`}
      state={{ taskName: run.task_name }}
      className="flex items-center gap-2.5 py-1.5 -mx-2 px-2 rounded-md hover:bg-white/[0.04] transition-colors"
    >
      <span className="text-[10px] text-muted-foreground/40 tabular-nums shrink-0 w-5 text-right">
        {index}
      </span>
      <span
        className={`size-2 rounded-full shrink-0 ${statusDotColor(run.status)}`}
        title={statusLabel(run.status)}
      />
      <span className="text-xs text-foreground/90 truncate flex-1 min-w-0">
        {prettyTaskName(run.task_name)}
      </span>
      <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
        {relativeTime(when, now)}
      </span>
    </Link>
  )
}

export function UpcomingRow({ run, now, index }: { run: UpcomingRun; now: number; index: number }) {
  return (
    <div className="flex items-center gap-2.5 py-1.5">
      <span className="text-[10px] text-muted-foreground/40 tabular-nums shrink-0 w-5 text-right">
        {index}
      </span>
      <span className="size-2 rounded-full shrink-0 bg-white/15" />
      <span className="text-xs text-foreground/90 truncate flex-1 min-w-0">
        {prettyTaskName(run.task_name)}
      </span>
      <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
        {relativeTime(run.next_run_at, now)}
      </span>
    </div>
  )
}
