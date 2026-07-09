import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import { Ban, Check, CircleDashed, Loader2, Package, SkipForward, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { StepFlowNode } from '@/lib/pipelineGraph'
import {
  categoryIcons,
  formatDuration,
  kindColors,
  statusBorders,
  statusTextColors,
} from './stepVisuals'

const statusIcons = {
  queued: CircleDashed,
  running: Loader2,
  succeeded: Check,
  failed: X,
  canceled: Ban,
  skipped: SkipForward,
} as const

/** Vertical offset for the i-th of n handles on one side. */
const handleTop = (i: number, n: number) => `${((i + 1) * 100) / (n + 1)}%`

function paramSummary(params: Record<string, unknown>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .slice(0, 3)
    .map(([k, v]) => `${k}=${String(v)}`)
  return parts.join(' · ')
}

export const StepNode = memo(function StepNode({ data, selected }: NodeProps<StepFlowNode>) {
  const { def, params, run, artifactCount } = data
  const Icon = categoryIcons[def?.category ?? 'transform'] ?? categoryIcons.transform
  const StatusIcon = run ? statusIcons[run.status as keyof typeof statusIcons] : null
  const summary = paramSummary(params)

  return (
    <div
      className={cn(
        'w-52 rounded-lg border bg-card shadow-sm transition-colors',
        run ? statusBorders[run.status] : 'border-border',
        selected && 'ring-1 ring-primary/60',
        run?.status === 'skipped' && 'opacity-50',
      )}
    >
      {(def?.inputs ?? []).map((port, i, arr) => (
        <Handle
          key={port.name}
          id={port.name}
          type="target"
          position={Position.Left}
          style={{ top: handleTop(i, arr.length) }}
          className={cn('!size-2.5 !border-2 !border-background', kindColors[port.kind])}
        />
      ))}

      <div className="flex items-center gap-2 px-3 py-2">
        <Icon className="size-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium text-foreground truncate">
          {def?.label ?? data.stepType}
        </span>
        {StatusIcon && (
          <StatusIcon
            className={cn(
              'size-4 ml-auto shrink-0',
              statusTextColors[run!.status],
              run!.status === 'running' && 'animate-spin',
            )}
          />
        )}
      </div>

      {summary && (
        <div className="px-3 pb-2 text-[10px] text-muted-foreground truncate">{summary}</div>
      )}

      {run && (
        <div className="px-3 pb-2 flex items-center gap-2">
          {run.status === 'running' && (
            <div className="h-1 flex-1 rounded-full bg-white/10 overflow-hidden">
              {run.progress === null ? (
                <div className="h-full w-1/3 rounded-full bg-primary/70 animate-pulse" />
              ) : (
                <div
                  className="h-full rounded-full bg-primary/70 transition-[width]"
                  style={{ width: `${Math.round(run.progress * 100)}%` }}
                />
              )}
            </div>
          )}
          <span className="text-[10px] tabular-nums text-muted-foreground ml-auto shrink-0">
            {formatDuration(run.started_at, run.finished_at)}
          </span>
          {artifactCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded border border-border/30 bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              <Package className="size-3" />
              {artifactCount}
            </span>
          )}
        </div>
      )}

      {(def?.outputs ?? []).map((port, i, arr) => (
        <Handle
          key={port.name}
          id={port.name}
          type="source"
          position={Position.Right}
          style={{ top: handleTop(i, arr.length) }}
          className={cn('!size-2.5 !border-2 !border-background', kindColors[port.kind])}
        />
      ))}
    </div>
  )
})
