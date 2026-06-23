# Video Processing Pipeline Platform — Milestone 1 (Vertical Slice)

## Context

The goal is a platform for iterating on college-football all-22 footage to converge on a
"normalized playbook." The work is open-ended and needs heavy iteration, so the platform
itself is the deliverable: a **Retool-style grid editor** for wiring chains of algorithm
blocks (typed ports, exported variables feeding downstream inputs) and a **Temporal-backed
execution engine** that runs those graphs durably with per-block caching so you can tweak
one block and re-run only it + downstream.

The repo already provides the foundation this builds on:
- **Temporal** is wired end-to-end — client seam (`app/core/temporal.py::get_temporal_client`),
  worker (`app/temporal/worker.py`), sample workflow/activity, UI on `:8080`. Currently
  sample-only (`GreetingWorkflow`).
- **S3/MinIO + presigned uploads + lifecycle table** — `app/services/s3.py`,
  `app/models/library_file.py`, `app/routers/library.py`. Clips already land in S3 as
  `library_files` rows.
- **LLM dispatch layer** — `app/services/llm/` (openrouter, dispatch, ledger) for the VLM block.
- **Frontend** — Vite + React 18 + TS, TanStack Query (server state), Zustand (UI state),
  shadcn/ui. **No graph/canvas library installed yet.**

Milestone 1 proves every layer with the smallest representative graph:
**ingest clip → ffmpeg sample frames → VLM label** (one block per compute class: resolve,
classical CV/ffmpeg, LLM). Graph versioning, fan-out orchestration, and the GPU/queue split
are designed-for but not built here.

## Locked architecture decisions

- **DAG engine lives INSIDE the Temporal workflow** ("deep Temporal"). The workflow walks the
  DAG deterministically (topological order) and calls **one activity per block**. The
  content-addressed **cache lookup happens inside the activity** — Temporal's replay only sees
  "activity returned ref X", so determinism holds while caching stays invisible to replay.
- **Single Temporal worker** for now; block resource class (`cpu`/`gpu`/`io`) is recorded as
  metadata so a task-queue split is a later, mechanical change.
- **Immutable graph versions.** Saving in the editor creates a new `pipeline_graph_versions`
  row (frozen JSON). Every run pins one version — reproducible + diffable for converging on the
  playbook.
- **Cache key = hash(block_type + block_code_version + resolved_config + sorted(upstream output hashes)).**
  Bump a block's `CODE_VERSION` constant on logic change to invalidate. Stored in `pipeline_step_runs`.
- **Split artifact storage.** Large outputs (frames, npz, subclips) → S3 under
  `pipelines/artifacts/<sha256>` (content-addressed, dedup for free). Small exported vars/scalars/JSON
  → Postgres (`pipeline_step_runs.exports` JSONB) so the editor + downstream wiring can read them
  without S3 round-trips.
- **Typed port-to-port edges.** Each block declares input/output ports as **Pydantic models**;
  their JSON schema drives both connection validation and the inspector UI. Edges connect
  `output_port → input_port`; engine resolves the upstream artifact/export ref.
- **Per-clip graph + batch orchestrator.** A graph processes one clip; a parent workflow fans
  out across clips via child workflows (designed-for; M1 runs one clip).

## Backend — `src/backend/app/pipelines/`

New domain mirroring AGENTS.md conventions (thin routers → services; I/O in activities).

### Block SDK & registry — `app/pipelines/blocks/`
- `base.py` — `Block` abstract base: declares `TYPE: str`, `CODE_VERSION: int`,
  `RESOURCE: Literal["cpu","gpu","io"]`, `InputPorts`/`OutputPorts` Pydantic models, and
  `async def run(self, ctx, inputs) -> outputs`. `ctx` exposes the run's `ArtifactStore`,
  DB session factory, and logger.
- `registry.py` — decorator `@register_block` populating `BLOCK_REGISTRY: dict[str, type[Block]]`.
  `block_schemas()` emits each block's port JSON schema + config schema for the frontend palette.
- `ingest_clip.py` — input: `library_file_id`; output port `clip` (S3 ref to the source object,
  resolved from `library_files`). Reuses `app/models/library_file.py` + `app/services/s3.py`.
- `ffmpeg_frames.py` — input port `clip` + config `{fps|count, max_dim}`; shells out to `ffmpeg`
  (add to backend `Dockerfile`); writes frames to the `ArtifactStore`; output port `frames`
  (manifest of S3 refs). `RESOURCE="cpu"`.
- `vlm_label.py` — input port `frames` + config `{model, prompt}`; reuses `app/services/llm/dispatch.py`;
  output: small `labels` JSON written to `exports`. `RESOURCE="io"`.

### Engine — `app/pipelines/engine.py`
- Pure, deterministic helpers usable from inside the workflow: `topo_order(graph)`,
  `resolve_inputs(step, upstream_results)`, `compute_cache_key(block, resolved_config, upstream_hashes)`.
  No I/O — safe in the Temporal sandbox.

### Artifact store + cache — `app/pipelines/artifacts.py`
- `ArtifactStore`: `put_bytes`/`put_file` → returns `ArtifactRef(sha256, s3_key, size, content_type)`;
  `get(ref)`. Content-addressed keys under `pipelines/artifacts/`. Wraps `app/services/s3.py`.
- Cache: `lookup(cache_key) -> StepRun | None` and `record(...)` against `pipeline_step_runs`
  (keyed by `cache_key`, unique). Lookup-or-compute lives in the **activity**, not the workflow.

### Temporal — `app/temporal/`
- `pipeline_workflow.py::PipelineRunWorkflow` — input `{graph_version_id, run_id, bindings}`.
  Loads the frozen graph (via an activity), computes topo order with `engine.py`, and for each
  step calls `execute_block_activity` passing resolved input refs + config. Collects output refs
  to feed downstream. Deterministic; all I/O delegated.
- `activities.py` — add `load_graph_version`, `execute_block_activity` (does cache
  lookup-or-compute: hit → return stored refs; miss → instantiate block from registry, run,
  persist artifacts + `pipeline_step_runs`, return refs), `finalize_run`.
- `worker.py` — register `PipelineRunWorkflow` + the new activities alongside the existing sample.
- (Designed-for, not built) `batch_workflow.py` fans out child `PipelineRunWorkflow` per clip.

### Models — `app/models/` (+ Alembic migration via `migration` skill)
- `pipeline_graphs` — id, name, created_by, timestamps (the editable container).
- `pipeline_graph_versions` — id, graph_id FK, version_int, `graph_json` (frozen nodes+edges+config),
  created_at. Immutable.
- `pipeline_runs` — id, graph_version_id FK, status, bindings JSONB (e.g. which clip),
  temporal_workflow_id, timestamps.
- `pipeline_step_runs` — id, run_id FK, node_id, block_type, cache_key (unique), status,
  `output_refs` JSONB (artifact refs), `exports` JSONB (small vars), timing, error.
  Import each in `alembic/env.py` per AGENTS.md.

### Schemas + Router — `app/schemas/pipelines.py`, `app/routers/pipelines.py`
- Pydantic request/response for graph CRUD, block-schema listing, run trigger, run/step status.
- Endpoints (admin-gated like `library.py`): `GET /admin/pipelines/blocks` (registry schemas),
  graph CRUD + `POST .../versions` (freeze), `POST .../runs` (starts `PipelineRunWorkflow` via
  `get_temporal_client`), `GET .../runs/{id}` (status + step exports/refs),
  `GET .../artifacts/{ref}` (presigned GET). Mount in `main.py`.

## Frontend — `src/frontend/src/`

- Install **`@xyflow/react`** (and `nanoid` if needed) in the frontend container.
- `pages/pipelines/PipelineEditor.tsx` — React Flow canvas: node palette (from
  `GET /admin/pipelines/blocks`), drag-to-add, typed port-to-port wiring with connection
  validation (reject mismatched port types using the JSON schema), a schema-driven inspector
  panel for per-block config, Save (creates a version) and Run buttons.
- `pages/pipelines/PipelineRuns.tsx` — run list + per-step status, exports, and artifact preview
  (frames/labels) for the iterate loop.
- `components/pipelines/` — `BlockNode.tsx` (renders ports from schema), `PortHandle.tsx`,
  `Inspector.tsx` (renders config form from JSON schema), `RunStepCard.tsx`.
- `store/pipelineEditor.ts` — Zustand slice for **editor UI state only** (selection, dirty,
  inspector open) per AGENTS.md (UI state in Zustand).
- `services/usePipelines.ts` — TanStack Query hooks: `useBlockSchemas`, `usePipelineGraphs`,
  `useSaveGraphVersion`, `useStartRun`, `useRun(id)` (polls status). Server state in Query.
- Add routes in `App.tsx` under the admin shell; follow DESIGN.md (light-only, semantic colors,
  lucide icons, no inline styles).

## Build order

1. Migration + 4 models; `app/services/s3.py`-backed `ArtifactStore`.
2. Block SDK (`base`, `registry`) + the 3 blocks; add `ffmpeg` to backend Dockerfile.
3. `engine.py` (pure helpers) + cache in activities.
4. `PipelineRunWorkflow` + activities; register in worker.
5. Router + schemas; mount in `main.py`.
6. Frontend: install React Flow, editor canvas + palette + typed wiring + inspector, run viewer,
   Query/Zustand wiring, routes.

## Verification (end-to-end)

1. `make up` (rebuild backend so `ffmpeg` + deps land), `make migrate`.
2. Upload a short clip via the existing library flow → confirm an `uploaded` `library_files` row.
3. In the editor: drag **ingest → ffmpeg_frames → vlm_label**, wire typed ports (confirm a
   mismatched wire is rejected), set ffmpeg `count=8`, set the VLM prompt; **Save** (creates a
   `pipeline_graph_versions` row) → **Run**.
4. Watch the execution in **Temporal UI (`localhost:8080`)** — confirm one activity per block and
   a clean topo order.
5. Run viewer shows frames (S3 artifact refs) + the VLM `labels` JSON from `exports`.
6. **Cache proof:** re-run the same graph → ffmpeg + ingest steps are cache hits (no recompute,
   same `cache_key`). Change the VLM prompt, Save (new version), Run → ingest/frames hit cache,
   only `vlm_label` recomputes. This is the core iteration-loop guarantee.
7. Bump `vlm_label.CODE_VERSION` → confirm its cache invalidates while upstream still hits.
