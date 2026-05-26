# 🎬 Lethe — Filler & Silence Remover
## Architecture Blueprint v2 — Implementation Plan

> **App Name:** Lethe  
> **Paradigma:** Clean Architecture + Hexagonal (Ports & Adapters)  
> **Prinsip:** SOLID · DRY · KISS · Single Source of Truth · Loose Coupling · EDA  
> **Stack:** Python 3.11+ backend · Tauri v2 + React frontend  
> **One class per file. No paradigm mixing. Every layer speaks only to its neighbor.**

---

## 1. What Changed from v1

| Fitur | v1 | v2 |
|---|---|---|
| UI | CLI only | Tauri v2 + React desktop app |
| Transcript | Tidak ada | Verbatim transcript editor |
| Bahasa | English only | Multilingual (auto-detect + manual select) |
| Translate | Tidak ada | ASR native lang → translate ke bahasa lain |
| Editing | Auto saja | Auto + manual trim via klik transcript |
| Waveform | Tidak ada | Visual waveform timeline di UI |

---

## 2. Architecture Overview: Tauri + Python Sidecar

```
┌─────────────────────────────────────────────┐
│           TAURI v2 SHELL (Rust)             │
│   Process lifecycle + system permissions    │
│                                             │
│  ┌─────────────────┐  ┌──────────────────┐  │
│  │  FRONTEND        │  │  PYTHON SIDECAR  │  │
│  │  React + TS      │  │  FastAPI server  │  │
│  │                  │  │                  │  │
│  │  - Video player  │◄─►  - VAD          │  │
│  │  - Waveform      │  │  - ASR           │  │
│  │  - Transcript    │  │  - Translate     │  │
│  │    editor        │  │  - FFmpeg edit   │  │
│  │  - Timeline      │  │                  │  │
│  └─────────────────┘  └──────────────────┘  │
│         HTTP/localhost IPC                   │
└─────────────────────────────────────────────┘
```

**Kenapa sidecar pattern?**
- Python sidecar di-bundle via PyInstaller → user tidak perlu install Python
- Frontend React ↔ Backend Python via HTTP localhost (clean separation)
- Tauri Rust shell hanya mengurus process lifecycle + file system permissions
- Zero Rust code yang perlu ditulis developer

---

## 3. Full Technology Stack

### Backend (Python)
| Library | Peran |
|---|---|
| `FastAPI` | HTTP server untuk IPC dengan frontend |
| `silero-vad` | Pass 1: Voice Activity Detection (CPU-first) |
| `CrisperWhisper` (nyrahealth) | Pass 2: Verbatim ASR + filler detection + word timestamps |
| `deep-translator` / `argostranslate` | Translate transcript offline |
| `ffmpeg-python` | Extract audio + cut + concat video (zero re-encoding) |
| `pydub` | Audio preprocessing (16kHz mono normalization) |
| `torch` | Runtime untuk VAD + ASR |
| `pydantic v2` | Data validation + config (SSOT) |
| `loguru` | Structured logging |
| `uvicorn` | ASGI server |

### Frontend (React + TypeScript)
| Library | Peran |
|---|---|
| `React 18` + `TypeScript` | UI framework |
| `Vite` | Build tool |
| `Tailwind CSS` | Styling |
| `WaveSurfer.js` | Waveform audio visualizer + playback |
| `@tanstack/react-query` | Async state management (API calls) |
| `Zustand` | Global UI state |
| `shadcn/ui` | Component library |

### Desktop Shell
| | |
|---|---|
| `Tauri v2` | Cross-platform shell (Windows/Mac/Linux) |
| `PyInstaller` | Bundle Python backend sebagai binary sidecar |

---

## 4. User Flow & Screen Design

```
┌─ SCREEN 1: Import ──────────────────────────┐
│  Drop video file di sini                    │
│  [Select Language ▼]  [Auto-detect]         │
│  [Enable Translation ☑] [Target Lang ▼]     │
│  [→ Process]                                │
└─────────────────────────────────────────────┘
         ↓ processing (progress bar)
┌─ SCREEN 2: Review & Edit ───────────────────┐
│                                             │
│  ┌─ VIDEO PLAYER ──────────────────────┐   │
│  │  [▶ Play] [00:04:23 / 00:12:34]    │   │
│  └────────────────────────────────────┘   │
│                                             │
│  ┌─ WAVEFORM TIMELINE ─────────────────┐   │
│  │  ████░░░████████░░░░░████████░░███  │   │
│  │  ↑ green=keep  red=cut  grey=filler │   │
│  └────────────────────────────────────┘   │
│                                             │
│  ┌─ TRANSCRIPT EDITOR ─────────────────┐   │
│  │  Hai semua, [umm] perkenalkan saya  │   │
│  │  [hmm] nama saya Budi [uh] dan...   │   │
│  │                                     │   │
│  │  [filler = merah, klik = toggle]    │   │
│  │  [silence gap = abu-abu strikethrough│  │
│  │  [select text → klik "Cut" = hapus] │   │
│  └────────────────────────────────────┘   │
│                                             │
│  [← Back]  [Auto-cut All]  [Export →]      │
└─────────────────────────────────────────────┘
         ↓
┌─ SCREEN 3: Export ──────────────────────────┐
│  Output format: [MP4 ▼]                     │
│  Codec: [Copy (no re-encode) ▼]             │
│  [Export video]  [Export transcript .srt]   │
│  [Export transcript .txt]                   │
└─────────────────────────────────────────────┘
```

---

## 5. Data Flow Pipeline (Revised)

```
[Video File]
     │
     ▼
[1] AudioExtractor (FFmpeg)
     → PCM WAV 16kHz mono
     │
     ▼
[2] LanguageDetector (CrisperWhisper detect_language)
     → detected_language: "id" | "en" | ...
     → (override jika user set manual)
     │
     ▼
[3] SileroVAD
     → List[SpeechSegment(start, end)]
     │
     ▼
[4] CrisperWhisperASR
     → input: speech segments + language code
     → output: List[WordToken(word, start, end, is_filler)]
     │
     ├──────────────────────────────┐
     ▼                              ▼
[5a] FillerFilterService     [5b] SilenceFilterService
     → mark is_filler=True         → detect gaps > threshold
     │                              │
     └──────────┬───────────────────┘
                ▼
[6] Translator (optional, jika enable_translation=True)
     → translate WordToken.word → target_language
     → TranslatedTranscript (ditampilkan paralel di UI)
     │
     ▼
[7] EditDecisionList (EDL)
     → KEEP ranges: List[TimeRange]
     → bisa di-override manual dari frontend
     │
     ▼
[8] FFmpegVideoEditor
     → concat segments via -c copy
     → output video file
```

---

## 6. Directory Structure

```
lethe/
│
├── src-tauri/                        # Tauri Rust shell (minimal config saja)
│   ├── tauri.conf.json               # Sidecar config, window setup
│   └── src/main.rs                   # Minimal boilerplate
│
├── frontend/                         # React app
│   ├── src/
│   │   ├── pages/
│   │   │   ├── ImportPage.tsx        # Screen 1: drop file + language select
│   │   │   ├── ReviewPage.tsx        # Screen 2: editor utama
│   │   │   └── ExportPage.tsx        # Screen 3: export
│   │   │
│   │   ├── components/
│   │   │   ├── VideoPlayer.tsx       # HTML5 video + sync dengan waveform
│   │   │   ├── WaveformTimeline.tsx  # WaveSurfer.js wrapper, color-coded regions
│   │   │   ├── TranscriptEditor.tsx  # Klik kata → toggle cut, select → cut range
│   │   │   ├── TranslationPanel.tsx  # Panel paralel terjemahan
│   │   │   └── ProgressOverlay.tsx   # Processing progress
│   │   │
│   │   ├── store/
│   │   │   ├── projectStore.ts       # Zustand: EDL, transcript, video path
│   │   │   └── settingsStore.ts      # Zustand: language, translation config
│   │   │
│   │   └── api/
│   │       └── backendClient.ts      # React Query hooks → FastAPI calls
│   │
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
│
├── backend/                          # Python FastAPI sidecar
│   │
│   ├── main.py                       # FastAPI app entrypoint + uvicorn
│   │
│   ├── domain/                       # ♦ CORE — zero external deps
│   │   ├── entities/
│   │   │   ├── word_token.py         # WordToken(word, time_range, confidence, is_filler)
│   │   │   ├── speech_segment.py     # SpeechSegment(start, end)
│   │   │   ├── translated_token.py   # TranslatedToken(original, translated, time_range)
│   │   │   └── edit_decision.py      # EditDecisionList(keep_ranges, source_duration)
│   │   │
│   │   ├── value_objects/
│   │   │   ├── time_range.py         # TimeRange(start, end) — frozen dataclass
│   │   │   ├── language_code.py      # LanguageCode("id"|"en"|...) — validated VO
│   │   │   ├── filler_word_set.py    # FillerWordSet — SSOT filler definitions
│   │   │   └── processing_config.py  # ProcessingConfig (pydantic) — SSOT config
│   │   │
│   │   └── ports/                    # Abstract interfaces
│   │       ├── audio_extractor.py    # IAudioExtractor
│   │       ├── vad_detector.py       # IVADDetector
│   │       ├── asr_transcriber.py    # IASRTranscriber
│   │       ├── translator.py         # ITranslator
│   │       └── video_editor.py       # IVideoEditor
│   │
│   ├── application/
│   │   ├── use_cases/
│   │   │   ├── process_video.py      # ProcessVideoUseCase — main pipeline
│   │   │   ├── apply_edl.py          # ApplyEDLUseCase — render final video
│   │   │   └── translate_transcript.py # TranslateTranscriptUseCase
│   │   │
│   │   └── services/
│   │       ├── filler_filter.py      # FillerFilterService
│   │       ├── silence_filter.py     # SilenceFilterService
│   │       └── edl_builder.py        # EDLBuilderService — merge filters → EDL
│   │
│   ├── infrastructure/
│   │   ├── audio/
│   │   │   └── ffmpeg_audio_extractor.py
│   │   ├── vad/
│   │   │   ├── silero_vad_detector.py        # default
│   │   │   └── pyannote_vad_detector.py      # optional GPU adapter
│   │   ├── asr/
│   │   │   └── crisper_whisper_transcriber.py
│   │   ├── translation/
│   │   │   ├── argos_translator.py           # offline, open source
│   │   │   └── deep_translator_adapter.py    # online fallback
│   │   └── video/
│   │       └── ffmpeg_video_editor.py
│   │
│   ├── presentation/                 # FastAPI routes (thin layer, no logic)
│   │   ├── routes/
│   │   │   ├── process.py            # POST /process — jalankan pipeline
│   │   │   ├── edl.py                # GET/PUT /edl — ambil & update EDL
│   │   │   ├── export.py             # POST /export — render final video
│   │   │   └── translate.py          # POST /translate — translate transcript
│   │   └── schemas/
│   │       ├── process_request.py    # Pydantic request/response schemas
│   │       ├── edl_schema.py
│   │       └── transcript_schema.py
│   │
│   └── config/
│       ├── settings.py               # pydantic BaseSettings (env vars)
│       └── container.py              # Dependency injection container
│
└── tests/
    ├── unit/
    │   ├── domain/
    │   └── application/
    └── integration/
        ├── test_pipeline.py
        └── test_api_routes.py
```

---

## 7. API Contract (Backend ↔ Frontend)

```
POST /process
  body: { video_path, language?, enable_translation, target_language? }
  response: { job_id }

GET /process/{job_id}/status
  response: { status: "processing"|"done"|"error", progress: 0-100 }

GET /process/{job_id}/result
  response: {
    transcript: [{ word, start, end, is_filler, translated? }],
    edl: [{ start, end }],                    ← initial KEEP ranges
    waveform_data: [...],                     ← amplitude array untuk WaveSurfer
    detected_language: "id",
    stats: { original_duration, filler_count, silence_removed_s }
  }

PUT /edl/{job_id}
  body: { keep_ranges: [{ start, end }] }     ← dari manual edit di UI
  response: { ok: true }

POST /export/{job_id}
  body: { output_path, codec: "copy"|"h264" }
  response: { output_path }

POST /translate/{job_id}
  body: { target_language }
  response: { translated_tokens: [{ original, translated, start, end }] }
```

---

## 8. Transcript Editor Interaction Design

Dua mode edit yang berjalan bersamaan:

**Mode 1 — Klik kata (word-level)**
- Kata filler (merah) → klik → toggle antara cut/keep
- Kata biasa → klik → pilih sebagai anchor point
- Waveform dan video player sync ke posisi kata yang diklik

**Mode 2 — Select teks (range-level)**
- Drag select beberapa kata → muncul toolbar "Cut selection"
- Selection langsung ter-reflect di waveform sebagai region merah
- Bisa juga select di waveform → highlight di transcript

**Color coding transcript:**
```
merah + strikethrough  → akan di-cut (filler atau manual)
abu-abu italic         → silence gap (tidak ada kata)
putih normal           → akan di-keep
```

---

## 9. Language & Translation Strategy

**Bahasa input (ASR):**
- CrisperWhisper mendukung 99+ bahasa via Whisper multilingual base
- Default: auto-detect dari 30 detik pertama audio
- User bisa override manual (dropdown: Indonesia, English, dll)
- Language code dikirim ke CrisperWhisper sebagai parameter `language`

**Translation (opsional):**
- Library: `argostranslate` (offline, open source, tidak perlu API key)
- Fallback: `deep-translator` (online jika argos model belum terinstall)
- Transcript asli tetap tampil di panel kiri
- Terjemahan tampil di panel kanan (paralel)
- Translation tidak mempengaruhi EDL — hanya untuk referensi baca

---

## 10. SOLID Principles Applied

| Prinsip | Implementasi |
|---|---|
| **S** — Single Responsibility | 1 file = 1 class = 1 tanggung jawab |
| **O** — Open/Closed | VAD baru = 1 class baru, tidak ada kode lama diubah |
| **L** — Liskov Substitution | Silero & Pyannote bisa di-swap tanpa mengubah use case |
| **I** — Interface Segregation | Tiap port punya 1 method, 1 tujuan |
| **D** — Dependency Inversion | Use case menerima interface via constructor, tidak pernah instantiate adapter |

---

## 11. Implementation Phases

### Phase 1 — Domain + Contracts
- Entities, value objects, port interfaces
- Zero external dependencies
- Unit tests 100% coverage

### Phase 2 — Backend Infrastructure
- FFmpegAudioExtractor
- SileroVADDetector
- CrisperWhisperTranscriber (+ language detection)
- ArgosTranslator
- FFmpegVideoEditor
- Integration test per adapter

### Phase 3 — Backend Application Layer
- FillerFilterService, SilenceFilterService, EDLBuilderService
- ProcessVideoUseCase, ApplyEDLUseCase, TranslateTranscriptUseCase
- FastAPI routes (thin — hanya marshal request/response)

### Phase 4 — Frontend Core
- ImportPage + bahasa selector
- WaveformTimeline (WaveSurfer.js)
- TranscriptEditor (click + select mode)
- Video player sync

### Phase 5 — Tauri Shell
- Sidecar config (bundle Python via PyInstaller)
- File picker permissions
- Window management

### Phase 6 — Polish
- TranslationPanel
- Export options (SRT, TXT, MP4)
- GPU/CPU auto-detection
- Batch processing

---

## 12. Full Dependencies

```toml
# backend/pyproject.toml
[project]
name = "lethe-backend"
requires-python = ">=3.11"
dependencies = [
    "fastapi>=0.110",
    "uvicorn>=0.29",
    "torch>=2.0",
    "transformers>=4.40",         # CrisperWhisper
    "silero-vad>=5.1",
    "ffmpeg-python>=0.2",
    "pydub>=0.25",
    "numpy>=1.26",
    "pydantic>=2.0",
    "pydantic-settings>=2.0",
    "argostranslate>=1.9",        # offline translation
    "deep-translator>=1.11",      # online fallback
    "loguru>=0.7",
    "python-dotenv>=1.0",
]
```

```json
// frontend/package.json dependencies
{
  "react": "^18",
  "typescript": "^5",
  "vite": "^5",
  "@tauri-apps/api": "^2",
  "wavesurfer.js": "^7",
  "@tanstack/react-query": "^5",
  "zustand": "^4",
  "tailwindcss": "^3",
  "@shadcn/ui": "latest"
}
```

---

*Blueprint v2.0 — Lethe · Ready for Phase 1 Implementation*