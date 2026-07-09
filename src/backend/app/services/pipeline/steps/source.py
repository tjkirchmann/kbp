"""Source step — the entry point of every pipeline: a library file picker."""

from pydantic import BaseModel, Field
from sqlalchemy import select

from app.core.database import TaskSessionLocal
from app.models.library_file import LibraryFile
from app.services import s3
from app.services.pipeline import ffmpeg
from app.services.pipeline.base import (
    ArtifactKind,
    ArtifactRef,
    BaseStep,
    PortSpec,
    StepContext,
    StepParamError,
)


class SourceParams(BaseModel):
    # The frontend renders this field as a library file picker (keyed on name).
    library_file_id: int = Field(description="Library file to process")


class SourceStep(BaseStep):
    name = "source"
    label = "Library Source"
    category = "source"
    Params = SourceParams
    inputs: list[PortSpec] = []
    outputs: list[PortSpec] = [PortSpec("out", ArtifactKind.video)]

    async def run(
        self,
        ctx: StepContext,
        params: SourceParams,
        inputs: dict[str, ArtifactRef],
    ) -> dict[str, ArtifactRef]:
        async with TaskSessionLocal() as db:
            file = (
                await db.execute(
                    select(LibraryFile).where(LibraryFile.id == params.library_file_id)
                )
            ).scalar_one_or_none()
        if file is None or file.deleted_at is not None or file.status != "uploaded":
            raise StepParamError(
                f"library file {params.library_file_id} is not available"
            )

        # Probe over a presigned URL — ffprobe range-reads container metadata
        # without downloading the object. The duration lands in the artifact
        # meta and drives downstream progress bars.
        ctx.log(f"probing {file.original_name}")
        meta = await ffmpeg.probe_meta(s3.create_internal_presigned_get(file.s3_key))

        # Persist an aliasing artifact row (library owns the bytes) so
        # downstream input resolution is one uniform query.
        ref = await ctx.publish_library_alias(
            "out", file.id, file.s3_key, file.original_name, meta
        )
        return {"out": ref}
