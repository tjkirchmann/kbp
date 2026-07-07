"""CFBD fact-table ingestion on Temporal.

A parent workflow (``CfbdFactsWorkflow``) fans out one child workflow per fact
endpoint (``CfbdEndpointWorkflow``); each child drives the per-season
``sync_fact_season`` activity. A Temporal Schedule (``schedule.py``) runs the
parent daily. The
transform/upsert logic itself lives in ``app.services.sync.cfbd_facts_syncers``.
"""
