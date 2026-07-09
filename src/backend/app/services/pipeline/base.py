"""The pipeline step seam.

Every processing step implements one interface — ``BaseStep`` — so the Temporal
activity that executes nodes (``run_node``) is written once and resolves steps
by name, exactly like the struct_output definition registry. A step declares:

  * ``Params`` — a Pydantic model; its JSON Schema is served to the frontend
    and drives the auto-rendered config form on the node.
  * typed input/output ports (``PortSpec``) — edges connect ports, and the
    graph validator enforces kind compatibility.
  * ``run(ctx, params, inputs)`` — the work. All side effects (S3 download/
    upload, artifact rows, progress/log writes, heartbeats) go through the
    ``StepContext`` so steps stay pure-ish and uniformly observable.

Steps register themselves into ``STEPS`` at import via ``register`` (the
``steps`` package does this; imported lazily to avoid load-time cycles).
"""

from __future__ import annotations

import asyncio
import shutil
import time
from abc import ABC, abstractmethod
from collections import deque
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import StrEnum
from pathlib import Path

from pydantic import BaseModel
from sqlalchemy import update
from temporalio import activity

from app.core.database import TaskSessionLocal
from app.models.pipeline import Artifact, NodeRun
from app.services import s3


class StepParamError(Exception):
    """Bad step params — non-retryable (retrying can't fix a bad config)."""


class ArtifactKind(StrEnum):
    video = "video"
    image = "image"
    audio = "audio"
    json = "json"
    text = "text"


_KIND_CONTENT_TYPES = {
    ArtifactKind.video: "video/mp4",
    ArtifactKind.image: "image/jpeg",
    ArtifactKind.audio: "audio/mpeg",
    ArtifactKind.json: "application/json",
    ArtifactKind.text: "text/plain",
}


@dataclass(frozen=True)
class PortSpec:
    name: str
    kind: ArtifactKind


@dataclass
class ArtifactRef:
    """Data-plane handle passed between nodes. Resolved from artifact rows —
    the bytes always live in S3; nodes re-download per step (acceptable v1)."""

    s3_key: str
    kind: ArtifactKind
    artifact_id: int | None = None
    library_file_id: int | None = None
    meta: dict = field(default_factory=dict)


# Log tail: last N lines, flushed as one blob on the progress throttle.
_LOG_TAIL_LINES = 40
_FLUSH_INTERVAL_SECONDS = 1.0


class StepContext:
    """Owns every side effect a step performs, keeping steps uniform:

    * ``download(ref)`` — S3 object → scratch file (internal client).
    * ``publish(port, path, ...)`` — scratch file → S3 + an ``artifacts`` row.
    * ``log(line)`` / ``set_progress(frac)`` — buffered, flushed to the node's
      ``node_runs`` row at most ~1/s (plus a final flush by the activity).
    * ``heartbeat()`` — Temporal activity heartbeat, which is also how
      cancellation is delivered to a running step.
    """

    def __init__(self, run_id: int, node_id: str, scratch_dir: Path) -> None:
        self.run_id = run_id
        self.node_id = node_id
        self.scratch_dir = scratch_dir
        self._log: deque[str] = deque(maxlen=_LOG_TAIL_LINES)
        self._progress: float | None = None
        self._last_flush = 0.0

    # --- data plane ---------------------------------------------------------

    async def download(self, ref: ArtifactRef) -> Path:
        """Fetch an artifact's bytes into the scratch dir, return the path."""
        dest = self.scratch_dir / Path(ref.s3_key).name
        await asyncio.to_thread(s3.download_file, ref.s3_key, dest)
        self.heartbeat()
        return dest

    async def publish(
        self,
        port: str,
        path: Path,
        kind: ArtifactKind,
        name: str | None = None,
        meta: dict | None = None,
        content_type: str | None = None,
    ) -> ArtifactRef:
        """Upload a produced file to S3 and record it as an artifact row."""
        filename = name or path.name
        key = s3.build_artifact_key(self.run_id, self.node_id, filename)
        ctype = content_type or _KIND_CONTENT_TYPES[kind]
        await asyncio.to_thread(s3.upload_file, key, path, ctype)
        self.heartbeat()
        size = path.stat().st_size
        async with TaskSessionLocal() as db:
            artifact = Artifact(
                run_id=self.run_id,
                node_id=self.node_id,
                output_port=port,
                s3_key=key,
                name=filename,
                kind=kind.value,
                content_type=ctype,
                size_bytes=size,
                meta=meta or {},
            )
            db.add(artifact)
            await db.commit()
            await db.refresh(artifact)
        return ArtifactRef(
            s3_key=key, kind=kind, artifact_id=artifact.id, meta=meta or {}
        )

    async def publish_library_alias(
        self, port: str, library_file_id: int, s3_key: str, name: str, meta: dict
    ) -> ArtifactRef:
        """Record an artifact row aliasing a library object (source nodes) —
        no upload; the library owns the bytes."""
        async with TaskSessionLocal() as db:
            artifact = Artifact(
                run_id=self.run_id,
                node_id=self.node_id,
                output_port=port,
                library_file_id=library_file_id,
                s3_key=s3_key,
                name=name,
                kind=ArtifactKind.video.value,
                meta=meta,
            )
            db.add(artifact)
            await db.commit()
            await db.refresh(artifact)
        return ArtifactRef(
            s3_key=s3_key,
            kind=ArtifactKind.video,
            artifact_id=artifact.id,
            library_file_id=library_file_id,
            meta=meta,
        )

    # --- observability ------------------------------------------------------

    def heartbeat(self) -> None:
        # No-op outside an activity so steps stay unit-testable.
        try:
            activity.heartbeat()
        except RuntimeError:
            pass

    def log(self, line: str) -> None:
        self._log.append(line.rstrip("\n"))

    async def set_progress(self, frac: float | None) -> None:
        """Record progress (0..1) and flush progress+log to the node_runs row,
        throttled to one write per second."""
        self._progress = None if frac is None else max(0.0, min(1.0, frac))
        now = time.monotonic()
        if now - self._last_flush >= _FLUSH_INTERVAL_SECONDS:
            await self.flush()

    async def flush(self) -> None:
        """Write buffered progress + log tail to the node_runs row."""
        self._last_flush = time.monotonic()
        async with TaskSessionLocal() as db:
            await db.execute(
                update(NodeRun)
                .where(NodeRun.run_id == self.run_id, NodeRun.node_id == self.node_id)
                .values(
                    progress=self._progress,
                    log_tail="\n".join(self._log) or None,
                    updated_at=datetime.now(UTC).replace(tzinfo=None),
                )
            )
            await db.commit()

    def cleanup(self) -> None:
        shutil.rmtree(self.scratch_dir, ignore_errors=True)


class BaseStep(ABC):
    """Interface every pipeline step implements.

    Class attrs: ``name`` (registry key / graph node type), ``label`` +
    ``category`` (palette display), ``Params`` (Pydantic config model → JSON
    Schema → frontend form), ``inputs``/``outputs`` (typed ports).
    """

    name: str
    label: str
    category: str  # "source" | "transform" | "analyze" | "escape hatch"
    Params: type[BaseModel]
    inputs: list[PortSpec] = []
    outputs: list[PortSpec] = []

    @abstractmethod
    async def run(
        self,
        ctx: StepContext,
        params: BaseModel,
        inputs: dict[str, ArtifactRef],
    ) -> dict[str, ArtifactRef]:
        """Execute the step. ``inputs``/return are keyed by port name."""

    def palette_entry(self) -> dict:
        """The frontend contract for this step (form schema + ports)."""
        return {
            "name": self.name,
            "label": self.label,
            "category": self.category,
            "params_schema": self.Params.model_json_schema(),
            "inputs": [{"name": p.name, "kind": p.kind.value} for p in self.inputs],
            "outputs": [{"name": p.name, "kind": p.kind.value} for p in self.outputs],
        }


# --- registry ----------------------------------------------------------------

STEPS: dict[str, BaseStep] = {}
_loaded = False


def register(step: BaseStep) -> None:
    """Register a step. Idempotent by name (last write wins)."""
    STEPS[step.name] = step


def _ensure_loaded() -> None:
    """Import the steps package once so ``STEPS`` is populated (lazy to avoid
    an import cycle: steps → base → steps)."""
    global _loaded
    if _loaded:
        return
    import app.services.pipeline.steps  # noqa: F401  (side-effect import)

    _loaded = True


def get_step(name: str) -> BaseStep | None:
    _ensure_loaded()
    return STEPS.get(name)


def all_steps() -> list[BaseStep]:
    _ensure_loaded()
    return list(STEPS.values())
