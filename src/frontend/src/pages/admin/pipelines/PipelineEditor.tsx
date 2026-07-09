import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from '@xyflow/react'
import type { Connection, Edge, IsValidConnection, NodeTypes } from '@xyflow/react'
import { flowToServer, mergeRunOverlay, serverToFlow } from '@/lib/pipelineGraph'
import type { StepFlowNode } from '@/lib/pipelineGraph'
import { usePipeline, useSavePipeline, useStartRun, useStepPalette } from '@/services/usePipelines'
import type { StepDef } from '@/services/usePipelines'
import { isTerminal, useCancelRun, useRunHistory, useRunStatus } from '@/services/usePipelineRun'
import { useProjects } from '@/services/useProjects'
import { usePipelineEditorStore } from '@/store/usePipelineEditorStore'
import { NodeInspector } from './NodeInspector'
import { RunBar } from './RunBar'
import { STEP_DRAG_MIME, StepPalette } from './StepPalette'
import { StepNode } from './StepNode'

// Module-level constant — recreating nodeTypes per render makes React Flow
// remount every node.
const nodeTypes: NodeTypes = { step: StepNode }

function schemaDefaults(def: StepDef): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, prop] of Object.entries(def.params_schema.properties ?? {})) {
    out[key] = prop.default ?? null
  }
  return out
}

function EditorInner({ pipelineId }: { pipelineId: number }) {
  const { data: pipeline } = usePipeline(pipelineId)
  const { data: palette = [] } = useStepPalette()
  const save = useSavePipeline()
  const startRun = useStartRun()
  const cancelRun = useCancelRun()
  const { data: runs = [], refetch: refetchRuns } = useRunHistory(pipelineId)
  const { data: projects = [] } = useProjects()

  const {
    selectedNodeId,
    activeRunId,
    runProjectId,
    dirty,
    setSelectedNodeId,
    setActiveRunId,
    setRunProjectId,
    setDirty,
    reset,
  } = usePipelineEditorStore()
  const { data: runStatus } = useRunStatus(activeRunId)
  const runMode = activeRunId !== null

  const [nodes, setNodes, onNodesChange] = useNodesState<StepFlowNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const rf = useReactFlow()
  const hydratedFor = useRef<number | null>(null)

  useEffect(() => reset, [pipelineId, reset])

  // Deep link from a project's run list: ?run=<id> opens the run overlay, then
  // the param is consumed so "Back to edit" leaves a clean URL.
  const [searchParams, setSearchParams] = useSearchParams()
  useEffect(() => {
    const runParam = searchParams.get('run')
    if (runParam === null) return
    const runId = Number(runParam)
    if (Number.isFinite(runId)) setActiveRunId(runId)
    setSearchParams({}, { replace: true })
  }, [searchParams, setSearchParams, setActiveRunId])

  // Hydrate canvas once per pipeline, after both graph and palette arrive.
  useEffect(() => {
    if (!pipeline || palette.length === 0 || hydratedFor.current === pipeline.id) return
    const { nodes: n, edges: e } = serverToFlow(pipeline.graph, palette)
    setNodes(n)
    setEdges(e)
    hydratedFor.current = pipeline.id
  }, [pipeline, palette, setNodes, setEdges])

  // Run overlay: merge live node_runs + artifact counts into canvas nodes.
  useEffect(() => {
    const counts = new Map<string, number>()
    for (const a of runStatus?.artifacts ?? []) {
      counts.set(a.node_id, (counts.get(a.node_id) ?? 0) + 1)
    }
    setNodes((ns) => mergeRunOverlay(ns, runMode ? (runStatus?.node_runs ?? []) : null, counts))
  }, [runStatus, runMode, setNodes])

  // Keep the history dropdown's status labels fresh once the live run ends.
  const liveStatus = runStatus?.run.status
  useEffect(() => {
    if (isTerminal(liveStatus)) void refetchRuns()
  }, [liveStatus, refetchRuns])

  const defsByName = useMemo(() => new Map(palette.map((d) => [d.name, d])), [palette])

  const isValidConnection: IsValidConnection = useCallback(
    (conn) => {
      const source = rf.getNode(conn.source!) as StepFlowNode | undefined
      const target = rf.getNode(conn.target!) as StepFlowNode | undefined
      const outPort = source?.data.def?.outputs.find((p) => p.name === conn.sourceHandle)
      const inPort = target?.data.def?.inputs.find((p) => p.name === conn.targetHandle)
      if (!outPort || !inPort || outPort.kind !== inPort.kind) return false
      // One edge per input port.
      return !rf
        .getEdges()
        .some((e) => e.target === conn.target && e.targetHandle === conn.targetHandle)
    },
    [rf],
  )

  const onConnect = useCallback(
    (conn: Connection) => {
      setEdges((es) => addEdge(conn, es))
      setDirty(true)
    },
    [setEdges, setDirty],
  )

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault()
      const stepName = e.dataTransfer.getData(STEP_DRAG_MIME)
      const def = defsByName.get(stepName)
      if (!def || runMode) return
      const position = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY })
      const node: StepFlowNode = {
        id: crypto.randomUUID().slice(0, 8),
        type: 'step',
        position,
        data: { stepType: def.name, params: schemaDefaults(def), def, run: null, artifactCount: 0 },
      }
      setNodes((ns) => [...ns, node])
      setDirty(true)
    },
    [defsByName, rf, runMode, setNodes, setDirty],
  )

  const onParamsChange = useCallback(
    (nodeId: string, params: Record<string, unknown>) => {
      setNodes((ns) => ns.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, params } } : n)))
      setDirty(true)
    },
    [setNodes, setDirty],
  )

  const onDeleteNode = useCallback(
    (nodeId: string) => {
      rf.deleteElements({ nodes: [{ id: nodeId }] })
      setSelectedNodeId(null)
      setDirty(true)
    },
    [rf, setSelectedNodeId, setDirty],
  )

  // Stable identity + change guard — an inline handler here loops: React Flow
  // invokes it per render, an unconditional store write re-renders, repeat.
  const onSelectionChange = useCallback(({ nodes: sel }: { nodes: { id: string }[] }) => {
    const id = sel[0]?.id ?? null
    const state = usePipelineEditorStore.getState()
    if (state.selectedNodeId !== id) state.setSelectedNodeId(id)
  }, [])

  const doSave = useCallback(async () => {
    const graph = flowToServer(rf.getNodes() as StepFlowNode[], rf.getEdges(), rf.getViewport())
    const result = await save.mutateAsync({ id: pipelineId, graph })
    setWarnings(result.warnings)
    setDirty(false)
    return result
  }, [rf, save, pipelineId, setDirty])

  const doRun = useCallback(async () => {
    if (runProjectId === null) return
    const { warnings: w } = await doSave() // run always executes what you see
    if (w.length > 0) return
    const run = await startRun.mutateAsync({ pipelineId, projectId: runProjectId })
    setActiveRunId(run.id)
    refetchRuns()
  }, [doSave, startRun, pipelineId, runProjectId, setActiveRunId, refetchRuns])

  // Cmd/Ctrl+S → save
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (!runMode) void doSave()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [doSave, runMode])

  if (!pipeline) return null

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null
  const activeRun = runStatus?.run ?? runs.find((r) => r.id === activeRunId) ?? null

  return (
    <div className="h-full flex flex-col gap-3 py-3">
      <RunBar
        dirty={dirty}
        saving={save.isPending}
        warnings={warnings}
        runs={runs}
        activeRun={runMode ? activeRun : null}
        starting={startRun.isPending}
        projects={projects}
        projectId={runProjectId}
        onProjectChange={setRunProjectId}
        onSave={() => void doSave()}
        onRun={() => void doRun()}
        onCancel={() => activeRunId && cancelRun.mutate(activeRunId)}
        onSelectRun={(id) => setActiveRunId(id)}
      />
      <div className="flex-1 min-h-0 flex gap-3">
        <StepPalette steps={palette} disabled={runMode} />
        <div className="flex-1 min-w-0 rounded-lg border border-border/20 overflow-hidden">
          <ReactFlow
            colorMode="dark"
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            isValidConnection={isValidConnection}
            onDrop={onDrop}
            onDragOver={(e) => {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
            }}
            onSelectionChange={onSelectionChange}
            onNodeDragStop={() => setDirty(true)}
            defaultViewport={pipeline.graph.viewport}
            nodesConnectable={!runMode}
            nodesDraggable={!runMode}
            deleteKeyCode={runMode ? null : ['Backspace', 'Delete']}
            onNodesDelete={() => setDirty(true)}
            onEdgesDelete={() => setDirty(true)}
            proOptions={{ hideAttribution: true }}
            fitView={pipeline.graph.nodes.length > 0 && !pipeline.graph.viewport}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable />
          </ReactFlow>
        </div>
        {selectedNode && (
          <NodeInspector
            node={selectedNode}
            artifacts={runStatus?.artifacts ?? []}
            runMode={runMode}
            onParamsChange={onParamsChange}
            onDelete={onDeleteNode}
          />
        )}
      </div>
    </div>
  )
}

export default function PipelineEditor() {
  const { pipelineId } = useParams()
  const id = Number(pipelineId)
  if (!Number.isFinite(id)) return null
  return (
    <ReactFlowProvider>
      <EditorInner pipelineId={id} />
    </ReactFlowProvider>
  )
}
