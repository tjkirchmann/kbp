import { useState } from 'react'
import cronstrue from 'cronstrue'
import { useSetCron } from '@/services/useAdminSync'
import { ApiError } from '@/lib/apiError'

// Human-readable cron (e.g. every-15-min -> "Every 15 minutes"), or null if unparseable.
function describeCron(cron: string): string | null {
  try {
    return cronstrue.toString(cron, { verbose: false })
  } catch {
    return null
  }
}

/** Inline-editable cron, shared by the sync card and task-detail views.
 *  Blank = paused (amber). Run-only tasks (schedulable=false) show static text. */
export default function CronField({
  taskName,
  cron,
  schedulable,
}: {
  taskName: string
  cron: string | null
  schedulable: boolean
}) {
  const setCron = useSetCron(taskName)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(cron ?? '')
  const [error, setError] = useState<string | null>(null)

  // Run-only tasks have no schedule and can't be edited.
  if (!schedulable) {
    return <span className="text-[10px] text-muted-foreground truncate min-w-0">Run-only task</span>
  }

  const submit = () => {
    const next = draft.trim()
    if (next === (cron ?? '')) {
      setEditing(false)
      setError(null)
      return
    }
    setCron.mutate(next === '' ? null : next, {
      onSuccess: () => {
        setEditing(false)
        setError(null)
      },
      onError: (e) =>
        setError(e instanceof ApiError && e.status === 400 ? 'Invalid cron' : 'Failed to save'),
    })
  }

  if (editing) {
    const draftDesc = draft.trim() ? describeCron(draft.trim()) : null
    // Size the input to its content so it occupies the same width as the cron text
    // it replaces (no layout jump on edit). +1ch headroom for the caret.
    const ch = Math.max(draft.length + 3, (cron ?? '').length + 3, 16)
    return (
      <span className="flex items-center gap-2 min-w-0 text-[10px]">
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={submit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
            if (e.key === 'Escape') {
              setDraft(cron ?? '')
              setEditing(false)
              setError(null)
            }
          }}
          placeholder="blank = paused"
          disabled={setCron.isPending}
          style={{ width: `${ch}ch` }}
          className="font-mono bg-transparent border border-primary/50 rounded px-1 py-0.5 text-foreground/90 focus:outline-none disabled:opacity-50"
        />
        {/* Live plain-English preview as you type. */}
        {error ? (
          <span className="text-destructive shrink-0">{error}</span>
        ) : (
          draftDesc && (
            <span className="text-muted-foreground shrink-0 truncate">· {draftDesc}</span>
          )
        )}
      </span>
    )
  }

  const desc = cron ? describeCron(cron) : null
  return (
    <button
      onClick={() => {
        setDraft(cron ?? '')
        setEditing(true)
        setError(null)
      }}
      title={
        cron
          ? `${desc ?? 'Custom schedule'} — click to edit (blank to pause)`
          : 'Paused — click to set a schedule'
      }
      className="flex items-center gap-2 min-w-0 text-[10px] hover:underline"
    >
      {cron ? (
        <>
          <span className="font-mono text-muted-foreground shrink-0 px-1 border border-transparent">
            {cron}
          </span>
          {desc && <span className="text-muted-foreground/70 truncate">· {desc}</span>}
        </>
      ) : (
        <span className="text-amber-500 font-medium">Paused — click to schedule</span>
      )}
    </button>
  )
}
