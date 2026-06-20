"""Temporal workflows.

Workflow code runs in Temporal's deterministic sandbox, so activity modules are
imported through `workflow.unsafe.imports_passed_through()` (the standard pattern)
to avoid the sandbox re-importing/instrumenting them. Use this file as the template
for new workflows: keep logic deterministic and push all I/O into activities.
"""
from datetime import timedelta

from temporalio import workflow

with workflow.unsafe.imports_passed_through():
    from app.temporal.activities import compose_greeting


@workflow.defn
class GreetingWorkflow:
    @workflow.run
    async def run(self, name: str) -> str:
        return await workflow.execute_activity(
            compose_greeting,
            name,
            start_to_close_timeout=timedelta(seconds=10),
        )
