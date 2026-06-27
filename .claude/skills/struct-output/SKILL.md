# Skill: Structured Output (pydantic-ai + OpenRouter + Temporal)

You are adding or modifying a **structured-output job** in KBP: take an entity (a
row in some table), send it to an LLM via pydantic-ai/OpenRouter, get back a
**typed** result, and store it in a per-definition `struct_output_{name}` table.

The system is **registry-driven** and **generalized** — you almost never write a
new model class, table migration, or workflow per job. You add a *definition*
(a row in `struct_output_definitions`) and everything else is derived at runtime.

---

## Architecture (how it's wired)

```
app/models/struct_output.py                  ← StructOutputDefinition (the registry row)
app/services/struct_output/
  ├── schema.py    ← field-type vocab + build_model() (runtime Pydantic via create_model)
  ├── table.py     ← ensure_output_table / upsert_output / target resolution (dynamic DDL)
  ├── runner.py    ← the ONE LLM seam: pydantic-ai Agent + OpenRouterModel
  ├── registry.py  ← load/list definitions, fetch source entity rows
  └── seeds.py     ← locked, code-tracked definitions  ← YOU EDIT THIS for load-bearing jobs
app/temporal/struct_output/
  ├── activities.py ← resolve_targets, generate_and_upsert (run outside sandbox; do I/O)
  ├── workflow.py   ← StructOutputBatchWorkflow (parent) + StructOutputEntityWorkflow (child)
  └── schedule.py   ← per-definition Temporal Schedule + trigger_batch / trigger_entity
app/temporal/worker.py     ← registers workflows+activities; seeds + reconciles schedules on boot
app/routers/struct_output.py ← read-only admin views (list defs, view outputs)
```

Topology (Option A — parent + per-entity child):
```
StructOutputBatchWorkflow(name, overwrite)
  ├─ resolve_targets (activity)              → entity ids needing generation
  └─ StructOutputEntityWorkflow(name, id) × N  (child per entity, bounded concurrency)
       └─ generate_and_upsert (activity)      → runner.generate → OpenRouter → upsert
```
The single-entity child is a first-class unit, so a future per-entity webhook
just starts `StructOutputEntityWorkflow` directly.

---

## A definition row (`struct_output_definitions`)

| column | meaning |
|---|---|
| `name` | slug + PK; drives table name `struct_output_{name}` and workflow ids |
| `source_table`, `source_pk` | where source rows come from (e.g. `cfbd_teams`, `id`) |
| `source_label_fields` | JSON list of columns fed to the LLM as context (prompt placeholders) |
| `source_filter` | optional trusted SQL boolean (e.g. `classification = 'fbs'`); blank = all rows |
| `fields` | JSON list of output field specs (see vocab below) |
| `prompt_template` | `str.format`-style; references `{label_field}` names |
| `model` | OpenRouter model id (e.g. `openai/gpt-4o`); blank → `settings.openrouter_default_model` |
| `cron` | 5-field UTC; null = no schedule. Scheduled runs are **populate-only** |
| `enabled` / `locked` / `deleted_at` | lifecycle flags (locked = undeletable seed; deleted_at = soft delete) |

## Field-type vocabulary (`schema.py` + `table.py` — keep in sync)

| type | Python (LLM schema) | SQL column |
|---|---|---|
| `score` | `int` constrained 1–10 | `integer` |
| `tier` / `enum` | `Literal[...]` (needs `"enum": [...]` on the spec) | `text` |
| `text` / `str` | `str` | `text` |
| `int` | `int` | `integer` |
| `float` | `float` | `double precision` |
| `bool` | `bool` | `boolean` |

A field spec: `{"name": str, "type": <above>, "description": str, "enum"?: [str]}`.
**`description` is the per-field LLM instruction** — write it carefully.

---

## How to add a NEW load-bearing (locked, code-tracked) definition

1. Edit `app/services/struct_output/seeds.py`: add an entry to `_definitions()`.
   Build `fields` and `prompt_template` (helper functions like
   `_program_profile_fields()` keep large specs readable). Set `locked=True`.
2. That's it for code. On worker boot, `seed_struct_output_definitions()` upserts
   the row (idempotent; re-asserts schema/prompt/source, leaves model/cron alone)
   and `reconcile_schedules()` creates/updates its Temporal Schedule.
3. The `struct_output_{name}` data table is created **on first run** from the
   field spec (no Alembic migration — dynamic DDL in `table.py`).

> The seed file IS the "hard delete from disk" target: removing a locked
> definition = deleting its entry here. (Admin-driven soft/hard delete is a later phase.)

## How to run / refresh

```bash
make struct-output-run NAME=program_profile             # populate-only (skips existing rows)
make struct-output-run NAME=program_profile OVERWRITE=1 # regenerate everyone
```
- **Populate-only** (default + all scheduled runs): only entities without a row.
- **Overwrite**: re-generate every in-scope entity. Manual/explicit only.
- Watch executions in the Temporal UI (`localhost:8080`) — one parent + one child
  per entity.

---

## Rules & gotchas

- **The runner is the only place that calls the LLM.** Don't add OpenRouter/OpenAI
  calls elsewhere. Model choice = the definition's `model` field.
- **Workflows are deterministic** — no I/O, no wall clock. All side effects live in
  activities, imported via `workflow.unsafe.imports_passed_through()`.
- **Activities** open their own `TaskSessionLocal` (NullPool) session; everything is
  idempotent (upsert keyed on entity id) so retries/re-runs converge.
- **Register new workflows/activities** in `app/temporal/worker.py` (only needed if
  you add new workflow/activity *functions*, not new definitions).
- **OPENROUTER_API_KEY** must be set (`.env`); the runner raises without it.
- **Identifiers** (table/column/source names) are validated as lowercase-snake and
  quoted; a malformed definition fails loudly rather than emitting unsafe DDL.
- pydantic-ai pins: `pydantic-ai-slim[openrouter]==1.22.0` (needs `openai>=2.8.0`,
  `pydantic>=2.10` — compatible with the repo's 2.11). Don't bump to 2.x without
  also bumping `pydantic` to >=2.12.

## Deferred to later phases (not built yet)
- Admin UI builder for DB-only dynamic definitions (create/edit fields from the UI).
- Webhook POST endpoints to trigger batch/entity runs (seam exists:
  `schedule.trigger_batch` / `trigger_entity`).
- Soft-delete recovery + hard-delete (drop table + remove seed) from the admin UI.
```
