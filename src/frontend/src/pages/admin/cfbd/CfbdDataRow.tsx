import type { CfbdColumnConfig, CfbdRenderContext } from './tableRegistry'

function toCellValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

interface CfbdDataRowProps {
  columns: CfbdColumnConfig[]
  row: Record<string, unknown>
  context?: CfbdRenderContext
  columnWidths?: Record<string, number>
}

/**
Single data row for the CFBD virtual table. Iterates the column config,
applies per-column renderers, and ensures every cell is flex-constrained
with `min-w-0` so long values never push their column wider than its
flex allocation — keeping every cell perfectly aligned with the header.
 */
export default function CfbdDataRow({ columns, row, context, columnWidths }: CfbdDataRowProps) {
  return (
    <div className="flex items-center h-full border-t border-border/20 hover:bg-[rgba(26,30,42,0.4)] transition-colors">
      {columns.map((col) => {
        const raw = row[col.key]
        const rendered = col.render ? col.render(raw, row, context) : toCellValue(raw)
        const cellClassName = col.className
          ? `px-5 flex items-center ${col.className}${col.minWidth ? '' : ' min-w-0'}`
          : `px-5 flex items-center flex-[1]${col.minWidth ? '' : ' min-w-0'}`
        const cellStyle = columnWidths?.[col.key]
          ? { width: columnWidths[col.key], flex: '0 0 auto' as const }
          : col.minWidth
            ? { minWidth: col.minWidth }
            : undefined
        return (
          <div key={col.key} className={cellClassName} style={cellStyle}>
            {col.rawCell ? (
              rendered
            ) : (
              <span className="text-xs text-muted-foreground truncate block">{rendered}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}
