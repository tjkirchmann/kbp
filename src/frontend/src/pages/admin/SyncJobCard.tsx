import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCw, Bell, History, Power, Eye, EyeOff } from 'lucide-react'
import type { SyncJobStatus, NotifyEvent } from '@/services/useAdminSync'
import { useRunSyncTask, useSetNotifyConfig, useChannels } from '@/services/useAdminSync'
import { relativeTime } from '@/lib/utils'
import RunHistoryStrip from './RunHistoryStrip'
import CronField from './CronField'
import TagBar from './TagBar'
import { prettyTaskName } from './syncUtils'
import { useToast } from '@/components/toast/ToastContext'

const NOTIFY_EVENTS: { key: NotifyEvent; label: string }[] = [
  { key: 'start', label: 'Start' },
  { key: 'success', label: 'Success' },
  { key: 'failure', label: 'Failure' },
]

// Shared pill states. The off state keeps a visible rest fill (so each toggle
// reads as a button against the gray group capsule) that lifts on hover.
const PILL_ON = 'bg-primary/15 text-primary border-primary/40 hover:bg-primary/25'
const PILL_OFF =
  'text-muted-foreground border-border/50 hover:bg-white/10 hover:text-foreground'

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

export default function SyncJobCard({ job }: { job: SyncJobStatus }) {
  const run = useRunSyncTask(job.task_name)
  const setNotify = useSetNotifyConfig(job.task_name)
  const channels = useChannels()
  const { toast } = useToast()

  const runNow = () => {
    const label = prettyTaskName(job.task_name)
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

      {/* Row 3: cron · run configuration (catch-up · on startup · staleness) · hide */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[10px]">
        <div className="flex items-center shrink-0 bg-white/[0.04] rounded-full px-2.5 py-1">
          {/* Transparent border + py-0.5 match the pill capsules' inner height. */}
          <span className="flex items-center px-0 py-0.5 border border-transparent">
            <CronField taskName={job.task_name} cron={job.cron} schedulable={job.schedulable} />
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 bg-white/[0.04] rounded-full px-2.5 py-1">
          <button
            onClick={() => setNotify.mutate({ run_catchup: !job.notify.run_catchup })}
            disabled={setNotify.isPending || !job.cron}
            title={job.cron
              ? 'Run the last missed scheduled slot when the worker restarts'
              : 'Catch-up only applies to scheduled tasks'}
            className={`flex items-center gap-1 px-2 py-0.5 rounded-full border transition-colors disabled:opacity-50 ${
              job.notify.run_catchup ? PILL_ON : PILL_OFF
            }`}
          >
            <History className="size-3" />
            Catch-up
          </button>

          <button
            onClick={() => setNotify.mutate({ run_on_startup: !job.notify.run_on_startup })}
            disabled={setNotify.isPending}
            title="Defer this task once when the app boots"
            className={`flex items-center gap-1 px-2 py-0.5 rounded-full border transition-colors disabled:opacity-50 ${
              job.notify.run_on_startup ? PILL_ON : PILL_OFF
            }`}
          >
            <Power className="size-3" />
            On startup
          </button>

          <select
            value={job.notify.startup_stale_seconds ?? -1}
            onChange={(e) => setNotify.mutate({ startup_stale_seconds: Number(e.target.value) })}
            disabled={setNotify.isPending || !job.notify.run_on_startup}
            title={job.notify.run_on_startup
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

        {/* History visibility — pinned far right */}
        <button
          onClick={() => setNotify.mutate({ hide_in_history: !job.notify.hide_in_history })}
          disabled={setNotify.isPending}
          title={job.notify.hide_in_history
            ? 'Hidden from the History rail — click to show'
            : 'Shown in the History rail — click to hide'}
          className={`ml-auto shrink-0 p-1 rounded-md border transition-colors disabled:opacity-50 ${
            job.notify.hide_in_history ? PILL_OFF : PILL_ON
          }`}
        >
          {job.notify.hide_in_history ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
        </button>
      </div>

      {/* Row 4: channel · alert scenarios · run now */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[10px]">
        {/* Channel */}
        <div className="flex items-center gap-2 shrink-0 bg-white/[0.04] rounded-full px-2.5 py-1">
          <span className="text-muted-foreground">Channel</span>
          <select
            value={job.notify.channel ?? ''}
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

        {/* Alert scenarios */}
        <div className="flex items-center gap-1.5 shrink-0 bg-white/[0.04] rounded-full px-2.5 py-1">
          <Bell className="size-3 text-muted-foreground" />
          {NOTIFY_EVENTS.map(({ key, label }) => {
            const on = job.notify[key]
            return (
              <button
                key={key}
                onClick={() => setNotify.mutate({ [`notify_on_${key}`]: !on })}
                disabled={setNotify.isPending}
                className={`px-2 py-0.5 rounded-full border transition-colors disabled:opacity-50 ${
                  on ? PILL_ON : PILL_OFF
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>

        {/* Run now — pinned far right */}
        <div className="flex items-center gap-2.5 shrink-0 ml-auto">
          {feedback && (
            <span className={`text-[11px] ${run.error ? 'text-destructive' : 'text-success'}`}>{feedback}</span>
          )}
          <button
            onClick={runNow}
            disabled={run.isPending}
            className="flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-primary/15 text-primary border border-primary/40 hover:bg-primary/25 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`size-3 ${run.isPending ? 'animate-spin' : ''}`} />
            {run.isPending ? 'Running' : 'Run now'}
          </button>
        </div>
      </div>
    </div>
  )
}
