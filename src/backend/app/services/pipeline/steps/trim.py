"""Trim step — cut a time range out of a video."""

from pydantic import BaseModel, Field

from app.services.pipeline import ffmpeg
from app.services.pipeline.base import (
    ArtifactKind,
    ArtifactRef,
    BaseStep,
    PortSpec,
    StepContext,
    StepParamError,
)


class TrimParams(BaseModel):
    start_seconds: float = Field(0, ge=0, description="Trim start (seconds)")
    end_seconds: float | None = Field(
        None, ge=0, description="Trim end (seconds); empty = end of video"
    )
    reencode: bool = Field(
        False,
        description=(
            "Re-encode instead of stream copy. Stream copy is instant but cut "
            "points snap to keyframes; re-encoding is frame-accurate but slow."
        ),
    )


class TrimStep(BaseStep):
    name = "trim"
    label = "Trim"
    category = "transform"
    Params = TrimParams
    inputs: list[PortSpec] = [PortSpec("in", ArtifactKind.video)]
    outputs: list[PortSpec] = [PortSpec("out", ArtifactKind.video)]

    async def run(
        self,
        ctx: StepContext,
        params: TrimParams,
        inputs: dict[str, ArtifactRef],
    ) -> dict[str, ArtifactRef]:
        if (
            params.end_seconds is not None
            and params.end_seconds <= params.start_seconds
        ):
            raise StepParamError("end_seconds must be greater than start_seconds")
        src = await ctx.download(inputs["in"])
        out_path = ctx.scratch_dir / f"trimmed{src.suffix or '.mp4'}"

        args = ["-ss", str(params.start_seconds), "-i", str(src)]
        if params.end_seconds is not None:
            args += ["-t", str(params.end_seconds - params.start_seconds)]
        args += (
            ["-c:v", "libx264", "-c:a", "aac"] if params.reencode else ["-c", "copy"]
        )
        args.append(str(out_path))

        input_duration = inputs["in"].meta.get("duration_seconds")
        end = params.end_seconds or input_duration
        total = (end - params.start_seconds) if end else None
        await ffmpeg.run_ffmpeg(args, ctx, total_duration=total)

        meta = await ffmpeg.probe_meta(out_path)
        ref = await ctx.publish("out", out_path, ArtifactKind.video, meta=meta)
        return {"out": ref}
