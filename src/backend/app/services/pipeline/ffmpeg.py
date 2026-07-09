"""ffmpeg/ffprobe execution for pipeline steps.

``run_ffmpeg`` is the one way steps invoke ffmpeg: it streams ``-progress``
key=value output into ``ctx.set_progress`` (percent needs the input duration —
callers pass it from the source probe meta; without it the node shows an
indeterminate bar), tails stderr into ``ctx.log``, heartbeats on every line so
Temporal can deliver cancellation, and kills the process when cancelled.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

from app.services.pipeline.base import StepContext


class FfmpegError(Exception):
    """ffmpeg/ffprobe exited non-zero. Message carries the stderr tail."""


async def run_ffmpeg(
    args: list[str],
    ctx: StepContext,
    total_duration: float | None = None,
) -> None:
    """Run ``ffmpeg <args>`` with live progress/log wired into the context."""
    cmd = ["ffmpeg", "-hide_banner", "-nostats", "-progress", "pipe:1", "-y", *args]
    ctx.log("$ " + " ".join(cmd))
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    async def read_progress() -> None:
        # -progress emits key=value lines; out_time_us tracks the output clock.
        assert proc.stdout is not None
        while line := await proc.stdout.readline():
            ctx.heartbeat()
            text = line.decode(errors="replace").strip()
            if text.startswith("out_time_us=") and total_duration:
                try:
                    seconds = int(text.split("=", 1)[1]) / 1_000_000
                except ValueError:
                    continue
                await ctx.set_progress(seconds / total_duration)

    async def read_stderr() -> None:
        assert proc.stderr is not None
        while line := await proc.stderr.readline():
            ctx.heartbeat()
            text = line.decode(errors="replace").rstrip()
            if text:
                ctx.log(text)

    try:
        await asyncio.gather(read_progress(), read_stderr())
        code = await proc.wait()
    except asyncio.CancelledError:
        proc.kill()
        await proc.wait()
        raise
    if code != 0:
        raise FfmpegError(f"ffmpeg exited {code}")
    await ctx.set_progress(1.0)


async def probe(target: str | Path, timeout: float = 30.0) -> dict:
    """``ffprobe`` a path or URL → parsed ``-show_format -show_streams`` JSON.

    Works against presigned S3 URLs (ffprobe range-reads container metadata
    without downloading the object).
    """
    proc = await asyncio.create_subprocess_exec(
        "ffprobe",
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        str(target),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout)
    except TimeoutError:
        proc.kill()
        await proc.wait()
        raise FfmpegError(f"ffprobe timed out after {timeout}s") from None
    if proc.returncode != 0:
        tail = stderr.decode(errors="replace").strip()[-500:]
        raise FfmpegError(f"ffprobe exited {proc.returncode}: {tail}")
    return dict(json.loads(stdout))


async def probe_meta(target: str | Path) -> dict:
    """Probe + flatten in one call (what steps attach to published artifacts)."""
    return extract_meta(await probe(target))


def extract_meta(probe_json: dict) -> dict:
    """Flatten a probe result into the small meta dict artifacts carry
    (duration drives downstream progress bars)."""
    fmt = probe_json.get("format") or {}
    video: dict = next(
        (s for s in probe_json.get("streams") or [] if s.get("codec_type") == "video"),
        {},
    )
    duration = fmt.get("duration")
    return {
        "duration_seconds": float(duration) if duration else None,
        "width": video.get("width"),
        "height": video.get("height"),
        "fps": video.get("avg_frame_rate"),
        "codec": video.get("codec_name"),
    }
