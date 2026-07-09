import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Check, Pencil, X } from 'lucide-react'
import { useProject, useUpdateProject } from '@/services/useProjects'
import { ProjectFilesPanel } from './ProjectFilesPanel'
import { ProjectRunsPanel } from './ProjectRunsPanel'

export default function ProjectDetail() {
  const { projectId } = useParams()
  const id = Number(projectId)
  const { data: project, isLoading } = useProject(Number.isFinite(id) ? id : null)
  const update = useUpdateProject()
  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState('')

  async function saveName() {
    const trimmed = draftName.trim()
    if (trimmed && project && trimmed !== project.name) {
      await update.mutateAsync({ id: project.id, name: trimmed })
    }
    setEditing(false)
  }

  if (isLoading) {
    return <div className="py-6 text-sm text-muted-foreground">Loading…</div>
  }
  if (!project) {
    return <div className="py-6 text-sm text-muted-foreground">Project not found.</div>
  }

  return (
    <div className="py-4 flex flex-col gap-4 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link
          to="/admin/projects"
          className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
          title="Back to projects"
        >
          <ArrowLeft className="size-4" />
        </Link>
        {editing ? (
          <div className="flex items-center gap-2">
            <input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveName()
                if (e.key === 'Escape') setEditing(false)
              }}
              autoFocus
              className="rounded-lg border border-border/30 bg-white/[0.03] px-2.5 py-1.5 text-lg font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
            <button
              onClick={saveName}
              className="rounded-lg p-1.5 text-success hover:bg-white/5 transition-colors"
              title="Save name"
            >
              <Check className="size-4" />
            </button>
            <button
              onClick={() => setEditing(false)}
              className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
              title="Cancel"
            >
              <X className="size-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {project.name}
            </h1>
            <button
              onClick={() => {
                setDraftName(project.name)
                setEditing(true)
              }}
              className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
              title="Rename project"
            >
              <Pencil className="size-4" />
            </button>
          </div>
        )}
      </div>

      {project.description && (
        <p className="text-sm text-muted-foreground">{project.description}</p>
      )}

      <ProjectFilesPanel projectId={project.id} />
      <ProjectRunsPanel projectId={project.id} />
    </div>
  )
}
