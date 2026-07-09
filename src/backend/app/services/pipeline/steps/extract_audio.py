"""Extract-audio step — pull the audio track out of a video."""

from enum import StrEnum

from pydantic import BaseModel, Field

from app.services.pipeline import ffmpeg
from app.services.pipeline.base import (
    ArtifactKind,
    ArtifactRef,
    BaseStep,
    PortSpec,
    StepContext,
)


class AudioFormat(StrEnum):
    mp3 = "mp3"
    aac = "aac"
    wav = "wav"


# format → (codec args, file extension, content type)
_FORMATS = {
    AudioFormat.mp3: (["-c:a", "libmp3lame"], ".mp3", "audio/mpeg"),
    AudioFormat.aac: (["-c:a", "aac"], ".m4a", "audio/mp4"),
    AudioFormat.wav: (["-c:a", "pcm_s16le"], ".wav", "audio/wav"),
}


class ExtractAudioParams(BaseModel):
    format: AudioFormat = Field(AudioFormat.mp3)
    bitrate_kbps: int = Field(192, ge=32, le=512, description="Ignored for wav")


class ExtractAudioStep(BaseStep):
    name = "extract_audio"
    label = "Extract Audio"
    category = "transform"
    Params = ExtractAudioParams
    inputs: list[PortSpec] = [PortSpec("in", ArtifactKind.video)]
    outputs: list[PortSpec] = [PortSpec("out", ArtifactKind.audio)]

    async def run(
        self,
        ctx: StepContext,
        params: ExtractAudioParams,
        inputs: dict[str, ArtifactRef],
    ) -> dict[str, ArtifactRef]:
        codec_args, ext, content_type = _FORMATS[params.format]
        src = await ctx.download(inputs["in"])
        out_path = ctx.scratch_dir / f"audio{ext}"
        args = ["-i", str(src), "-vn", *codec_args]
        if params.format is not AudioFormat.wav:
            args += ["-b:a", f"{params.bitrate_kbps}k"]
        args.append(str(out_path))
        await ffmpeg.run_ffmpeg(
            args, ctx, total_duration=inputs["in"].meta.get("duration_seconds")
        )
        meta = await ffmpeg.probe_meta(out_path)
        ref = await ctx.publish(
            "out", out_path, ArtifactKind.audio, meta=meta, content_type=content_type
        )
        return {"out": ref}
