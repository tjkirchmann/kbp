"""CFBD games (fact table) ingestion on Temporal.

A single-activity workflow (``CfbdGamesWorkflow``) drives ``sync_games_season``,
which fetches the current season's games from CFBD, records a content-hash
snapshot per changed game, and batch-upserts into ``cfbd_games``. A Temporal
Schedule (``schedule.py``) runs it on a frequent cron (games are a fact table —
scores change). This replaces the old Procrastinate ``cfbd_games`` task
(``app/tasks/cfbd_sync.py``); the row/hash mapping is ported verbatim.
"""
