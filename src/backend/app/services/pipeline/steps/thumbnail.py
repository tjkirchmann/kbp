"""Thumbnail step — grab one frame as a JPEG."""

from pydantic import BaseModel, Field

from app.services.pipeline import ffmpeg
from app.services.pipeline.base import (
    ArtifactKind,
    ArtifactRef,
    BaseStep,
    PortSpec,
    StepContext,
)


class ThumbnailParams(BaseModel):
    at_seconds: float = Field(0, ge=0, description="Timestamp to capture")
    width: int | None = Field(
        None, ge=16, description="Thumbnail width; empty = source width"
    )


class ThumbnailStep(BaseStep):
    name = "thumbnail"
    label = "Thumbnail"
    category = "transform"
    Params = ThumbnailParams
    inputs: list[PortSpec] = [PortSpec("in", ArtifactKind.video)]
    outputs: list[PortSpec] = [PortSpec("out", ArtifactKind.image)]

    async def run(  # type: ignore[override]
        self,
        ctx: StepContext,
        params: ThumbnailParams,
        inputs: dict[str, ArtifactRef],
    ) -> dict[str, ArtifactRef]:
        src = await ctx.download(inputs["in"])
        out_path = ctx.scratch_dir / "thumbnail.jpg"
        args = ["-ss", str(params.at_seconds), "-i", str(src), "-frames:v", "1"]
        if params.width:
            args += ["-vf", f"scale={params.width}:-2"]
        args.append(str(out_path))
        # Single frame — no meaningful percent; leave the bar indeterminate.
        await ffmpeg.run_ffmpeg(args, ctx)
        ref = await ctx.publish("out", out_path, ArtifactKind.image)
        return {"out": ref}
