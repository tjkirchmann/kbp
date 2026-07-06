import { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react'
import { X, ChevronDown, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useClickOutside } from '@/pages/admin/useClickOutside'

interface SearchableSelectOption {
  value: string
  label: string
}

interface SearchableSelectProps {
  label?: string
  options: SearchableSelectOption[]
  value?: string
  onChange: (value: string) => void
  placeholder?: string
  /** When true, the clear (X) button is hidden — selection is required. */
  required?: boolean
}

/**
Search-to-select dropdown for large option sets (conference, team, etc.).

- Click trigger → opens dropdown with search input focused
- Type to filter the option list
- Arrow keys + Enter to navigate and select
- Escape to close
- Click X to clear selection
- Click outside to close

Styled to match ClearableSelect trigger button; dropdown is a positioned
popover with search input + scrollable option list.
 */
export default function SearchableSelect({
  label,
  options,
  value,
  onChange,
  placeholder = 'Search…',
  required = false,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [alignRight, setAlignRight] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false))

  const filtered = useMemo(() => {
    if (!query.trim()) return options
    const q = query.toLowerCase()
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q),
    )
  }, [options, query])

  // Reset query + active index on open
  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIndex(0)
      // Focus the search input on next tick
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  // Clamp active index when filtered list changes
  useEffect(() => {
    setActiveIndex((prev) => Math.min(prev, Math.max(0, filtered.length - 1)))
  }, [filtered.length])

  // Flip dropdown to the left when it overflows its nearest clipping ancestor
  useLayoutEffect(() => {
    if (!open) {
      setAlignRight(false)
      return
    }
    const el = dropdownRef.current
    if (!el) return

    const rect = el.getBoundingClientRect()

    // Walk up to find the nearest ancestor that clips overflow
    let bound = window.innerWidth
    let current: HTMLElement | null = el.parentElement
    while (current && current !== document.body) {
      const s = getComputedStyle(current)
      if (s.overflowX !== 'visible' || s.overflowY !== 'visible') {
        bound = current.getBoundingClientRect().right
        break
      }
      current = current.parentElement
    }

    setAlignRight(rect.right > bound - 4)
  }, [open])

  const selectedOption = value ? options.find((o) => o.value === value) : undefined

  const selectOption = (optionValue: string) => {
    onChange(optionValue)
    setOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((prev) => Math.min(prev + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((prev) => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[activeIndex]) {
        selectOption(filtered[activeIndex].value)
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={ref} className="relative">
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {label && <span>{label}</span>}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            'flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs transition-colors',
            open
              ? 'border-primary/40 bg-primary/10 text-foreground'
              : 'border-border/20 bg-white/[0.03] text-foreground hover:border-border/40',
          )}
        >
          <span className={selectedOption ? 'text-foreground' : 'text-muted-foreground'}>
            {selectedOption?.label ?? placeholder}
          </span>
          <ChevronDown
            className={cn('size-3 shrink-0 transition-transform', open && 'rotate-180')}
          />
        </button>
        {value && !required && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-white/5"
            aria-label="Clear selection"
          >
            <X className="size-3" />
          </button>
        )}
      </label>
      {open && (
        <div
          ref={dropdownRef}
          className={cn(
            'absolute top-full z-50 mt-1 min-w-[180px] rounded-lg border border-border bg-card p-1 shadow-2xl shadow-black/40',
            alignRight ? 'right-0' : 'left-0',
          )}
        >
          {/* Search input */}
          <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-border/20 mb-1">
            <Search className="size-3 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setActiveIndex(0)
              }}
              onKeyDown={handleKeyDown}
              placeholder="Filter…"
              className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
            />
          </div>

          {/* Options */}
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">No matches</p>
            ) : (
              filtered.map((option, idx) => {
                const active = option.value === value
                const highlighted = idx === activeIndex
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => selectOption(option.value)}
                    onMouseEnter={() => setActiveIndex(idx)}
                    className={cn(
                      'w-full rounded-md px-3 py-1.5 text-left text-xs font-medium transition-colors',
                      active
                        ? 'border border-primary/40 bg-primary/15 text-primary'
                        : highlighted
                          ? 'bg-white/5 text-foreground'
                          : 'text-muted-foreground hover:text-foreground hover:bg-white/5',
                    )}
                  >
                    {option.label}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
