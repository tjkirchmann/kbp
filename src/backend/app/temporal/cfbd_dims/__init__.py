"""CFBD dimension ingestion as a durable Temporal workflow.

Replaces the former Procrastinate task ``cfbd_dims`` (deleted). The workflow
(:mod:`app.temporal.cfbd_dims.workflow`) fans out one activity per dimension
entity — each fetches its CFBD endpoint, records content-hash snapshots, and
batch-upserts its table inside its own DB transaction
(:mod:`app.temporal.cfbd_dims.activities`). A nightly Temporal Schedule
(:mod:`app.temporal.cfbd_dims.schedule`) drives it.

Why activities own the full fetch→snapshot→upsert: keeping the fetched CFBD
lists inside each activity means they never transit the workflow's event
history, sidestepping Temporal's per-payload size limits. Each activity returns
only a small ``{processed, changed}`` summary.
"""
