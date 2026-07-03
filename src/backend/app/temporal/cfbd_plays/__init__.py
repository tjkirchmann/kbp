"""CFBD play-by-play ingestion on Temporal — run-only (no schedule).

``/plays`` and ``/plays/stats`` are the highest-volume CFBD fact endpoints, so —
like the former Procrastinate ``cfbd_plays`` task — they are NOT scheduled. The
workflow is triggered on demand (``starter.py`` → ``make temporal-cfbd-plays``),
mirroring the ``cfbd_facts`` parent/child topology: a parent fans out one child
workflow per endpoint, each child drives the per-season ``sync_plays_season``
activity. The transform/upsert logic lives in
``app.services.sync.cfbd_plays_syncers``.
"""
