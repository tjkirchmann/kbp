# Skill: Data Modeling

Rules and conventions for KBP's data model. Read this before adding any table, column, or relationship.

---

## Non-negotiables

- **Every table gets**: `id` (PK), `created_at`, `updated_at`, `deleted_at`
- **Soft deletes only** — never hard delete rows. Set `deleted_at = now()`. All queries must filter `WHERE deleted_at IS NULL`.
- **Integer PKs** — no UUIDs. Simple `id: Mapped[int] = mapped_column(primary_key=True)`.
- **Snake case** everywhere — columns, tables, enums.
- **One model file per domain** — `user.py`, `pool.py`, etc. Re-export all from `app/models/__init__.py`.

---

## Soft delete rules

- `deleted_at IS NULL` filter goes on every query, including joins.
- Cascade: when a parent is soft-deleted, stamp `deleted_at` on children in the same transaction via `UPDATE ... WHERE parent_id = ?`.
- Current cascade scope: deleting a `Pool` stamps `deleted_at` on its `PoolGame` and `PoolSubmission` rows.
- `deleted_at` on a `User` blocks authentication (403) — checked in `get_current_user` in `app/core/auth.py`.
- Child tables (`PoolGame`, `PoolSubmission`, `PoolSubmissionGameItem`) may be soft-deleted independently in future — the column is there for it.

---

## Schema

### `users`
| Column | Type | Notes |
|---|---|---|
| `id` | int PK | |
| `clerk_id` | string | unique, indexed — Clerk's external ID |
| `email` | string | |
| `name` | string nullable | |
| `is_admin` | bool | default false |
| `is_banned` | bool | default false |
| `created_at` / `updated_at` / `deleted_at` | datetime | standard |

### `pools`
| Column | Type | Notes |
|---|---|---|
| `id` | int PK | |
| `name` | string | e.g. "2025 Kirchmann Bowl Pool" |
| `season_year` | int | e.g. 2025 |
| `is_featured` | bool | one featured pool shown in standings — enforced at app layer only, not DB |
| `submissions_open` | bool | admin kill switch |
| `submissions_due_at` | datetime nullable | auto-close deadline |
| `scoring_strategy` | enum nullable | `scoring_strategy` postgres type — values TBD |
| `created_at` / `updated_at` / `deleted_at` | datetime | standard |

### `pool_games`
| Column | Type | Notes |
|---|---|---|
| `id` | int PK | |
| `pool_id` | FK → pools | indexed |
| `cfbd_game_id` | int | CFBD reference ID |
| `cfbd_snapshot` | JSONB | full raw payload from CFBD API — camelCase keys |
| `home_team` / `away_team` | string | denormalized from snapshot |
| `game_date` | date | denormalized from snapshot |
| `bowl_name` | string nullable | from `notes` field in CFBD response |
| `home_score` / `away_score` | int nullable | filled by admin when result is entered |
| `sort_order` | int | default 0; admin-controlled; sort by `game_date` as fallback |
| `created_at` / `updated_at` / `deleted_at` | datetime | standard |

### `pool_submissions`
| Column | Type | Notes |
|---|---|---|
| `id` | int PK | |
| `pool_id` | FK → pools | indexed |
| `submitted_by_user_id` | FK → users | always required — who owns/entered it |
| `on_behalf_of_name` | string nullable | display only, no FK |
| `on_behalf_of_email` | string nullable | display only, no FK |
| `is_locked` | bool | set when submissions close or admin locks individually |
| `created_at` / `updated_at` / `deleted_at` | datetime | standard |

### `pool_submission_game_items`
| Column | Type | Notes |
|---|---|---|
| `id` | int PK | |
| `submission_id` | FK → pool_submissions | indexed |
| `pool_game_id` | FK → pool_games | indexed |
| `picked_winner` | string | team name |
| `picked_margin` | int | points |
| `created_at` / `updated_at` / `deleted_at` | datetime | standard (no timestamps in original — add if needed) |

---

## Key decisions (don't re-litigate without cause)

- **One active/featured pool at a time** — `is_featured` is a plain bool, uniqueness enforced in app layer only (no partial unique index — avoids deadlocks). Admin manually un-features old pools.
- **All pool games are required picks** — no optional or bonus games.
- **Scoring is computed on-the-fly** — no stored score column on submission items. The scoring service receives the full game object and uses its attributes.
- **CFBD snapshot stored as JSONB** — full raw payload cached permanently, no Redis needed. CFBD API returns camelCase keys (`homeTeam`, `awayTeam`, `startDate`, `seasonType`).
- **Submissions: one per person per pool is not enforced at DB level** — a user can submit on behalf of someone without an account (`on_behalf_of_name`). `submitted_by_user_id` is who entered it, not necessarily who it's for.
- **`submissions_open` + `submissions_due_at` both exist** — boolean is manual override, timestamp is auto-close. Both checked when restricting submission access.

---

## CFBD API
- Base URL: `https://api.collegefootballdata.com`
- Auth: `Authorization: Bearer {cfbd_api_key}` (stored in `Settings`, injected via docker-compose env)
- Postseason games: `GET /games?year={year}&seasonType=postseason` — note camelCase param
- Bowl name lives in the `notes` field of each game object
- Service: `app/services/cfbd.py` → `fetch_postseason_games(year)`
