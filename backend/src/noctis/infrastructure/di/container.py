"""Dependency injection composition root."""

from noctis.infrastructure.audio.ffmpeg_audio_extractor import FFmpegAudioExtractor
from noctis.infrastructure.events.log_progress_emitter import LogProgressEmitter
from noctis.infrastructure.repository.in_memory_project_repo import InMemoryProjectRepository
from noctis.infrastructure.vad.amplitude_vad_detector import AmplitudeVADDetector
from noctis.infrastructure.video.ffmpeg_video_editor import FFmpegVideoEditor

from noctis.application.use_cases.apply_trim import ApplyTrimUseCase
from noctis.application.use_cases.detect_silence import DetectSilenceUseCase
from noctis.application.use_cases.toggle_segment import ToggleSegmentUseCase


class Container:
    """Wires concrete implementations to port interfaces. Single composition root."""

    def __init__(self) -> None:
        self.repo = InMemoryProjectRepository()
        self.emitter = LogProgressEmitter()
        self.audio_extractor = FFmpegAudioExtractor()
        self.vad_detector = AmplitudeVADDetector()
        self.video_editor = FFmpegVideoEditor()

        self.detect_silence = DetectSilenceUseCase(
            vad=self.vad_detector, repo=self.repo, emitter=self.emitter
        )
        self.apply_trim = ApplyTrimUseCase(
            editor=self.video_editor, repo=self.repo, emitter=self.emitter
        )
        self.toggle_segment = ToggleSegmentUseCase(repo=self.repo)


# Singleton container instance
container = Container()
