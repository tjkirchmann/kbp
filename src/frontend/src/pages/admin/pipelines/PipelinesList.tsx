import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Trash2, Workflow } from 'lucide-react'
import { useCreatePipeline, useDeletePipeline, usePipelines } from '@/services/usePipelines'

export default function PipelinesList() {
  const { data: pipelines = [], isLoading } = usePipelines()
  const create = useCreatePipeline()
  const del = useDeletePipeline()
  const navigate = useNavigate()
  const [name, setName] = useState('')

  async function onCreate() {
    const trimmed = name.trim()
    if (!trimmed) return
    const pipeline = await create.mutateAsync(trimmed)
    setName('')
    navigate(`/admin/pipelines/${pipeline.id}`)
  }

  return (
    <div className="py-4 flex flex-col gap-4 max-w-3xl">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Pipelines</h1>
        <div className="ml-auto flex items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onCreate()}
            placeholder="New pipeline name…"
            className="rounded-lg border border-border/30 bg-white/[0.03] px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
          <button
            onClick={onCreate}
            disabled={!name.trim() || create.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary/15 border border-primary/40 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
          >
            <Plus className="size-4" />
            Create
          </button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Drag-and-drop video processing over library files — each run executes on Temporal with live
        per-node status.
      </p>

      <div className="bg-white/[0.03] border border-border/20 rounded-lg divide-y divide-border/20">
        {isLoading ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">Loading…</div>
        ) : pipelines.length === 0 ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">
            No pipelines yet — name one above to get started.
          </div>
        ) : (
          pipelines.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors"
            >
              <Workflow className="size-4 text-muted-foreground shrink-0" />
              <Link
                to={`/admin/pipelines/${p.id}`}
                className="min-w-0 flex-1 text-sm font-medium text-foreground hover:text-primary transition-colors truncate"
              >
                {p.name}
              </Link>
              <span className="text-xs text-muted-foreground">
                {p.graph.nodes?.length ?? 0} node{(p.graph.nodes?.length ?? 0) === 1 ? '' : 's'}
              </span>
              <span className="text-xs text-muted-foreground">
                updated {new Date(p.updated_at + 'Z').toLocaleDateString()}
              </span>
              <button
                onClick={() => del.mutate(p.id)}
                className="rounded-lg p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                title="Delete pipeline"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
