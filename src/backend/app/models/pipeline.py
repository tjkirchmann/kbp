from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Pipeline(Base):
    """A saved video-processing graph (the breadboard).

    The graph is stored whole as JSONB — the editor loads/saves it as a unit and
    nothing queries individual nodes across pipelines. Shape:
    ``{nodes: [{id, type, position, params}], edges: [{id, source, source_port,
    target, target_port}], viewport: {x, y, zoom}}``. Runs snapshot the graph,
    so editing a pipeline never affects an in-flight or historical run.
    """

    __tablename__ = "pipelines"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    graph: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now()
    )
    deleted_at: Mapped[datetime | None] = mapped_column(nullable=True)


class PipelineRun(Base):
    """One execution of a pipeline = one Temporal workflow.

    ``graph`` is a frozen snapshot taken at run start; live per-node state lives
    in ``node_runs`` rows written by activities (DB-backed so the observability
    surface survives the move to Temporal Cloud unchanged).
    """

    __tablename__ = "pipeline_runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    pipeline_id: Mapped[int] = mapped_column(
        ForeignKey("pipelines.id"), nullable=False, index=True
    )
    # Every run executes in a project context; artifacts inherit it via run_id.
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id"), nullable=False, index=True
    )
    workflow_id: Mapped[str] = mapped_column(String, nullable=False)
    # queued | running | succeeded | failed | canceled
    status: Mapped[str] = mapped_column(String, nullable=False, server_default="queued")
    graph: Mapped[dict] = mapped_column(JSONB, nullable=False)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    started_at: Mapped[datetime | None] = mapped_column(nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(nullable=True)


class NodeRun(Base):
    """Live execution state of one node within a run.

    ``node_id`` is the client-generated string id from the graph snapshot (not
    an FK — integrity is by snapshot). ``log_tail`` holds the last ~40 lines,
    rewritten whole on a ~1/s throttle, never per-line.
    """

    __tablename__ = "node_runs"
    __table_args__ = (UniqueConstraint("run_id", "node_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    run_id: Mapped[int] = mapped_column(
        ForeignKey("pipeline_runs.id"), nullable=False, index=True
    )
    node_id: Mapped[str] = mapped_column(String, nullable=False)
    step_type: Mapped[str] = mapped_column(String, nullable=False)
    # queued | running | succeeded | failed | canceled | skipped
    status: Mapped[str] = mapped_column(String, nullable=False, server_default="queued")
    # 0..1; NULL = indeterminate (step can't estimate, e.g. raw_ffmpeg).
    progress: Mapped[float | None] = mapped_column(Float, nullable=True)
    log_tail: Mapped[str | None] = mapped_column(Text, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    attempt: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
    started_at: Mapped[datetime | None] = mapped_column(nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now()
    )


class Artifact(Base):
    """An output produced at a node's port during a run.

    Bytes live in S3 under ``artifacts/{run_id}/{node_id}/{uuid}/{filename}``,
    except when ``library_file_id`` is set — then ``s3_key`` aliases the library
    object's key (source nodes do this) and the S3 bytes are owned by the
    library: never delete them through the artifact.
    """

    __tablename__ = "artifacts"

    id: Mapped[int] = mapped_column(primary_key=True)
    run_id: Mapped[int] = mapped_column(
        ForeignKey("pipeline_runs.id"), nullable=False, index=True
    )
    node_id: Mapped[str] = mapped_column(String, nullable=False)
    output_port: Mapped[str] = mapped_column(String, nullable=False)
    library_file_id: Mapped[int | None] = mapped_column(
        ForeignKey("library_files.id"), nullable=True
    )
    # Not unique: source nodes alias the same library key across runs;
    # produced keys are collision-free via their uuid segment.
    s3_key: Mapped[str] = mapped_column(String, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    # video | image | audio | json | text
    kind: Mapped[str] = mapped_column(String, nullable=False)
    content_type: Mapped[str | None] = mapped_column(String, nullable=True)
    size_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    meta: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    deleted_at: Mapped[datetime | None] = mapped_column(nullable=True)
