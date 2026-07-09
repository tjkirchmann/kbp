import { Ban, FolderKanban, History, Pencil, Play, Save, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PipelineRun } from '@/services/usePipelines'
import type { Project } from '@/services/useProjects'
import { isTerminal } from '@/services/usePipelineRun'
import { statusTextColors } from './stepVisuals'

interface RunBarProps {
  dirty: boolean
  saving: boolean
  warnings: string[]
  runs: PipelineRun[]
  activeRun: PipelineRun | null
  starting: boolean
  projects: Project[]
  projectId: number | null
  onProjectChange: (id: number | null) => void
  onSave: () => void
  onRun: () => void
  onCancel: () => void
  onSelectRun: (runId: number | null) => void
}

const buttonClasses =
  'inline-flex items-center gap-1.5 rounded-lg border border-border/30 bg-white/[0.03] px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 disabled:pointer-events-none'

/** Editor toolbar: save/run/cancel, live status pill, run history picker. */
export function RunBar({
  dirty,
  saving,
  warnings,
  runs,
  activeRun,
  starting,
  projects,
  projectId,
  onProjectChange,
  onSave,
  onRun,
  onCancel,
  onSelectRun,
}: RunBarProps) {
  const runMode = activeRun !== null
  const runActive = runMode && !isTerminal(activeRun.status)

  return (
    <div className="flex items-center gap-2 bg-white/[0.03] border border-border/20 rounded-lg px-3 py-2">
      {runMode ? (
        <>
          <span className="text-sm text-muted-foreground">
            Run <span className="font-mono">#{activeRun.id}</span>
          </span>
          <span
            className={cn(
              'px-2.5 py-0.5 rounded-full text-xs font-medium bg-white/[0.04]',
              statusTextColors[activeRun.status] ?? 'text-foreground',
            )}
          >
            {activeRun.status}
          </span>
          {activeRun.error && (
            <span className="truncate text-xs text-destructive" title={activeRun.error}>
              {activeRun.error}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            {runActive && (
              <button onClick={onCancel} className={buttonClasses}>
                <Ban className="size-4" />
                Cancel
              </button>
            )}
            <button onClick={() => onSelectRun(null)} className={buttonClasses}>
              <Pencil className="size-4" />
              Back to edit
            </button>
          </div>
        </>
      ) : (
        <>
          <button onClick={onSave} disabled={!dirty || saving} className={buttonClasses}>
            <Save className="size-4" />
            {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
          </button>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <FolderKanban className="size-3.5" />
            <select
              className="rounded-lg border border-border/30 bg-white/[0.03] px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
              value={projectId ?? ''}
              onChange={(e) =>
                onProjectChange(e.target.value === '' ? null : Number(e.target.value))
              }
            >
              <option value="">Pick a project…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={onRun}
            disabled={starting || saving || projectId === null}
            title={projectId === null ? 'Pick a project to run in' : undefined}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary/15 border border-primary/40 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/20 transition-colors disabled:opacity-50 disabled:pointer-events-none"
          >
            <Play className="size-4" />
            {starting ? 'Starting…' : 'Run'}
          </button>
          {warnings.length > 0 && (
            <span
              className="inline-flex items-center gap-1.5 text-xs text-warning"
              title={warnings.join('\n')}
            >
              <TriangleAlert className="size-3.5" />
              {warnings.length} issue{warnings.length > 1 ? 's' : ''}
            </span>
          )}
          <div className="ml-auto" />
        </>
      )}

      {runs.length > 0 && (
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <History className="size-3.5" />
          <select
            className="rounded-lg border border-border/30 bg-white/[0.03] px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
            value={activeRun?.id ?? ''}
            onChange={(e) => onSelectRun(e.target.value === '' ? null : Number(e.target.value))}
          >
            <option value="">Edit mode</option>
            {runs.map((r) => (
              <option key={r.id} value={r.id}>
                #{r.id} · {r.status} · {new Date(r.created_at + 'Z').toLocaleString()}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  )
}
