import { cn } from '@/lib/utils'

interface FilterInputProps {
  label: string
  type?: 'text' | 'number'
  placeholder?: string
  value?: string
  onChange: (value: string) => void
  /** Tailwind width class, e.g. 'w-24', 'w-36'. Defaults to 'w-32'. */
  width?: string
  min?: number
  max?: number
}

/**
Unified filter input for the CFBD data explorer.
Replaces the 6 near-identical per-filter component files + SimpleTextFilter
with a single component that covers both text and number inputs.

Number spinners are hidden globally via index.css.
 */
export default function FilterInput({
  label,
  type = 'text',
  placeholder,
  value,
  onChange,
  width = 'w-32',
  min,
  max,
}: FilterInputProps) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span>{label}</span>
      <input
        type={type}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        min={min}
        max={max}
        className={cn(
          'rounded-lg bg-white/[0.03] border border-border/20 px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40',
          width,
        )}
      />
    </label>
  )
}
