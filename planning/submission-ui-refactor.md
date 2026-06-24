# Submission UI Refactor

## Context

Work on the submissions flow, with one architecture reversal from the first pass:

1. **Custom per-pool questions (normalized).** The legacy Richmond Bull Pool site asked "for the record" questions: dating/allegiances, approach to football (or otherwise), hours of college football watched this year, and whether they want to be in the KBP group chat. **Decision (revised):** instead of hardcoding columns on the submission, model this as an **extensible, normalized Q/A system**. The admin **defines** the question set during **Pool setup (Step 1 — Pool details / naming)**; each submitter **answers** them on the submission Entry step. New pools' builder is **prefilled with the four legacy questions** (editable/removable).
2. **"Select Your Team" card layout.** Logo + team name are cramped in the top ~33%. They should own the **entire upper portion of the card** (everything above the point-selector row) and be noticeably bigger. The season summary / offense / defense placeholders stay as the lower portion.
3. **Autosave bug.** Picks autosave on a 1500ms debounce. Going fast and clicking away/navigating before the timer fires drops the save. Navigating away (game change, step change, unmount) should flush the pending save immediately.

Pre-existing bug found while inspecting migrations: alembic history has **three heads**, and two migration files share the **same revision id** `w2f3a4b5c6d7` (`add_submission_submitted_at` and `add_cfbd_games_week`), both with `down_revision = v1e2f3a4b5c6`. Alembic cannot run with a duplicate revision id. User approved fixing it (rename the dup + merge heads) so the new migration applies.

## Goals / Non-goals

- Goal: Two new tables — `pool_questions` (admin-defined, ordered) and `submission_answers` (per-submission) — mirroring the existing `PoolGame` ordering/soft-delete patterns.
- Goal: Question builder on **Pool setup Step 1**, prefilled with the four legacy questions, persisted **on "Next"** as a replace-all list (like the bracket endpoint).
- Goal: Submitters answer the pool's questions on the **Entry step**; answers hydrate when resuming.
- Goal: TeamCard logo + name as the full, bigger upper portion.
- Goal: Flush pending autosave on game change / step change / unmount / page unload.
- Goal: Repair alembic history so `alembic upgrade head` works.
- Non-goal: Columns-on-submission for questions (reversed — now normalized).
- Non-goal: Scoring/using answers anywhere yet; just author + collect + display-back-on-resume.
- Non-goal: Changing the placeholder season-summary/offense/defense content.

## Approach

### 1. Data model (`src/backend/app/models/pool.py`)

Mirror `PoolGame` (ordering + `cascade="all, delete-orphan"` + `deleted_at` + composite `UniqueConstraint`). Add a `QuestionType` `enum.StrEnum` (`text`, `number`, `boolean`) per the repo's `ScoringStrategy` enum pattern.

```python
class QuestionType(enum.StrEnum):
    text = "text"; number = "number"; boolean = "boolean"

class PoolQuestion(Base):
    __tablename__ = "pool_questions"
    id; created_at
    pool_id -> pools.id (index)
    prompt: str
    question_type: Mapped[QuestionType] = mapped_column(Enum(QuestionType, name="question_type"))
    sort_order: int (server_default "0")
    required: bool (server_default "false")
    deleted_at: datetime | None
    pool: relationship(back_populates="questions")

class SubmissionAnswer(Base):
    __tablename__ = "submission_answers"
    __table_args__ = (UniqueConstraint("submission_id", "question_id", name="uq_submission_answers_sub_q"),)
    id; created_at; updated_at
    submission_id -> pool_submissions.id (index)
    question_id -> pool_questions.id (index)
    answer_text: Mapped[str | None]   # single text column; coerced by question_type
    deleted_at: datetime | None
```

Add `questions` relationship to `Pool` and `answers` to `PoolSubmission` (cascade delete-orphan). Register both in `app/models/__init__.py`.

### 2. Migrations (Alembic — `migration` skill; ENUM via `create_type=False` + manual `op.execute("CREATE TYPE …")`)

1. **Rename dup**: in `alembic/versions/w2f3a4b5c6d7_add_cfbd_games_week.py` change revision id → unique (`x3a4b5c6d7e8`), keep `down_revision=v1e2f3a4b5c6`, rename file to match.
2. **Merge heads**: new merge migration, `down_revision` = `("4af0541bf4c6", "w2f3a4b5c6d7", "x3a4b5c6d7e8")` (the three current heads).
3. **New tables migration** on top of the merge: `CREATE TYPE question_type AS ENUM ('text','number','boolean')`, `create_table pool_questions`, `create_table submission_answers` (+ unique constraint), with `downgrade()` dropping tables then the type. Follow `b1c2d3e4f5a6_add_pool_tables.py` for the enum-create pattern.

Verify: `alembic heads` → one head; `make migrate` dry-run + apply clean.

### 3. Backend schemas (`src/backend/app/schemas/pool.py`)

- `PoolQuestionSchema` (id, prompt, question_type, sort_order, required) `from_attributes`.
- `PoolQuestionInput` (prompt, question_type, required) + `PoolQuestionsUpdate { questions: list[PoolQuestionInput] }` (ordered; index → sort_order) for the admin replace-all.
- `SubmissionAnswerInput` (question_id, answer_text) + `SubmissionAnswersUpdate { answers: list[...] }`.
- `SubmissionAnswerSchema` (question_id, answer_text) for read/hydrate.
- Add `questions: list[PoolQuestionSchema]` to `PoolDetailSchema`.

### 4. Backend routers

**Admin** (`src/backend/app/routers/pools.py`):
- `PUT /admin/pools/{pool_id}/questions` → replace-all: soft-delete existing `PoolQuestion`s for the pool, insert the new ordered list (index = sort_order). Mirror `update_bracket`'s clear-then-set + return shape. Include questions in `get_pool` (`PoolDetailSchema.questions`).

**Submission** (`src/backend/app/routers/submissions.py`):
- `GET /submission/pools/{pool_id}/questions` → public list of that pool's questions (active), ordered.
- `GET /submission/{submission_id}/answers` → owner's answers (like `get_picks`).
- `PUT /submission/{submission_id}/answers` → upsert answers (locked check like `upsert_pick`; replace-all or per-question upsert on `uq_submission_answers_sub_q`). Validate `question_id` belongs to the submission's pool.

### 5. Frontend — admin question builder (Pool setup Step 1)

`src/frontend/src/services/useAdminPools.ts`: add `PoolQuestion` type + `useUpdatePoolQuestions()` mutation (`PUT /admin/pools/{id}/questions`, invalidates `['admin','pools',poolId]`).

`src/frontend/src/pages/admin/PoolCreate.tsx` (Step 1, lines ~315–361): below name/season inputs add a **Questions builder** — local state `questions: {prompt, question_type, required}[]`, **prefilled with the four legacy questions**:
- allegiances/dating "for the record" → text
- approach to football (or otherwise) → text
- hours of college football watched this year → number
- want to be in the KBP group chat → boolean

Add/remove/reorder rows (mirror the multiplier +/- / row UI patterns already in this file). On **"Next: Select Games"** (`handleCreatePool`): create the pool (existing) then `useUpdatePoolQuestions` with the ordered list before advancing to Step 2.

### 6. Frontend — Entry step answers (`src/frontend/src/pages/submission/EntryMetaStep.tsx`)

`src/frontend/src/services/useSubmission.ts`: add `usePoolQuestions(poolId)` query, `useSubmissionAnswers(submissionId)` query, `useSaveAnswers(submissionId)` mutation (invalidate answers + my-submissions).

In `EntryMetaStep`: render the pool's questions as inputs (text / number / yes-no toggle by `question_type`), prefilled from existing answers when resuming. On submit, after `enter.mutateAsync` (or when resuming) call `useSaveAnswers` before `onComplete`. Answers optional → don't block continuing.

### 7. Frontend — TeamCard layout (`src/frontend/src/pages/submission/GamesStep.tsx`)

Restructure `TeamCard` (lines 86–156): replace fixed `h-[33%]` top block with an **upper region that flex-grows** to fill everything above the point selector — big centered logo (`h-10 w-10` → ~`h-20 w-20`, larger ring) and bigger name (`text-sm` → `text-lg`/`xl`). Keep the inline point-selector row as its own row beneath (only when selected). Keep `<PlaceholderSections />` as the lower portion; preserve the non-selected "Win by X" badge.

### 8. Frontend — autosave flush (`GamesStep.tsx`)

Store latest pending pick in a `pendingRef` alongside `debounceRef`. Add `flushPending()` (clear timer + immediate `savePick.mutateAsync`). Call it in: a `useEffect` cleanup keyed on `currentIndex` (game switch), an unmount cleanup (leaving step / navigating away), and a `beforeunload`/`pagehide` handler. Keep the 1500ms debounce + "Saved ✓" flash for the happy path.

## Affected files

- `src/backend/app/models/pool.py` — `QuestionType`, `PoolQuestion`, `SubmissionAnswer`; `questions`/`answers` relationships.
- `src/backend/app/models/__init__.py` — register new models.
- `src/backend/app/schemas/pool.py` — question/answer schemas; `PoolDetailSchema.questions`.
- `src/backend/app/routers/pools.py` — `PUT …/questions`; questions in `get_pool`.
- `src/backend/app/routers/submissions.py` — questions GET; answers GET + PUT.
- `src/backend/alembic/versions/w2f3a4b5c6d7_add_cfbd_games_week.py` — rename to unique id (+ file rename).
- `src/backend/alembic/versions/<merge>.py`, `<new>_add_pool_questions_and_answers.py` — new migrations.
- `src/frontend/src/services/useAdminPools.ts` — `PoolQuestion` + `useUpdatePoolQuestions`.
- `src/frontend/src/services/useSubmission.ts` — `usePoolQuestions`, `useSubmissionAnswers`, `useSaveAnswers`.
- `src/frontend/src/pages/admin/PoolCreate.tsx` — Step 1 question builder (prefilled), save on Next.
- `src/frontend/src/pages/submission/EntryMetaStep.tsx` — answer inputs + save + resume hydration.
- `src/frontend/src/pages/submission/GamesStep.tsx` — TeamCard layout + autosave flush.

## Verification

- **Migration**: `cd src/backend && alembic heads` → one head; `make migrate` shows `CREATE TYPE question_type` + two `CREATE TABLE`s, applies clean; `\d pool_questions`, `\d submission_answers` confirm schema.
- **Backend**: `make lint`; backend tests if present.
- **App run** (`run`/`verify`, docker compose): create a pool → Step 1 shows the four prefilled questions, editable; advance → reopen pool detail and confirm questions persisted. As a submitter, enter that pool → Entry step shows those questions; answer, leave, resume → answers prefilled. Team cards show big logo+name owning the upper portion. Make a pick and immediately click "All Pools"/next game → reopen → pick saved (flush works).
- **Frontend lint** passes.

## Open questions

- Boolean ("group chat") control style — yes/no two-button matching existing `EntryMetaStep` styling; not blocking.
