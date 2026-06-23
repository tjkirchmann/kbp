import { RefreshCw, Bell, History, Power, Eye, EyeOff } from 'lucide-react'
import type { SyncNotify } from '@/services/useAdminSync'
import { useRunSyncTask, useSetNotifyConfig, useChannels } from '@/services/useAdminSync'
import CronField from './CronField'
import { prettyTaskName, NOTIFY_EVENTS, PILL_ON, PILL_OFF, STALE_PRESETS } from './syncUtils'
import { useToast } from '@/components/toast/ToastContext'

// The two configuration rows shared by the Sync list card and the task detail
// page. Rendered as a fragment so the parent card's flex `gap-2.5` produces the
// spacing between (and around) the rows — exactly as it does for the card's
// other rows. Both call sites pass the same `notify` shape (job.notify /
// task.notify), so the controls are data-source-agnostic.
export default function SyncControlRows({
  taskName,
  cron,
  schedulable,
  notify,
}: {
  taskName: string
  cron: string | null
  schedulable: boolean
  notify: SyncNotify
}) {
  const run = useRunSyncTask(taskName)
  const setNotify = useSetNotifyConfig(taskName)
  const channels = useChannels()
  const { toast } = useToast()

  const runNow = () => {
    const label = prettyTaskName(taskName)
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

  const feedback = run.isPending
    ? null
    : run.error
      ? 'Failed to queue'
      : run.data?.already_queued
        ? 'Already queued'
        : run.data?.deferred
          ? 'Queued'
          : null

  return (
    <>
      {/* Row 3: cron · run configuration (catch-up · on startup · staleness) · hide */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[10px]">
        <div className="flex items-center shrink-0 bg-white/[0.04] rounded-full px-2.5 py-1">
          {/* Transparent border + py-0.5 match the pill capsules' inner height. */}
          <span className="flex items-center px-0 py-0.5 border border-transparent">
            <CronField taskName={taskName} cron={cron} schedulable={schedulable} />
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 bg-white/[0.04] rounded-full px-2.5 py-1">
          <button
            onClick={() => setNotify.mutate({ run_catchup: !notify.run_catchup })}
            disabled={setNotify.isPending || !cron}
            title={
              cron
                ? 'Run the last missed scheduled slot when the worker restarts'
                : 'Catch-up only applies to scheduled tasks'
            }
            className={`flex items-center gap-1 px-2 py-0.5 rounded-full border transition-colors disabled:opacity-50 ${
              notify.run_catchup ? PILL_ON : PILL_OFF
            }`}
          >
            <History className="size-3" />
            Catch-up
          </button>

          <button
            onClick={() => setNotify.mutate({ run_on_startup: !notify.run_on_startup })}
            disabled={setNotify.isPending}
            title="Defer this task once when the app boots"
            className={`flex items-center gap-1 px-2 py-0.5 rounded-full border transition-colors disabled:opacity-50 ${
              notify.run_on_startup ? PILL_ON : PILL_OFF
            }`}
          >
            <Power className="size-3" />
            On startup
          </button>

          <select
            value={notify.startup_stale_seconds ?? -1}
            onChange={(e) => setNotify.mutate({ startup_stale_seconds: Number(e.target.value) })}
            disabled={setNotify.isPending || !notify.run_on_startup}
            title={
              notify.run_on_startup
                ? 'Skip the startup run if the task succeeded within this window'
                : 'Enable "On startup" to set a staleness window'
            }
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
          onClick={() => setNotify.mutate({ hide_in_history: !notify.hide_in_history })}
          disabled={setNotify.isPending}
          title={
            notify.hide_in_history
              ? 'Hidden from the History rail — click to show'
              : 'Shown in the History rail — click to hide'
          }
          className={`ml-auto shrink-0 p-1 rounded-md border transition-colors disabled:opacity-50 ${
            notify.hide_in_history ? PILL_OFF : PILL_ON
          }`}
        >
          {notify.hide_in_history ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
        </button>
      </div>

      {/* Row 4: channel · alert scenarios · run now */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[10px]">
        {/* Channel */}
        <div className="flex items-center gap-2 shrink-0 bg-white/[0.04] rounded-full px-2.5 py-1">
          <span className="text-muted-foreground">Channel</span>
          <select
            value={notify.channel ?? ''}
            disabled={setNotify.isPending}
            onChange={(e) => setNotify.mutate({ channel_name: e.target.value })}
            className="bg-transparent border border-border/50 rounded-md px-1.5 py-0.5 text-foreground/90 disabled:opacity-50 focus:outline-none focus:border-primary/50"
          >
            <option value="">Global default</option>
            {(channels.data ?? []).map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Alert scenarios */}
        <div className="flex items-center gap-1.5 shrink-0 bg-white/[0.04] rounded-full px-2.5 py-1">
          <Bell className="size-3 text-muted-foreground" />
          {NOTIFY_EVENTS.map(({ key, label }) => {
            const on = notify[key]
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
            <span className={`text-[11px] ${run.error ? 'text-destructive' : 'text-success'}`}>
              {feedback}
            </span>
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
    </>
  )
}
