import type { DragEvent } from 'react'
import type { StepDef } from '@/services/usePipelines'
import { categoryIcons } from './stepVisuals'

export const STEP_DRAG_MIME = 'application/x-kbp-step'

const categoryOrder = ['source', 'transform', 'analyze', 'escape hatch']

interface StepPaletteProps {
  steps: StepDef[]
  disabled: boolean
}

/** Draggable step catalog. Drop handling (position + node creation) lives in
 * the editor, which owns the React Flow instance. */
export function StepPalette({ steps, disabled }: StepPaletteProps) {
  const byCategory = new Map<string, StepDef[]>()
  for (const step of steps) {
    byCategory.set(step.category, [...(byCategory.get(step.category) ?? []), step])
  }

  function onDragStart(e: DragEvent, stepName: string) {
    e.dataTransfer.setData(STEP_DRAG_MIME, stepName)
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div className="w-56 shrink-0 overflow-y-auto bg-white/[0.03] border border-border/20 rounded-lg p-3 flex flex-col gap-4">
      {categoryOrder
        .filter((c) => byCategory.has(c))
        .map((category) => (
          <div key={category}>
            <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {category}
            </h4>
            <div className="flex flex-col gap-1">
              {byCategory.get(category)!.map((step) => {
                const Icon = categoryIcons[step.category] ?? categoryIcons.transform
                return (
                  <div
                    key={step.name}
                    draggable={!disabled}
                    onDragStart={(e) => onDragStart(e, step.name)}
                    className="flex items-center gap-2 rounded-lg border border-border/30 bg-card px-2.5 py-2 text-sm text-foreground cursor-grab hover:bg-muted/60 transition-colors aria-disabled:opacity-50 aria-disabled:cursor-default"
                    aria-disabled={disabled}
                  >
                    <Icon className="size-4 text-muted-foreground" />
                    {step.label}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      <p className="mt-auto text-[10px] text-muted-foreground">
        Drag a step onto the canvas, connect ports left → right.
      </p>
    </div>
  )
}
