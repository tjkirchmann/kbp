import { RefreshCw, Bell, History, Power, Eye, EyeOff } from 'lucide-react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  useTaskDetail, useRunSyncTask, useSetNotifyConfig, useChannels, type NotifyEvent,
} from '@/services/useAdminSync'
import { relativeTime, absoluteTime, formatDuration } from '@/lib/utils'
import { prettyTaskName } from './syncUtils'
import RunHistoryStrip from './RunHistoryStrip'
import CronField from './CronField'
import SyncSidePanel from './SyncSidePanel'
import TagBar from './TagBar'
import { useToast } from '@/components/toast/ToastContext'

const NOTIFY_EVENTS: { key: NotifyEvent; label: string }[] = [
  { key: 'start', label: 'Start' },
  { key: 'success', label: 'Success' },
  { key: 'failure', label: 'Failure' },
]

// Staleness presets for "run on startup": skip the boot run if the task
// succeeded within this window. -1 is the "Always" sentinel (clears to null).
const STALE_PRESETS: { label: string; seconds: number }[] = [
  { label: 'Always', seconds: -1 },
  { label: '1h', seconds: 3600 },
  { label: '6h', seconds: 21600 },
  { label: '12h', seconds: 43200 },
  { label: '24h', seconds: 86400 },
  { label: '7d', seconds: 604800 },
]

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg px-4 py-3 bg-white/[0.03] border border-border/20">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold text-foreground tabular-nums">{value}</p>
    </div>
  )
}

export default function TaskDetail() {
  const { taskName } = useParams()
  const navigate = useNavigate()
  const { data: task, isLoading, error } = useTaskDetail(taskName)
  const run = useRunSyncTask(taskName ?? '')
  const setNotify = useSetNotifyConfig(taskName ?? '')
  const channels = useChannels()
  const { toast } = useToast()

  const runNow = () => {
    const label = prettyTaskName(taskName ?? '')
    run.mutate(undefined, {
      onSuccess: (data) => {
        if (data.deferred) {
          toast({ variant: 'success', title: 'Workflow started', description: label })
        } else if (data.already_queued) {
          toast({ variant: 'info', title: 'Already queued', description: label })
        }
      },
      onError: () =>
        toast({ variant: 'error', title: 'Could not start workflow', description: label }),
    })
  }

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
        <div className="rounded-lg p-4 bg-white/[0.03] border border-border/20 flex flex-col gap-2.5">
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

          {/* Row 2: channel · notify event toggles · history visibility */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[10px]">
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-muted-foreground">Channel</span>
              <select
                value={task.notify.channel ?? ''}
                disabled={setNotify.isPending}
                onChange={e => setNotify.mutate({ channel_name: e.target.value })}
                className="bg-transparent border border-border/50 rounded-md px-1.5 py-0.5 text-foreground/90 disabled:opacity-50 focus:outline-none focus:border-primary/50"
              >
                <option value="">Global default</option>
                {(channels.data ?? []).map(c => (
                  <option key={c.name} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <Bell className="size-3 text-muted-foreground" />
              {NOTIFY_EVENTS.map(({ key, label }) => {
                const on = task.notify[key]
                return (
                  <button
                    key={key}
                    onClick={() => setNotify.mutate({ [`notify_on_${key}`]: !on })}
                    disabled={setNotify.isPending}
                    className={`px-2 py-0.5 rounded-full border transition-colors disabled:opacity-50 ${
                      on
                        ? 'bg-primary/15 text-primary border-primary/40 hover:bg-primary/25'
                        : 'text-muted-foreground border-border/50 hover:bg-muted/40'
                    }`}
                  >
                    {label}
                  </button>
                )
              })}
            </div>

            {/* History visibility — pinned far right */}
            <button
              onClick={() => setNotify.mutate({ hide_in_history: !task.notify.hide_in_history })}
              disabled={setNotify.isPending}
              title={task.notify.hide_in_history
                ? 'Hidden from the History rail — click to show'
                : 'Shown in the History rail — click to hide'}
              className={`ml-auto shrink-0 p-1 rounded-md border transition-colors disabled:opacity-50 ${
                task.notify.hide_in_history
                  ? 'text-muted-foreground/60 border-border/50 hover:bg-muted/40'
                  : 'bg-primary/15 text-primary border-primary/40 hover:bg-primary/25'
              }`}
            >
              {task.notify.hide_in_history ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
            </button>
          </div>

          {/* Row 3: schedule · run controls (catch-up · on startup · staleness) + run now */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <CronField taskName={task.task_name} cron={task.cron} schedulable={task.schedulable} />

            {/* Run controls — centered in the row */}
            <div className="flex items-center gap-1.5 shrink-0 text-[10px] mx-auto">
              <button
                onClick={() => setNotify.mutate({ run_catchup: !task.notify.run_catchup })}
                disabled={setNotify.isPending || !task.cron}
                title={task.cron
                  ? 'Run the last missed scheduled slot when the worker restarts'
                  : 'Catch-up only applies to scheduled tasks'}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full border transition-colors disabled:opacity-50 ${
                  task.notify.run_catchup
                    ? 'bg-primary/15 text-primary border-primary/40 hover:bg-primary/25'
                    : 'text-muted-foreground border-border/50 hover:bg-muted/40'
                }`}
              >
                <History className="size-3" />
                Catch-up
              </button>

              <button
                onClick={() => setNotify.mutate({ run_on_startup: !task.notify.run_on_startup })}
                disabled={setNotify.isPending}
                title="Defer this task once when the app boots"
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full border transition-colors disabled:opacity-50 ${
                  task.notify.run_on_startup
                    ? 'bg-primary/15 text-primary border-primary/40 hover:bg-primary/25'
                    : 'text-muted-foreground border-border/50 hover:bg-muted/40'
                }`}
              >
                <Power className="size-3" />
                On startup
              </button>

              <select
                value={task.notify.startup_stale_seconds ?? -1}
                onChange={(e) => setNotify.mutate({ startup_stale_seconds: Number(e.target.value) })}
                disabled={setNotify.isPending || !task.notify.run_on_startup}
                title={task.notify.run_on_startup
                  ? 'Skip the startup run if the task succeeded within this window'
                  : 'Enable "On startup" to set a staleness window'}
                className="px-2 py-0.5 rounded-full border border-border/50 bg-transparent text-muted-foreground text-[11px] disabled:opacity-50"
              >
                {STALE_PRESETS.map((p) => (
                  <option key={p.seconds} value={p.seconds}>
                    {p.label === 'Always' ? 'Always' : `Skip if < ${p.label}`}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={runNow}
              disabled={run.isPending}
              className="shrink-0 flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-primary/15 text-primary border border-primary/40 hover:bg-primary/25 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`size-3 ${run.isPending ? 'animate-spin' : ''}`} />
              {run.isPending ? 'Running' : 'Run now'}
            </button>
          </div>
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

        {/* Upcoming fires */}
        {task.upcoming.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-2">Upcoming</h3>
            <div className="flex flex-col gap-1.5">
              {task.upcoming.map((ts, i) => (
                <div key={i} className="flex items-center gap-2.5 text-xs">
                  <span className="size-1.5 rounded-full bg-border shrink-0" />
                  <span className="text-muted-foreground tabular-nums">
                    {absoluteTime(ts)} · {relativeTime(ts)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <SyncSidePanel />
    </div>
  )
}
