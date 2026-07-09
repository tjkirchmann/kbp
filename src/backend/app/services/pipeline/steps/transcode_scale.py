"""Transcode/scale step — re-encode and/or resize a video."""

from enum import StrEnum

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


class VideoCodec(StrEnum):
    libx264 = "libx264"
    libx265 = "libx265"
    copy = "copy"


class EncodePreset(StrEnum):
    ultrafast = "ultrafast"
    fast = "fast"
    medium = "medium"
    slow = "slow"
    veryslow = "veryslow"


class TranscodeScaleParams(BaseModel):
    width: int | None = Field(
        None, ge=16, description="Target width; empty = derive from height"
    )
    height: int | None = Field(
        None, ge=16, description="Target height; empty = derive from width"
    )
    video_codec: VideoCodec = Field(VideoCodec.libx264)
    crf: int = Field(23, ge=0, le=51, description="Quality (lower = better/larger)")
    preset: EncodePreset = Field(EncodePreset.medium)
    fps: float | None = Field(None, gt=0, description="Target frame rate")


class TranscodeScaleStep(BaseStep):
    name = "transcode_scale"
    label = "Transcode / Scale"
    category = "transform"
    Params = TranscodeScaleParams
    inputs: list[PortSpec] = [PortSpec("in", ArtifactKind.video)]
    outputs: list[PortSpec] = [PortSpec("out", ArtifactKind.video)]

    async def run(
        self,
        ctx: StepContext,
        params: TranscodeScaleParams,
        inputs: dict[str, ArtifactRef],
    ) -> dict[str, ArtifactRef]:
        filters = params.width or params.height or params.fps
        if params.video_codec is VideoCodec.copy and filters:
            raise StepParamError(
                "codec 'copy' cannot scale or change fps — pick a real codec"
            )

        src = await ctx.download(inputs["in"])
        out_path = ctx.scratch_dir / "transcoded.mp4"
        args = ["-i", str(src)]
        if params.width or params.height:
            # -2 keeps aspect ratio and stays divisible by 2 (encoder requirement).
            scale = f"{params.width or -2}:{params.height or -2}"
            args += ["-vf", f"scale={scale}"]
        if params.fps:
            args += ["-r", str(params.fps)]
        if params.video_codec is VideoCodec.copy:
            args += ["-c:v", "copy", "-c:a", "copy"]
        else:
            args += [
                "-c:v",
                params.video_codec.value,
                "-crf",
                str(params.crf),
                "-preset",
                params.preset.value,
                "-c:a",
                "aac",
            ]
        args.append(str(out_path))

        await ffmpeg.run_ffmpeg(
            args, ctx, total_duration=inputs["in"].meta.get("duration_seconds")
        )
        meta = await ffmpeg.probe_meta(out_path)
        ref = await ctx.publish("out", out_path, ArtifactKind.video, meta=meta)
        return {"out": ref}
