# Pool Entry UX Fixes

## Context
The pool-entry flow at `/submission` (pick pool → optional password → entry meta →
pick games) has three rough edges reported during review:

1. The per-game margin control only adds (`+1 / +3 / +7`) and defaults to `0`,
   allowing a meaningless zero-margin pick.
2. Clicking the already-selected team **deselects** it, and the left-hand step
   rail shows a generic checkmark rather than which team was picked.
3. The flow has no ending — the last game's **Done** button is disabled and does
   nothing. Picks autosave per-game, but there is no review/submit/confirmation
   and the existing `is_locked` flag is never set.

## Goals / Non-goals
- Goal: margin is always ≥ 1 (default 1), with a full decrement/increment stepper.
- Goal: a pick cannot be cleared once made (team can still be switched); the rail
  shows the picked team's logo.
- Goal: finish the flow with a Review & Submit step that locks the entry.
- Non-goal: redesigning the placeholder team-stat sections in `GamesStep`.
- Non-goal: unlock/edit-after-submit UX beyond surfacing the locked state.

## Approach

### 1 — Margin stepper (min 1)
In `GamesStep.tsx` (`TeamCard`), replace the single `+1/+3/+7` row with a stepper:
`−7 −3 −1  [value]  +1 +3 +7`. Every change clamps to `Math.max(1, …)`. Default
margin on select becomes `1`; the number input uses `min={1}` and clamps `< 1`.
Server guard: `GamePickUpsert.picked_margin` → `Field(ge=1)`.

### 2 — No deselect + logo in rail
- `GamesStep.handleSelect`: drop the toggle/delete branch — selected team click is
  a no-op; switching teams keeps the existing margin.
- `useSavePick`: invalidate the picks query on success so the rail updates live.
- `SubmissionWorkspace`: enrich `gameItems` with the picked winner's logo, resolved
  from each game's `home_team_meta` / `away_team_meta`.
- `StepRail`: render the team logo in the number circle when a game is picked
  (fallback to the checkmark when no logo is available).

### 3 — Review & Submit step
**Backend**
- Alembic migration (down_revision `v1e2f3a4b5c6`): add nullable `submitted_at`
  timestamp to `pool_submissions`.
- `POST /submission/{submission_id}/submit`: require a pick for every pool game
  (400 if incomplete), set `is_locked=True` + `submitted_at=now()`, return the row.
- `upsert_pick`: 403 when the submission is already locked.
- Expose `is_locked` + `submitted_at` on `MySubmissionSchema`.

**Frontend**
- `useSubmission.ts`: `useSubmitEntry(submissionId)` mutation (invalidates picks +
  my-submissions); add `is_locked` / `submitted_at` to the `MySubmission` interface.
- New `ReviewStep.tsx`: lists each game (logo + winner + margin); Submit disabled
  until all games picked; success → "Entry submitted ✓" confirmation.
- `SubmissionWorkspace`: add the `'review'` step id, wire the last-game **Done**
  button to advance to Review, and add Review to the rail.
- `GamesStep`: add an `onDone` prop for the last-game Done button.

## Affected files
| Path | Change |
| --- | --- |
| `src/backend/app/models/pool.py` | add `submitted_at` to `PoolSubmission` |
| `src/backend/app/schemas/pool.py` | `picked_margin: Field(ge=1)`; lock fields on `MySubmissionSchema` |
| `src/backend/app/routers/submissions.py` | `/submit` endpoint; lock guard on upsert |
| `src/backend/alembic/versions/*_add_submission_submitted_at.py` | new migration |
| `src/frontend/src/services/useSubmission.ts` | `useSubmitEntry`, invalidations, interface fields |
| `src/frontend/src/pages/submission/GamesStep.tsx` | stepper, no-deselect, `onDone` |
| `src/frontend/src/pages/submission/StepRail.tsx` | picked-team logo |
| `src/frontend/src/pages/submission/SubmissionWorkspace.tsx` | review step + rail wiring |
| `src/frontend/src/pages/submission/ReviewStep.tsx` | new review/submit screen |

## Verification
- `npm run build` in `src/frontend` (tsc + vite) — typecheck/build clean.
- Backend: apply migration; `/submit` returns 400 when incomplete, locks when
  complete; a locked submission's pick upsert returns 403.
- Run the app and walk the flow: stepper min 1 / no deselect / rail logos →
  Done → Review → Submit → confirmation.

## Open questions
- None outstanding — scope confirmed (Review + Submit with lock; full `−7…+7` stepper).
