# Sync CFBD Dimension Tables Nightly

## Context
KBP materializes two CFBD entities today: `cfbd_teams` (nightly, `0 3 * * *`) and
`cfbd_games` (every 15 min — a fact table whose scores change). The remaining CFBD
**dimension** (slowly-changing reference) data isn't stored. We want **one** nightly
Procrastinate task that materializes **all** CFBD dim tables, folding the existing
teams sync into it. Games stays separate (it's frequent by design — "if it needs to be
more frequent, we can write another sync").

---

## Goals / Non-goals
- **Goal:** One nightly task `cfbd_dims` that upserts every CFBD dimension table.
- **Goal:** Reuse the existing sync infra (provider, snapshots, batch-upsert, `@notify`,
  DB-driven cron, registry-driven admin card). No frontend/admin-endpoint edits.
- **Goal:** Fold `cfbd_teams` into `cfbd_dims` and retire the standalone teams task.
- **Non-goal:** Touching `cfbd_games` (fact table, separate cadence).
- **Non-goal:** New admin UI — the Sync panel is registry-driven.

---

## Scope (from CFBD OpenAPI docs)
`cfbd_dims` fetches these global, no-required-param dimension endpoints:

| Endpoint | Table | PK strategy |
|---|---|---|
| `/teams` | `cfbd_teams` (reuse existing) | `id` (int) |
| `/conferences` | `cfbd_conferences` | `id` (int) |
| `/venues` | `cfbd_venues` | `id` (int) |
| `/coaches` | `cfbd_coaches` + `cfbd_coach_seasons` | synthetic `coach_id` = sha1(`first|last|hireDate`); seasons keyed `(coach_id, year, school)` |
| `/draft/positions` | `cfbd_draft_positions` | `name` |
| `/draft/teams` | `cfbd_draft_teams` | `display_name` |

Field sets (camelCase from CFBD → snake_case columns):
- **Conference:** id, name, shortName, abbreviation, classification.
- **Venue:** id, name, city, state, zip, countryCode, timezone, latitude, longitude,
  elevation, capacity, constructionYear, grass, dome.
- **Coach:** firstName, lastName, hireDate (+ derived `coach_id`).
- **CoachSeason:** school, year, games, wins, losses, ties, preseasonRank,
  postseasonRank, srs, spOverall, spOffense, spDefense (all stat fields nullable).
- **DraftPosition:** name, abbreviation.
- **DraftTeam:** location, nickname, displayName, logo.

Coaches is the only non-flat case: CFBD exposes no coach id and nests a `seasons[]`
array, so it splits into a coach table + a seasons child table.

---

## Approach
Mirror the established CFBD pattern in `app/tasks/cfbd_sync.py`: for each entity,
record a content-hash snapshot via `record_snapshot`
(`app/services/sync/snapshots.py`) then batch-upsert with
`pg_insert(...).on_conflict_do_update`. Reuse `cfbd_provider`
(`app/services/sync/providers/cfbd.py`), `SyncSnapshot`, the `@notify` decorator
(`app/tasks/notify_decorator.py`), and `TaskSessionLocal`.

**Snapshots:** one `entity_type` per kind (`cfbd_conference`, `cfbd_venue`,
`cfbd_coach`, `cfbd_draft_position`, `cfbd_draft_team`; `cfbd_team` already exists).
Coach snapshot payload includes the nested `seasons` so season changes are tracked at
the coach level.

**Shared upsert:** extract the existing `_batch_upsert` from `cfbd_sync.py` into
`app/services/sync/upsert.py` as `batch_upsert(db, model, rows, batch_size)` and import
it from both `cfbd_sync` (games) and `cfbd_dims`. Keep batches under the 32767 bind-param
cap (all dim tables are far under it; coach_seasons is batched).

**Schedule (DB-driven — the cron lives in `admin_notify_config.cron`, not code):** a
migration seeds a `cfbd_dims` notify row (`notify_on_failure=true`) with cron
`0 3 * * *` (the slot teams used) and **nulls** `cfbd_teams.cron`. The worker's
`periodic_sync.resync` picks it up on its poll/NOTIFY without a code-level
`@app.periodic`.

**Retiring teams:** remove `sync_cfbd_teams` + the team helpers from `cfbd_sync.py`
(move team row/hash logic into `cfbd_dims`); `cfbd_games` stays. The `cfbd_teams`
`admin_notify_config` row is kept (cron nulled) so its historical runs in
`procrastinate_jobs` remain queryable; the registry card disappears once the task is
unregistered. The `cfbd_teams` *table* and `cfbd_games`' read dependency on it are
unaffected — `cfbd_dims` now populates it.

---

## Affected files
- `app/services/sync/providers/cfbd.py` — add `conferences`, `venues`, `coaches`,
  `draft/positions`, `draft/teams` branches to `fetch()` (simple GETs, no cache needed).
- `app/models/cfbd.py` — add `CfbdConference`, `CfbdVenue`, `CfbdCoach`,
  `CfbdCoachSeason`, `CfbdDraftPosition`, `CfbdDraftTeam`.
- `app/models/__init__.py` — export + `__all__` the new models.
- `app/tasks/cfbd_dims.py` — **new** combined `cfbd_dims` task (teams + conferences +
  venues + coaches + draft), `queueing_lock="cfbd_dims"`, `retry=3`, `@notify`.
- `app/tasks/cfbd_sync.py` — remove `sync_cfbd_teams` + `_team_row`/`_team_hash_fields`
  (moved to dims); switch games to the shared `batch_upsert`.
- `app/services/sync/upsert.py` — **new** shared `batch_upsert` helper.
- `app/core/procrastinate.py` — add `"app.tasks.cfbd_dims"` to `import_paths`.
- `alembic/versions/<rev>_add_cfbd_dim_tables.py` — **new**: create the 6 tables; seed
  `cfbd_dims` notify row + cron `0 3 * * *`; null `cfbd_teams` cron. (Pattern per
  `r7a8b9c0d1e2_add_cron_to_notify_config.py` and `m2b3c4d5e6f7_add_admin_notify_config.py`.)

No edits to `routers/admin.py`, `SyncPanel.tsx`, `SyncJobCard.tsx`, or
`useAdminSync.ts` — the admin Sync panel is registry-driven.

---

## Verification
Live runtime verification (docker/make/defer) is **skipped** — the server has no
`.env` file yet, so the stack can't boot. Rely on static checks instead:
1. `python -m py_compile` (or import) every new/changed module:
   `app/tasks/cfbd_dims.py`, `app/tasks/cfbd_sync.py`, `app/models/cfbd.py`,
   `app/services/sync/upsert.py`, `app/services/sync/providers/cfbd.py`,
   `app/core/procrastinate.py`, and the new migration — confirm they import cleanly.
2. Confirm the migration's `down_revision` chains off the current head
   (`q6f7a8b9c0d1`) and that `upgrade()`/`downgrade()` are symmetric (6 tables created
   + cron seed; tables dropped + cron revert).
3. Sanity-check the SQLAlchemy models register on `Base.metadata` and the new
   `import_paths` entry is well-formed.
4. Deferred to first real deploy (once `.env` exists): worker registers
   `cfbd_dims` at `0 3 * * *`, the `/admin/sync` card appears, and the six tables
   populate on first run.

---

## Open questions
- Coach synthetic PK via sha1(`firstName|lastName|hireDate`) — acceptable given CFBD
  exposes no coach id? (Assumed yes.)
- Keep the retired `cfbd_teams` notify-config row (cron nulled) for run history rather
  than deleting it — assumed yes.
