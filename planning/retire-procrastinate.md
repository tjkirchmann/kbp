# Retire Procrastinate — Full Migration to Temporal

## Context

`cfbd_facts` and `cfbd_dims` already moved to Temporal (`app/temporal/`),
accepting admin-panel/notification regressions. This plan removes Procrastinate
**entirely**, with **no observability regressions** this time — the admin Sync
panel and bot rebuild on Temporal's visibility API. Decisions locked with the
user:

- **Admin panel + bot /status**: rebuild on Temporal (no UX regression).
- **espn_poll**: per-game **entity workflow** (one long-running workflow per live
  game), not a cron-style schedule — lean fully into Temporal.
- **Rate limiter**: replace the DB token bucket with a **Temporal-native gate**
  (its docstring already warns it's only correct for a single sequential caller,
  which N game workflows violate).
- **Cron editing**: **code-defined schedules only** (`ensure_schedule` pattern).
  No live DB-cron editing; changing a schedule is a code change + redeploy.

## What's still on Procrastinate (inventory)

**Tasks** (registered in `app/core/procrastinate.py` `import_paths`):
- `cfbd_games` — `app/tasks/cfbd_sync.py` (fact table, DB-cron scheduled)
- `cfbd_plays` + `cfbd_play_stats` — `app/tasks/cfbd_plays.py` (run-only)
- `espn_poll` (cron, retry=0) + `espn_seed` (run-only/startup) — `app/tasks/espn_poller.py`

**Infrastructure**:
- `app/worker.py` — worker entrypoint + DB-cron registry
- `app/core/periodic_sync.py` — `cron_changed` LISTEN/NOTIFY + poll reconcile
- `app/tasks/startup.py` — `run_on_startup` defers (reads `procrastinate_events`)
- `app/tasks/notify_decorator.py` — `@notify` lifecycle + catch-up suppression
- `app/routers/admin.py` — Sync panel: status/history/charts/cancel/abort/retry/cron/run-now, all via raw `procrastinate_jobs`/`procrastinate_events` SQL
- `app/bot/cogs/commands.py` — `/sync`, `/status` (defer + history SQL)
- `main.py`, `app/bot/__main__.py` — `procrastinate_app.open_async()`
- `start.sh`, `supervisord.conf`, `docker-compose.yml` — schema apply + worker
- `pyproject.toml`/`requirements.txt`/`uv.lock` — `procrastinate` dep

---

## Phase 1 — Migrate `cfbd_games` (fact table, scheduled)

Mirrors the `cfbd_facts` migration exactly (smallest, lowest-risk first).

- **NEW** `app/temporal/cfbd_games/` package:
  - `activities.py` — `sync_games_season` activity wrapping the existing
    fetch → snapshot → batch_upsert body from `cfbd_sync.py` (logic relocated
    verbatim; `_game_row`/`_game_hash_fields` move into a `services/sync` helper
    or stay co-located).
  - `workflow.py` — `CfbdGamesWorkflow` (single activity; current-year derived
    from `workflow.now().year`).
  - `schedule.py` — `ensure_games_schedule` (idempotent, SKIP overlap), cron
    from a new `temporal_cfbd_games_cron` setting (port current DB cron value).
  - `starter.py` — manual trigger (`make temporal-cfbd-games`).
- `app/temporal/worker.py` — register workflow + activity; `ensure_games_schedule` on boot.
- `app/core/procrastinate.py` — drop `"app.tasks.cfbd_sync"` from `import_paths`.
- **DELETE** `app/tasks/cfbd_sync.py`.

## Phase 2 — Migrate `cfbd_plays` / `cfbd_play_stats` (run-only)

No schedule; today only the admin "Run" button defers it.

- **NEW** `app/temporal/cfbd_plays/` — parent/child workflow per endpoint
  (mirrors `cfbd_facts` topology: parent loads coverage, fans out per endpoint,
  `sync_plays_season` activity does fetch→upsert→coverage→commit per season).
  Relocate `_sync_plays`/`_sync_play_stats`/`_load_coverage`/`_batch` into a
  `services/sync` module (or the activities module) verbatim.
- `starter.py` — manual trigger (`make temporal-cfbd-plays`), replaces Run button.
- Register in worker; drop `"app.tasks.cfbd_plays"` from `import_paths`; **DELETE** `app/tasks/cfbd_plays.py`.

## Phase 3 — ESPN: rate-limit gate (prerequisite for Phase 4)

The N-workflow model breaks the current single-caller token bucket. Build the
Temporal-native gate first so Phase 4 can depend on it.

- **NEW** `app/temporal/espn/rate_limit.py` — a Temporal-native limiter. Approach:
  a singleton **`EspnRateLimiterWorkflow`** (fixed id) holding a token-bucket in
  workflow state; game workflows acquire via **signal-with-start + update/query**
  (or, simpler and acceptable: an `acquire_espn_token` **activity** rewritten to
  be concurrency-safe with `SELECT … FOR UPDATE`/atomic insert so parallel
  callers can't overshoot). Decision: start with the **concurrency-safe activity**
  (smaller, reuses the `espn_rate_token` table) and only escalate to a limiter
  workflow if contention shows. Rate value still read from `admin_config`.
- Update `app/core/rate_limiter.py` docstring + make the acquire atomic (drop the
  "single sequential caller" assumption).

## Phase 4 — ESPN poller as per-game entity workflows

- **NEW** `app/temporal/espn/` package:
  - `activities.py` — relocate the per-game body of `_run_poll`: `fetch_espn_boxscore`
    → `extract_espn_scores` → state-transition notify → DB update → `log_event`,
    plus `acquire token` (Phase 3) and the stale-pre-game/`_prune_event_log` bits.
    Seed activity from `_run_seed`.
  - `game_workflow.py` — **`EspnGameWorkflow`** (fixed id = `espn:{game_id}`):
    loop = acquire token → poll activity → compute interval from live-game count
    (activity/query) → `workflow.sleep(interval)`; **continue-as-new** every K
    iterations to bound history; **exit** when state reaches `post` (or stale-pre
    timeout). Idempotent start dedups via the fixed id.
  - `seeder_workflow.py` — **`EspnSeederWorkflow`**: finds games that should be
    live (the current `_run_poll` selection query, as an activity) and
    `start_child_workflow` per game with the fixed id (already-running children
    are skipped, not duplicated). Driven by a **Temporal Schedule** at a coarse
    tick (e.g. every 1–2 min) — the seeder is cheap; the per-game workflows do the
    fast polling. Also handles `espn_seed` (stub-row insertion) as a startup/seed
    activity.
  - `schedule.py` — `ensure_espn_seeder_schedule` (idempotent).
  - `starter.py` — manual seed/trigger (`make temporal-espn-seed`).
- Register all in `app/temporal/worker.py`; on boot also `ensure_espn_seeder_schedule`.
- `app/core/procrastinate.py` — drop `"app.tasks.espn_poller"`; **DELETE** `app/tasks/espn_poller.py`.
- **Note**: `retry=0` (swallow transient poll errors) maps to a per-activity
  `RetryPolicy(maximum_attempts=1)`; halftime/final/start notifications stay as
  activity calls into the unchanged `notification_service`.

## Phase 5 — Notifications & startup defers on Temporal

- **`@notify`** (`notify_decorator.py`): re-implement lifecycle notifications as a
  small **workflow interceptor** or explicit start/success/failure activity calls
  inside each migrated workflow, reading `admin_notify_config` at runtime (same
  table, unchanged). Catch-up suppression is obsolete — Temporal Schedules own
  overlap/catchup policy — so that logic is dropped.
- **`run_on_startup`** (`startup.py`): obsolete. Temporal Schedules + the
  workflows' own coverage self-heal cover "ensure data present on boot." Any
  genuinely needed startup run becomes a one-shot `client.start_workflow` on
  worker boot. **DELETE** `startup.py`; the `procrastinate_events`-based
  last-success query goes away (use Temporal visibility if needed).

## Phase 6 — Admin Sync panel on Temporal visibility

Rebuild `app/routers/admin.py` sync endpoints against the Temporal client
(`app/core/temporal.py`) instead of raw `procrastinate_jobs`/`procrastinate_events` SQL.

- **NEW** `app/services/temporal_history.py` — wraps the Temporal client:
  - `list_workflows(...)` via `client.list_workflows` (visibility) → run rows
    (id, type, status, start/close time, duration) for `/sync/status`,
    `/sync/recent`, `/sync/tasks/{name}`, charts windows.
  - schedule introspection via `client.list_schedules` / `get_schedule_handle`
    for cron + next/upcoming fires (`/sync/upcoming`).
  - actions: cancel → `handle.cancel()`, abort → `handle.terminate()`, retry →
    re-start workflow (Temporal has no Procrastinate-style retry; "retry" =
    start a fresh run with the same input), run-now → `start_workflow` /
    `schedule.trigger()`.
- Rewrite each `admin.py` sync endpoint to call that service. The Pydantic
  response shapes (`SyncRun`, `SyncJobStatus`, etc.) stay so the **frontend is
  largely unchanged**; `job_id:int` becomes `run_id/workflow_id:str` (small
  frontend type change in `RunDetail.tsx` + the sync pages).
- `/sync/cron/{task}` (live edit) → **removed or made read-only** (code-defined
  schedules per decision). The notify-config endpoints stay (still drive
  `admin_notify_config` for notifications).
- `_RUN_ONLY_TASKS`, `_registered_tasks()` → derive the task list from the
  registered Temporal workflow types / schedules instead of the Procrastinate
  registry.

## Phase 7 — Bot on Temporal

- `app/bot/cogs/commands.py`:
  - `/sync <name>` → `client.start_workflow` (or `schedule.trigger`) for the named
    workflow, fixed-id dedup replaces `AlreadyEnqueued`.
  - `/status` → the new `temporal_history.list_workflows` (drop `_RECENT_SQL`).
- `app/bot/__main__.py` — remove `procrastinate_app.open_async()`; open a Temporal
  client instead (or lazily per command).

## Phase 8 — Tear down Procrastinate

- **DELETE**: `app/core/procrastinate.py`, `app/worker.py`,
  `app/core/periodic_sync.py`, `app/tasks/startup.py`,
  `app/tasks/notify_decorator.py` (after Phase 5), and the now-empty `app/tasks/`.
- `main.py` — remove the `procrastinate_app.open_async()` block and
  `defer_startup_tasks`.
- `start.sh` — remove the Procrastinate schema-apply block.
- `supervisord.conf` — remove `[program:procrastinate_worker]`; the Temporal
  worker runs as its own compose service (already exists). If the API container
  must also run the Temporal worker, add a `[program:temporal_worker]` here;
  otherwise rely on the compose `temporal_worker` service.
- `docker-compose.yml` — remove the `procrastinate_worker` service + its schema block.
- `pyproject.toml` / `requirements.txt` → drop `procrastinate`; regenerate `uv.lock`.
- **DB**: the `procrastinate_*` tables become dead. Add an Alembic migration to
  drop them (or leave them and note as orphaned — **decide at execution time**;
  default: drop in a final migration once history is no longer needed).

---

## Verification (per phase)

1. **Compile + worker construction**: `py_compile` new modules; import
   `app.temporal.worker` and construct the `Worker` (validates workflow/activity
   registration + sandbox determinism) after each phase.
2. **Procrastinate-still-loads** (Phases 1–4): until Phase 8, `app.core.procrastinate`
   + remaining task modules import clean with the migrated task removed.
3. **Workflow behavior**: `temporalio` time-skipping `WorkflowEnvironment` with
   mocked activities — assert games/plays coverage skip+sync logic; assert an
   `EspnGameWorkflow` polls, transitions, and exits at `post`; assert the seeder
   starts one child per live game and dedups.
4. **Rate limiter** (Phase 3): concurrent-acquire test proves no overshoot.
5. **Admin/bot** (Phases 6–7): hit each rewritten endpoint against a live
   Temporal (`docker compose up temporal temporal_worker backend`); confirm panel
   + `/status` render Temporal runs.
6. **End-to-end**: full `docker compose up` with Procrastinate removed; confirm
   all schedules fire, ESPN game workflows spin up for live games, admin panel
   works, no `procrastinate` import anywhere (`grep -rli procrastinate src/`).

## Open questions / risks

- **Visibility search attributes**: Template `list_workflows` needs a query
  (e.g. by WorkflowType + time). Confirm the dev `auto-setup` image's advanced
  visibility (Postgres) supports the filters the panel needs; may require
  declaring custom search attributes. Flag during Phase 6.
- **"Retry" semantics**: Temporal has no exact analogue to Procrastinate's retry
  a specific failed job — modeled as "start a new run." Acceptable?
- **Per-game workflow volume**: many simultaneous live games = many workflows.
  Fine for Temporal, but confirm the dev single-Postgres stack handles game-day
  load (prod sizing out of scope).
- **espn_rate_token table**: kept for Phase 3's atomic activity; revisit if the
  limiter is later promoted to a workflow.
