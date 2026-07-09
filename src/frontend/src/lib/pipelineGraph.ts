import type { Edge, Node, Viewport } from '@xyflow/react'
import type { GraphNode, PipelineGraph, StepDef } from '@/services/usePipelines'
import type { NodeRun } from '@/services/usePipelineRun'

/** Data carried by every canvas node. One custom node type ('step') renders
 * all steps; the palette definition drives ports, form, and labels. */
export interface StepNodeData extends Record<string, unknown> {
  stepType: string
  params: Record<string, unknown>
  def: StepDef | undefined
  run: NodeRun | null
  artifactCount: number
}

export type StepFlowNode = Node<StepNodeData, 'step'>

export function serverToFlow(
  graph: PipelineGraph,
  palette: StepDef[],
): { nodes: StepFlowNode[]; edges: Edge[] } {
  const defs = new Map(palette.map((d) => [d.name, d]))
  const nodes: StepFlowNode[] = (graph.nodes ?? []).map((n) => ({
    id: n.id,
    type: 'step',
    position: n.position ?? { x: 0, y: 0 },
    data: {
      stepType: n.type,
      params: n.params ?? {},
      def: defs.get(n.type),
      run: null,
      artifactCount: 0,
    },
  }))
  const edges: Edge[] = (graph.edges ?? []).map((e) => ({
    id: e.id,
    source: e.source,
    sourceHandle: e.source_port,
    target: e.target,
    targetHandle: e.target_port,
  }))
  return { nodes, edges }
}

export function flowToServer(
  nodes: StepFlowNode[],
  edges: Edge[],
  viewport: Viewport,
): PipelineGraph {
  const graphNodes: GraphNode[] = nodes.map((n) => ({
    id: n.id,
    type: n.data.stepType,
    position: { x: n.position.x, y: n.position.y },
    params: n.data.params,
  }))
  return {
    nodes: graphNodes,
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      source_port: e.sourceHandle ?? 'out',
      target: e.target,
      target_port: e.targetHandle ?? 'in',
    })),
    viewport: { x: viewport.x, y: viewport.y, zoom: viewport.zoom },
  }
}

/** Overlay live run state onto canvas nodes (run mode). Returns new node
 * objects only where data changed so React Flow re-renders minimally. */
export function mergeRunOverlay(
  nodes: StepFlowNode[],
  nodeRuns: NodeRun[] | null,
  artifactCounts: Map<string, number>,
): StepFlowNode[] {
  const byId = new Map((nodeRuns ?? []).map((r) => [r.node_id, r]))
  return nodes.map((n) => {
    const run = byId.get(n.id) ?? null
    const artifactCount = artifactCounts.get(n.id) ?? 0
    if (n.data.run === run && n.data.artifactCount === artifactCount) return n
    return { ...n, data: { ...n.data, run, artifactCount } }
  })
}
