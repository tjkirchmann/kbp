import { useState } from 'react'
import { X, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useClickOutside } from '@/pages/admin/useClickOutside'

interface ClearableSelectOption {
  value: string
  label: string
}

interface ClearableSelectProps {
  label?: string
  options: ClearableSelectOption[]
  value?: string
  onChange: (value: string) => void
  placeholder?: string
  /** When true, the clear (X) button is hidden — selection is required. */
  required?: boolean
}

/**
Custom clearable dropdown for known-value filter sets (season_type, poll).

Design language constraints: no native `<select>` element.
Styled trigger matches FilterInput; dropdown is a positioned popover
with option buttons matching the CfbdTableSelector button style.

- Click trigger → opens dropdown
- Click option → selects value, closes dropdown, fires onChange
- Click X → clears value, fires onChange('')
- Click outside → closes dropdown
 */
export default function ClearableSelect({
  label,
  options,
  value,
  onChange,
  placeholder = 'Select…',
  required = false,
}: ClearableSelectProps) {
  const [open, setOpen] = useState(false)
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false))

  const selectedOption = value ? options.find((o) => o.value === value) : undefined

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
        <div className="absolute left-0 top-full z-50 mt-1 min-w-[160px] rounded-lg border border-border bg-card p-1 shadow-2xl shadow-black/40">
          {options.map((option) => {
            const active = option.value === value
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                }}
                className={cn(
                  'w-full rounded-md px-3 py-1.5 text-left text-xs font-medium transition-colors',
                  active
                    ? 'border border-primary/40 bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-white/5',
                )}
              >
                {option.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
