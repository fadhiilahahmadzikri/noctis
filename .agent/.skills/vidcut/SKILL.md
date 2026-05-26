---
name: vidcut
description: >
  Research, architect, and blueprint a Python CLI tool that removes filler words (umm, hmm, uh,
  eh, mhm) and silence from self-recording videos or podcasts. Use this skill when the user wants
  to build a video/audio jump-cut tool, automate podcast cleanup, cut dead air from recordings,
  or design a Python pipeline with VAD + ASR + FFmpeg. Trigger for: silence removal, filler word
  removal, auto-editor, jump cut, podcast editor, dead air removal, disfluency detection,
  CrisperWhisper, silero-vad, or any Python + video + audio + automation request. Also use when
  the user asks about Hexagonal / Clean Architecture applied to ML audio pipelines in Python.
---

# VidCut — Video Filler & Silence Remover

A skill for building a clean, modular Python CLI tool that removes filler words and silence
from video recordings using a two-pass audio pipeline.

---

## Context & Problem Domain

Two categories of "noise" exist in self-recording video:

| Category | Examples | Technical nature |
|---|---|---|
| **True silence** | Dead air, thinking pauses | No audio signal → detected by VAD |
| **Filler sounds** | "hmm", "umm", "uh", "eh", "mhm" | Has audio signal, not meaningful speech → detected by ASR |

These require **two different algorithms** — that's the key architectural insight.

---

## Chosen Technology Stack

### Why these specific tools (do not deviate without good reason)

**VAD (silence detection): `silero-vad`**
- CPU-first, ONNX-based, 3x faster than pyannote on CPU
- Ideal for single-speaker self-recording environments
- pyannote provided as optional GPU adapter only

**Filler detection: `CrisperWhisper` (`nyrahealth/CrisperWhisper`)**
- Fine-tuned Whisper variant that does *verbatim* transcription
- Standard Whisper **explicitly strips** hmm/uh/um from output — do NOT use it
- CrisperWhisper achieves F1=0.975 on filled pause detection
- Provides word-level timestamps via Dynamic Time Warping (DTW)

**Video/audio editing: `ffmpeg-python`**
- Use `-c copy` for zero re-encoding (preserves quality, fastest)
- pydub for audio preprocessing only (format conversion, normalization)

**Full stack:**
```
torch, transformers (CrisperWhisper), silero-vad,
ffmpeg-python, pydub, numpy,
pydantic v2, pydantic-settings,
typer, rich, loguru,
pytest
```
Package manager: `uv`

---

## Architecture Pattern: Hexagonal (Ports & Adapters)

This is not negotiable — the pattern exists because:
1. We have two interchangeable VAD backends (silero vs pyannote)
2. The ASR model may be swapped without touching business logic
3. Domain rules (what counts as a filler, how long silence must be) must be testable without any ML model loaded

```
Presentation (CLI / Typer)
        ↓
Application Layer (Use Cases — orchestration only)
        ↓
Domain Layer (Entities, Value Objects, Port interfaces)
        ↑
Infrastructure (Adapters implementing the ports)
    ├── SileroVADDetector
    ├── PyannoteVADDetector  (optional)
    ├── CrisperWhisperTranscriber
    └── FFmpegVideoEditor
```

**Dependency rule:** Domain imports nothing external. Application imports only domain. Infrastructure implements domain ports.

---

## Two-Pass Processing Strategy

This is the efficiency key — do NOT run ASR on the full audio:

```
Pass 1: silero-vad (lightweight)
  → identifies speech segments as List[SpeechSegment(start, end)]
  → cost: ~0.1x realtime on CPU

Pass 2: CrisperWhisper (heavy, but only on speech portion)
  → transcribes only the speech segments from Pass 1
  → output: List[WordToken(word, start, end, is_filler)]
  → cost: ~0.5x realtime on GPU, only for speech frames

Merge:
  FillerFilterService + SilenceFilterService
  → produces EditDecisionList (KEEP ranges)
  → ffmpeg concat keeps segments, discards the rest
```

By running ASR only on speech segments, we reduce the audio fed to CrisperWhisper by 40–60%.

---

## Directory Structure

```
vidcut/
├── pyproject.toml
├── .env.example
├── vidcut/
│   ├── domain/
│   │   ├── entities/
│   │   │   ├── audio_segment.py      # AudioSegment(start, end, type)
│   │   │   ├── word_token.py         # WordToken(word, time_range, confidence, is_filler)
│   │   │   ├── speech_segment.py     # SpeechSegment(start, end)
│   │   │   └── edit_decision.py      # EditDecisionList(keep_ranges, source_duration)
│   │   ├── value_objects/
│   │   │   ├── time_range.py         # TimeRange(start, end) — frozen dataclass
│   │   │   ├── filler_word_set.py    # FillerWordSet(words: frozenset) — SSOT for fillers
│   │   │   └── processing_config.py  # ProcessingConfig (pydantic) — SSOT for config
│   │   └── ports/                    # Abstract interfaces only
│   │       ├── audio_extractor.py    # IAudioExtractor
│   │       ├── vad_detector.py       # IVADDetector
│   │       ├── asr_transcriber.py    # IASRTranscriber
│   │       └── video_editor.py       # IVideoEditor
│   ├── application/
│   │   ├── use_cases/
│   │   │   ├── process_video.py      # ProcessVideoUseCase — main orchestrator
│   │   │   └── preview_edl.py        # PreviewEDLUseCase — dry run, no edit
│   │   └── services/
│   │       ├── filler_filter.py      # FillerFilterService
│   │       └── silence_filter.py     # SilenceFilterService
│   ├── infrastructure/
│   │   ├── audio/
│   │   │   └── ffmpeg_audio_extractor.py
│   │   ├── vad/
│   │   │   ├── silero_vad_detector.py
│   │   │   └── pyannote_vad_detector.py
│   │   ├── asr/
│   │   │   └── crisper_whisper_transcriber.py
│   │   └── video/
│   │       └── ffmpeg_video_editor.py
│   ├── presentation/
│   │   ├── cli.py
│   │   └── formatters/rich_progress.py
│   └── config/
│       ├── settings.py               # pydantic BaseSettings
│       └── container.py              # Dependency injection container
└── tests/
    ├── unit/
    └── integration/
```

**One class per file. No exceptions.**

---

## SOLID Principles Applied

| Principle | How it's applied |
|---|---|
| **S** — Single Responsibility | Each file = one class = one job |
| **O** — Open/Closed | New VAD backend = new class, zero old code changed |
| **L** — Liskov Substitution | SileroVAD and PyannoteVAD are drop-in replaceable |
| **I** — Interface Segregation | Each port is minimal: 1 method, 1 purpose |
| **D** — Dependency Inversion | Use cases receive interfaces via constructor, never instantiate adapters |

---

## ProcessingConfig (Single Source of Truth)

All tuneable parameters live here — nothing hardcoded elsewhere:

```python
class ProcessingConfig(BaseModel):
    vad_backend: Literal["silero", "pyannote"] = "silero"
    min_silence_duration_ms: int = 500
    speech_pad_ms: int = 200
    enable_filler_removal: bool = True
    filler_words: FrozenSet[str] = frozenset({
        "hmm", "hm", "umm", "um", "uh", "eh",
        "mhm", "mmm", "ah", "eeh", "uhh"
    })
    filler_confidence_threshold: float = 0.7
    output_codec: Literal["copy", "h264", "h265"] = "copy"
    padding_ms: int = 100
```

---

## CLI Interface

```bash
vidcut input.mp4 output.mp4                  # basic
vidcut input.mp4 --dry-run                   # preview only, no edit
vidcut input.mp4 output.mp4 --min-silence 800 --no-filler-removal
vidcut input.mp4 output.mp4 --vad-backend pyannote --padding 150
```

Dry run output shows: original duration, compressed duration, removed per category, filler breakdown with counts and total time.

---

## Implementation Phases

When building, follow this order — each phase is independently testable:

1. **Domain + Contracts** — entities, value objects, port ABCs. Zero external deps. Write unit tests first.
2. **Infrastructure Adapters** — implement each port. Integration test each independently.
3. **Application Layer** — use cases and services. Mock the ports for unit tests.
4. **Presentation** — CLI wiring, Rich progress, dry-run mode.
5. **Polish** — GPU/CPU auto-detection, batch file support.

---

## Reference Files

See `references/algorithm-research.md` for the full research notes on why CrisperWhisper
was chosen over alternatives, and the VAD benchmark comparison.
