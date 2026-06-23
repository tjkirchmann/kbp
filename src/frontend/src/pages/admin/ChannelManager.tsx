import { useState } from 'react'
import { Plus, Trash2, Send, Pencil, X, Check } from 'lucide-react'
import {
  useChannels,
  useUpsertChannel,
  useDeleteChannel,
  useTestChannel,
  type NotificationChannel,
} from '@/services/useAdminSync'
import { useToast } from '@/components/toast/ToastContext'

// Strategies the backend can deliver to. Add entries here as new
// NotificationStrategy implementations land. "none" is a black hole — a channel
// that accepts a payload and drops it, used to silence any consumer.
const STRATEGIES = [
  { value: 'discord', label: 'Discord' },
  { value: 'none', label: 'None (silence)' },
]

function webhookOf(c: NotificationChannel): string {
  const v = c.config?.webhook_url
  return typeof v === 'string' ? v : ''
}

export default function ChannelManager() {
  const channels = useChannels()
  const upsert = useUpsertChannel()
  const del = useDeleteChannel()
  const test = useTestChannel()
  const { toast } = useToast()

  // editing = the channel name being edited; null = creating a new channel.
  const [editing, setEditing] = useState<string | null>(null)
  const [strategy, setStrategy] = useState('discord')
  const [name, setName] = useState('')
  const [webhook, setWebhook] = useState('')

  // A "none" channel has no destination — webhook is irrelevant and stays empty.
  const needsWebhook = strategy !== 'none'
  // The built-in `none` channel's strategy is fixed; only its (empty) config is editable.
  const strategyLocked = editing === 'none'

  const resetForm = () => {
    setEditing(null)
    setStrategy('discord')
    setName('')
    setWebhook('')
  }

  const startEdit = (c: NotificationChannel) => {
    setEditing(c.name)
    setName(c.name)
    setStrategy(c.strategy)
    setWebhook(webhookOf(c))
  }

  const save = () => {
    if (!name.trim() || (needsWebhook && !webhook.trim())) return
    const config = needsWebhook ? { webhook_url: webhook.trim() } : {}
    const isEdit = editing !== null
    upsert.mutate(
      { name: name.trim(), strategy, config },
      {
        onSuccess: () => {
          resetForm()
          toast({
            variant: 'success',
            title: isEdit ? 'Channel updated' : 'Channel created',
            description: name.trim(),
          })
        },
        onError: (err) =>
          toast({
            variant: 'error',
            title: isEdit ? 'Could not update channel' : 'Could not create channel',
            description: err.message,
          }),
      },
    )
  }

  return (
    <div className="flex flex-col h-full min-h-0 gap-3 min-w-0">
      {/* Scrollable channel list */}
      <div className="flex flex-col gap-1.5 flex-1 min-h-0 overflow-y-auto pr-1">
        {(channels.data ?? []).map((c) => (
          <div key={c.name} className="flex items-center gap-2 text-[11px]">
            <span className="font-medium text-foreground/90 w-24 truncate" title={c.name}>
              {c.name}
            </span>
            <span className="px-1.5 py-0.5 rounded bg-muted/40 text-muted-foreground">
              {c.strategy}
            </span>
            <span className="text-muted-foreground truncate flex-1" title={webhookOf(c)}>
              {webhookOf(c)}
            </span>
            <button
              onClick={() => startEdit(c)}
              title="Edit channel"
              className={`text-muted-foreground hover:text-primary ${editing === c.name ? 'text-primary' : ''}`}
            >
              <Pencil className="size-3.5" />
            </button>
            <button
              onClick={() => test.mutate(c.name)}
              disabled={test.isPending}
              title="Send a test notification"
              className="text-muted-foreground hover:text-primary disabled:opacity-50"
            >
              <Send className="size-3.5" />
            </button>
            {c.name !== 'none' && (
              <button
                onClick={() => del.mutate(c.name)}
                disabled={del.isPending}
                title="Delete channel"
                className="text-muted-foreground hover:text-destructive disabled:opacity-50"
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
          </div>
        ))}
        {channels.data?.length === 0 && (
          <p className="text-[11px] text-muted-foreground">No channels yet.</p>
        )}
      </div>

      {/* Add / edit channel — pinned, always visible */}
      <div className="shrink-0 flex flex-col gap-2 text-[11px] pt-3 border-t border-border/40">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground font-medium">
            {editing ? `Edit ${editing}` : 'New channel'}
          </span>
          {editing && (
            <button
              onClick={resetForm}
              title="Cancel edit"
              className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" /> Cancel
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Strategy</span>
          <select
            value={strategy}
            onChange={(e) => setStrategy(e.target.value)}
            disabled={strategyLocked}
            className="bg-transparent border border-border/50 rounded-md px-1.5 py-0.5 text-foreground focus:outline-none focus:border-primary/50 disabled:opacity-50"
          >
            {STRATEGIES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="name"
            readOnly={editing !== null}
            className="bg-transparent border border-border/50 rounded-md px-1.5 py-0.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 read-only:opacity-60"
          />
          {needsWebhook && (
            <input
              value={webhook}
              onChange={(e) => setWebhook(e.target.value)}
              placeholder="discord webhook url"
              className="bg-transparent border border-border/50 rounded-md px-1.5 py-0.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
            />
          )}
          <button
            onClick={save}
            disabled={upsert.isPending || !name.trim() || (needsWebhook && !webhook.trim())}
            className="self-start flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/40 hover:bg-primary/25 transition-colors disabled:opacity-50"
          >
            {editing ? (
              <>
                <Check className="size-3" /> Save
              </>
            ) : (
              <>
                <Plus className="size-3" /> Add
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
