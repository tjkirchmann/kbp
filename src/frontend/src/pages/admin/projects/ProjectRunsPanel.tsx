import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Play, Workflow } from 'lucide-react'
import { useProjectRuns } from '@/services/useProjects'
import { usePipelines, useStartRun } from '@/services/usePipelines'
import { statusTextColors, formatDuration } from '@/pages/admin/pipelines/stepVisuals'
import { useToast } from '@/components/toast/ToastContext'

interface ProjectRunsPanelProps {
  projectId: number
}

export function ProjectRunsPanel({ projectId }: ProjectRunsPanelProps) {
  const { data: runs = [], isLoading } = useProjectRuns(projectId)
  const { data: pipelines = [] } = usePipelines()
  const startRun = useStartRun()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [pipelineId, setPipelineId] = useState<number | ''>('')

  async function onRun() {
    if (pipelineId === '') return
    try {
      const run = await startRun.mutateAsync({ pipelineId, projectId })
      navigate(`/admin/pipelines/${run.pipeline_id}?run=${run.id}`)
    } catch {
      toast({ variant: 'error', title: 'Run failed to start' })
    }
  }

  return (
    <div className="bg-white/[0.03] border border-border/20 rounded-lg">
      <div className="flex items-center gap-2 border-b border-border/40 px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">Runs</h2>
        <div className="ml-auto flex items-center gap-2">
          <select
            value={pipelineId}
            onChange={(e) => setPipelineId(e.target.value === '' ? '' : Number(e.target.value))}
            className="rounded-lg border border-border/30 bg-white/[0.03] px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
          >
            <option value="">Pick a pipeline…</option>
            {pipelines.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            onClick={onRun}
            disabled={pipelineId === '' || startRun.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary/15 border border-primary/40 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
          >
            <Play className="size-4" />
            Run
          </button>
        </div>
      </div>
      <div className="divide-y divide-border/20">
        {isLoading ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">Loading…</div>
        ) : runs.length === 0 ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">
            No runs yet — pick a pipeline above to run it in this project.
          </div>
        ) : (
          runs.map((run) => (
            <Link
              key={run.id}
              to={`/admin/pipelines/${run.pipeline_id}?run=${run.id}`}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors"
            >
              <Workflow className="size-4 text-muted-foreground shrink-0" />
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                {run.pipeline_name}
                <span className="ml-2 text-xs text-muted-foreground">#{run.id}</span>
              </span>
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-medium bg-white/[0.04] ${statusTextColors[run.status] ?? 'text-foreground'}`}
              >
                {run.status}
              </span>
              <span className="w-16 text-right text-xs text-muted-foreground tabular-nums">
                {formatDuration(run.started_at, run.finished_at)}
              </span>
              <span className="text-xs text-muted-foreground">
                {new Date(run.created_at + 'Z').toLocaleString()}
              </span>
            </Link>
          ))
        )}
      </div>
    </div>
  )
}
