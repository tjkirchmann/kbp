"""Temporal layer for structured-output jobs.

Topology (Option A — parent + per-entity child):

    StructOutputBatchWorkflow(name, overwrite)      ← triggered / scheduled
      ├─ resolve_targets (activity)                  entity ids needing generation
      └─ StructOutputEntityWorkflow(name, id) × N    child per entity, bounded
           └─ generate_and_upsert (activity)         pydantic-ai → OpenRouter → upsert

The single-entity child is a first-class unit, so the future per-entity webhook
just starts ``StructOutputEntityWorkflow`` directly.
"""
