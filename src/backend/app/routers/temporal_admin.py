"""Temporal workflow status endpoints for the admin UI.

Provides live status of CFBD sync workflows — schedule info, last execution
status, and results — for the Coverage dashboard side panel.
"""

import logging
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.auth import require_admin
from app.core.temporal import get_temporal_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin/temporal", dependencies=[Depends(require_admin)])

# ── workflow registry (declarative — add new ones here) ─────────────────────

_SYNC_WORKFLOWS = [
    {
        "id": "cfbd-dims",
        "schedule_id": "cfbd-dims",
        "label": "Dimensions",
        "kind": "scheduled",
    },
    {
        "id": "cfbd-facts",
        "schedule_id": "cfbd-facts-daily",
        "label": "Facts",
        "kind": "scheduled",
    },
    {
        "id": "cfbd-games",
        "schedule_id": "cfbd-games-frequent",
        "label": "Games",
        "kind": "scheduled",
    },
    {
        "id": "cfbd-plays",
        "schedule_id": None,
        "label": "Plays",
        "kind": "manual",
    },
]

# ── response models ──────────────────────────────────────────────────────────


class TemporalWorkflowStatus(BaseModel):
    id: str
    label: str
    kind: str  # "scheduled" | "manual"
    schedule_cron: str | None = None
    workflow_status: str | None = None
    last_run_at: str | None = None
    last_run_duration_seconds: float | None = None
    next_run_at: str | None = None
    result: dict | None = None
    error: str | None = None


class CfbdTemporalStatusResponse(BaseModel):
    temporal_reachable: bool
    workflows: list[TemporalWorkflowStatus]


# ── helpers ──────────────────────────────────────────────────────────────────


def _iso(dt: datetime | None) -> str | None:
    """Format a datetime to ISO-8601 (UTC) or return None."""
    if dt is None:
        return None
    return dt.astimezone(UTC).isoformat()


def _duration_seconds(start: datetime, close: datetime | None) -> float | None:
    """Seconds between start and close (or None if still running / not closed)."""
    if close is None:
        return None
    return (close - start).total_seconds()


# ── endpoint ─────────────────────────────────────────────────────────────────


@router.get("/cfbd-sync-status", response_model=CfbdTemporalStatusResponse)
async def get_cfbd_sync_status():
    """Return Temporal schedule + last-execution status for CFBD sync workflows.

    Handles missing Temporal gracefully — returns empty status fields rather
    than a 500 when the Temporal server is unreachable.
    """
    try:
        client = await get_temporal_client()
    except Exception:
        logger.warning("Temporal unreachable; returning empty sync status.")
        return CfbdTemporalStatusResponse(
            temporal_reachable=False,
            workflows=[
                TemporalWorkflowStatus(
                    id=w["id"],
                    label=w["label"],
                    kind=w["kind"],
                )
                for w in _SYNC_WORKFLOWS
            ],
        )

    results: list[TemporalWorkflowStatus] = []

    for w in _SYNC_WORKFLOWS:
        status = TemporalWorkflowStatus(
            id=w["id"],
            label=w["label"],
            kind=w["kind"],
        )

        # ── schedule info ──────────────────────────────────────────────
        if w["schedule_id"] is not None:
            try:
                handle = client.get_schedule_handle(w["schedule_id"])
                desc = await handle.describe()
                schedule = desc.schedule
                if schedule and schedule.spec and schedule.spec.cron_expressions:
                    status.schedule_cron = schedule.spec.cron_expressions[0]

                # Next action times — get the soonest one after now
                if desc.info and desc.info.next_action_times:
                    next_actions = sorted(desc.info.next_action_times)
                    now = datetime.now(UTC)
                    for nt in next_actions:
                        if nt > now:
                            status.next_run_at = _iso(nt)
                            break
                    # If none found, use the first one anyway (all are in the future)
                    if status.next_run_at is None and next_actions:
                        status.next_run_at = _iso(next_actions[0])
            except Exception as exc:
                logger.warning(
                    "Failed to query schedule %s: %s", w["schedule_id"], exc
                )

        # ── last execution ─────────────────────────────────────────────
        try:
            # Fetch last 5 executions for this workflow type to find a
            # completed one (the most recent might still be running).
            latest = None
            async for wf in client.list_workflows(
                query=f'WorkflowId="{w["id"]}" ORDER BY StartTime DESC'
            ):
                if latest is None or (
                    wf.start_time
                    and latest.start_time
                    and wf.start_time > latest.start_time
                ):
                    latest = wf

            if latest is not None:
                status.workflow_status = (
                    latest.status.name if latest.status else None
                )
                status.last_run_at = _iso(latest.start_time)
                status.last_run_duration_seconds = _duration_seconds(
                    latest.start_time, latest.close_time
                )

                # Fetch result if completed successfully
                if (
                    status.workflow_status == "COMPLETED"
                    and latest.start_time is not None
                ):
                    try:
                        handle = client.get_workflow_handle(w["id"])
                        result = await handle.result()
                        if isinstance(result, dict):
                            status.result = result
                    except Exception as exc:
                        logger.warning(
                            "Failed to get result for %s: %s", w["id"], exc
                        )

                # Surface failure reason
                if status.workflow_status == "FAILED":
                    try:
                        handle = client.get_workflow_handle(w["id"])
                        desc = await handle.describe()
                        if hasattr(desc, "failure") and desc.failure:
                            status.error = desc.failure.message or "Unknown error"
                    except Exception:
                        status.error = "Unable to retrieve error details"

        except Exception as exc:
            logger.warning("Failed to query workflow %s: %s", w["id"], exc)

        results.append(status)

    return CfbdTemporalStatusResponse(
        temporal_reachable=True, workflows=results
    )
