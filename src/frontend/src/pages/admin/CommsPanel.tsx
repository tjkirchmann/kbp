import { useState, useEffect } from 'react'
import { useAdminConfig, useUpdateAdminConfig, useTestDiscordWebhook } from '@/services/useAdminConfig'

export default function CommsPanel() {
  const { data: config, isLoading, error } = useAdminConfig()
  const update = useUpdateAdminConfig()
  const testWebhook = useTestDiscordWebhook()

  const [webhookUrl, setWebhookUrl] = useState('')
  const [saved, setSaved] = useState(false)
  const [testStatus, setTestStatus] = useState<'idle' | 'ok' | 'error'>('idle')

  useEffect(() => {
    if (config) setWebhookUrl(config.discord_webhook_url)
  }, [config])

  async function handleSave() {
    await update.mutateAsync({ discord_webhook_url: webhookUrl })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (isLoading) return <p className="text-muted-foreground text-sm">Loading...</p>
  if (error) return <p className="text-destructive text-sm">Failed to load config.</p>

  return (
    <div className="flex flex-col gap-6 max-w-lg">
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-foreground">Discord Webhook URL</label>
        <div className="flex gap-2">
          <input
            type="url"
            value={webhookUrl}
            onChange={e => setWebhookUrl(e.target.value)}
            placeholder="https://discord.com/api/webhooks/..."
            className="flex-1 px-3 py-2 rounded-lg bg-white/[0.03] border border-border/20 text-foreground text-sm focus:outline-none focus:border-primary/60 transition-colors"
          />
          <button
            onClick={async () => {
              setTestStatus('idle')
              try {
                await testWebhook.mutateAsync()
                setTestStatus('ok')
              } catch {
                setTestStatus('error')
              } finally {
                setTimeout(() => setTestStatus('idle'), 3000)
              }
            }}
            disabled={testWebhook.isPending || !config?.discord_webhook_url}
            className="px-3 py-1.5 rounded-full text-sm font-medium bg-muted/20 text-muted-foreground border border-border/40 hover:bg-muted/40 transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {testWebhook.isPending ? 'Sending...' : testStatus === 'ok' ? 'Sent!' : testStatus === 'error' ? 'Failed' : 'Test'}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">Alerts are sent here when ESPN returns a bad or unexpected response.</p>
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
