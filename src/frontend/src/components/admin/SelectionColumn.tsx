import { useRef, useCallback } from 'react'
import { Check, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DataTableColumn, DataTableColumnHeader, DataTableCell } from '@/components/ui/data-table'
import type { CellRenderParams } from '@virtuoso.dev/data-table'

interface SelectionColumnProps<T> {
  /** Full sorted data array (needed for shift-click range and select-all). */
  data: T[]
  /** Extract a stable key from a row. */
  rowKey: (row: T) => string | number
  /** Currently selected IDs. */
  selectedIds: Set<string | number>
  /** Called when selection changes. Receives a new Set. */
  onSelectionChange: (ids: Set<string | number>) => void
}

/**
 * A DataTableColumn that renders a checkbox in the header (select-all with
 * indeterminate state) and each body cell.  Supports shift-click range
 * selection.  Intended as a child of <DataTable>.
 */
export default function SelectionColumn<T>({
  data,
  rowKey,
  selectedIds,
  onSelectionChange,
}: SelectionColumnProps<T>) {
  const lastClickedIndexRef = useRef<number | null>(null)

  const allSelected = data.length > 0 && data.every((row) => selectedIds.has(rowKey(row)))
  const someSelected = data.some((row) => selectedIds.has(rowKey(row)))
  const indeterminate = someSelected && !allSelected

  const handleHeaderClick = useCallback(() => {
    if (allSelected) {
      const next = new Set(selectedIds)
      data.forEach((row) => next.delete(rowKey(row)))
      onSelectionChange(next)
    } else {
      const next = new Set(selectedIds)
      data.forEach((row) => next.add(rowKey(row)))
      onSelectionChange(next)
    }
    lastClickedIndexRef.current = null
  }, [data, rowKey, selectedIds, onSelectionChange, allSelected])

  const handleCellClick = useCallback(
    (row: T, index: number, event: React.MouseEvent) => {
      if (event.shiftKey && lastClickedIndexRef.current !== null) {
        const start = Math.min(lastClickedIndexRef.current, index)
        const end = Math.max(lastClickedIndexRef.current, index)
        const next = new Set(selectedIds)
        for (let i = start; i <= end; i++) {
          next.add(rowKey(data[i]))
        }
        onSelectionChange(next)
      } else {
        const id = rowKey(row)
        const next = new Set(selectedIds)
        if (next.has(id)) {
          next.delete(id)
        } else {
          next.add(id)
        }
        onSelectionChange(next)
      }
      lastClickedIndexRef.current = index
    },
    [data, rowKey, selectedIds, onSelectionChange],
  )

  return (
    <DataTableColumn id="selection">
      <DataTableColumnHeader className="justify-center">
        <button
          type="button"
          onClick={handleHeaderClick}
          className={cn(
            'size-4 shrink-0 rounded-[5px] border flex items-center justify-center transition-colors',
            'bg-white/[0.03] border-border hover:border-primary/60 cursor-pointer',
          )}
          disabled={data.length === 0}
        >
          {allSelected ? (
            <Check className="size-3 text-primary" strokeWidth={3} />
          ) : indeterminate ? (
            <Minus className="size-3 text-primary" strokeWidth={3} />
          ) : null}
        </button>
      </DataTableColumnHeader>

      <DataTableCell className="justify-center px-2">
        {({ row }: CellRenderParams) => {
          const typedRow = row.data as T
          const id = rowKey(typedRow)
          const isSelected = selectedIds.has(id)

          return (
            <button
              type="button"
              onClick={(e) => handleCellClick(typedRow, row.index, e)}
              className={cn(
                'size-4 shrink-0 rounded-[5px] border flex items-center justify-center transition-colors cursor-pointer',
                isSelected ? 'bg-primary border-primary' : 'bg-white/[0.03] border-border',
              )}
            >
              {isSelected && <Check className="size-3 text-primary-foreground" strokeWidth={3} />}
            </button>
          )
        }}
      </DataTableCell>
    </DataTableColumn>
  )
}
