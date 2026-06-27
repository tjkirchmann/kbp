"""ESPN live-game polling on Temporal — per-game entity workflows.

Replaces the former Procrastinate ``espn_poll`` cron loop (``app/tasks/espn_poller.py``)
with one long-running workflow per live game:

    EspnSeederWorkflow                ← driven by a coarse Schedule (every ~1 min)
      ├─ seed_missing_games           (activity)  insert stub espn_games rows
      ├─ find_live_game_ids           (activity)  games that should be polling now
      └─ EspnGameWorkflow × N          (abandoned child, fixed id "espn:{id}")
           └─ poll_espn_game           (activity, on the rate-limited espn queue)

Each ``EspnGameWorkflow`` owns one game: it polls on an interval, fires
start/halftime/final notifications on state transitions, and exits when the game
reaches ``post`` (or a stale pre-game times out). The fixed id dedups — the seeder
re-runs every tick but an already-running game workflow is reused, not duplicated.

Rate limiting is handled by Temporal, not application code: ``poll_espn_game``
runs on a dedicated ``espn`` task queue whose ``max_task_queue_activities_per_second``
caps ESPN requests globally across all game workflows (see app/temporal/worker.py
and the former app/core/rate_limiter.py, now retired).
"""
