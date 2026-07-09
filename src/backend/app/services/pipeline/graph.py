"""The pipeline graph schema + validator.

One Pydantic ``Graph`` model is the single authority for graph shape: the PUT
endpoint validates against it (structural problems hard-fail; semantic issues
come back as warnings so WIP graphs still save), and ``prepare_run`` validates
the frozen snapshot strictly before executing. Runs execute snapshots, so a
registry change never breaks an in-flight run.
"""

from __future__ import annotations

from pydantic import BaseModel, Field, ValidationError

from app.services.pipeline.base import get_step


class GraphNode(BaseModel):
    id: str
    type: str
    # Editor-owned passthrough (canvas position); the executor ignores it.
    position: dict = Field(default_factory=dict)
    params: dict = Field(default_factory=dict)


class GraphEdge(BaseModel):
    id: str
    source: str
    source_port: str
    target: str
    target_port: str


class Graph(BaseModel):
    nodes: list[GraphNode] = Field(default_factory=list)
    edges: list[GraphEdge] = Field(default_factory=list)
    # Editor-owned passthrough ({x, y, zoom}).
    viewport: dict = Field(default_factory=dict)


def validate_graph(graph: Graph) -> list[str]:
    """Semantic validation → list of problems (empty = runnable).

    Checks: unique node ids, known step types, params valid per step schema,
    edges reference real nodes/ports with matching artifact kinds, at most one
    edge per input port, every input port connected, and no cycles.
    """
    problems: list[str] = []

    nodes_by_id: dict[str, GraphNode] = {}
    for node in graph.nodes:
        if node.id in nodes_by_id:
            problems.append(f"duplicate node id {node.id!r}")
        nodes_by_id[node.id] = node

    steps = {}
    for node in graph.nodes:
        step = get_step(node.type)
        if step is None:
            problems.append(f"node {node.id!r}: unknown step type {node.type!r}")
            continue
        steps[node.id] = step
        try:
            step.Params.model_validate(node.params)
        except ValidationError as exc:
            for err in exc.errors():
                loc = ".".join(str(p) for p in err["loc"]) or "params"
                problems.append(f"node {node.id!r}: {loc}: {err['msg']}")

    seen_inputs: set[tuple[str, str]] = set()
    for edge in graph.edges:
        src, tgt = steps.get(edge.source), steps.get(edge.target)
        if edge.source not in nodes_by_id or edge.target not in nodes_by_id:
            problems.append(f"edge {edge.id!r}: references a missing node")
            continue
        if src is None or tgt is None:
            continue  # unknown step already reported
        out_port = next((p for p in src.outputs if p.name == edge.source_port), None)
        in_port = next((p for p in tgt.inputs if p.name == edge.target_port), None)
        if out_port is None:
            problems.append(
                f"edge {edge.id!r}: {edge.source!r} has no output port "
                f"{edge.source_port!r}"
            )
        if in_port is None:
            problems.append(
                f"edge {edge.id!r}: {edge.target!r} has no input port "
                f"{edge.target_port!r}"
            )
        if out_port and in_port and out_port.kind != in_port.kind:
            problems.append(
                f"edge {edge.id!r}: kind mismatch "
                f"({out_port.kind.value} → {in_port.kind.value})"
            )
        key = (edge.target, edge.target_port)
        if key in seen_inputs:
            problems.append(
                f"node {edge.target!r}: input port {edge.target_port!r} has "
                "multiple incoming edges"
            )
        seen_inputs.add(key)

    for node_id, step in steps.items():
        for port in step.inputs:
            if (node_id, port.name) not in seen_inputs:
                problems.append(
                    f"node {node_id!r}: input port {port.name!r} is not connected"
                )

    if _has_cycle(graph, nodes_by_id):
        problems.append("graph contains a cycle")

    return problems


def build_deps(graph: Graph) -> dict[str, list[tuple[str, str, str]]]:
    """node_id → [(upstream_node, upstream_port, my_port)] — the workflow's
    execution plan (small enough for a Temporal payload)."""
    deps: dict[str, list[tuple[str, str, str]]] = {n.id: [] for n in graph.nodes}
    for edge in graph.edges:
        deps[edge.target].append((edge.source, edge.source_port, edge.target_port))
    return deps


def _has_cycle(graph: Graph, nodes_by_id: dict[str, GraphNode]) -> bool:
    """Kahn's algorithm — cycle iff not all nodes drain."""
    indegree = {nid: 0 for nid in nodes_by_id}
    out_edges: dict[str, list[str]] = {nid: [] for nid in nodes_by_id}
    for edge in graph.edges:
        if edge.source in nodes_by_id and edge.target in nodes_by_id:
            indegree[edge.target] += 1
            out_edges[edge.source].append(edge.target)
    ready = [nid for nid, deg in indegree.items() if deg == 0]
    drained = 0
    while ready:
        nid = ready.pop()
        drained += 1
        for nxt in out_edges[nid]:
            indegree[nxt] -= 1
            if indegree[nxt] == 0:
                ready.append(nxt)
    return drained != len(nodes_by_id)
