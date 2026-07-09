import { Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { StepFlowNode } from '@/lib/pipelineGraph'
import type { Artifact } from '@/services/usePipelineRun'
import { ArtifactChip } from './ArtifactChip'
import { ParamsForm } from './ParamsForm'
import { formatDuration, statusTextColors } from './stepVisuals'

interface NodeInspectorProps {
  node: StepFlowNode
  artifacts: Artifact[]
  runMode: boolean
  onParamsChange: (nodeId: string, params: Record<string, unknown>) => void
  onDelete: (nodeId: string) => void
}

/** Right-hand panel for the selected node: config form in edit mode; live
 * status, log tail, and artifacts in run mode. */
export function NodeInspector({
  node,
  artifacts,
  runMode,
  onParamsChange,
  onDelete,
}: NodeInspectorProps) {
  const { def, params, run } = node.data
  const nodeArtifacts = artifacts.filter((a) => a.node_id === node.id)

  return (
    <div className="w-80 shrink-0 flex flex-col gap-4 overflow-y-auto bg-white/[0.03] border border-border/20 rounded-lg p-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">
          {def?.label ?? node.data.stepType}
        </h3>
        <p className="text-xs text-muted-foreground">
          {def?.category} · <span className="font-mono">{node.id.slice(0, 8)}</span>
        </p>
      </div>

      {run && (
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'px-2.5 py-0.5 rounded-full text-xs font-medium bg-white/[0.04]',
              statusTextColors[run.status],
            )}
          >
            {run.status}
          </span>
          <span className="text-xs tabular-nums text-muted-foreground">
            {formatDuration(run.started_at, run.finished_at)}
          </span>
          {run.attempt > 1 && <span className="text-xs text-warning">attempt {run.attempt}</span>}
        </div>
      )}

      {run?.error && (
        <pre className="whitespace-pre-wrap rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
          {run.error}
        </pre>
      )}

      <div>
        <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Parameters
        </h4>
        {def ? (
          <ParamsForm
            schema={def.params_schema}
            params={params}
            onChange={(p) => onParamsChange(node.id, p)}
            disabled={runMode}
          />
        ) : (
          <p className="text-xs text-destructive">Unknown step type: {node.data.stepType}</p>
        )}
      </div>

      {run?.log_tail && (
        <div>
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Log
          </h4>
          <pre className="max-h-64 overflow-auto rounded-lg bg-white/[0.03] border border-border/20 p-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
            {run.log_tail}
          </pre>
        </div>
      )}

      {nodeArtifacts.length > 0 && (
        <div>
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Artifacts
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {nodeArtifacts.map((a) => (
              <ArtifactChip key={a.id} artifact={a} />
            ))}
          </div>
        </div>
      )}

      {!runMode && (
        <button
          onClick={() => onDelete(node.id)}
          className="mt-auto inline-flex items-center gap-2 self-start rounded-lg px-2.5 py-1.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
        >
          <Trash2 className="size-4" />
          Delete node
        </button>
      )}
    </div>
  )
}
