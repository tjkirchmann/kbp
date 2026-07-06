"""Clip creation: derive a processable :class:`Clip` from a source
:class:`LibraryFile`.

Video metadata is probed with ``ffprobe`` against a short-lived *internal*
presigned S3 URL — no full download; ffprobe range-reads only the container
metadata. Probing runs in a worker thread so it doesn't block the event loop.
If ffprobe fails (corrupt input, unreadable codec, network), the Clip is still
persisted with ``status='failed'`` and null metadata to record the attempt.
"""

import asyncio
import json
import subprocess

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Clip, ClipStatus, LibraryFile
from app.services import s3

# ffprobe should finish in well under a second for mp4; cap it so a stalled
# network read can't hang the request indefinitely.
_FFPROBE_TIMEOUT_S = 30


def _probe(url: str) -> dict:
    """Run ffprobe over an HTTP(S) URL and return the parsed JSON. Raises on
    non-zero exit, timeout, or unparseable output."""
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            url,
        ],
        capture_output=True,
        text=True,
        timeout=_FFPROBE_TIMEOUT_S,
        check=True,
    )
    return json.loads(result.stdout)


def _extract_metadata(probe: dict) -> dict:
    """Pull the fields we store from an ffprobe payload. Duration comes from the
    container format; dimensions/fps/codec from the first video stream."""
    video = next(
        (s for s in probe.get("streams", []) if s.get("codec_type") == "video"),
        None,
    )
    if video is None:
        raise ValueError("no video stream")

    duration = probe.get("format", {}).get("duration")
    return {
        "duration_seconds": float(duration) if duration is not None else None,
        "width": video.get("width"),
        "height": video.get("height"),
        # Raw fraction (e.g. "30000/1001") — stored lossless, parsed downstream.
        "fps": video.get("avg_frame_rate"),
        "codec": video.get("codec_name"),
    }


async def create_clip_from_library_file(db: AsyncSession, file_id: int) -> Clip:
    """Create a :class:`Clip` from an uploaded video ``LibraryFile``."""
    row = (
        await db.execute(select(LibraryFile).where(LibraryFile.id == file_id))
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="File not found")
    if row.deleted_at is not None or row.status != "uploaded":
        raise HTTPException(status_code=400, detail="File not available")
    if row.content_type is not None and not row.content_type.startswith("video/"):
        raise HTTPException(status_code=400, detail="File is not a video")

    url = s3.create_internal_presigned_get(row.s3_key)
    try:
        probe = await asyncio.to_thread(_probe, url)
        metadata = _extract_metadata(probe)
        clip = Clip(library_file_id=row.id, status=ClipStatus.ready, **metadata)
    except (subprocess.SubprocessError, ValueError, json.JSONDecodeError):
        clip = Clip(library_file_id=row.id, status=ClipStatus.failed)

    db.add(clip)
    await db.commit()
    await db.refresh(clip)
    return clip
