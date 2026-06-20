# CFBD Facts on Temporal

## Context

`cfbd_facts` is today a single large **Procrastinate** task
(`app/tasks/cfbd_facts.py`) that materializes ~22 CFBD fact tables: it loops
endpoints × seasons, and for each missing `(endpoint, year)` fetches the CFBD
API → records a content-hash snapshot → batch-upserts → marks coverage, with a
per-season commit so an interrupted backfill self-heals. It is scheduled by a
DB-driven cron (`admin_notify_config.cron`) and wrapped in `@notify`.

We're migrating orchestration to **Temporal** (already stood up: client seam
`app/core/temporal.py`, worker `app/temporal/worker.py`, full server in
`docker-compose.yml`, `temporalio==1.29.0`) and beginning the exit from
Procrastinate. This change rewrites **only** `cfbd_facts` in idiomatic Temporal
style using current orchestration patterns. The proven smart-sync *logic*
(coverage, snapshots, idempotent upserts) is preserved verbatim — only the
orchestration layer changes. **Admin Sync-panel + notification regressions for
this one task are explicitly accepted.**

---

## Goals / Non-goals

- **Goal**: `cfbd_facts` runs as a Temporal workflow, scheduled by Temporal, no
  longer registered with or orchestrated by Procrastinate.
- **Goal**: use the current Temporal patterns idiomatically — parent/child
  workflows for fan-out, activities for all I/O, `RetryPolicy`, heartbeating,
  Temporal **Schedules** (not the deprecated cron field), deterministic time.
- **Goal**: keep coverage/snapshot/upsert semantics and per-season self-heal
  identical to today.
- **Non-goal**: migrating `cfbd_plays`, `cfbd_sync`, `cfbd_dims`, `espn_poller`
  (they keep their own helper copies and stay on Procrastinate for now).
- **Non-goal**: preserving the admin Sync card, "Run now" button, run history,
  or `@notify` notifications for `cfbd_facts` (accepted regressions).
- **Non-goal**: removing Procrastinate entirely (future work).

---

## Approach

### Workflow topology (most temporal-esque)

```
CfbdFactsWorkflow (parent, scheduled daily)
  ├─ activity: get_facts_config           → start_year (from settings)
  ├─ activity: load_fact_coverage         → completed {(endpoint, year)}
  └─ fan-out, bounded concurrency:
        CfbdEndpointWorkflow(endpoint, …)  (child, one per endpoint)
          └─ for each missing season (sequential):
                activity: sync_fact_season(endpoint, year, current_year)
```

- **Parent `CfbdFactsWorkflow`** loads config + coverage, then fans out one
  **child workflow per endpoint** via `workflow.execute_child_workflow`. Children
  are dispatched in **bounded batches** (deterministic `asyncio.gather` over a
  fixed batch size, e.g. 4) so we don't hammer the CFBD API — mirroring today's
  effectively-sequential behavior while gaining parallelism. Current season is
  `workflow.now().year` (deterministic Temporal time, not `datetime.utcnow()`).
- **Child `CfbdEndpointWorkflow`** owns one endpoint's multi-season backfill as
  its own durable history (per-endpoint failure isolation). It iterates
  `start_year..current_year` **sequentially**, skipping seasons already complete,
  calling the `sync_fact_season` activity per missing season.
- **Big payloads never cross the workflow boundary.** `sync_fact_season` does
  fetch → snapshot → upsert → coverage → commit *entirely inside the activity*,
  so multi-MB CFBD season payloads stay out of workflow history (respects
  Temporal payload limits) and the existing per-season commit/self-heal boundary
  is preserved exactly.
- **`RetryPolicy`** on activities replaces `retry=3` + hand-rolled HTTP backoff
  (exponential backoff for CFBD 429/5xx). A failed `(endpoint, year)` leaves the
  season incomplete (coverage not written) so it self-heals next run — identical
  to today's isolating try/except. Child workflows surface but don't abort
  siblings (parent tolerates a child failure and records it in the summary).
- **Heartbeating** on `sync_fact_season` (heartbeat + `heartbeat_timeout`) for
  the long week-paged endpoints (`game_team_stats`, `game_player_stats`,
  `game_weather`); generous `start_to_close_timeout`.
- Typed `@dataclass` inputs for workflow/activity args; explicit timeouts.

### Scheduling (replaces Procrastinate periodic + DB cron + catch-up)

- A **Temporal Schedule** runs `CfbdFactsWorkflow` daily with
  `ScheduleOverlapPolicy.SKIP` (mirrors today's `queueing_lock` "don't stack").
  This is the modern replacement for the deprecated workflow cron field and for
  Procrastinate's periodic/catch-up machinery.
- `ensure_cfbd_facts_schedule(client)` creates-or-updates the schedule
  idempotently and is invoked on **worker boot** (declarative, self-registering —
  same spirit as today's startup cron registration). Cron string configurable
  via a new `temporal_cfbd_facts_cron` setting (default daily, e.g. `0 8 * * *`).

### Code moves & reuse

- Extract the **pure transform logic** out of `app/tasks/cfbd_facts.py` into
  `app/services/sync/cfbd_facts_syncers.py` — `_SYNCERS`, all `_expand_*`,
  `_make_generic`, `_flatten`, `_batch`, `_load_coverage`, plus a new
  orchestration-free `sync_one_season(db, endpoint, year, current_year)` holding
  the body currently inline in the task loop (fetch via existing
  `cfbd_provider.fetch` → syncer → coverage upsert → `db.commit()`). Reuses
  existing `record_snapshot` (`app/services/sync/snapshots.py`) and
  `batch_upsert` (`app/services/sync/upsert.py`) unchanged.
- Temporal activities import from that service module; **no transform logic is
  rewritten**, only relocated.
- `app/tasks/cfbd_facts.py` is **deleted** (orchestration removed). `cfbd_plays`
  is unaffected — it carries its own `_SYNCERS`/`_load_coverage`/`_batch` copies
  and does not import `cfbd_facts`.

---

## Affected files

| File | Change |
|---|---|
| `app/services/sync/cfbd_facts_syncers.py` | **NEW** — relocated transforms + `sync_one_season(db, endpoint, year, current_year)`; exports `FACT_ENDPOINTS` |
| `app/temporal/cfbd_facts/__init__.py` | **NEW** — package marker |
| `app/temporal/cfbd_facts/activities.py` | **NEW** — `get_facts_config`, `load_fact_coverage`, `sync_fact_season` (async, `TaskSessionLocal`, heartbeat) |
| `app/temporal/cfbd_facts/workflows.py` | **NEW** — `CfbdFactsWorkflow` (parent) + `CfbdEndpointWorkflow` (child); typed dataclass args |
| `app/temporal/cfbd_facts/schedule.py` | **NEW** — `ensure_cfbd_facts_schedule(client)` (idempotent, SKIP overlap) |
| `app/temporal/cfbd_facts/starter.py` | **NEW** — manual trigger (replaces admin "Run now") |
| `app/temporal/worker.py` | register new workflows + activities; `ensure_cfbd_facts_schedule` on boot |
| `app/core/procrastinate.py` | remove `"app.tasks.cfbd_facts"` from `import_paths` |
| `app/core/config.py` | add `temporal_cfbd_facts_cron` (default daily) |
| `app/tasks/cfbd_facts.py` | **DELETE** |
| `Makefile` | add `temporal-cfbd-facts` target for manual run |

---

## Accepted regressions

- `cfbd_facts` disappears from the admin **Sync** panel (registry is
  Procrastinate-driven), loses its "Run now" button + Procrastinate run history,
  and its `@notify` start/success/failure notifications + DB-cron row go inert.
  All accepted per the request. Replacement manual trigger: `make
  temporal-cfbd-facts` (and the Temporal Web UI at `:8080`).

---

## Verification

1. **Compile + registration**: `python -m py_compile` the new/changed modules;
   import `app.temporal.worker` and **construct the `Worker`** (validates
   workflow/activity registration and sandbox determinism without a live server).
2. **Procrastinate intact**: import `app.core.procrastinate` and
   `app.tasks.cfbd_plays` after the `import_paths` removal — both load clean and
   `cfbd_facts` is gone from the registry.
3. **Workflow behavior** (where network allows): run under `temporalio`'s
   time-skipping `WorkflowEnvironment` with mocked activities — assert the parent
   fans out the right endpoint children, children skip already-complete seasons
   and call `sync_fact_season` only for missing `(endpoint, year)`, and a single
   activity failure isolates to that season without aborting siblings. Fall back
   to registration validation if the test server can't be fetched.
4. **End-to-end (optional, manual)**: `docker compose up temporal temporal_worker
   backend`; `make temporal-cfbd-facts`; confirm in Temporal UI the parent +
   child workflows complete and `cfbd_fact_coverage` rows land (current season
   `complete=false`, prior seasons `complete=true`).

---

## Open questions

- None blocking. Schedule defaults to daily `0 8 * * *` UTC
  (`temporal_cfbd_facts_cron`), adjustable later. `@notify` for `cfbd_facts` is
  intentionally dropped per accepted regressions; can be re-added later as a
  final summary activity if desired.
