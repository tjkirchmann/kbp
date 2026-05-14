import { useState, useEffect } from 'react'
import { useAdminConfig, useUpdateAdminConfig } from '@/services/useAdminConfig'

export default function GeneralPanel() {
  const { data: config, isLoading, error } = useAdminConfig()
  const update = useUpdateAdminConfig()

  const [rateLimit, setRateLimit] = useState('')
  const [webhookUrl, setWebhookUrl] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (config) {
      setRateLimit(String(config.espn_rate_limit_per_minute))
      setWebhookUrl(config.discord_webhook_url)
    }
  }, [config])

  async function handleSave() {
    const parsed = parseInt(rateLimit, 10)
    await update.mutateAsync({
      espn_rate_limit_per_minute: isNaN(parsed) ? undefined : parsed,
      discord_webhook_url: webhookUrl,
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (isLoading) return <p className="text-muted-foreground text-sm">Loading...</p>
  if (error) return <p className="text-destructive text-sm">Failed to load config.</p>

  return (
    <div className="flex flex-col gap-6 max-w-lg">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">ESPN Rate Limit (req/min)</label>
          <input
            type="number"
            min={1}
            value={rateLimit}
            onChange={e => setRateLimit(e.target.value)}
            className="px-3 py-2 rounded-lg bg-[rgba(13,15,19,0.6)] border border-border/40 text-foreground text-sm focus:outline-none focus:border-primary/60 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <p className="text-xs text-muted-foreground">Global ESPN API request cap. Shared equally across all live games (min 60s per game).</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">Discord Webhook URL</label>
          <input
            type="url"
            value={webhookUrl}
            onChange={e => setWebhookUrl(e.target.value)}
            placeholder="https://discord.com/api/webhooks/..."
            className="px-3 py-2 rounded-lg bg-[rgba(13,15,19,0.6)] border border-border/40 text-foreground text-sm focus:outline-none focus:border-primary/60 transition-colors"
          />
          <p className="text-xs text-muted-foreground">Alerts are sent here when ESPN returns a bad or unexpected response.</p>
        </div>
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
  )
}
