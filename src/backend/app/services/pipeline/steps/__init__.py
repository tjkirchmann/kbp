"""Step registration — importing this package populates the ``STEPS`` registry
(``base._ensure_loaded`` does it lazily; nothing else should import steps
directly)."""

from app.services.pipeline.base import register
from app.services.pipeline.steps.extract_audio import ExtractAudioStep
from app.services.pipeline.steps.probe import ProbeStep
from app.services.pipeline.steps.raw_ffmpeg import RawFfmpegStep
from app.services.pipeline.steps.source import SourceStep
from app.services.pipeline.steps.thumbnail import ThumbnailStep
from app.services.pipeline.steps.transcode_scale import TranscodeScaleStep
from app.services.pipeline.steps.trim import TrimStep

register(SourceStep())
register(ProbeStep())
register(TrimStep())
register(TranscodeScaleStep())
register(ThumbnailStep())
register(ExtractAudioStep())
register(RawFfmpegStep())
