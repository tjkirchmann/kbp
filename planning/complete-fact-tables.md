# Complete CFBD Fact Tables + Full Mirror

## Context
KBP already mirrors part of the CollegeFootballData (CFBD) dataset via two
Procrastinate tasks: `cfbd_dims` (nightly, slowly-changing reference data) and
`cfbd_facts` (smart-daily, season-cursored event/measurement data). `cfbd_facts`
covers `/lines`, `/rankings`, `/games/teams` today; its docstring carries a
roadmap of ~12 remaining fact endpoints marked ⬜. This change finishes that
roadmap so the full CFBD dataset is mirrored locally — with play-by-play split
into a **separate, cron-less manual task** per the user's instruction (plays are
millions of rows / thousands of paged calls and shouldn't run on a schedule).

The architecture is already uniform, so each new endpoint is a small repeated
addition: model → migration table → provider endpoint entry → syncer fn →
register in `_SYNCERS`. The existing `cfbd_fact_coverage` cursor auto-handles
per-season backfill/skip for every new endpoint with no extra wiring.

---

## Goals / Non-goals
- **Goal:** Add the remaining season- and week-batched CFBD fact tables to the
  existing `cfbd_facts` daily task.
- **Goal:** Add a separate `cfbd_plays` task for `/plays` + `/plays/stats` that
  is runnable from the admin "Run" button but **never scheduled** (null cron,
  run-only — mirrors `espn_seed`).
- **Goal:** Keep everything idempotent via the existing snapshot → batch_upsert
  pattern and the coverage cursor.
- **Non-goal:** Per-`gameId` fan-out endpoints (`/game/box/advanced` and similar
  one-call-per-game shapes) — deferred and documented in the roadmap; not what
  the user asked to include and a poor fit for the season-batched cursor.
- **Non-goal:** Frontend/admin UI changes beyond marking the plays task run-only.
- **Non-goal:** New dimension tables — the remaining CFBD data is all
  season-scoped (fact-shaped), so it flows through `cfbd_facts`/`cfbd_plays`.

---

## Approach

### Phase 1 — Extend `cfbd_facts` (daily cron) with remaining facts
For each endpoint below: add a SQLAlchemy model in `app/models/cfbd.py`, a
`create_table` in one new migration, an endpoint entry in the provider, a
`_sync_*` function in `app/tasks/cfbd_facts.py`, and a `_SYNCERS` registration.
Each syncer reuses `record_snapshot` (`app/services/sync/snapshots.py`) and
`batch_upsert` (`app/services/sync/upsert.py`) exactly as the existing
`_sync_lines` / `_sync_rankings` / `_sync_team_stats` do.

Year-batched (added to `_FACT_ENDPOINTS`, `year=` param):

| Endpoint | Table | Grain (PK) |
|---|---|---|
| `/calendar` | `cfbd_calendar` | season·season_type·week |
| `/records` | `cfbd_team_records` | year × team_id |
| `/ratings/sp` | `cfbd_sp_ratings` | year × team |
| `/ratings/srs` | `cfbd_srs_ratings` | year × team |
| `/ratings/elo` | `cfbd_elo_ratings` | year × team |
| `/ratings/fpi` | `cfbd_fpi_ratings` | year × team |
| `/stats/season` | `cfbd_team_season_stats` (EAV) | year × team_id × stat_name |
| `/stats/season/advanced` | `cfbd_team_season_adv_stats` | year × team |
| `/stats/player/season` | `cfbd_player_season_stats` (EAV) | year × player_id × category × stat |
| `/talent` | `cfbd_team_talent` | year × team |
| `/recruiting/teams` | `cfbd_recruiting_teams` | year × team |
| `/recruiting/players` | `cfbd_recruiting_players` | year × player_id |
| `/recruiting/groups` | `cfbd_recruiting_groups` | year × team × position_group |
| `/player/returning` | `cfbd_returning_production` | year × team |
| `/games/media` | `cfbd_game_media` | game_id × media_type/outlet |
| `/drives` | `cfbd_drives` | drive id |

Week-paged (added to `_FACT_WEEKLY_ENDPOINTS`, reuses `_fetch_by_week`):

| Endpoint | Table | Grain (PK) |
|---|---|---|
| `/games/players` | `cfbd_game_player_stats` (EAV) | game_id × player_id × category × stat |
| `/games/weather` | `cfbd_game_weather` | game_id |

EAV/long shape (one row per stat, like the existing `cfbd_game_team_stats`) is
used wherever CFBD's stat set is open-ended, to avoid schema churn as categories
appear. All non-key columns are nullable for resilience.

### Phase 2 — Separate cron-less `cfbd_plays` task
- New module `app/tasks/cfbd_plays.py`: a Procrastinate task named `cfbd_plays`
  materializing `cfbd_plays` + `cfbd_play_stats` from `/plays` and
  `/plays/stats` (week-paged via the provider). Same snapshot/upsert pattern and
  its own `cfbd_fact_coverage` rows.
- Register the module in `app/core/procrastinate.py` `import_paths`.
- Add `"cfbd_plays"` to `_RUN_ONLY_TASKS` in `app/routers/admin.py` so the UI
  treats it as run-only (cron not editable), mirroring `espn_seed`.
- Migration seeds its `admin_notify_config` row with **cron = NULL** (run-only;
  never scheduled) and `notify_on_failure = true`, and creates the two tables.

### Phase 3 — Roadmap/docs
Update the coverage roadmap comment block in `cfbd_facts.py` (move completed
endpoints ✅/🆕), note the deferred per-`gameId` endpoints, and add a one-line
module docstring to `cfbd_plays.py` explaining it is intentionally cron-less.

---

## Affected files
- `app/models/cfbd.py` — ~19 new models (17 facts + plays/play_stats)
- `app/services/sync/providers/cfbd.py` — new entries in `_FACT_ENDPOINTS` /
  `_FACT_WEEKLY_ENDPOINTS` (plus per-season-type paging where required, e.g.
  `/drives`, `/plays`)
- `app/tasks/cfbd_facts.py` — new `_sync_*` fns + `_SYNCERS` entries + roadmap
- `app/tasks/cfbd_plays.py` — **new** run-only task
- `app/core/procrastinate.py` — add `app.tasks.cfbd_plays` to `import_paths`
- `app/routers/admin.py` — add `cfbd_plays` to `_RUN_ONLY_TASKS`
- `alembic/versions/<rev1>_add_cfbd_remaining_fact_tables.py` — **new**, all
  Phase 1 tables
- `alembic/versions/<rev2>_add_cfbd_plays_tables.py` — **new**, plays tables +
  run-only cron seed (revises rev1)

---

## Verification
No live CFBD API key or running KBP stack in this worktree, so verification is
structural + fixture-driven (no network):
1. **Compile/lint:** `python -m py_compile` (or ruff) on every new/changed
   module — no import or syntax errors; provider endpoint maps load.
2. **Migrations:** bring up the compose `db` service, run `make migrate`
   (alembic upgrade head) → all new tables created; spot-check `migrate-down`
   reverses the two new revisions cleanly.
3. **Fixture syncer test:** feed representative canned CFBD JSON payloads (one
   per endpoint shape) through each `_sync_*` fn into the real compose DB and
   assert the expected keyed rows land — proves field mapping + PK + ON CONFLICT
   upsert end-to-end without the network. Re-run to confirm idempotency (no
   duplicate rows, snapshot `changed` count drops to 0).
4. **Run-only wiring:** assert `cfbd_plays` is registered in the Procrastinate
   app, its `admin_notify_config.cron` is NULL, and it is in `_RUN_ONLY_TASKS`
   (so the admin status endpoint reports `schedulable=False`).

## Open questions
- CFBD camelCase field names for the newer endpoints will be validated against
  CFBD's documented schema during build; models use nullable columns + EAV where
  stat sets are open-ended, so minor field drift won't break ingestion.
