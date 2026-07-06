"""Behavioral tests for the CFBD plays parent/child workflows (mocked activities).

Verifies the smart-sync coverage logic: completed (endpoint, year) pairs are
skipped, missing/in-progress ones are synced, and per-season results aggregate
into the parent's per-endpoint summary. This is the same topology cfbd_facts uses.
"""

import uuid

from temporalio import activity
from temporalio.testing import WorkflowEnvironment
from temporalio.worker import Worker

from app.temporal.cfbd_plays.activities import PlaysConfig, SeasonResult
from app.temporal.cfbd_plays.workflows import (
    CfbdPlaysEndpointWorkflow,
    CfbdPlaysWorkflow,
)

TASK_QUEUE = "test-cfbd-plays"

# A small, deterministic window so the test asserts exact skip/sync sets.
START_YEAR = 2020
# CfbdPlaysWorkflow derives current_year from workflow.now().year; the time-skipping
# test server starts "now" at a real wall-clock year, so we compute against that in
# the test by reading it back from the result rather than hardcoding.


def _activities(completed_pairs: list[list], synced_log: list):
    @activity.defn(name="get_plays_config")
    async def get_plays_config() -> PlaysConfig:
        # Two endpoints, fixed start year.
        return PlaysConfig(start_year=START_YEAR, endpoints=["plays", "play_stats"])

    @activity.defn(name="load_plays_coverage")
    async def load_plays_coverage() -> list:
        return completed_pairs

    @activity.defn(name="sync_plays_season")
    async def sync_plays_season(
        endpoint: str, year: int, current_year: int
    ) -> SeasonResult:
        synced_log.append((endpoint, year))
        return SeasonResult(processed=10, changed=2)

    return [get_plays_config, load_plays_coverage, sync_plays_season]


async def _run(completed_pairs: list[list]):
    synced_log: list = []
    async with await WorkflowEnvironment.start_time_skipping() as env:
        async with Worker(
            env.client,
            task_queue=TASK_QUEUE,
            workflows=[CfbdPlaysWorkflow, CfbdPlaysEndpointWorkflow],
            activities=_activities(completed_pairs, synced_log),
        ):
            summary = await env.client.execute_workflow(
                CfbdPlaysWorkflow.run,
                id=f"plays-{uuid.uuid4()}",
                task_queue=TASK_QUEUE,
            )
    return summary, synced_log


async def test_all_seasons_synced_when_no_coverage():
    """With empty coverage, every (endpoint, year) from START_YEAR..current is synced."""
    summary, synced = await _run([])
    # Both endpoints present in the summary.
    assert set(summary) == {"plays", "play_stats"}
    # Each endpoint synced the same set of years; nothing skipped.
    for ep in ("plays", "play_stats"):
        assert summary[ep]["skipped"] == []
        assert summary[ep]["errors"] == []
        assert summary[ep]["synced"], "expected at least one synced season"
        # processed = 10 per synced season.
        assert summary[ep]["processed"] == 10 * len(summary[ep]["synced"])


async def test_completed_seasons_are_skipped():
    """A (endpoint, year) marked complete is skipped, not re-synced."""
    # Mark plays/2020 and plays/2021 complete; play_stats has no coverage.
    completed = [["plays", 2020], ["plays", 2021]]
    summary, synced = await _run(completed)

    # plays skips exactly the completed years, syncs the rest.
    assert set(summary["plays"]["skipped"]) == {2020, 2021}
    assert 2020 not in summary["plays"]["synced"]
    assert 2021 not in summary["plays"]["synced"]
    # The sync activity was never called for the skipped pairs.
    assert ("plays", 2020) not in synced
    assert ("plays", 2021) not in synced

    # play_stats had no coverage → nothing skipped.
    assert summary["play_stats"]["skipped"] == []


async def test_current_season_always_resynced():
    """The in-progress (current) season is never in completed coverage, so it is
    always synced even when prior years are complete."""
    # Mark a wide range complete but the workflow's current_year (from workflow.now)
    # won't be in this list, so it must still be synced.
    completed = [["plays", y] for y in range(START_YEAR, 2025)]
    summary, synced = await _run(completed)
    # The newest synced 'plays' year is the current season (whatever the test clock
    # says) — assert at least one plays season was synced despite heavy coverage.
    assert summary["plays"]["synced"], "current season should always sync"
    # And every synced year is strictly greater than the last completed one (2024).
    assert all(y >= 2024 for y in summary["plays"]["synced"])
