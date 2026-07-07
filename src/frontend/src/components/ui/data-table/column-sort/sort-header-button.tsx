import { dispatchModelAction$, modelActionState$, useCellValue, usePublisher } from '@virtuoso.dev/data-table'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'

import { cn } from '@/lib/utils'

import type { HeaderSlotRenderParams } from '@virtuoso.dev/data-table'
import type { ReactNode } from 'react'

export type SortDirection = 'asc' | 'desc'
export type SortPayload = {
  field: string
  direction: SortDirection
}

export interface SortHeaderButtonProps extends Partial<HeaderSlotRenderParams> {
  action?: string
  className?: string
  field?: string
  getDirection?: (payload: unknown, field: string) => SortDirection | undefined
  getPayload?: (context: { direction: SortDirection | undefined; field: string; previousDirection: SortDirection | undefined }) => unknown
}

function sortDirectionFromPayload(payload: unknown, field: string): SortDirection | undefined {
  if (typeof payload !== 'object' || payload === null) {
    return undefined
  }

  const sort = payload as Partial<SortPayload>
  return sort.field === field && (sort.direction === 'asc' || sort.direction === 'desc') ? sort.direction : undefined
}

export function SortHeaderButton({
  action = 'sort',
  className,
  column,
  field,
  getDirection = sortDirectionFromPayload,
  getPayload,
}: SortHeaderButtonProps) {
  const dispatch = usePublisher(dispatchModelAction$)
  const actionState = useCellValue(modelActionState$)
  const sortField = field ?? column?.field

  if (!sortField) {
    return null
  }

  const direction = getDirection(actionState[action]?.payload, sortField)
  const nextDirection: SortDirection | undefined = direction === 'asc' ? 'desc' : direction === 'desc' ? undefined : 'asc'
  const label =
    nextDirection === 'asc'
      ? `Sort ${sortField} ascending`
      : nextDirection === 'desc'
        ? `Sort ${sortField} descending`
        : `Clear ${sortField} sorting`
  const Icon = direction === 'asc' ? ArrowUp : direction === 'desc' ? ArrowDown : ArrowUpDown

  return (
    <button
      aria-label={label}
      aria-pressed={direction !== undefined}
      className={cn(
        'ml-1 inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50',
        direction !== undefined && 'bg-muted text-foreground',
        !direction && 'opacity-0 group-hover:opacity-100',
        className
      )}
      data-sort-direction={direction}
      onClick={() => {
        dispatch({
          action,
          payload: getPayload
            ? getPayload({ direction: nextDirection, field: sortField, previousDirection: direction })
            : nextDirection === undefined
              ? undefined
              : { field: sortField, direction: nextDirection },
        })
      }}
      title={label}
      type="button"
    >
      <Icon className="size-3.5" />
    </button>
  )
}

// ── Sortable header label (clickable text + arrow only when sorted) ───────

export interface SortableHeaderLabelProps {
  field: string
  children: ReactNode
  className?: string
}

export function SortableHeaderLabel({ field, children, className }: SortableHeaderLabelProps) {
  const dispatch = usePublisher(dispatchModelAction$)
  const actionState = useCellValue(modelActionState$)

  const direction = sortDirectionFromPayload(actionState['sort']?.payload, field)
  const nextDirection: SortDirection | undefined =
    direction === 'asc' ? 'desc' : direction === 'desc' ? undefined : 'asc'

  const handleClick = () => {
    dispatch({
      action: 'sort',
      payload: nextDirection === undefined ? undefined : { field, direction: nextDirection },
    })
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        'flex items-center gap-1.5 transition-colors hover:text-foreground text-left',
        direction !== undefined && 'text-foreground',
        !direction && 'text-muted-foreground',
        className,
      )}
    >
      {children}
      <span className="inline-flex size-3.5 shrink-0 items-center justify-center">
        {direction === 'asc' && <ArrowUp className="size-3.5 text-primary" />}
        {direction === 'desc' && <ArrowDown className="size-3.5 text-primary" />}
      </span>
    </button>
  )
}
