import { Link } from 'react-router-dom'
import { BrainCircuit, Lock } from 'lucide-react'
import { useStructDefinitions, type StructDefinitionSummary } from '@/services/useStructOutput'
import AdminListTable from '@/components/admin/AdminListTable'
import { type AdminTableColumn } from '@/components/admin/AdminVirtualTable'

const ROW_HEIGHT = 44

// First column is an icon: gold lock for code-tracked (static) definitions, blank
// for runtime-configured (dynamic). The icon replaces the tier pill — a static
// struct is always locked/load-bearing, a dynamic one is editable.
const COLUMNS: AdminTableColumn[] = [
  { key: 'icon', header: '', className: 'w-16 shrink-0' },
  { key: 'name', header: 'Name', className: 'flex-[2]' },
  { key: 'source', header: 'Source', className: 'flex-[1.5]' },
  { key: 'fields', header: 'Fields', className: 'flex-[0.8]' },
  { key: 'model', header: 'Model', className: 'flex-[1.5]' },
  { key: 'cron', header: 'Cron', className: 'flex-[1.2]' },
]

function StructRow({ def }: { def: StructDefinitionSummary }) {
  return (
    <Link
      to={`/admin/ai-structs/${encodeURIComponent(def.name)}`}
      className="group flex h-full items-center border-t border-border/20 transition-colors hover:bg-[rgba(26,30,42,0.4)]"
    >
      <div className="flex w-16 shrink-0 items-center justify-center">
        {def.tier === 'static' && <Lock className="size-4 text-warning" />}
      </div>
      <div className="min-w-0 flex-[2] px-5">
        <span className="block truncate text-sm font-medium text-foreground transition-colors group-hover:text-primary">
          {def.name}
        </span>
      </div>
      <div className="flex-[1.5] truncate px-5 font-mono text-xs text-muted-foreground">
        {def.source}
      </div>
      <div className="flex-[0.8] px-5 font-mono text-xs text-muted-foreground">
        {def.field_count}
      </div>
      <div className="flex-[1.5] truncate px-5 font-mono text-xs text-muted-foreground">
        {def.model}
      </div>
      <div className="flex-[1.2] truncate px-5 font-mono text-xs text-muted-foreground">
        {def.cron ?? '—'}
      </div>
    </Link>
  )
}

export default function AiStructsList() {
  const { data: defs = [], isLoading, error } = useStructDefinitions()

  return (
    <AdminListTable<StructDefinitionSummary>
      data={defs}
      isLoading={isLoading}
      error={error as Error | null}
      columns={COLUMNS}
      rowKey={(d) => d.name}
      rowHeight={ROW_HEIGHT}
      renderRow={(def) => <StructRow def={def} />}
      noun="definition"
      searchKeys={['name', 'source']}
      searchPlaceholder="Search definitions…"
      emptyState={
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
          <BrainCircuit className="size-8 opacity-30" />
          <p className="text-sm">No structured-output definitions.</p>
        </div>
      }
      noMatchState={
        <p className="py-4 text-sm text-muted-foreground">
          No definitions match the current search.
        </p>
      }
    />
  )
}
