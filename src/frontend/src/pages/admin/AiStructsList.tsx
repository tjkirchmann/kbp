import { useEffect, useMemo, useState, forwardRef } from 'react'
import { Link } from 'react-router-dom'
import { BrainCircuit, Lock, Loader2 } from 'lucide-react'
import { localModel } from '@virtuoso.dev/data-table'
import { useStructDefinitions, type StructDefinitionSummary } from '@/services/useStructOutput'
import AdminTableToolbar from '@/components/admin/AdminTableToolbar'
import {
  DataTable,
  DataTableColumn,
  DataTableColumnHeader,
  DataTableCell,
} from '@/components/ui/data-table'

const ROW_HEIGHT = 44
const SEARCH_KEYS: (keyof StructDefinitionSummary)[] = ['name', 'source']

export default function AiStructsList() {
  const { data: defs = [], isLoading, error } = useStructDefinitions()
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return defs
    return defs.filter((d) =>
      SEARCH_KEYS.some((k) =>
        String(d[k] ?? '')
          .toLowerCase()
          .includes(q),
      ),
    )
  }, [defs, search])

  const [model] = useState(() => localModel<StructDefinitionSummary>({ data: [] }))
  useEffect(() => {
    model.setData?.(filtered)
  }, [model, filtered])

  if (error) {
    return <p className="text-destructive text-sm">Failed to load definitions.</p>
  }

  return (
    <div className="h-full flex flex-col gap-3 overflow-hidden">
      <AdminTableToolbar
        count={filtered.length}
        total={defs.length}
        noun="definition"
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search definitions…"
      />

      {isLoading && defs.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
        </div>
      ) : filtered.length === 0 && search.trim() ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="py-4 text-sm text-muted-foreground">
            No definitions match the current search.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
          <BrainCircuit className="size-8 opacity-30" />
          <p className="text-sm">No structured-output definitions.</p>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col [&>*]:flex-1 [&>*]:min-h-0">
          <DataTable
            className="bg-white/[0.03] border border-border/20 rounded-2xl overflow-hidden flex-1 min-h-0"
            model={model}
            computeRowKey={({ data }) => data.name}
            components={{
              Row: forwardRef<any, any>(({ style, ...props }: any, ref) => (
                <div
                  ref={ref}
                  {...props}
                  className="flex items-center border-t border-border/20 transition-colors hover:bg-[rgba(26,30,42,0.4)]"
                  style={{ ...style, height: ROW_HEIGHT }}
                />
              )) as any,
            }}
          >
            <DataTableColumn id="icon">
              <DataTableColumnHeader className="w-16 justify-center" />
              <DataTableCell className="justify-center">
                {({ row }) => {
                  const def = row.data as StructDefinitionSummary
                  if (def.tier === 'static') {
                    return <Lock className="size-4 text-warning" />
                  }
                  return null
                }}
              </DataTableCell>
            </DataTableColumn>

            <DataTableColumn field="name" grow={2}>
              <DataTableColumnHeader className="px-5">Name</DataTableColumnHeader>
              <DataTableCell className="px-5">
                {({ row }) => {
                  const def = row.data as StructDefinitionSummary
                  return (
                    <Link
                      to={`/admin/ai-structs/${encodeURIComponent(def.name)}`}
                      className="block truncate text-sm font-medium text-foreground transition-colors hover:text-primary"
                    >
                      {def.name}
                    </Link>
                  )
                }}
              </DataTableCell>
            </DataTableColumn>

            <DataTableColumn field="source">
              <DataTableColumnHeader className="px-5">Source</DataTableColumnHeader>
              <DataTableCell className="px-5 font-mono text-xs text-muted-foreground truncate">
                {({ cellValue }) => String(cellValue)}
              </DataTableCell>
            </DataTableColumn>

            <DataTableColumn field="field_count">
              <DataTableColumnHeader className="px-5">Fields</DataTableColumnHeader>
              <DataTableCell className="px-5 font-mono text-xs text-muted-foreground">
                {({ cellValue }) => String(cellValue)}
              </DataTableCell>
            </DataTableColumn>

            <DataTableColumn field="model">
              <DataTableColumnHeader className="px-5">Model</DataTableColumnHeader>
              <DataTableCell className="px-5 font-mono text-xs text-muted-foreground truncate">
                {({ cellValue }) => String(cellValue)}
              </DataTableCell>
            </DataTableColumn>

            <DataTableColumn field="cron">
              <DataTableColumnHeader className="px-5">Cron</DataTableColumnHeader>
              <DataTableCell className="px-5 font-mono text-xs text-muted-foreground truncate">
                {({ cellValue }) => String(cellValue ?? '\u2014')}
              </DataTableCell>
            </DataTableColumn>
          </DataTable>
        </div>
      )}
    </div>
  )
}
