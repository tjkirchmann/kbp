"""Raw ffmpeg step — the escape hatch: arbitrary ffmpeg args.

``{input}``/``{output}`` tokens are substituted with scratch paths. No
sandboxing — the pool has one trusted admin and the worker container is
disposable. Progress is indeterminate (we can't know the output duration)."""

import shlex

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


class RawFfmpegParams(BaseModel):
    args: str = Field(
        description=(
            "ffmpeg arguments; use {input} and {output} as file placeholders, "
            "e.g. `-i {input} -vf hflip {output}`"
        ),
    )
    output_filename: str = Field(
        "out.mp4", description="Output name; the extension picks the container"
    )
    output_kind: ArtifactKind = Field(ArtifactKind.video)


class RawFfmpegStep(BaseStep):
    name = "raw_ffmpeg"
    label = "Raw ffmpeg"
    category = "escape hatch"
    Params = RawFfmpegParams
    inputs: list[PortSpec] = [PortSpec("in", ArtifactKind.video)]
    outputs: list[PortSpec] = [PortSpec("out", ArtifactKind.video)]

    async def run(  # type: ignore[override]
        self,
        ctx: StepContext,
        params: RawFfmpegParams,
        inputs: dict[str, ArtifactRef],
    ) -> dict[str, ArtifactRef]:
        if "{output}" not in params.args:
            raise StepParamError("args must reference {output}")
        src = await ctx.download(inputs["in"])
        out_path = ctx.scratch_dir / params.output_filename
        args = [
            token.replace("{input}", str(src)).replace("{output}", str(out_path))
            for token in shlex.split(params.args)
        ]
        await ffmpeg.run_ffmpeg(args, ctx)
        if not out_path.exists():
            raise StepParamError(
                f"ffmpeg did not produce {params.output_filename!r} — check args"
            )
        meta = {}
        if params.output_kind in (ArtifactKind.video, ArtifactKind.audio):
            meta = await ffmpeg.probe_meta(out_path)
        ref = await ctx.publish("out", out_path, params.output_kind, meta=meta)
        return {"out": ref}
