import { useCallback, useEffect, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Loader2, Check, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface AdminTableColumn {
  /** Stable key for the column. */
  key: string
  /** Header cell content. */
  header: React.ReactNode
  /** Column sizing/alignment classes, e.g. "flex-[3]" or "flex-[1] text-right". */
  className?: string
  /** Minimum column width in px when resizable. Defaults to 60. */
  minWidth?: number
}

interface AdminVirtualTableProps<T> {
  columns: AdminTableColumn[]
  rows: T[]
  rowKey: (row: T) => string | number
  /** Render the cells for one row. Second arg carries columnWidths when resizable. */
  renderRow: (
    row: T,
    meta?: { columnWidths?: Record<string, number> },
  ) => React.ReactNode
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
  /** True when more rows are available server-side. */
  hasMore?: boolean
  /** Called when the scroll nears the end of the list. */
  onLoadMore?: () => void
  /** True while requesting the next chunk; prevents duplicate triggers. */
  isLoadingMore?: boolean
  /** Sticky footer rendered below the scroll area, inside the table shell. */
  footer?: React.ReactNode
  /** Allow horizontal scrolling when columns exceed available width. */
  allowHorizontalScroll?: boolean
  /** Ref attached to the scrollable shell element (for external width measurement). */
  shellRef?: React.RefObject<HTMLDivElement | null>
  /** Enable column resize handles + horizontal scroll. */
  resizable?: boolean
  /** Column to sort by. */
  sortKey?: string
  /** Sort direction. */
  sortDir?: 'asc' | 'desc'
  /** Called when a column header is clicked. */
  onSortClick?: (key: string) => void
  /** Enable row selection mode. */
  selectable?: boolean
  /** Currently selected row IDs. */
  selectedIds?: Set<number | string>
  /** Called when selection changes. Receives a new Set (never mutates the old one). */
  onSelectionChange?: (ids: Set<number | string>) => void
  /** Body scrollTop to restore once rows first render (applied once per mount). */
  initialScrollTop?: number
  /** Reports the body scrollTop while scrolling (throttled, trailing). */
  onScrollTopChange?: (scrollTop: number) => void
}

const HEADER_ROW =
  'shrink-0 flex items-center border-b border-border/40 text-xs font-medium text-muted-foreground'
const SHELL =
  'bg-white/[0.03] border border-border/20 rounded-2xl overflow-hidden flex flex-col flex-1 min-h-0'
const ABSOLUTE_COL_FLOOR = 40
const CELL_PAD = 40 // px-5 padding (20px × 2)

let measurerCanvas: HTMLCanvasElement | null = null
let measurerCtx: CanvasRenderingContext2D | null = null

function getMeasurer(): CanvasRenderingContext2D {
  if (!measurerCtx) {
    measurerCanvas = document.createElement('canvas')
    measurerCtx = measurerCanvas.getContext('2d')!
  }
  return measurerCtx
}

function measureText(text: string, font: string): number {
  const ctx = getMeasurer()
  ctx.font = font
  return ctx.measureText(text).width
}

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
  hasMore,
  onLoadMore,
  isLoadingMore,
  resizable,
  sortKey,
  sortDir,
  onSortClick,
  footer,
  selectable = false,
  shellRef,
  selectedIds,
  onSelectionChange,
  initialScrollTop,
  onScrollTopChange,
}: AdminVirtualTableProps<T>) {
  const innerShellRef = useRef<HTMLDivElement>(null)
  const shellEl = shellRef ?? innerShellRef
  const parentRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const lastClickedIndexRef = useRef<number | null>(null)
  const initializedSizes = useRef(false)

  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({})
  const [headerMinWidths, setHeaderMinWidths] = useState<Record<string, number>>({})
  const headerRowRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 10,
  })

  useEffect(() => {
    const root = parentRef.current
    const sentinel = sentinelRef.current

    if (!root || !sentinel || !hasMore || !onLoadMore || isLoadingMore) {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries
        if (entry?.isIntersecting) {
          onLoadMore()
        }
      },
      {
        root,
        rootMargin: '200px 0px',
      },
    )

    observer.observe(sentinel)

    return () => observer.disconnect()
  }, [hasMore, isLoadingMore, onLoadMore, rows.length])

  // ── sync header horizontal position with body scroll ──────────
  const syncHeaderScroll = useCallback(() => {
    const body = parentRef.current
    const header = headerRowRef.current
    if (body && header) {
      header.style.transform = `translateX(${-body.scrollLeft}px)`
    }
  }, [])

  // ── scroll position reporting + restore ────────────────────────
  const scrollReportTimeoutRef = useRef<number | null>(null)
  const handleBodyScroll = useCallback(() => {
    if (resizable) syncHeaderScroll()
    if (!onScrollTopChange || scrollReportTimeoutRef.current != null) return
    scrollReportTimeoutRef.current = window.setTimeout(() => {
      scrollReportTimeoutRef.current = null
      if (parentRef.current) onScrollTopChange(parentRef.current.scrollTop)
    }, 150)
  }, [resizable, syncHeaderScroll, onScrollTopChange])

  useEffect(
    () => () => {
      if (scrollReportTimeoutRef.current != null) {
        window.clearTimeout(scrollReportTimeoutRef.current)
      }
    },
    [],
  )

  const appliedInitialScrollRef = useRef(false)
  useEffect(() => {
    if (appliedInitialScrollRef.current) return
    if (!initialScrollTop || initialScrollTop <= 0) return
    if (rows.length === 0 || !parentRef.current) return
    parentRef.current.scrollTop = initialScrollTop
    appliedInitialScrollRef.current = true
  }, [rows.length, initialScrollTop])


  // ── initial column widths + header minimums ────────────────
  const measureColumns = useCallback(() => {
    if (!resizable || !shellEl.current || initializedSizes.current) return
    const cells = shellEl.current.querySelectorAll<HTMLElement>('[data-col-header]')
    if (cells.length === 0) return
    const widths: Record<string, number> = {}
    const mins: Record<string, number> = {}
    cells.forEach((cell) => {
      const key = cell.getAttribute('data-col-header')
      if (!key) return
      widths[key] = cell.getBoundingClientRect().width

      // Header text minimum: measure label with header font
      const cs = getComputedStyle(cell)
      const font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
      const text = cell.textContent?.trim() ?? ''
      mins[key] = Math.ceil(measureText(text, font)) + CELL_PAD + 2
    })
    if (Object.keys(widths).length > 0) {
      setColumnWidths(widths)
      setHeaderMinWidths(mins)
      initializedSizes.current = true
    }
  }, [resizable, shellEl])

  useEffect(() => {
    if (!resizable || rows.length === 0 || isLoading) return
    const id = requestAnimationFrame(measureColumns)
    return () => cancelAnimationFrame(id)
  }, [resizable, rows.length, isLoading, measureColumns])

  useEffect(() => {
    if (resizable) {
      initializedSizes.current = false
      setColumnWidths({})
    }
  }, [resizable, columns])

  // ── resize handlers ──────────────────────────────────────────
  const handleResizeStart = useCallback(
    (colKey: string, index: number) => (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const startX = e.clientX
      const startWidths = { ...columnWidths }
      const currentCol = columns[index]
      const nextCol = columns[index + 1]
      if (!currentCol) return

      const onMove = (ev: MouseEvent) => {
        const delta = ev.clientX - startX
        const curMin = Math.max(currentCol.minWidth ?? 0, headerMinWidths[currentCol.key] ?? ABSOLUTE_COL_FLOOR)
        const nextMin = nextCol
          ? Math.max(nextCol.minWidth ?? 0, headerMinWidths[nextCol.key] ?? ABSOLUTE_COL_FLOOR)
          : ABSOLUTE_COL_FLOOR
        const curW = startWidths[currentCol.key] ?? curMin
        const nextW =
          nextCol && startWidths[nextCol.key] !== undefined
            ? startWidths[nextCol.key]
            : undefined
        setColumnWidths((prev) => {
          const next = { ...prev }
          next[currentCol.key] = Math.max(curMin, curW + delta)
          if (nextCol && nextW !== undefined)
            next[nextCol.key] = Math.max(nextMin, nextW - delta)
          return next
        })
      }

      const onUp = () => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }

      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    },
    [columnWidths, columns, headerMinWidths],
  )

  // ── double-click snap to content width ────────────────────
  const snapColumn = useCallback(
    (colKey: string, colIndex: number) => {
      const headerMin = headerMinWidths[colKey] ?? ABSOLUTE_COL_FLOOR

      const bodyEl = parentRef.current
      const bodyCs = bodyEl ? getComputedStyle(bodyEl) : null
      const bodyFont = bodyCs
        ? `${bodyCs.fontWeight} ${bodyCs.fontSize} ${bodyCs.fontFamily}`
        : '400 0.75rem "Geist Sans"'

      let maxCellW = 0
      const visible = virtualizer.getVirtualItems()
      for (const vr of visible) {
        const row = rows[vr.index] as Record<string, unknown>
        const raw = row[colKey]
        const text =
          raw === null || raw === undefined
            ? '—'
            : typeof raw === 'boolean'
              ? (raw ? 'Yes' : 'No')
              : String(raw)
        const w = measureText(text, bodyFont)
        if (w > maxCellW) maxCellW = w
      }

      const target = Math.ceil(Math.max(headerMin, maxCellW + CELL_PAD + 2))
      const currentCol = columns[colIndex]
      const nextCol = columns[colIndex + 1]
      if (!currentCol) return

      setColumnWidths((prev) => {
        const next = { ...prev }
        const delta = target - (prev[colKey] ?? headerMin)
        next[colKey] = target
        if (nextCol) {
          next[nextCol.key] = Math.max(
            headerMinWidths[nextCol.key] ?? ABSOLUTE_COL_FLOOR,
            (prev[nextCol.key] ?? headerMinWidths[nextCol.key] ?? ABSOLUTE_COL_FLOOR) - delta,
          )
        }
        return next
      })
    },
    [virtualizer, rows, columns, headerMinWidths],
  )

  const totalColumnWidth = Object.values(columnWidths).reduce((s, w) => s + w, 0)

  const colStyle = useCallback(
    (colKey: string): React.CSSProperties | undefined => {
      if (!resizable || !columnWidths[colKey]) return undefined
      return { width: columnWidths[colKey], flex: '0 0 auto' }
    },
    [resizable, columnWidths],
  )

  const handleRowClick = (row: T, index: number, event: React.MouseEvent) => {
    if (!selectable || !onSelectionChange || !selectedIds) return

    const id = rowKey(row)
    const shiftKey = event.shiftKey

    if (shiftKey && lastClickedIndexRef.current !== null) {
      const start = Math.min(lastClickedIndexRef.current, index)
      const end = Math.max(lastClickedIndexRef.current, index)
      const newSelection = new Set(selectedIds)
      for (let i = start; i <= end; i++) {
        newSelection.add(rowKey(rows[i]))
      }
      onSelectionChange(newSelection)
    } else {
      const newSelection = new Set(selectedIds)
      if (newSelection.has(id)) {
        newSelection.delete(id)
      } else {
        newSelection.add(id)
      }
      onSelectionChange(newSelection)
    }

    lastClickedIndexRef.current = index
  }

  const handleSelectAll = () => {
    if (!selectable || !onSelectionChange || !selectedIds) return

    const allSelected = rows.every((row) => selectedIds.has(rowKey(row)))
    const newSelection = new Set(selectedIds)

    if (allSelected) {
      rows.forEach((row) => newSelection.delete(rowKey(row)))
    } else {
      rows.forEach((row) => newSelection.add(rowKey(row)))
    }

    onSelectionChange(newSelection)
  }

  const renderHeader = (extra?: React.ReactNode) => (
    <div
      ref={headerRowRef}
      className={HEADER_ROW}
    >
      {extra}
      {columns.map((col, idx) => (
        <div
          key={col.key}
          data-col-header={col.key}
          className={cn(
            'px-5 py-2.5 relative select-none',
            !col.minWidth && 'min-w-0',
            col.className,
          )}
          style={resizable ? colStyle(col.key) : col.minWidth ? { minWidth: col.minWidth } : undefined}
        >
          {onSortClick ? (
            <button
              type="button"
              className="flex items-center gap-1 cursor-pointer hover:text-foreground transition-colors"
              onClick={() => onSortClick(col.key)}
            >
              {col.header}
              {sortKey === col.key && (
                <span className="text-[10px] leading-none">
                  {sortDir === 'asc' ? '▲' : '▼'}
                </span>
              )}
            </button>
          ) : (
            col.header
          )}
          {resizable && idx < columns.length - 1 && (
            <div
              className="absolute right-0 top-0 bottom-0 w-3 -mr-1 cursor-col-resize group/resize z-10"
              onMouseDown={handleResizeStart(col.key, idx)}
              onDoubleClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                snapColumn(col.key, idx)
              }}
            >
              <div className="absolute inset-y-2 left-1/2 w-px bg-border/30 group-hover/resize:bg-primary/60 transition-colors" />
            </div>
          )}
        </div>
      ))}
    </div>
  )

  if (isLoading) {
    return (
      <div ref={shellEl as React.RefObject<HTMLDivElement>} className={cn(SHELL, resizable && 'overflow-auto', className)}>
        {renderHeader(
          selectable ? (
            <div className="w-10 shrink-0 flex justify-center py-2.5">
              <span className="size-4 shrink-0 rounded-[5px] border border-border bg-white/[0.03]" />
            </div>
          ) : undefined,
        )}
        <div className="flex-1 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading…
        </div>
      </div>
    )
  }

  if (rows.length === 0) {
    const message = isFiltered
      ? (noMatchState ?? <p className="text-sm text-muted-foreground py-4">No matches.</p>)
      : (emptyState ?? <p className="text-sm text-muted-foreground py-4">Nothing here yet.</p>)
    return (
      <div ref={shellEl as React.RefObject<HTMLDivElement>} className={cn(SHELL, resizable && 'overflow-auto', className)}>
        {renderHeader(
          selectable ? (
            <div className="w-10 shrink-0 flex justify-center py-2.5">
              <span className="size-4 shrink-0 rounded-[5px] border border-border bg-white/[0.03]" />
            </div>
          ) : undefined,
        )}
        <div className="flex-1 flex items-center justify-center">{message}</div>
      </div>
    )
  }

  const allSelected =
    selectable &&
    selectedIds &&
    rows.length > 0 &&
    rows.every((row) => selectedIds.has(rowKey(row)))
  const someSelected = selectable && selectedIds && rows.some((row) => selectedIds.has(rowKey(row)))
  const indeterminate = someSelected && !allSelected

  const renderBodyRow = (row: T, vRow: { index: number; start: number }) => {
    const sharedStyle: React.CSSProperties = {
      position: 'absolute',
      transform: `translateY(${vRow.start}px)`,
      left: 0,
      height: rowHeight,
    }
    if (resizable && totalColumnWidth > 0) {
      sharedStyle.width = totalColumnWidth
    } else {
      sharedStyle.right = 0
    }

    if (!selectable) {
      return (
        <div key={rowKey(row)} style={sharedStyle}>
          {renderRow(row, { columnWidths: resizable ? columnWidths : undefined })}
        </div>
      )
    }

    const isSelected = selectedIds?.has(rowKey(row))
    return (
      <div
        key={rowKey(row)}
        style={sharedStyle}
        className={cn(
          'border-t border-border/20 transition-colors cursor-pointer hover:bg-[rgba(26,30,42,0.4)]',
          isSelected && 'bg-primary/[0.06]',
        )}
        onClick={(e) => handleRowClick(row, vRow.index, e)}
      >
        <div className="flex items-center h-full w-full">
          <div className="w-10 shrink-0 flex justify-center">
            <span
              className={cn(
                'size-4 shrink-0 rounded-[5px] border flex items-center justify-center transition-colors',
                isSelected ? 'bg-primary border-primary' : 'bg-white/[0.03] border-border',
              )}
            >
              {isSelected && <Check className="size-3 text-primary-foreground" strokeWidth={3} />}
            </span>
          </div>
          {renderRow(row, { columnWidths: resizable ? columnWidths : undefined })}
        </div>
      </div>
    )
  }

  return (
    <div ref={shellEl as React.RefObject<HTMLDivElement>} className={cn(SHELL, resizable && 'overflow-auto', className)}>
      {renderHeader(
        selectable ? (
          <div className="w-10 shrink-0 flex justify-center py-2.5">
            <button
              onClick={handleSelectAll}
              className="size-4 shrink-0 rounded-[5px] border flex items-center justify-center transition-colors bg-white/[0.03] border-border hover:border-primary/60"
              disabled={rows.length === 0}
            >
              {allSelected ? (
                <Check className="size-3 text-primary" strokeWidth={3} />
              ) : indeterminate ? (
                <Minus className="size-3 text-primary" strokeWidth={3} />
              ) : null}
            </button>
          </div>
        ) : undefined,
      )}
      <div
        ref={parentRef}
        className={cn('flex-1', resizable ? 'overflow-auto scrollbar-themed' : 'overflow-y-auto')}
        style={{ scrollbarGutter: 'stable', willChange: 'transform' }}
        onScroll={resizable || onScrollTopChange ? handleBodyScroll : undefined}
      >
        <div
          style={{
            height: virtualizer.getTotalSize(),
            position: 'relative',
            ...(resizable && totalColumnWidth > 0 ? { minWidth: totalColumnWidth } : {}),
          }}
        >
          {virtualizer.getVirtualItems().map((vRow) => renderBodyRow(rows[vRow.index], vRow))}
        </div>

        {resizable && totalColumnWidth > 0 && (hasMore || isLoadingMore) && (
          <div
            ref={sentinelRef}
            className="flex items-center justify-center py-3"
            style={{ minWidth: totalColumnWidth }}
          >
            {isLoadingMore ? (
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            ) : (
              <span className="sr-only">Load more rows</span>
            )}
          </div>
        )}
        {(!resizable || totalColumnWidth === 0) && (hasMore || isLoadingMore) && (
          <div ref={sentinelRef} className="flex items-center justify-center py-3">
            {isLoadingMore ? (
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            ) : (
              <span className="sr-only">Load more rows</span>
            )}
          </div>
        )}
      </div>
      {footer && (
        <div className="shrink-0 flex items-center border-t border-border/40 px-5 py-3">
          {footer}
        </div>
      )}
    </div>
  )
}
