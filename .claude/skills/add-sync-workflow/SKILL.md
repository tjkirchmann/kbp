# Skill: Add a Sync Workflow (Procrastinate)

You are adding a background **workflow** (a Procrastinate task) to KBP. Workflows run on a
worker, optionally on a cron schedule, and show up automatically in the admin **Sync** panel
with run history and a "Run now" button.

The admin panel is **registry-driven**: it lists whatever tasks are registered on the
Procrastinate app. You do **not** edit the backend endpoint or any frontend file to make a new
workflow appear. There are exactly two required steps.

## Architecture (how it's wired)
```
app/core/procrastinate.py   ← the App singleton + import_paths (the registry source)
app/tasks/<name>.py         ← @app.task / @app.periodic definitions  ← YOU WRITE THIS
app/routers/admin.py        ← GET /admin/sync/status  (lists ALL registered tasks)
                              POST /admin/sync/run/{task_name}  (defers ANY task by name)
src/frontend/.../SyncPanel.tsx + SyncJobCard.tsx  ← render one card per task, generic
```
- `/admin/sync/status` reads `procrastinate_app.tasks` (all tasks) + `periodic_registry`
  (crons) + the `procrastinate_jobs`/`procrastinate_events` tables (run history). Adding a task
  to the registry is all it takes to get a card.
- `POST /admin/sync/run/{task_name}` defers any registered task — the "Run now" button uses it.

## Step 1 — Write the task

Create `src/backend/app/tasks/<name>.py`. Import the shared app as `app` and decorate.

```python
import logging
from typing import Any

from app.core.database import TaskSessionLocal as SessionLocal
from app.core.procrastinate import procrastinate_app as app

logger = logging.getLogger(__name__)


@app.periodic(cron="*/15 * * * *")   # OMIT this line for a run-only (manual) task
@app.task(name="my_workflow", queueing_lock="my_workflow", retry=3)
async def my_workflow(timestamp: int | None = None) -> dict[str, Any]:
    """One-line summary — shown as the card subtitle for run-only tasks."""
    async with SessionLocal() as db:
        ...                          # do work; commit explicitly
        await db.commit()
    logger.info("my_workflow: done")
    return {"processed": 0}
```

Rules — match the existing tasks in `app/tasks/cfbd_sync.py`:
- **`name=`** is the stable identifier (snake_case). It's the card title (prettified) and the
  `{task_name}` in the run endpoint. The frontend prettifies `cfbd`/`espn` to uppercase.
- **`queueing_lock=`** (usually same as `name`) prevents a second copy queuing while one is
  pending — this is the "don't stack runs" guarantee. Always set it.
- **`retry=N`** for transient failures (CFBD/ESPN HTTP). Replaces hand-rolled backoff.
- **`@app.periodic(cron=...)`** ABOVE `@app.task` (task is innermost). 5-field cron. Omit it
  entirely for a run-only task — it still gets a card and a "Run now" button, just no schedule.
- A periodic task **must** accept `timestamp: int | None = None` (Procrastinate passes it).
- Use `TaskSessionLocal` (NullPool) for DB work inside tasks, not the request `SessionLocal`.
- The first line of the docstring becomes the card description for run-only tasks — write one.
- Tasks must be **idempotent** (upsert, not blind insert): periodic + manual + retry all re-run.

## Step 2 — Register the module

Add the module path to `import_paths` in `src/backend/app/core/procrastinate.py`:

```python
procrastinate_app = App(
    connector=PsycopgConnector(conninfo=_conninfo),
    import_paths=["app.tasks.cfbd_sync", "app.tasks.espn_poller", "app.tasks.my_workflow"],
)
```
This is the security-required allowlist — Procrastinate only loads tasks from these modules.
The worker and the API both read it; that's what makes the card and Run-now appear.

**That's it.** No edits to `admin.py`, `useAdminSync.ts`, `SyncPanel.tsx`, or `SyncJobCard.tsx`.

## If the task needs new dependencies
Backend uses **uv** (not pip). From `src/backend/`: `uv add <package>`. Don't hand-edit
`requirements.txt`.

## If the task needs the worker restarted
The registry is read at process start. After editing `import_paths` or adding a task module:
- **Local (docker compose):** `docker compose restart backend procrastinate_worker`
  (the worker runs the cron + executes jobs; the backend process defers them).
- The worker logs `Registering task <name> ... with cron ...` on boot — confirm yours appears.

## Verify
1. Restart worker + backend (above).
2. Worker log shows `Registering task my_workflow` (if periodic) and
   `Launching a worker on all queues`.
3. Defer once to seed history:
   `docker compose exec procrastinate_worker procrastinate --app=app.core.procrastinate.procrastinate_app defer my_workflow`
4. Open `/admin/sync` → a new card for "My Workflow" with a green capsule after it runs;
   hover shows time/status/duration; "Run now" queues another (within ~5s a new capsule fills).
5. Periodic tasks also show "Next run in …" computed from the cron.

## Out of scope / gotchas
- Don't persist run results yourself — Procrastinate's `procrastinate_jobs` +
  `procrastinate_events` tables already power the history strip.
- `schema --apply` is **not** idempotent; it's gated in `start.sh`/compose, nothing to do.
- Cron is 5-field UTC-evaluated; an invalid cron makes `next_run_at` null (card still renders).
