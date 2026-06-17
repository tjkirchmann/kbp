# Integrate CFBD Fact Tables — Smart Daily Sync

## Context

KBP materializes CFBD reference data via two Procrastinate paths today:

- **`cfbd_games`** — a fact table (game results/scores), synced **every 15 min**
  for the current year (`app/tasks/cfbd_sync.py`).
- **`cfbd_dims`** — all slowly-changing **dimension** tables in one **nightly**
  task (`app/tasks/cfbd_dims.py`, merged in from `remote/cfbd-sync`).

The rest of CFBD's **fact** data (events/measurements that change over time —
betting lines, poll rankings, box-score stats, drives, plays, ratings, …) isn't
stored yet. This PR adds the **first three new fact tables** behind **one smart
daily task** and lays down the conventions + a full catalog so we can reach
**full fact coverage** incrementally.

Per owner decisions: start with **Lines, Rankings, Team game stats**; **backfill
all history** (not just the current season); **one combined `cfbd_facts` task**;
built **on top of the merged dim branch** (reuse `batch_upsert`, snapshots, the
provider, the registry-driven admin card).

---

## Goals / Non-goals

- **Goal:** Materialize 3 fact tables — `cfbd_betting_lines`, `cfbd_rankings`,
  `cfbd_game_team_stats` — into Postgres with **no duplicate rows** (PK upsert)
  and **fresh data** (idempotent re-runs converge).
- **Goal:** A **smart** daily sync that only calls the API for data we're
  **missing** — past seasons are immutable, so once fully ingested they're never
  re-fetched; only the in-progress season is re-pulled daily.
- **Goal:** **Backfill** every season from a configurable start year, converging
  to ~3 API calls/day once caught up.
- **Goal:** Reuse all existing sync infra (provider, `record_snapshot`,
  `batch_upsert`, `@notify`, DB-driven cron, registry-driven admin Sync panel).
  **No** frontend or admin-endpoint edits.
- **Goal:** Document **every** CFBD fact table (catalog below) in the plan, the
  PR body, and the task module — a roadmap to full coverage.
- **Non-goal:** Touching `cfbd_games` (already a fact table, its own cadence) or
  `cfbd_dims` (dimensions).
- **Non-goal:** Sub-daily cadence, per-table tasks, or per-game API fan-out — we
  start daily and "get more complicated from there."
- **Non-goal:** New admin UI (the Sync panel is registry-driven) or surfacing
  this data in the app yet.

---

## The full CFBD fact-table catalog (coverage roadmap)

Comment carried into `app/tasks/cfbd_facts.py` and the PR. ✅ done · 🆕 this PR ·
⬜ planned (full coverage).

| CFBD endpoint | Grain | Target table | Status |
|---|---|---|---|
| `/games` | game | `cfbd_games` | ✅ (15-min, `cfbd_sync.py`) |
| `/lines` | game × provider | `cfbd_betting_lines` | 🆕 |
| `/rankings` | season·week·poll·team | `cfbd_rankings` | 🆕 |
| `/games/teams` | game × team × stat | `cfbd_game_team_stats` | 🆕 |
| `/games/players` | game × player × stat | `cfbd_game_player_stats` | ⬜ |
| `/games/weather` | game | `cfbd_game_weather` | ⬜ |
| `/games/media` | game × outlet | `cfbd_game_media` | ⬜ |
| `/game/box/advanced` | game | `cfbd_game_box_advanced` | ⬜ |
| `/drives` | drive | `cfbd_drives` | ⬜ |
| `/plays` | play | `cfbd_plays` | ⬜ (high volume) |
| `/plays/stats` | play × stat | `cfbd_play_stats` | ⬜ |
| `/calendar` | season·week | `cfbd_calendar` | ⬜ (week boundaries) |
| `/records` | season × team | `cfbd_team_records` | ⬜ |
| `/stats/season` | season × team × stat | `cfbd_team_season_stats` | ⬜ |
| `/stats/season/advanced` | season × team | `cfbd_team_season_adv` | ⬜ |
| `/stats/game/advanced` | game × team | `cfbd_team_game_adv` | ⬜ |
| `/stats/player/season` | season × player × stat | `cfbd_player_season_stats` | ⬜ |
| `/ratings/sp` · `/srs` · `/elo` · `/fpi` | season(·week) × team | `cfbd_team_ratings` | ⬜ |
| `/ppa/teams` · `/ppa/games` · `/ppa/players/*` | varies | `cfbd_ppa_*` | ⬜ |
| `/wepa/*` | season × player/team | `cfbd_wepa_*` | ⬜ |
| `/metrics/wp` · `/wp/pregame` | game / play | `cfbd_win_prob` | ⬜ |
| `/recruiting/teams` · `/players` · `/groups` | season × team/player | `cfbd_recruiting_*` | ⬜ |
| `/teams/ats` | season × team | `cfbd_team_ats` | ⬜ |
| `/talent` | season × team | `cfbd_team_talent` | ⬜ |
| `/player/usage` · `/returning` · `/portal` | season × player | `cfbd_player_*` | ⬜ |

---

## Data model (4 new tables)

CFBD is camelCase → snake_case columns. All fact rows carry `last_synced_at`.

### `cfbd_betting_lines` — `/lines` → `BettingGame.lines[]`
PK `(game_id, provider)`. One row per game per sportsbook.
`game_id, provider, season, season_type, week, home_team_id, home_team,
away_team_id, away_team, spread, spread_open, over_under, over_under_open,
home_moneyline, away_moneyline, formatted_spread, last_synced_at`.

### `cfbd_rankings` — `/rankings` → `PollWeek.polls[].ranks[]`
PK `(season, season_type, week, poll, team_id)`. One row per ranked team per poll
per week. `season, season_type, week, poll, team_id, school, conference, rank,
first_place_votes, points, last_synced_at`.

### `cfbd_game_team_stats` — `/games/teams` → `GameTeamStats.teams[].stats[]`
PK `(game_id, team_id, category)`. Long/EAV — CFBD's stat categories are
open-ended, so a wide table would churn. `game_id, team_id, team, conference,
home_away, points, category, stat (text value), last_synced_at`.

### `cfbd_fact_coverage` — smart-sync cursor (no API; internal bookkeeping)
PK `(endpoint, season_year)`. `endpoint, season_year, complete (bool),
row_count, last_synced_at`. A `(endpoint, year)` row with `complete=true` means a
finished season fully ingested → **never fetched again**.

---

## Approach

### Smart "only fetch what's missing" engine
The daily `cfbd_facts` task drives all three endpoints through one loop:

```
current = utcnow().year
for endpoint in ("lines", "rankings", "game_team_stats"):
    for year in range(settings.cfbd_facts_start_year, current + 1):
        cov = coverage[(endpoint, year)]
        if cov and cov.complete:        # immutable past season, already done
            continue                    # ← the API call we DON'T make
        data = cfbd_provider.fetch(endpoint, year=year)
        snapshot changed entities + batch_upsert rows
        upsert coverage(endpoint, year, complete = year < current, row_count)
```

- **Past seasons** are fetched once, marked `complete`, then skipped forever.
- **Current season** stays `complete=false` → re-pulled daily (lines move,
  polls/stats update) until the calendar year rolls — the January run after a
  season finishes does the final pull, then marks it complete.
- After the initial backfill the task converges to **3 calls/day** (current year
  × 3 endpoints). This is the whole "be smart" requirement, derived from the
  cursor table rather than guesswork.
- Coverage is recorded **only after a successful upsert**, so an interrupted
  backfill self-heals (a half-loaded year stays `complete=false` and is retried).

### Mirror the established CFBD pattern
Per `cfbd_dims.py`: for each entity, `record_snapshot(...)`
(`app/services/sync/snapshots.py`) for change history, then `batch_upsert(...)`
(`app/services/sync/upsert.py`) with `index_elements=` the composite PK. Rows are
de-duped by PK in-memory (last wins) before upsert so one `ON CONFLICT` statement
never touches a key twice. Snapshot grain = the API object (per game for
lines/stats, per poll-week for rankings) to keep snapshot volume bounded.

### Schedule (DB-driven, registry card is automatic)
Migration seeds an `admin_notify_config` row for `cfbd_facts` with cron
`0 4 * * *` (after `cfbd_dims` at 3am UTC), `notify_on_failure=true`. The worker's
`periodic_sync.resync` registers it from the DB — no `@app.periodic` in code. The
`/admin/sync` card appears automatically (registry-driven).

---

## Affected files

- `app/models/cfbd.py` — add `CfbdBettingLine`, `CfbdRanking`,
  `CfbdGameTeamStat`, `CfbdFactCoverage`.
- `app/models/__init__.py` — export + `__all__` the 4 new models.
- `app/services/sync/providers/cfbd.py` — add a `_FACT_ENDPOINTS` map +
  `lines` / `rankings` / `game_team_stats` branches to `fetch()` (GET with
  `year`, optional `seasonType`).
- `app/tasks/cfbd_facts.py` — **new** combined `cfbd_facts` task: the
  coverage-driven smart loop, row/hash builders, the full fact-table catalog
  docstring. `queueing_lock="cfbd_facts"`, `retry=3`, `@notify`.
- `app/core/procrastinate.py` — add `"app.tasks.cfbd_facts"` to `import_paths`.
- `app/core/config.py` — add `cfbd_facts_start_year: int = 2013` (lines data
  begins ~2013; configurable via env).
- `alembic/versions/<rev>_add_cfbd_fact_tables.py` — **new**, `down_revision =
  "s8b9c0d1e2f3"`: create the 4 tables; seed the `cfbd_facts` notify row + cron.

No edits to `routers/admin.py`, `SyncPanel.tsx`, `SyncJobCard.tsx`, or
`useAdminSync.ts` — the admin Sync panel is registry-driven.

---

## Verification

Live runtime (docker/make/defer) is **skipped** — repo has no `.env`, the stack
can't boot (same constraint the dim branch documented). Static checks instead:

1. `python -m py_compile` / import every new/changed module: `cfbd_facts.py`,
   `models/cfbd.py`, `models/__init__.py`, `providers/cfbd.py`, `config.py`,
   `procrastinate.py`, and the new migration — all import cleanly.
2. Confirm the migration `down_revision` chains off the current head
   (`s8b9c0d1e2f3`) and `upgrade()`/`downgrade()` are symmetric (4 tables + cron
   seed created; dropped + reverted on downgrade).
3. Sanity-check the 4 SQLAlchemy models register on `Base.metadata` with the
   intended composite PKs, and the new `import_paths` entry is well-formed.
4. Dry-run the smart loop logic with a stub coverage map (pure-Python) to confirm
   past-complete years are skipped and the current year is always selected.
5. Deferred to first real deploy (once `.env` exists): worker registers
   `cfbd_facts` at `0 4 * * *`, the `/admin/sync` card appears, first run
   backfills all seasons, second run hits the API only for the current year.

---

## Open questions

- **Start year = 2013** (when CFBD betting lines begin; rankings/stats go back
  further but lines would be sparse before then). Configurable via
  `cfbd_facts_start_year`. OK, or pick a different floor?
- **`cfbd_game_team_stats` as EAV** (one row per category) vs a wide pivot —
  going EAV to avoid schema churn as CFBD adds categories. Acceptable?
- **Backfill on one daily task**: the first run iterates ~12 seasons × 3
  endpoints (~36 calls) in a single job. Fine as a one-off, or do we want the
  first backfill chunked across runs? (Default: single job; it self-heals.)
