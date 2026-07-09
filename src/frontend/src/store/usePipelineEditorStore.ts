import { create } from 'zustand'

/** UI-only editor state (selection, run overlay, dirty flag). Canvas nodes and
 * edges live in React Flow's own state inside the editor; server state lives
 * in TanStack Query. */
interface PipelineEditorState {
  selectedNodeId: string | null
  /** Non-null = run mode: the canvas overlays this run's live status. */
  activeRunId: number | null
  /** Project the next run will execute in — required before Run enables. */
  runProjectId: number | null
  dirty: boolean
  setSelectedNodeId: (id: string | null) => void
  setActiveRunId: (id: number | null) => void
  setRunProjectId: (id: number | null) => void
  setDirty: (dirty: boolean) => void
  reset: () => void
}

export const usePipelineEditorStore = create<PipelineEditorState>((set) => ({
  selectedNodeId: null,
  activeRunId: null,
  runProjectId: null,
  dirty: false,
  setSelectedNodeId: (id) => set({ selectedNodeId: id }),
  setActiveRunId: (id) => set({ activeRunId: id }),
  setRunProjectId: (id) => set({ runProjectId: id }),
  setDirty: (dirty) => set({ dirty }),
  reset: () => set({ selectedNodeId: null, activeRunId: null, runProjectId: null, dirty: false }),
}))
