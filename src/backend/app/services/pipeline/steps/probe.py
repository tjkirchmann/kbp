"""Probe step — full ffprobe report as a JSON artifact (no download)."""

import json

from pydantic import BaseModel

from app.services import s3
from app.services.pipeline import ffmpeg
from app.services.pipeline.base import (
    ArtifactKind,
    ArtifactRef,
    BaseStep,
    PortSpec,
    StepContext,
)


class ProbeParams(BaseModel):
    pass


class ProbeStep(BaseStep):
    name = "probe"
    label = "Probe Metadata"
    category = "analyze"
    Params = ProbeParams
    inputs: list[PortSpec] = [PortSpec("in", ArtifactKind.video)]
    outputs: list[PortSpec] = [PortSpec("out", ArtifactKind.json)]

    async def run(  # type: ignore[override]
        self,
        ctx: StepContext,
        params: ProbeParams,
        inputs: dict[str, ArtifactRef],
    ) -> dict[str, ArtifactRef]:
        source = inputs["in"]
        ctx.log(f"ffprobe {source.s3_key}")
        report = await ffmpeg.probe(s3.create_internal_presigned_get(source.s3_key))
        out_path = ctx.scratch_dir / "probe.json"
        out_path.write_text(json.dumps(report, indent=2))
        ref = await ctx.publish(
            "out", out_path, ArtifactKind.json, meta=ffmpeg.extract_meta(report)
        )
        return {"out": ref}
