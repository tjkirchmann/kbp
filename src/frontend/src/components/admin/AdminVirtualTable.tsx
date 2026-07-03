import { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface AdminTableColumn {
  /** Stable key for the column. */
  key: string
  /** Header cell content. */
  header: React.ReactNode
  /** Column sizing/alignment classes, e.g. "flex-[3]" or "flex-[1] text-right". */
  className?: string
}

interface AdminVirtualTableProps<T> {
  columns: AdminTableColumn[]
  rows: T[]
  rowKey: (row: T) => string | number
  /** Render the cells for one row. Should mirror the column layout. */
  renderRow: (row: T) => React.ReactNode
  /** Fixed row height in px (drives virtualization). */
  rowHeight: number
  isLoading?: boolean
  /** Shown when there are zero rows before any filtering. */
  emptyState?: React.ReactNode
  /** Shown when rows is empty but a filter/search is active. */
  noMatchState?: React.ReactNode
  /** True when a filter/search is narrowing the list (selects noMatchState over emptyState). */
  isFiltered?: boolean
  className?: string
}

const HEADER_ROW = 'shrink-0 flex items-center border-b border-border/40 text-xs font-medium text-muted-foreground'
const SHELL = 'bg-white/[0.03] border border-border/20 rounded-2xl overflow-hidden flex flex-col flex-1 min-h-0'

// Shared shell + sticky flex column header + @tanstack/react-virtual body for the
// admin list tables. Each page supplies its columns and per-row cell markup; the
// virtualization, shell styling, and placeholder states live here so every table
// behaves and aligns identically.
export default function AdminVirtualTable<T>({
  columns,
  rows,
  rowKey,
  renderRow,
  rowHeight,
  isLoading,
  emptyState,
  noMatchState,
  isFiltered,
  className,
}: AdminVirtualTableProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 10,
  })

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
        <Loader2 className="size-4 animate-spin" />
        Loading…
      </div>
    )
  }

  if (rows.length === 0) {
    if (isFiltered) {
      return (
        <>{noMatchState ?? <p className="text-sm text-muted-foreground py-4">No matches.</p>}</>
      )
    }
    return <>{emptyState ?? <p className="text-sm text-muted-foreground py-4">Nothing here yet.</p>}</>
  }

  return (
    <div className={cn(SHELL, className)}>
      <div className={HEADER_ROW}>
        {columns.map((col) => (
          <div key={col.key} className={cn('px-5 py-2.5', col.className)}>
            {col.header}
          </div>
        ))}
      </div>
      <div
        ref={parentRef}
        className="flex-1 overflow-y-auto"
        style={{ scrollbarGutter: 'stable', willChange: 'transform' }}
      >
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((vRow) => {
            const row = rows[vRow.index]
            return (
              <div
                key={rowKey(row)}
                style={{
                  position: 'absolute',
                  transform: `translateY(${vRow.start}px)`,
                  left: 0,
                  right: 0,
                  height: rowHeight,
                }}
              >
                {renderRow(row)}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
