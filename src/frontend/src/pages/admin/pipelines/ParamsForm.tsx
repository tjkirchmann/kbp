import type { JsonSchemaProp, ParamsSchema } from '@/services/usePipelines'
import { useLibraryFiles } from '@/services/useAdminLibrary'
import { cn } from '@/lib/utils'

/** Resolved view of one schema property (after $ref / anyOf-null unwrapping). */
interface ResolvedField {
  type: string
  enumValues: string[] | null
  min: number | undefined
  max: number | undefined
  description: string | undefined
  nullable: boolean
  defaultValue: unknown
}

function resolveField(prop: JsonSchemaProp, defs: Record<string, JsonSchemaProp>): ResolvedField {
  let node = prop
  let nullable = false
  if (node.anyOf) {
    nullable = node.anyOf.some((b) => b.type === 'null')
    node = node.anyOf.find((b) => b.type !== 'null') ?? node
  }
  if (node.$ref) {
    const name = node.$ref.split('/').pop()!
    node = defs[name] ?? node
  }
  return {
    type: node.type ?? 'string',
    enumValues: node.enum ?? null,
    min: node.minimum ?? node.exclusiveMinimum,
    max: node.maximum,
    description: prop.description ?? node.description,
    nullable,
    defaultValue: prop.default,
  }
}

const inputClasses =
  'w-full rounded-lg border border-border/30 bg-white/[0.03] px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40'

function LibraryFilePicker({
  value,
  onChange,
}: {
  value: unknown
  onChange: (v: number | null) => void
}) {
  const { data: files = [] } = useLibraryFiles(false)
  const videos = files.filter((f) => f.content_type?.startsWith('video/'))
  return (
    <select
      className={inputClasses}
      value={value == null ? '' : String(value)}
      onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
    >
      <option value="">Select a video…</option>
      {videos.map((f) => (
        <option key={f.id} value={f.id}>
          {f.original_name}
        </option>
      ))}
    </select>
  )
}

interface ParamsFormProps {
  schema: ParamsSchema
  params: Record<string, unknown>
  onChange: (params: Record<string, unknown>) => void
  disabled?: boolean
}

/** Hand-rolled JSON-Schema → form renderer. Pipeline step params are flat
 * scalars and enums by design, so this covers the whole contract: enum →
 * select, boolean → checkbox, number → number input, string → text/textarea,
 * and the `library_file_id` field name → library video picker. */
export function ParamsForm({ schema, params, onChange, disabled }: ParamsFormProps) {
  const properties = schema.properties ?? {}
  const defs = schema.$defs ?? {}
  const set = (key: string, value: unknown) => onChange({ ...params, [key]: value })

  const fields = Object.entries(properties)
  if (fields.length === 0) {
    return <p className="text-xs text-muted-foreground">This step has no parameters.</p>
  }

  return (
    <div className={cn('flex flex-col gap-3', disabled && 'opacity-60 pointer-events-none')}>
      {fields.map(([key, prop]) => {
        const f = resolveField(prop, defs)
        const value = params[key] ?? f.defaultValue ?? null
        return (
          <label key={key} className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {key.replaceAll('_', ' ')}
            </span>
            {key === 'library_file_id' ? (
              <LibraryFilePicker value={value} onChange={(v) => set(key, v)} />
            ) : f.enumValues ? (
              <select
                className={inputClasses}
                value={String(value ?? '')}
                onChange={(e) => set(key, e.target.value)}
              >
                {f.enumValues.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : f.type === 'boolean' ? (
              <input
                type="checkbox"
                className="size-4 accent-[#009cde] self-start"
                checked={Boolean(value)}
                onChange={(e) => set(key, e.target.checked)}
              />
            ) : f.type === 'integer' || f.type === 'number' ? (
              <input
                type="number"
                className={inputClasses}
                value={value == null ? '' : String(value)}
                min={f.min}
                max={f.max}
                step={f.type === 'integer' ? 1 : 'any'}
                placeholder={f.nullable ? 'auto' : undefined}
                onChange={(e) => set(key, e.target.value === '' ? null : Number(e.target.value))}
              />
            ) : key === 'args' ? (
              <textarea
                className={cn(inputClasses, 'font-mono text-xs min-h-20')}
                value={String(value ?? '')}
                onChange={(e) => set(key, e.target.value)}
              />
            ) : (
              <input
                type="text"
                className={inputClasses}
                value={String(value ?? '')}
                onChange={(e) => set(key, e.target.value)}
              />
            )}
            {f.description && (
              <span className="text-xs text-muted-foreground">{f.description}</span>
            )}
          </label>
        )
      })}
    </div>
  )
}
