import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AdminTableToolbarProps {
  /** Number of rows currently shown (after filtering). */
  count: number
  /** Total rows before filtering. When it differs from `count`, the label reads "X of Y". */
  total: number
  /** Singular noun for the rows, e.g. "team". Pluralized with a trailing "s". */
  noun: string
  /** Extra text appended after the count, e.g. "· synced 5m ago". */
  countSuffix?: string
  /** When provided, renders a search input wired to these. */
  search?: string
  onSearch?: (value: string) => void
  searchPlaceholder?: string
  /** Right-aligned slot for per-page controls (filters, action buttons). */
  children?: React.ReactNode
  className?: string
}

// Fixed-height header band above an admin table. Keeping the height constant
// regardless of which optional slots are present means the table below always
// starts at the same vertical position across sections.
export default function AdminTableToolbar({
  count,
  total,
  noun,
  countSuffix,
  search,
  onSearch,
  searchPlaceholder,
  children,
  className,
}: AdminTableToolbarProps) {
  const label =
    total === 0
      ? `No ${noun}s`
      : count === total
        ? `${total} ${noun}${total !== 1 ? 's' : ''}`
        : `${count} of ${total} ${noun}s`

  return (
    <div className={cn('shrink-0 flex h-9 items-center gap-3', className)}>
      {onSearch && (
        <div className="relative flex-1 max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder={searchPlaceholder ?? 'Search…'}
            value={search ?? ''}
            onChange={(e) => onSearch(e.target.value)}
            className="w-full rounded-lg bg-white/[0.03] border border-border/20 pl-8 pr-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
        </div>
      )}
      <p
        className={cn(
          'text-sm text-muted-foreground shrink-0 whitespace-nowrap',
          !onSearch && 'mr-auto',
        )}
      >
        {label}
        {countSuffix ? ` ${countSuffix}` : ''}
      </p>
      {children && <div className="ml-auto flex items-center gap-2 shrink-0">{children}</div>}
    </div>
  )
}
