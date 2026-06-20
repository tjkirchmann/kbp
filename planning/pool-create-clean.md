# Pool Create UX Overhaul

## Context
The admin "Create Pool" wizard (`src/frontend/src/pages/admin/PoolCreate.tsx`,
the live component routed at `/admin/pools/new` — `PoolsPanel.tsx` is dead code)
has several UX rough edges: native checkboxes that clash with the app's design
system, no FBS default on the game finder, a missing week filter, a confusing
"Season" label, an always-shown playoff bracket step even when there are no
postseason games, and a final multiplier step rendered as a card grid that lacks
team flavor and the ability to remove or add games. This change polishes all of
these into a coherent, admin-table-consistent flow.

---

## Goals / Non-goals
- Goal: app-styled game-select checkboxes; FBS-default finder; week filter +
  "Season Stage" rename; a hero-card choice to skip playoff assignment (default
  skip when no postseason games); a review table in step 4 with team flavor,
  multiplier editing, row removal, and an "Add games" button back to step 2.
- Non-goal: redesigning the bracket-assignment UI itself, the submission flow,
  or `PoolsPanel.tsx` (dead code, left untouched).

---

## Approach

### Backend (`src/backend`)
1. **Persist `week`** — add `week: Mapped[Optional[int]]` to `CfbdGame`
   (`app/models/cfbd.py`) + an Alembic migration (follow `app/alembic/`
   conventions per the `migration` skill). Map `g.get("week")` in both
   `_cfbd_api_to_row` and `_cfbd_api_to_schema` (`app/routers/pools.py`); bump
   `_UPSERT_COLS` 18 → 19. Add `week: int | None` to `CfbdGameSchema` and
   `PoolGameSchema` (+ its `model_validate`) in `app/schemas/pool.py`.
2. **Remove-a-game endpoint** — `DELETE /admin/pools/{pool_id}/games/{pool_game_id}`
   in `app/routers/pools.py`: soft-delete by setting `deleted_at` (mirrors the
   existing soft-delete pattern in `delete_pool`).

### Services (`src/frontend/src/services/useAdminPools.ts`)
3. Add `week: number | null` to the `CfbdGame` and `PoolGameDetail` interfaces.
   Add a `useRemovePoolGame` mutation hook (DELETE) following the existing
   `useDeletePool` pattern.

### Component (`src/frontend/src/pages/admin/PoolCreate.tsx`)
4. **Custom checkbox** (issue 1) — in `GameRow`, replace the native
   `<input type="checkbox">` with an app-styled control: a `size-4` rounded box
   using `border-border` / `bg-white/[0.03]`, filling to `bg-primary` with a
   `Check` icon (lucide) when selected. Keep the `<label>` toggle wrapper.
5. **FBS default** (issue 2) — initialize `finderClass = 'fbs'` (raw CFBD value,
   matching the `TeamsList` default-`'fbs'` precedent) so the finder loads
   FBS-only.
6. **Week filter + rename** (issue 3) — add a "Week" `<select>` to the step-2
   filter row (options derived from loaded games' `week`, sorted, plus "All");
   apply it in the `finderGames`/`selectedGames` memos. Rename the **Season**
   filter label to **Season Stage**.
7. **Hero-card selector in step 3** (issue 4a) — add a `bracketMode`
   (`'assign' | 'skip'`) state defaulting to `'skip'` when no
   `poolGames.some(pg => pg.season_type === 'postseason')`, else `'assign'`. Two
   selectable cards at the top of step 3 (inner-card style, primary ring on the
   active card). When `skip`, hide the bracket UI and Next → step 4 with no
   assignments; when `assign`, show the existing bracket assignment UI.
8. **Step 4 review table** (issue 4b) — retitle to **"Review & Assign
   Multipliers"**. Replace the card grid with an admin-style table mirroring
   `pages/admin/TeamsList.tsx` (rounded panel, sticky flex header, rows).
   Pull team flavor via `useAdminTeams()` keyed by `school` for home/away
   logos & colors. Columns: **Matchup** (logos + names), **Date / Week**,
   **Playoff slot** badge (reuse `ROUND_COLORS`/`ROUND_LABELS`), **Multiplier**
   (− / `Nx` / + stepper, existing logic), **Remove** (calls `useRemovePoolGame`
   then clears the row from `poolGames`, `selected`, `multipliers`,
   `slotToGame`). Add an **"Add games"** button → `setStep('step2')` with
   selections preserved; `handleAddGames` merges results, preserving existing
   multipliers (`prev[pg.id] ?? 1`) and bracket assignments instead of resetting.

---

## Affected files
- `src/backend/app/models/cfbd.py` — add `week` column to `CfbdGame`
- `src/backend/app/alembic/versions/*` — new migration adding `cfbd_games.week`
- `src/backend/app/routers/pools.py` — map `week`; bump `_UPSERT_COLS`; add DELETE endpoint
- `src/backend/app/schemas/pool.py` — `week` on `CfbdGameSchema` & `PoolGameSchema`
- `src/frontend/src/services/useAdminPools.ts` — `week` fields; `useRemovePoolGame`
- `src/frontend/src/pages/admin/PoolCreate.tsx` — all 5 frontend UX changes

---

## Verification
- `make migrate` (or alembic upgrade) applies the `week` migration cleanly.
- Backend: hit `GET /admin/pools/cfbd-games/{year}` and confirm `week` present;
  `DELETE /admin/pools/{id}/games/{pgId}` soft-deletes (row drops from pool detail).
- Frontend: `tsc`/`vite build` clean; run app (`run` skill) and walk the wizard:
  - Step 2 loads FBS-filtered; custom checkboxes select/deselect; "Week" filter
    narrows games; the filter is labeled "Season Stage".
  - Step 3 defaults to the Skip card when no postseason games selected; choosing
    Assign reveals the bracket UI.
  - Step 4 shows the table with team logos/colors, week, slot badges; multiplier
    +/− works; Remove drops a row; "Add games" returns to step 2 with prior
    selections intact, and re-adding preserves multipliers.

## Open questions
- None — `week` is persisted to the DB (clean) rather than schema-only.
