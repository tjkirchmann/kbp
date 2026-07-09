import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FolderKanban, Plus, Trash2 } from 'lucide-react'
import { useCreateProject, useDeleteProject, useProjects } from '@/services/useProjects'

export default function ProjectsList() {
  const { data: projects = [], isLoading } = useProjects()
  const create = useCreateProject()
  const del = useDeleteProject()
  const navigate = useNavigate()
  const [name, setName] = useState('')

  async function onCreate() {
    const trimmed = name.trim()
    if (!trimmed) return
    const project = await create.mutateAsync(trimmed)
    setName('')
    navigate(`/admin/projects/${project.id}`)
  }

  return (
    <div className="py-4 flex flex-col gap-4 max-w-3xl">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Projects</h1>
        <div className="ml-auto flex items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onCreate()}
            placeholder="New project name…"
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
        A project owns its files and pipeline runs — pipelines stay shared, and every run records
        the project it executed in.
      </p>

      <div className="bg-white/[0.03] border border-border/20 rounded-lg divide-y divide-border/20">
        {isLoading ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">Loading…</div>
        ) : projects.length === 0 ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">
            No projects yet — name one above to get started.
          </div>
        ) : (
          projects.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors"
            >
              <FolderKanban className="size-4 text-muted-foreground shrink-0" />
              <Link
                to={`/admin/projects/${p.id}`}
                className="min-w-0 flex-1 text-sm font-medium text-foreground hover:text-primary transition-colors truncate"
              >
                {p.name}
              </Link>
              {p.description && (
                <span className="text-xs text-muted-foreground truncate max-w-48">
                  {p.description}
                </span>
              )}
              <span className="text-xs text-muted-foreground">
                created {new Date(p.created_at + 'Z').toLocaleDateString()}
              </span>
              <button
                onClick={() => del.mutate(p.id)}
                className="rounded-lg p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                title="Delete project"
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
