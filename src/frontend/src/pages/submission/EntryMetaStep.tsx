import { useEffect, useState } from 'react'
import { Loader2, User, Users } from 'lucide-react'
import { useEnterPool, useMySubmissions } from '@/services/useSubmission'

interface Props {
  poolId: number
  onComplete: (submissionId: number, displayName: string) => void
}

type Mode = 'self' | 'other'
type OtherTab = 'create' | 'edit'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function EntryMetaStep({ poolId, onComplete }: Props) {
  const [mode, setMode] = useState<Mode | null>(null)
  const [otherTab, setOtherTab] = useState<OtherTab>('create')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const enter = useEnterPool(poolId)
  const { data: mySubmissions = [] } = useMySubmissions(poolId)

  const selfSubmission = mySubmissions.find((s) => s.on_behalf_of_name === '')
  const otherSubmissions = mySubmissions.filter((s) => s.on_behalf_of_name !== '')

  useEffect(() => {
    setSelectedId(null)
    setName('')
    setEmail('')
    setError(null)
    if (mode === 'other') setOtherTab('create')
  }, [mode])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    // Resuming an existing submission
    if (selectedId !== null) {
      const sub = mySubmissions.find((s) => s.id === selectedId)
      onComplete(selectedId, sub?.on_behalf_of_name || 'Me')
      return
    }

    // Self with existing — button shouldn't be reachable, but guard anyway
    if (mode === 'self' && selfSubmission) {
      onComplete(selfSubmission.id, 'Me')
      return
    }

    if (mode === 'other' && otherTab === 'create' && !name.trim()) return

    try {
      const { submission_id } = await enter.mutateAsync({
        on_behalf_of_name: mode === 'other' ? name.trim() : '',
        on_behalf_of_email: mode === 'other' ? email.trim() || null : null,
      })
      onComplete(submission_id, mode === 'other' ? name.trim() : 'Me')
    } catch {
      setError('Something went wrong. Please try again.')
    }
  }

  const canSubmit =
    mode === 'self' ||
    (mode === 'other' && otherTab === 'edit' && selectedId !== null) ||
    (mode === 'other' && otherTab === 'create' && name.trim().length > 0)

  const submitLabel = (() => {
    if (mode === 'self' && selfSubmission) return 'Edit My Picks'
    if (mode === 'other' && otherTab === 'edit') return 'Edit Picks'
    return 'Continue to Pick Games'
  })()

  return (
    <form onSubmit={handleSubmit} className="flex flex-col h-full gap-5 items-center">
      <div className="space-y-1 self-start">
        <h2 className="text-base font-semibold text-foreground">Your Entry</h2>
        <p className="text-sm text-muted-foreground">Who is this entry for?</p>
      </div>

      {/* Hero switcher */}
      <div className="flex gap-3 max-w-xs w-full">
        <button
          type="button"
          onClick={() => setMode('self')}
          className={`flex-1 flex flex-col items-center gap-2 px-4 py-4 rounded-xl border text-sm font-medium transition-colors ${
            mode === 'self'
              ? 'bg-primary/15 border-primary/40 text-primary'
              : 'bg-[rgba(13,15,19,0.4)] border-border/40 text-muted-foreground hover:text-foreground hover:border-border'
          }`}
        >
          <User className="size-5" />
          Myself
        </button>
        <button
          type="button"
          onClick={() => setMode('other')}
          className={`flex-1 flex flex-col items-center gap-2 px-4 py-4 rounded-xl border text-sm font-medium transition-colors ${
            mode === 'other'
              ? 'bg-primary/15 border-primary/40 text-primary'
              : 'bg-[rgba(13,15,19,0.4)] border-border/40 text-muted-foreground hover:text-foreground hover:border-border'
          }`}
        >
          <Users className="size-5" />
          Someone Else
        </button>
      </div>

      {/* ── SELF branch ── */}
      {mode === 'self' && (
        <div className="max-w-xs w-full space-y-3">
          {selfSubmission ? (
            /* Non-selectable info row */
            <div className="flex items-center justify-between px-3 py-2.5 rounded-xl border border-border/40 bg-[rgba(13,15,19,0.4)] text-sm">
              <span className="font-medium text-foreground">My Entry</span>
              <span className="text-xs text-muted-foreground">
                {formatDate(selfSubmission.created_at)}
              </span>
            </div>
          ) : null}
        </div>
      )}

      {/* ── OTHER branch ── */}
      {mode === 'other' && (
        <div className="max-w-xs w-full space-y-4">
          {/* Underline tab switcher */}
          <div className="flex border-b border-border">
            <button
              type="button"
              onClick={() => {
                setOtherTab('create')
                setSelectedId(null)
              }}
              className={`flex-1 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                otherTab === 'create'
                  ? 'text-foreground border-primary'
                  : 'text-muted-foreground border-transparent hover:text-foreground'
              }`}
            >
              Create New
            </button>
            <button
              type="button"
              disabled={otherSubmissions.length === 0}
              onClick={() => otherSubmissions.length > 0 && setOtherTab('edit')}
              className={`flex-1 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                otherTab === 'edit'
                  ? 'text-foreground border-primary'
                  : otherSubmissions.length === 0
                    ? 'text-muted-foreground/30 border-transparent cursor-default'
                    : 'text-muted-foreground border-transparent hover:text-foreground'
              }`}
            >
              Edit Existing
            </button>
          </div>

          {/* Create New tab */}
          {otherTab === 'create' && (
            <div className="flex flex-col gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Submitting on behalf of <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Uncle Bob"
                  maxLength={80}
                  autoFocus
                  className="w-full px-4 py-2.5 rounded-xl bg-[rgba(13,15,19,0.6)] border border-border/40 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Their email{' '}
                  <span className="text-muted-foreground/50 font-normal normal-case">
                    (optional)
                  </span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="uncle.bob@example.com"
                  className="w-full px-4 py-2.5 rounded-xl bg-[rgba(13,15,19,0.6)] border border-border/40 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50"
                />
              </div>
            </div>
          )}

          {/* Edit Existing tab */}
          {otherTab === 'edit' && (
            <div className="space-y-1.5">
              {otherSubmissions.map((sub) => (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => setSelectedId(sub.id === selectedId ? null : sub.id)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-sm transition-colors ${
                    selectedId === sub.id
                      ? 'bg-primary/15 border-primary/40 text-primary'
                      : 'bg-[rgba(13,15,19,0.4)] border-border/40 text-muted-foreground hover:text-foreground hover:border-border'
                  }`}
                >
                  <span className="font-medium">{sub.on_behalf_of_name}</span>
                  <span className="text-xs opacity-60">{formatDate(sub.created_at)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {error && <p className="text-xs text-destructive max-w-xs w-full">{error}</p>}

      {mode !== null && (
        <div className="max-w-xs w-full">
          <button
            type="submit"
            disabled={!canSubmit || enter.isPending}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary/15 text-primary text-sm font-medium hover:bg-primary/25 transition-colors disabled:opacity-40"
          >
            {enter.isPending ? <Loader2 className="size-4 animate-spin" /> : submitLabel}
          </button>
        </div>
      )}
    </form>
  )
}
