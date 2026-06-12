import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTaskDetail, useTaskRuns, type RunWindow } from '@/services/useAdminSync'
import { relativeTime, formatDuration } from '@/lib/utils'
import { prettyTaskName, PILL_ON, PILL_OFF } from './syncUtils'
import RunHistoryStrip from './RunHistoryStrip'
import SyncSidePanel from './SyncSidePanel'
import SyncControlRows from './SyncControlRows'
import TagBar from './TagBar'
import Stat from './Stat'
import RunScatterChart from './RunScatterChart'

const RUN_WINDOWS: RunWindow[] = ['3h', '1d', '3d', '7d', '30d']

export default function TaskDetail() {
  const { taskName } = useParams()
  const navigate = useNavigate()
  const { data: task, isLoading, error } = useTaskDetail(taskName)
  const [chartWindow, setChartWindow] = useState<RunWindow>('7d')
  const windowed = useTaskRuns(taskName, chartWindow)

  if (isLoading) return <p className="text-muted-foreground text-sm py-8">Loading…</p>
  if (error || !task) {
    return (
      <div className="text-sm text-muted-foreground py-8">
        Task not found.{' '}
        <button onClick={() => navigate('/admin/sync')} className="text-primary hover:underline">Back to Sync</button>
      </div>
    )
  }

  const { stats } = task
  return (
    <div className="flex gap-5 h-full min-h-0 items-stretch">
      <div className="flex flex-col gap-5 min-w-0 w-full max-w-2xl overflow-y-auto pr-1">
        {/* Header card — mirrors the SyncJobCard layout, minus the visualizer */}
        <div className="rounded-xl p-3.5 bg-white/[0.03] border border-border/20 flex flex-col gap-2.5">
          {/* Row 1: name (description) · tags (fill) · last/next run */}
          <div className="flex items-center gap-3">
            <div className="min-w-0 shrink-0">
              <h3 className="text-sm font-semibold tracking-tight text-foreground truncate">
                {prettyTaskName(task.task_name)}
              </h3>
              {task.description && (
                <p className="text-[11px] text-muted-foreground truncate">{task.description}</p>
              )}
            </div>
            <TagBar entityType="sync_task" entityId={task.task_name} />
            <div className="flex items-center gap-4 text-[11px] shrink-0">
              <span className="text-muted-foreground">
                Last run <span className="text-foreground/90">{relativeTime(task.last_run_at)}</span>
              </span>
              {task.cron && (
                <>
                  <span className="h-2.5 w-px bg-border/50" />
                  <span className="text-muted-foreground">
                    Next run <span className="text-foreground/90">{relativeTime(task.next_run_at)}</span>
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Rows 2 & 3: cron / run config + channel / alerts / run now */}
          <SyncControlRows
            taskName={task.task_name}
            cron={task.cron}
            schedulable={task.schedulable}
            notify={task.notify}
          />
        </div>

        {/* Run history visualizer */}
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-2">Run history</h3>
          <RunHistoryStrip runs={task.runs} taskName={task.task_name} />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Success rate" value={stats.success_rate != null ? `${Math.round(stats.success_rate * 100)}%` : '—'} />
          <Stat label="Avg duration" value={formatDuration(stats.avg_duration_seconds)} />
          <Stat label="p95 duration" value={formatDuration(stats.p95_duration_seconds)} />
          <Stat label="Total" value={String(stats.total)} />
          <Stat label="Succeeded" value={String(stats.succeeded)} />
          <Stat label="Failed" value={String(stats.failed)} />
        </div>

        {/* Run analytics — runs over time + duration histogram, windowed */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Run analytics</h3>
            <div className="flex items-center gap-1 text-[10px]">
              {RUN_WINDOWS.map(w => (
                <button
                  key={w}
                  onClick={() => setChartWindow(w)}
                  className={`px-2 py-0.5 rounded-full border transition-colors ${
                    chartWindow === w ? PILL_ON : PILL_OFF
                  }`}
                >
                  {w}
                </button>
              ))}
            </div>
          </div>
          {windowed.isLoading ? (
            <p className="text-xs text-muted-foreground/60 py-3">Loading…</p>
          ) : (
            <RunScatterChart runs={windowed.data ?? []} />
          )}
        </div>
      </div>

      <SyncSidePanel />
    </div>
  )
}
