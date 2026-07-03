# Skill: Structured Output (pydantic-ai + OpenRouter + Temporal)

You are adding or modifying a **structured-output job** in KBP: take an entity (a
row in some table), send it to an LLM via pydantic-ai/OpenRouter, get back a
**typed** result, and store it.

The system is **two-tiered**, unified by one seam:

- **Static tier** — a definition known at startup, authored in **code**. First-class
  and type-safe: a real Pydantic model for the LLM schema, a real Alembic-migrated
  ORM table for storage, a real SQLAlchemy predicate for source filtering. This is
  the load-bearing path (e.g. `program_profile`).
- **Dynamic tier** — a definition configured at **runtime** from a row in
  `struct_output_definitions` (a future admin UI is the author). Output schema and
  table are derived at runtime from the row's field spec. Preserved and available,
  but has **no committed definitions today** — "decide if we want to use it" later.

Both tiers implement one interface — `BaseDefinition` — so the Temporal activities,
the LLM runner, and the schedule reconciler are written **once** and never care
which tier a definition is.

> **Consumer-TBD callout:** this delivers the *architecture*, not a load. No output
> is load-bearing until a feature reads it (a team-profile page, game previews,
> etc.). The next branch should pick + wire one consumer.

---

## Architecture (how it's wired)

```
app/services/struct_output/
  ├── base.py           ← THE SEAM: BaseDefinition ABC + StaticDefinition +
  │                       DynamicDefinition (adapter) + STATIC registry +
  │                       combined resolver (get_definition / all_definitions /
  │                       all_scheduled — static first, then DB)
  ├── definitions/      ← STATIC definitions live here (code)
  │   ├── __init__.py     ← imports each def + register_static(...) on import
  │   └── program_profile.py  ← ProgramProfileOutput (Pydantic) + ProgramProfileDefinition
  ├── runner.py         ← the ONE LLM seam: pydantic-ai Agent + OpenRouterModel
  ├── schema.py         ← DYNAMIC: field-type vocab + build_model() (create_model)
  ├── table.py          ← DYNAMIC: ensure_output_table / upsert_output (CREATE TABLE)
  └── registry.py       ← DYNAMIC: load/list registry rows, fetch source rows
app/models/struct_output.py                  ← StructOutputDefinition (the registry row)
app/models/struct_output_program_profile.py  ← STATIC ORM table (real migration)
app/temporal/struct_output/
  ├── activities.py   ← resolve_targets, generate_and_upsert (speak the seam)
  ├── workflow.py     ← StructOutputBatchWorkflow (parent) + StructOutputEntityWorkflow (child)
  └── schedule.py     ← per-definition Temporal Schedule + trigger_batch / trigger_entity
app/temporal/worker.py     ← registers workflows+activities; reconciles schedules on boot
app/routers/struct_output.py ← read-only admin views (both tiers; tagged with `tier`)
```

Topology (parent + per-entity child — shared by both tiers):
```
StructOutputBatchWorkflow(name, overwrite)
  ├─ resolve_targets (activity)              → defn.fetch_source_ids ∖ existing_entity_ids
  └─ StructOutputEntityWorkflow(name, id) × N  (child per entity, bounded concurrency)
       └─ generate_and_upsert (activity)      → runner.generate → defn.upsert
```

---

## The seam — `BaseDefinition`

Both tiers implement it. The Temporal layer + runner speak **only** this:

| member | meaning |
|---|---|
| `name`, `cron`, `model` | identity + runtime knobs (`model=""` → settings default) |
| `prompt_template` | str.format-style; references `{label_field}` names |
| `effective_model()` | resolved OpenRouter id (blank → `settings.openrouter_default_model`) |
| `render_prompt(entity)` | renders the template; unknown placeholder → `ValueError` |
| `output_model()` | the Pydantic model used as pydantic-ai `output_type` |
| `fetch_source_ids(db)` | in-scope source entity ids (after any filter) |
| `existing_entity_ids(db)` | entity ids already stored |
| `fetch_source_row(db, eid)` | one source row as `{pk + label_fields}` |
| `upsert(db, eid, values, *, model, run_id)` | store one result, idempotent |

`StaticDefinition` implements these via the ORM (real model, real table, real
predicate). `DynamicDefinition` adapts the existing `schema`/`registry`/`table`
dynamic machinery to the same methods.

**Resolver** — `get_definition(db, name)` checks `STATIC` (code) first, then the
DB (dynamic). `all_definitions` / `all_scheduled` union both; **static wins on a
name collision** (a shadowed dynamic row is skipped), so a stale/colliding row
can't produce a duplicate schedule.

---

## How to add a NEW STATIC definition (the common, load-bearing case)

1. **Output Pydantic model + ORM table.** Create the Pydantic `BaseModel`
   (typed fields; scores `Field(ge=1, le=10)`, tiers `Literal[...]`) **and** a
   matching SQLAlchemy ORM model whose single integer PK is the FK to the source
   entity. The two must stay field-for-field in lockstep (the runner upserts by
   `setattr`). Mirror `program_profile.py` + `struct_output_program_profile.py`.
2. **Migration.** `make migrate-new` (autogenerates from the ORM model) — a real,
   reviewable migration. No dynamic DDL for static tables.
3. **Definition class.** In `app/services/struct_output/definitions/<name>.py`,
   subclass `StaticDefinition`, set `name` / `output` / `output_orm` /
   `source_model` / `source_label_fields` / `prompt_template` / `cron`, and override
   `filter_source(stmt)` to scope rows (e.g. `.where(Model.col == 'fbs')`). Export a
   singleton instance.
4. **Register.** In `definitions/__init__.py`, import the singleton and call
   `register_static(...)`. That's it — no worker/workflow/activity changes.
5. On worker boot, `reconcile_struct_output_schedules` picks it up (cron set) and
   creates/updates its Temporal Schedule. `get_definition('name')` now resolves it.

> Adding/removing/renaming a field means updating the Pydantic model, the ORM
> model, **and** a migration — the three stay in lockstep. This is the cost of
> type-safety; it's the point.

## How to add a NEW DYNAMIC definition (for the future admin UI)

A dynamic definition is a **row** in `struct_output_definitions`. There's no code.
(No admin UI exists yet, so today this means inserting a row by hand for testing.)

| column | meaning |
|---|---|
| `name` | slug + PK; drives table name `struct_output_{name}` and workflow ids |
| `source_table`, `source_pk` | where source rows come from (e.g. `cfbd_teams`, `id`) |
| `source_label_fields` | JSON list of columns fed to the LLM as prompt placeholders |
| `source_filter` | optional trusted SQL boolean (e.g. `classification = 'fbs'`); blank = all |
| `fields` | JSON list of output field specs (vocab below) |
| `prompt_template` | `str.format`-style; references `{label_field}` names |
| `model` | OpenRouter model id; blank → `settings.openrouter_default_model` |
| `cron` | 5-field UTC; null = no schedule. Scheduled runs are **populate-only** |
| `enabled` / `locked` / `deleted_at` | lifecycle flags |

### Field-type vocabulary (`schema.py` + `table.py` — dynamic only, keep in sync)

| type | Python (LLM schema) | SQL column |
|---|---|---|
| `score` | `int` constrained 1–10 | `integer` |
| `tier` / `enum` | `Literal[...]` (needs `"enum": [...]` on the spec) | `text` |
| `text` / `str` | `str` | `text` |
| `int` / `float` / `bool` | `int` / `float` / `bool` | `integer` / `double precision` / `boolean` |

A field spec: `{"name": str, "type": <above>, "description": str, "enum"?: [str]}`.
**`description` is the per-field LLM instruction** — write it carefully. The data
table is created **on first run** from the spec (no Alembic migration).

---

## How to run / refresh

```bash
make struct-output-run NAME=program_profile             # populate-only (skips existing rows)
make struct-output-run NAME=program_profile OVERWRITE=1 # regenerate everyone
```
- **Populate-only** (default + all scheduled runs): only entities without a row.
- **Overwrite**: re-generate every in-scope entity. Manual/explicit only.
- Watch executions in the Temporal UI (`localhost:8080`) — one parent + one child
  per entity. Works identically for static and dynamic (both are name-based).

---

## Rules & gotchas

- **The runner is the only place that calls the LLM** (`runner.py`). Don't add
  OpenRouter/OpenAI calls elsewhere. Model choice = the definition's `model`.
- **Static tables evolve via Alembic** — no schema drift (this was the bug the
  refactor fixed: `CREATE TABLE IF NOT EXISTS` was a no-op once a table existed).
- **Dynamic tables CANNOT evolve** — editing a dynamic definition's `fields` will
  not migrate its already-created table (`IF NOT EXISTS` is a no-op). Known
  limitation, deferred until the admin-UI phase adds DDL migration.
- **Workflows are deterministic** — no I/O, no wall clock. All side effects live in
  activities, imported via `workflow.unsafe.imports_passed_through()`.
- **Activities** open their own `TaskSessionLocal` (NullPool) session; everything is
  idempotent (upsert keyed on entity id) so retries/re-runs converge.
- **OPENROUTER_API_KEY** must be set (`.env`); the runner raises without it.
- **Register new workflows/activities** in `app/temporal/worker.py` only if you add
  new workflow/activity *functions* — adding a definition (either tier) never does.
- **Don't seed static definitions into the registry.** They live in code
  (`definitions/`) and are never DB rows. The registry is the **dynamic** tier's home.
- pydantic-ai pins: `pydantic-ai-slim[openrouter]==1.50.0` (bumped from 1.22.0
  to fix an upstream `int`-typed `upstream_inference_cost` cost field that pydantic
  2.11.2 rejects as `int_from_float`; 1.50.0 keeps pydantic 2.11.2 — the
  pydantic-bump boundary is at 1.65.0). Don't bump to 2.x without also bumping
  `pydantic` to >=2.12.

## Deferred to later phases (not built yet)
- Admin UI builder for dynamic definitions (create/edit fields from the UI).
- Webhook POST endpoints to trigger batch/entity runs (seam exists:
  `schedule.trigger_batch` / `trigger_entity`).
- Soft-delete recovery + hard-delete from the admin UI.
- Dynamic DDL migration (so editing a dynamic definition migrates its table).
- **A consumer** — wire a user-facing feature to read an output (the thing that
  actually makes the system load-bearing).
