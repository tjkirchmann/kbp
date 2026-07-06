import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { X } from 'lucide-react'
import {
  useStructDefinition,
  useStructOutputs,
  type StructOutputRow,
  type StructTier,
} from '@/services/useStructOutput'

// Bookkeeping columns shown grouped at the bottom of the side panel rather than
// in the field list. Present on every output table (static ORM + dynamic DDL).
const META_KEYS = new Set(['generated_at', 'model', 'run_id'])

function tierClass(tier: StructTier) {
  return tier === 'static' ? 'tag-teal' : 'tag-purple'
}

/** Generic cell value → display string (no per-definition prettification). */
function fmt(v: unknown): string {
  if (v == null) return '—'
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  return String(v)
}

function fmtDate(v: unknown): string {
  if (v == null) return '—'
  const d = new Date(String(v))
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString()
}

export default function AiStructDetail() {
  const { name } = useParams<{ name: string }>()
  const def = useStructDefinition(name)
  const outputs = useStructOutputs(name)
  const [selected, setSelected] = useState<StructOutputRow | null>(null)

  const labelFields = outputs.data?.label_fields ?? []
  // Column order: every key on the first row except the _labels nest. Label
  // fields render from row._labels and are shown first (the row's identity).
  const columns = useMemo(() => {
    const first = outputs.data?.rows?.[0]
    return first ? Object.keys(first).filter((k) => k !== '_labels') : []
  }, [outputs.data])

  return (
    <div className="flex h-full min-h-0 gap-5">
      <div className="flex flex-1 min-w-0 min-h-0 flex-col gap-4 overflow-y-auto pr-1">
        {def.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : def.error ? (
          <p className="text-sm text-destructive">Failed to load definition.</p>
        ) : def.data ? (
          <>
            {/* Header: name · tier · source · model · cron */}
            <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1.5">
              <h1 className="text-xl font-semibold tracking-tight text-foreground">
                {def.data.name}
              </h1>
              <span
                className={`shrink-0 rounded-full px-1.5 py-0.5 text-xs font-medium ${tierClass(
                  def.data.tier,
                )}`}
              >
                {def.data.tier}
              </span>
              <span className="whitespace-nowrap text-xs text-muted-foreground">
                source{' '}
                <span className="font-mono text-foreground/90">
                  {def.data.source ?? def.data.source_table}
                </span>
              </span>
              <span className="whitespace-nowrap text-xs text-muted-foreground">
                model <span className="font-mono text-foreground/90">{def.data.model}</span>
              </span>
              {def.data.cron && (
                <span className="whitespace-nowrap text-xs text-muted-foreground">
                  cron <span className="font-mono text-foreground/90">{def.data.cron}</span>
                </span>
              )}
            </div>

            {/* Definition summary: fields + prompt */}
            <div className="flex shrink-0 flex-col gap-3 rounded-xl border border-border/20 bg-white/[0.03] p-4">
              <div>
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
                  Fields ({def.data.fields.length})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {def.data.fields.map((f) => (
                    <span
                      key={f.name}
                      className="whitespace-nowrap rounded-md bg-muted/50 px-2 py-0.5 font-mono text-xs text-foreground/90"
                    >
                      {f.name}: {f.type}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
                  Prompt
                </p>
                <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-md bg-muted/30 p-3 font-mono text-xs text-foreground/80">
                  {def.data.prompt_template}
                </pre>
              </div>
            </div>

            {/* Results table — flat & generic, horizontally scrollable */}
            {outputs.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading outputs…</p>
            ) : outputs.error ? (
              <p className="text-sm text-destructive">Failed to load outputs.</p>
            ) : !outputs.data?.rows.length ? (
              <p className="text-sm text-muted-foreground">No outputs generated yet.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border/20 bg-white/[0.03]">
                <table className="min-w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border/40">
                      {labelFields.map((lf) => (
                        <th
                          key={`l-${lf}`}
                          className="whitespace-nowrap px-3 py-2 text-left font-medium text-foreground"
                        >
                          {lf}
                        </th>
                      ))}
                      {columns.map((c) => (
                        <th
                          key={c}
                          className="whitespace-nowrap px-3 py-2 text-left font-medium text-muted-foreground"
                        >
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {outputs.data.rows.map((row, i) => {
                      const isSel = selected === row
                      return (
                        <tr
                          key={
                            labelFields.map((lf) => String(row._labels[lf] ?? '')).join('|') ||
                            String(i)
                          }
                          onClick={() => setSelected(isSel ? null : row)}
                          className={`cursor-pointer border-b border-border/20 transition-colors hover:bg-white/[0.04] ${
                            isSel ? 'bg-primary/10' : ''
                          }`}
                        >
                          {labelFields.map((lf) => (
                            <td
                              key={`l-${lf}`}
                              className="whitespace-nowrap px-3 py-2 font-medium text-foreground"
                            >
                              {fmt(row._labels[lf])}
                            </td>
                          ))}
                          {columns.map((c) => (
                            <td key={c} className="whitespace-nowrap px-3 py-2 text-foreground/80">
                              {fmt(row[c])}
                            </td>
                          ))}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : null}
      </div>

      {/* Row side panel — appears on row click */}
      {selected && (
        <aside className="flex h-full min-h-0 w-[380px] shrink-0 flex-col border-l border-border/40 pl-5">
          <div className="flex shrink-0 items-start justify-between gap-2 pb-3">
            <h2 className="text-base font-semibold leading-tight text-foreground">
              {labelFields
                .map((lf) => fmt(selected._labels[lf]))
                .filter((v) => v && v !== '—')
                .join(' · ') || 'Row detail'}
            </h2>
            <button
              onClick={() => setSelected(null)}
              aria-label="Close"
              className="shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
            <dl className="flex flex-col gap-1.5">
              {columns
                .filter((c) => !META_KEYS.has(c))
                .map((c) => (
                  <div key={c} className="flex flex-col gap-0.5">
                    <dt className="font-mono text-[11px] text-muted-foreground/70">{c}</dt>
                    <dd className="break-words text-sm text-foreground/90">{fmt(selected[c])}</dd>
                  </div>
                ))}
            </dl>
            <div className="flex flex-col gap-1.5 border-t border-border/20 pt-3">
              {['generated_at', 'model', 'run_id']
                .filter((k) => selected[k] != null)
                .map((k) => (
                  <div key={k} className="flex justify-between gap-2 text-xs">
                    <span className="font-mono text-muted-foreground/70">{k}</span>
                    <span className="break-all text-right font-mono text-foreground/80">
                      {k === 'generated_at' ? fmtDate(selected[k]) : fmt(selected[k])}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        </aside>
      )}
    </div>
  )
}
