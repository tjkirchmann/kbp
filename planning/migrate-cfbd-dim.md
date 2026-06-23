# Migrate CFBD Dim Workflow to Temporal

## Context
`cfbd_dims` (`src/backend/app/tasks/cfbd_dims.py`) is today a single monolithic
Procrastinate task: it fetches 6 slowly-changing CFBD dimension endpoints
(teams, conferences, venues, coaches, draft positions, draft teams)
*sequentially*, then snapshots + upserts each inside one DB transaction, wrapped
by `@notify` and scheduled via DB-cron through the shared admin Sync panel.

Temporal 1.29.0 is already scaffolded in the repo (`app/temporal/`, worker,
`app/core/temporal.py` client seam, `temporal`/`temporal_worker` compose
services) but only runs the sample `GreetingWorkflow`. This migrates the real
dim workflow onto Temporal so it gains durability, per-entity retry, parallel
fan-out, and native scheduling — and proves out the Temporal stack as the home
for durable workflows.

**Decided with the user:**
- **Control plane:** native **Temporal Schedule** — drop `cfbd_dims` from the
  Procrastinate admin Sync panel, DB-cron, and `@notify` entirely (accepted loss
  of the admin card / "Run now" button / Discord notifications for this one job).
- **Old task:** **full rewrite** inside `app/temporal/`; delete
  `app/tasks/cfbd_dims.py`.

The other 4 tasks (cfbd_sync, cfbd_facts, cfbd_plays, espn_poller) stay on
Procrastinate untouched.

## Goals / Non-goals
- Goal: A `CfbdDimsWorkflow` that fans out **one activity per dimension entity**
  (fetch → snapshot → upsert), runs them in parallel with independent retry, and
  returns the **same aggregate result shape** the old task did.
- Goal: A native Temporal **Schedule** (`0 3 * * *` UTC, the old cron) with
  `overlap=SKIP` and a `catchup_window`, ensured idempotently at worker startup.
- Goal: Remove all Procrastinate/admin/notify coupling for `cfbd_dims`.
- Non-goal: Migrating any other task off Procrastinate.
- Non-goal: Making the admin panel Temporal-aware (explicitly dropped).

## Why this is the correct Temporal ontology
| Old (Procrastinate) | New (Temporal) |
|---|---|
| `retry=3` on whole task | `RetryPolicy` per activity — a CFBD blip on coaches doesn't re-fetch teams |
| 6 sequential fetches | parallel activity fan-out via `asyncio.gather` |
| all-or-nothing run | durable: a worker crash only re-runs incomplete activities |
| `queueing_lock="cfbd_dims"` | `ScheduleOverlapPolicy.SKIP` |
| `run_catchup` flag | Schedule `catchup_window` |
| DB-cron via admin panel | `ScheduleSpec(cron_expressions=["0 3 * * *"])` |
| coaches large payload | dedicated activity + heartbeat + longer `start_to_close_timeout` |

**Payload-size discipline:** fetch + snapshot + upsert stay *inside* each
activity (each returns only a small `{processed, changed}` dict), so the fetched
CFBD lists never transit workflow history — avoiding Temporal's per-payload size
limits and history bloat. This is why we do not split fetch and upsert into
separate activities.

## Approach

### New package `app/temporal/cfbd_dims/`
- `activities.py`
  - The pure row/hash mapping helpers, rewritten here (mirrors the originals:
    `_team_row`/`_team_hash`, `_conference_*`, `_venue_*`, `_draft_position_row`,
    `_draft_team_row`, `_coach_id`/`_coach_row`/`_coach_season_row`/`_coach_hash`,
    `_BATCH`).
  - A `_DIM_SPECS` registry: `entity_key -> (endpoint, entity_type, pk, model,
    row_fn, hash_fn)` for the 5 flat dims.
  - `@activity.defn async def sync_flat_dim(entity_key: str) -> dict` — opens its
    own `TaskSessionLocal`, fetches `cfbd_provider.fetch(endpoint)`, runs the
    snapshot+dedup+`batch_upsert` loop (the logic from the old `_sync_flat`),
    commits, returns `{"entity": key, "processed": p, "changed": ch}`.
  - `@activity.defn async def sync_coaches() -> dict` — the two-table case
    (coaches + coach seasons), heartbeating between steps, returns coach/season
    counts.
  - Reuse existing infra unchanged: `cfbd_provider` (`app/services/sync/providers/cfbd.py`),
    `record_snapshot` (`app/services/sync/snapshots.py`), `batch_upsert`
    (`app/services/sync/upsert.py`), `TaskSessionLocal` (`app/core/database.py`),
    models in `app/models/cfbd.py`.
- `workflow.py`
  - `@workflow.defn class CfbdDimsWorkflow` with `@workflow.run async def run(self)`.
  - Imports activities under `workflow.unsafe.imports_passed_through()` (the
    established pattern in `app/temporal/workflows.py`).
  - `asyncio.gather` the 5 `sync_flat_dim` calls + the `sync_coaches` call, each
    via `workflow.execute_activity(...)` with `start_to_close_timeout` and a
    `RetryPolicy(initial_interval=2s, backoff_coefficient=2.0, maximum_attempts=4)`
    (coaches gets a longer timeout). Assemble the aggregate dict matching the old
    `result` shape (`teams`, `conferences`, `venues`, `draft_positions`,
    `draft_teams`, `coaches`, `coach_seasons`).
- `schedule.py`
  - `SCHEDULE_ID = "cfbd-dims"`, `WORKFLOW_ID = "cfbd-dims"`.
  - `async def ensure_schedule(client)` — idempotent create-or-update of the
    Temporal Schedule: `ScheduleSpec(cron_expressions=["0 3 * * *"])`,
    `ScheduleActionStartWorkflow(CfbdDimsWorkflow.run, id=WORKFLOW_ID,
    task_queue=settings.temporal_task_queue)`,
    `SchedulePolicy(overlap=ScheduleOverlapPolicy.SKIP, catchup_window=...)`.
    Handle `already exists` by updating instead.
  - `async def trigger_now(client)` — trigger the schedule for an on-demand run;
    used by the Makefile target.
- `__init__.py` — package docstring.

### Edits
- `app/temporal/worker.py` — register `CfbdDimsWorkflow` in `workflows=[...]` and
  `sync_flat_dim` + `sync_coaches` in `activities=[...]`; after the client
  connects, call `ensure_schedule(client)` (mirrors how `app/worker.py` registers
  crons on boot). Keep the sample `GreetingWorkflow` as the documented template.
- `app/core/procrastinate.py` — remove `"app.tasks.cfbd_dims"` from `import_paths`.
- **Delete** `app/tasks/cfbd_dims.py`.
- New Alembic migration (per the `migration` skill, head off
  `t9c0d1e2f3a4`) — `DELETE FROM admin_notify_config WHERE task_name='cfbd_dims'`
  in `upgrade`; re-insert the failure-on row + `0 3 * * *` cron in `downgrade`
  (mirrors the seed in `s8b9c0d1e2f3`).
- `Makefile` — add a `temporal-cfbd-dims` target that runs `trigger_now` in the
  `temporal_worker` container (the new "Run now").
- Doc-comment pointers updated to the new home: `app/models/cfbd.py` (2 refs),
  `app/tasks/cfbd_facts.py`, `app/tasks/cfbd_sync.py`, and the **Temporal**
  section of `AGENTS.md`.

## Affected files
| Path | Change |
|---|---|
| `app/temporal/cfbd_dims/__init__.py` | new package |
| `app/temporal/cfbd_dims/activities.py` | new: helpers + 2 activities |
| `app/temporal/cfbd_dims/workflow.py` | new: `CfbdDimsWorkflow` |
| `app/temporal/cfbd_dims/schedule.py` | new: ensure/trigger schedule |
| `app/temporal/worker.py` | register workflow+activities, ensure schedule at startup |
| `app/core/procrastinate.py` | drop `cfbd_dims` from `import_paths` |
| `app/tasks/cfbd_dims.py` | **deleted** |
| `alembic/versions/<new>_drop_cfbd_dims_notify_config.py` | new migration |
| `Makefile` | `temporal-cfbd-dims` target |
| `AGENTS.md`, `app/models/cfbd.py`, `app/tasks/cfbd_facts.py`, `app/tasks/cfbd_sync.py` | doc pointers |

## Verification
1. `python -m py_compile` all new/changed backend modules.
2. `make up` (or `docker compose up temporal temporal_worker db`); confirm the
   worker logs connecting, registering `CfbdDimsWorkflow`, and the `cfbd-dims`
   schedule being ensured.
3. `make temporal-cfbd-dims` to trigger an immediate run; watch the activity
   fan-out + aggregate result dict in the worker logs and the execution in the
   Temporal UI at `localhost:8080`.
4. Spot-check dim tables got upserted (`cfbd_teams`, `cfbd_conferences`,
   `cfbd_venues`, `cfbd_coaches`, `cfbd_coach_seasons`, `cfbd_draft_positions`,
   `cfbd_draft_teams`).
5. Confirm `cfbd_dims` no longer appears in `/admin/sync` (registry-driven).
6. Fallback if docker is unavailable: import-check the modules and dry-run
   `CfbdDimsWorkflow` against mocked activities to prove orchestration/aggregation.

## Implementation notes / deviations
- **Alembic cleanup migration deferred (blocked, pre-existing).** The plan called
  for a migration to `DELETE FROM admin_notify_config WHERE task_name='cfbd_dims'`.
  While building, `alembic heads` revealed a **pre-existing** broken tree: the
  revision id `w2f3a4b5c6d7` is declared by **two** different files
  (`w2f3a4b5c6d7_add_cfbd_games_week.py` and
  `w2f3a4b5c6d7_add_submission_submitted_at.py`), and `v1e2f3a4b5c6` has three
  children → **multiple heads**. `alembic` warns "Revision … present more than
  once" and `alembic upgrade head` cannot run. This predates and is unrelated to
  this change. Adding a clean, runnable migration is impossible until the
  duplicate id + multiple heads are reconciled, and doing that safely is out of
  scope (those revisions may already be stamped in deployed DBs).
  - The leftover `cfbd_dims` row is **functionally harmless** — the admin Sync
    panel is registry-driven, so with `cfbd_dims` removed from `import_paths` it
    shows no card. Its only effect is a recurring "Cron set for unknown task
    cfbd_dims; skipping" log line from the Procrastinate worker's cron resync.
  - **To silence it immediately** (one-off, no migration needed):
    `DELETE FROM admin_notify_config WHERE task_name = 'cfbd_dims';`
  - **Recommend a separate fix** for the duplicate-revision/multi-head Alembic
    defect (e.g. rename one colliding revision + `alembic merge` the heads), after
    which this row deletion can ride along as a normal migration.

## Open questions
- How to reconcile the pre-existing Alembic multiple-heads / duplicate-revision
  state (separate from this feature).
