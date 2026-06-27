import { useState, useEffect } from 'react'
import { useAdminConfig, useUpdateAdminConfig } from '@/services/useAdminConfig'
import { useChannels } from '@/services/useAdminChannels'
import { useEventLog, useEspnStatus } from '@/services/useEventLog'
import EspnPollChart from './EspnPollChart'

export default function EspnPanel() {
  const { data: config, isLoading, error } = useAdminConfig()
  const update = useUpdateAdminConfig()
  const { data: channels = [] } = useChannels()
  const { data: status } = useEspnStatus()
  const { data: pollLog = [] } = useEventLog('espn_poller', 30)

  const [rateLimit, setRateLimit] = useState('')
  const [alertChannel, setAlertChannel] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (config) {
      setRateLimit(String(config.espn_rate_limit_per_minute))
      setAlertChannel(config.espn_alert_channel)
    }
  }, [config])

  async function handleSave() {
    const parsed = parseInt(rateLimit, 10)
    if (isNaN(parsed)) return
    await update.mutateAsync({
      espn_rate_limit_per_minute: parsed,
      espn_alert_channel: alertChannel,
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (isLoading) return <p className="text-muted-foreground text-sm">Loading...</p>
  if (error) return <p className="text-destructive text-sm">Failed to load config.</p>

  const intervalSec = status?.effective_interval_seconds ?? 0
  const intervalLabel =
    intervalSec > 0
      ? intervalSec >= 60
        ? `${Math.round(intervalSec)}s / game`
        : `${intervalSec.toFixed(1)}s / game`
      : null

  return (
    <div className="flex flex-col gap-8 max-w-lg">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">Rate Limit (req/min)</label>
          <input
            type="number"
            min={1}
            value={rateLimit}
            onChange={(e) => setRateLimit(e.target.value)}
            className="px-3 py-2 rounded-lg bg-white/[0.03] border border-border/20 text-foreground text-sm focus:outline-none focus:border-primary/60 transition-colors w-36 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <p className="text-xs text-muted-foreground">
            Global ESPN API request cap. Shared equally across all active games.
            {intervalLabel && (
              <span className="ml-1 text-primary">
                {status!.live_games} live · {intervalLabel}
              </span>
            )}
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">Game alerts channel</label>
          <select
            value={alertChannel}
            onChange={(e) => setAlertChannel(e.target.value)}
            className="px-3 py-2 rounded-lg bg-white/[0.03] border border-border/20 text-foreground text-sm focus:outline-none focus:border-primary/60 transition-colors w-72"
          >
            <option value="">None — silenced (default)</option>
            {channels.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name} ({c.strategy})
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Where game start / halftime / final and poll errors are sent. Defaults to silenced —
            pick a channel to deliver them.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={update.isPending}
            className="px-4 py-1.5 rounded-full text-sm font-medium bg-primary/15 text-primary border border-primary/40 hover:bg-primary/25 transition-colors disabled:opacity-50"
          >
            {update.isPending ? 'Saving...' : 'Save'}
          </button>
          {saved && <span className="text-xs text-success">Saved</span>}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-foreground">
            Poll activity <span className="text-muted-foreground font-normal">— last 30 min</span>
          </p>
          {pollLog.length === 0 && <p className="text-xs text-muted-foreground">No data yet</p>}
        </div>
        {pollLog.length > 0 && <EspnPollChart data={pollLog} />}
      </div>
    </div>
  )
}
