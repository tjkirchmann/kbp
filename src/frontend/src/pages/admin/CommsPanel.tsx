import { useState, useEffect } from 'react'
import { useAdminConfig, useUpdateAdminConfig, useTestDiscordBot } from '@/services/useAdminConfig'

const INPUT_CLASS =
  'flex-1 px-3 py-2 rounded-lg bg-white/[0.03] border border-border/20 text-foreground text-sm focus:outline-none focus:border-primary/60 transition-colors'
const TEST_BTN_CLASS =
  'px-3 py-1.5 rounded-full text-sm font-medium bg-muted/20 text-muted-foreground border border-border/40 hover:bg-muted/40 transition-colors disabled:opacity-50 whitespace-nowrap'

type TestState = 'idle' | 'ok' | 'error'

function testLabel(pending: boolean, status: TestState) {
  return pending ? 'Sending...' : status === 'ok' ? 'Sent!' : status === 'error' ? 'Failed' : 'Test'
}

export default function CommsPanel() {
  const { data: config, isLoading, error } = useAdminConfig()
  const update = useUpdateAdminConfig()
  const testBot = useTestDiscordBot()

  const [botEnabled, setBotEnabled] = useState(false)
  const [commandChannel, setCommandChannel] = useState('')
  const [listenChannels, setListenChannels] = useState('')
  const [saved, setSaved] = useState(false)
  const [botTest, setBotTest] = useState<TestState>('idle')

  useEffect(() => {
    if (config) {
      setBotEnabled(config.discord_bot_enabled)
      setCommandChannel(config.discord_bot_command_channel)
      setListenChannels(config.discord_bot_listen_channels)
    }
  }, [config])

  async function handleSave() {
    await update.mutateAsync({
      discord_bot_enabled: botEnabled,
      discord_bot_command_channel: commandChannel,
      discord_bot_listen_channels: listenChannels,
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function runTest(mutate: () => Promise<unknown>, setStatus: (s: TestState) => void) {
    setStatus('idle')
    try {
      await mutate()
      setStatus('ok')
    } catch {
      setStatus('error')
    } finally {
      setTimeout(() => setStatus('idle'), 3000)
    }
  }

  if (isLoading) return <p className="text-muted-foreground text-sm">Loading...</p>
  if (error) return <p className="text-destructive text-sm">Failed to load config.</p>

  return (
    <div className="flex flex-col gap-8 max-w-lg">
      {/* Discord Bot */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-sm font-medium text-foreground">Discord Bot</span>
            <span className="text-xs text-muted-foreground">
              Listens for slash commands &amp; messages, and posts.
            </span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={botEnabled}
            onClick={() => setBotEnabled((v) => !v)}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${botEnabled ? 'bg-primary/60' : 'bg-muted/30'}`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${botEnabled ? 'translate-x-6' : 'translate-x-1'}`}
            />
          </button>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">Command Channel ID</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={commandChannel}
              onChange={(e) => setCommandChannel(e.target.value)}
              placeholder="123456789012345678"
              className={INPUT_CLASS}
            />
            <button
              onClick={() => runTest(() => testBot.mutateAsync(), setBotTest)}
              disabled={testBot.isPending || !config?.discord_bot_command_channel}
              className={TEST_BTN_CLASS}
            >
              {testLabel(testBot.isPending, botTest)}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Where commands are allowed and where bot notifications &amp; test posts go.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">Listen Channel IDs</label>
          <input
            type="text"
            value={listenChannels}
            onChange={(e) => setListenChannels(e.target.value)}
            placeholder="123..., 456..."
            className={INPUT_CLASS}
          />
          <p className="text-xs text-muted-foreground">
            Comma-separated channels the message listener acts on.
          </p>
        </div>

        <p className="text-xs text-muted-foreground">
          The bot token &amp; guild id are set via env (<code>DISCORD_BOT_TOKEN</code>,{' '}
          <code>DISCORD_GUILD_ID</code>). The listener also needs Message Content Intent enabled in
          the Discord Developer Portal.
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
  )
}
