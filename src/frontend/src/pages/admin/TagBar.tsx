import { useState, useRef, useEffect, useMemo, useLayoutEffect } from 'react'
import { Plus, X } from 'lucide-react'
import { useTags, useTagSuggestions, useAddTag, useRemoveTag, type Tag } from '@/services/useTags'
import { useToast } from '@/components/toast/ToastContext'

const dropdownStyle = {
  background: 'rgba(13, 15, 19, 0.92)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
} as const

const GAP = 6 // gap-1.5 between items, in px
const ADD_BTN_W = 22 // the trailing + add button
const OVERFLOW_W = 30 // approx width of the +N badge

/**
 * How many chips fit in `available` px. The + add button always sits after the
 * chips, so its width is always reserved; the +N badge width is reserved only
 * when chips overflow. Returns the visible count.
 */
function fitCount(widths: number[], available: number): number {
  // The trailing + button (and its gap) is always present.
  const base = available - ADD_BTN_W - GAP
  if (base <= 0) return 0
  const fits = (limit: number) => {
    let used = 0
    let n = 0
    for (let i = 0; i < widths.length; i++) {
      const next = used + (i === 0 ? 0 : GAP) + widths[i]
      if (next > limit) break
      used = next
      n++
    }
    return n
  }
  const n = fits(base)
  if (n === widths.length) return n // all fit, no +N badge needed
  // Overflow: also reserve the +N badge so it never gets clipped.
  return fits(base - OVERFLOW_W - GAP)
}

function Chip({ tag, onRemove }: { tag: Tag; onRemove?: () => void }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${tag.color}`}>
      {tag.name}
      {onRemove && (
        <button
          onClick={onRemove}
          className="opacity-60 hover:opacity-100 transition-opacity"
          aria-label={`Remove ${tag.name}`}
        >
          <X className="size-2.5" />
        </button>
      )}
    </span>
  )
}

/** Click-outside hook shared by the two popovers. */
function useClickOutside<T extends HTMLElement>(onClose: () => void) {
  const ref = useRef<T>(null)
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])
  return ref
}

/**
 * Inline tag editor for any entity. Shows as many applied tags as fit the
 * available width, collapsing the overflow behind a +N ellipsis (dropdown lists
 * all, each removable), and a + button opens a popover to add a free-text tag or
 * pick from existing tags for this entity type.
 */
export default function TagBar({ entityType, entityId }: { entityType: string; entityId: string }) {
  const { toast } = useToast()
  const { data: tags = [] } = useTags(entityType, entityId)
  const add = useAddTag(entityType, entityId)
  const remove = useRemoveTag(entityType, entityId)

  const [allOpen, setAllOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [input, setInput] = useState('')

  const allRef = useClickOutside<HTMLDivElement>(() => setAllOpen(false))
  const addRef = useClickOutside<HTMLDivElement>(() => { setAddOpen(false); setInput('') })

  const { data: suggestions = [] } = useTagSuggestions(entityType, entityId, addOpen)
  const filtered = useMemo(() => {
    const q = input.trim().toLowerCase()
    return q ? suggestions.filter(s => s.toLowerCase().includes(q)) : suggestions
  }, [suggestions, input])

  // --- Overflow measurement: show as many chips as fit, collapse rest into +N ---
  const rowRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const [visibleCount, setVisibleCount] = useState(tags.length)

  useLayoutEffect(() => {
    const row = rowRef.current
    const measure = measureRef.current
    if (!row || !measure) return
    const recompute = () => {
      const widths = Array.from(measure.children).map(c => (c as HTMLElement).offsetWidth)
      setVisibleCount(fitCount(widths, row.clientWidth))
    }
    recompute()
    const ro = new ResizeObserver(recompute)
    ro.observe(row)
    return () => ro.disconnect()
  }, [tags])

  const visible = tags.slice(0, visibleCount)
  const hidden = tags.slice(visibleCount)

  const submit = (name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    add.mutate(trimmed, {
      onSuccess: () => { setInput(''); setAddOpen(false) },
      onError: () => toast({ variant: 'error', title: 'Could not add tag', description: trimmed }),
    })
  }

  const onRemove = (name: string) =>
    remove.mutate(name, {
      onError: () => toast({ variant: 'error', title: 'Could not remove tag', description: name }),
    })

  return (
    // rowRef on the full-width wrapper sets the available width to measure against.
    // No overflow-hidden here — it would clip the +N / + add popovers.
    <div ref={rowRef} className="flex items-center gap-1.5 w-full min-w-0">
      {/* Offscreen measurement layer: all chips at natural width, never shown. */}
      <div ref={measureRef} aria-hidden className="absolute -left-[9999px] top-0 flex gap-1.5 invisible">
        {tags.map(t => <Chip key={t.name} tag={t} />)}
      </div>

      {/* Visible chips — as many as fit, left-justified. */}
      {tags.length === 0 ? (
        <span className="text-[10px] text-muted-foreground/60 shrink-0">No tags</span>
      ) : (
        visible.map(t => (
          <span key={t.name} className="shrink-0">
            <Chip tag={t} onRemove={() => onRemove(t.name)} />
          </span>
        ))
      )}

      {/* +N ellipsis — reveals the hidden tags */}
      {hidden.length > 0 && (
        <div ref={allRef} className="relative shrink-0">
          <button
            onClick={() => setAllOpen(o => !o)}
            className="text-[10px] px-1.5 py-0.5 rounded-full border border-border/50 text-muted-foreground hover:bg-muted/40 transition-colors"
          >
            +{hidden.length}
          </button>
          {allOpen && (
            <div
              className="absolute left-0 top-7 rounded-xl p-2 min-w-44 z-50 shadow-lg border border-white/10 flex flex-wrap gap-1.5"
              style={dropdownStyle}
            >
              {tags.map(t => (
                <Chip key={t.name} tag={t} onRemove={() => onRemove(t.name)} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* + add — free text or pick from existing; sits after the chips. */}
      <div ref={addRef} className="relative shrink-0">
        <button
          onClick={() => setAddOpen(o => !o)}
          className="p-0.5 rounded-full border border-border/50 text-muted-foreground hover:bg-muted/40 transition-colors"
          aria-label="Add tag"
        >
          <Plus className="size-3" />
        </button>
        {addOpen && (
          <div
            className="absolute left-0 top-7 rounded-xl p-2 w-52 z-50 shadow-lg border border-white/10 flex flex-col gap-1.5"
            style={dropdownStyle}
          >
            <input
              autoFocus
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submit(input) }}
              placeholder="Add a tag…"
              className="bg-transparent border border-border/50 rounded-md px-2 py-1 text-[11px] text-foreground/90 focus:outline-none focus:border-primary/50"
            />
            {input.trim() && !suggestions.includes(input.trim()) && (
              <button
                onClick={() => submit(input)}
                className="text-left text-[11px] px-2 py-1 rounded-md text-primary hover:bg-primary/15 transition-colors"
              >
                Create “{input.trim()}”
              </button>
            )}
            {filtered.length > 0 && (
              <div className="flex flex-col gap-0.5 max-h-40 overflow-y-auto">
                {filtered.map(s => (
                  <button
                    key={s}
                    onClick={() => submit(s)}
                    className="text-left text-[11px] px-2 py-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors truncate"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            {!input.trim() && filtered.length === 0 && (
              <p className="text-[10px] text-muted-foreground/60 px-2 py-1">No existing tags</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
