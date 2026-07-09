"""Graph validation + deps-plan tests (pure — no DB, no Temporal)."""

from app.services.pipeline.graph import Graph, build_deps, validate_graph


def _graph(nodes: list[dict], edges: list[dict]) -> Graph:
    return Graph.model_validate({"nodes": nodes, "edges": edges})


def _source(node_id: str = "src") -> dict:
    return {"id": node_id, "type": "source", "params": {"library_file_id": 1}}


def _edge(eid: str, source: str, target: str, target_port: str = "in") -> dict:
    return {
        "id": eid,
        "source": source,
        "source_port": "out",
        "target": target,
        "target_port": target_port,
    }


def test_valid_linear_graph_has_no_problems():
    g = _graph(
        [_source(), {"id": "t", "type": "trim", "params": {"start_seconds": 1}}],
        [_edge("e1", "src", "t")],
    )
    assert validate_graph(g) == []


def test_unknown_step_type_reported():
    g = _graph([{"id": "x", "type": "nope", "params": {}}], [])
    assert any("unknown step type" in p for p in validate_graph(g))


def test_bad_params_reported_with_field():
    g = _graph([{"id": "src", "type": "source", "params": {}}], [])
    problems = validate_graph(g)
    assert any("library_file_id" in p for p in problems)


def test_duplicate_node_ids_reported():
    g = _graph([_source("a"), _source("a")], [])
    assert any("duplicate node id" in p for p in validate_graph(g))


def test_unconnected_input_reported():
    g = _graph([{"id": "t", "type": "trim", "params": {}}], [])
    assert any("not connected" in p for p in validate_graph(g))


def test_kind_mismatch_reported():
    # thumbnail outputs image; trim expects video
    g = _graph(
        [
            _source(),
            {"id": "thumb", "type": "thumbnail", "params": {}},
            {"id": "t", "type": "trim", "params": {}},
        ],
        [_edge("e1", "src", "thumb"), _edge("e2", "thumb", "t")],
    )
    assert any("kind mismatch" in p for p in validate_graph(g))


def test_multiple_edges_into_one_input_reported():
    g = _graph(
        [_source("a"), _source("b"), {"id": "t", "type": "trim", "params": {}}],
        [_edge("e1", "a", "t"), _edge("e2", "b", "t")],
    )
    assert any("multiple incoming edges" in p for p in validate_graph(g))


def test_cycle_reported():
    g = _graph(
        [
            {"id": "a", "type": "trim", "params": {}},
            {"id": "b", "type": "trim", "params": {}},
        ],
        [_edge("e1", "a", "b"), _edge("e2", "b", "a")],
    )
    assert any("cycle" in p for p in validate_graph(g))


def test_edge_to_missing_node_reported():
    g = _graph([_source()], [_edge("e1", "src", "ghost")])
    assert any("missing node" in p for p in validate_graph(g))


def test_build_deps_shape():
    g = _graph(
        [
            _source(),
            {"id": "t", "type": "trim", "params": {}},
            {"id": "thumb", "type": "thumbnail", "params": {}},
        ],
        [_edge("e1", "src", "t"), _edge("e2", "t", "thumb")],
    )
    deps = build_deps(g)
    assert deps["src"] == []
    assert deps["t"] == [("src", "out", "in")]
    assert deps["thumb"] == [("t", "out", "in")]
