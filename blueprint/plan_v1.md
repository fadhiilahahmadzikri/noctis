# SilentCut — Project Blueprint
### Automated Video Silence Trimmer · Desktop Application

---

## 1. Latar Belakang & Filosofi

Content creator yang merekam video edukatif atau podcast-style menghabiskan sebagian besar waktu editing bukan untuk hal kreatif, melainkan untuk pekerjaan mekanis: memotong bagian diam, merapatkan antar kalimat, menghilangkan jeda panjang di tengah rekaman. Untuk video satu jam, proses ini bisa memakan waktu 1–2 jam manual di timeline editor.

**SilentCut** dibangun berdasarkan satu premis: *silence detection tidak memerlukan AI besar, tidak memerlukan cloud, dan tidak memerlukan GPU*. Ini adalah masalah signal processing, bukan language modeling. Solusinya harus ringan, offline, dan deterministik.

Filosofi teknis yang mendasari:

- **Simplicity over cleverness** — gunakan tool terbaik di kelasnya, bukan yang paling populer
- **Offline-first** — semua processing terjadi lokal di mesin user, tidak ada data yang keluar
- **Composable, not monolithic** — setiap komponen bisa diganti tanpa meruntuhkan sistem
- **Responsibility-driven** — setiap class dan modul punya satu alasan untuk berubah

---

## 2. Problem Statement

```
Input  : Video mentah 1 jam (podcast/edukasi, single speaker)
Output : Video bersih tanpa silence panjang, dense, siap diedit lebih lanjut

Pain Point:
  - Silence panjang (2–10 detik) tersebar di 1 jam rekaman
  - Proses manual memerlukan timeline scrubbing yang sangat melelahkan
  - User ingin kontrol: ada yang mau fully otomatis, ada yang mau review dulu
```

---

## 3. Feature Scope (V1)

### Mode A — Automatic Trim
User drop video → sistem deteksi silence → langsung render output bersih.
Tidak ada intervensi manual.

### Mode B — Manual Review (Segment Editor)
User drop video → sistem deteksi silence → tampilkan segment list → user preview dan toggle segmen mana yang dihapus → render.

### Di luar scope V1 (eksplisit):
- Filler word detection (umm, hmm)
- Multi-track audio
- Subtitle generation
- Cloud sync

---

## 4. Stack Teknologi

### Backend — Python 3.11+

| Kebutuhan | Library | Alasan |
|---|---|---|
| VAD / Silence Detection | `silero-vad` | CPU-only, <1ms per 30ms chunk, presisi tinggi, no GPU needed |
| Video Cutting & Muxing | `ffmpeg` via `subprocess` | Fastest path — `ffmpeg -c copy` = milliseconds, no re-encode |
| Audio extraction | `ffmpeg` subprocess | Sudah ada, konsisten |
| API Server | `FastAPI` | Async, auto-docs, WebSocket support untuk progress stream |
| Progress Streaming | `FastAPI WebSocket` | Real-time progress ke frontend saat processing video panjang |
| PyInstaller bundling | `PyInstaller` | Bundle Python → single binary untuk Tauri sidecar |
| Config schema | `pydantic v2` | Validation dan serialization bawaan FastAPI |

**Kenapa `ffmpeg` subprocess langsung, bukan MoviePy?**

MoviePy membaca video frame-by-frame ke numpy array sebelum menulis kembali. Untuk cut-and-concat tanpa re-encoding, ini overhead tidak perlu. `ffmpeg -c copy` beroperasi di level container, bukan pixel — hasilnya milliseconds untuk clip apapun. MoviePy untuk use case ini = 100x lebih lambat tanpa keuntungan apapun.

### Frontend — Tauri v2 + React + TypeScript

| Kebutuhan | Tech | Alasan |
|---|---|---|
| Desktop shell | `Tauri v2` | Lightweight, native OS integration, MIT license |
| UI framework | `React 18 + TypeScript` | Ecosystem matang, type safety |
| State management | `Zustand` | Minimal boilerplate, cocok untuk local app state |
| Styling | `Tailwind CSS` | Utility-first, tidak butuh CSS-in-JS overhead |
| File dialog | `Tauri dialog plugin` | Native OS file picker |

### Komunikasi Frontend ↔ Python

```
Tauri Frontend (React)
       │ HTTP REST + WebSocket
       ▼
FastAPI Server (Python Sidecar)
       │ subprocess
       ▼
FFmpeg + Silero VAD
```

**Pola komunikasi:**
- REST: operasi synchronous (load project, get segments, update config)
- WebSocket: progress streaming saat processing (% completion, current timestamp)
- Tauri Sidecar: Python binary di-bundle ke dalam executable Tauri, otomatis spawn saat app buka

---

## 5. Arsitektur Backend (Clean Architecture)

```
backend/
├── domain/                    # Pure business logic, zero framework dependency
│   ├── entities/
│   │   ├── segment.py         # Segment: start, end, type (speech/silence), is_removed
│   │   ├── video_project.py   # VideoProject: path, duration, segments list
│   │   └── detection_config.py # SilenceConfig: threshold_db, min_duration_ms, padding_ms
│   └── value_objects/
│       └── time_range.py      # TimeRange: start_ms, end_ms, duration_ms (immutable)
│
├── application/               # Use cases — orchestrates domain objects
│   ├── ports/                 # Abstract interfaces (dependency inversion)
│   │   ├── i_vad_detector.py  # IVADDetector: detect(audio_path) -> List[TimeRange]
│   │   ├── i_video_cutter.py  # IVideoCutter: cut(project, output_path) -> Path
│   │   └── i_progress_emitter.py # IProgressEmitter: emit(percent, message)
│   └── use_cases/
│       ├── detect_silence.py  # DetectSilenceUseCase
│       ├── apply_trim.py      # ApplyTrimUseCase
│       └── toggle_segment.py  # ToggleSegmentUseCase (manual mode)
│
├── infrastructure/            # Concrete implementations of ports
│   ├── vad/
│   │   └── silero_vad_adapter.py    # Implements IVADDetector using silero-vad
│   ├── video/
│   │   └── ffmpeg_cutter.py         # Implements IVideoCutter using subprocess+ffmpeg
│   └── events/
│       └── websocket_emitter.py     # Implements IProgressEmitter via WebSocket
│
└── presentation/              # FastAPI routes
    ├── api/
    │   ├── project_router.py  # POST /project/load, GET /project/{id}/segments
    │   ├── detect_router.py   # POST /project/{id}/detect
    │   ├── trim_router.py     # POST /project/{id}/trim
    │   └── segment_router.py  # PATCH /project/{id}/segment/{seg_id}
    └── ws/
        └── progress_ws.py     # WS /ws/progress/{job_id}
```

### Alasan struktur ini:

`domain/` tidak pernah tahu tentang FastAPI, Silero, atau FFmpeg. Kalau suatu hari Silero diganti library lain, hanya `infrastructure/vad/` yang berubah. Kalau FFmpeg diganti PyAV, hanya `infrastructure/video/` yang berubah. Domain tetap utuh.

---

## 6. Domain Entities

```python
# domain/entities/segment.py
from dataclasses import dataclass, field
from enum import Enum
from uuid import UUID, uuid4

class SegmentType(Enum):
    SPEECH = "speech"
    SILENCE = "silence"

@dataclass
class Segment:
    start_ms: int
    end_ms: int
    segment_type: SegmentType
    id: UUID = field(default_factory=uuid4)
    is_removed: bool = False  # user toggle (manual mode)

    @property
    def duration_ms(self) -> int:
        return self.end_ms - self.start_ms

    def toggle(self) -> "Segment":
        """Returns new Segment with toggled state (immutable operation)."""
        return Segment(
            start_ms=self.start_ms,
            end_ms=self.end_ms,
            segment_type=self.segment_type,
            id=self.id,
            is_removed=not self.is_removed,
        )
```

```python
# domain/entities/video_project.py
from dataclasses import dataclass, field
from pathlib import Path
from typing import List
from .segment import Segment

@dataclass
class VideoProject:
    source_path: Path
    duration_ms: int
    segments: List[Segment] = field(default_factory=list)

    def get_kept_segments(self) -> List[Segment]:
        return [s for s in self.segments if not s.is_removed]

    def get_removed_segments(self) -> List[Segment]:
        return [s for s in self.segments if s.is_removed]
```

---

## 7. Design Patterns yang Digunakan

### 7.1 Strategy Pattern — Detection Mode

Mode Auto dan Manual tidak berbeda di level deteksi, tapi berbeda di post-processing. Strategy pattern memastikan ini bisa dikembangkan tanpa menyentuh core:

```python
# application/ports/i_detection_strategy.py
from abc import ABC, abstractmethod
from domain.entities.video_project import VideoProject
from domain.entities.detection_config import SilenceConfig

class IDetectionStrategy(ABC):
    @abstractmethod
    def apply(self, project: VideoProject, config: SilenceConfig) -> VideoProject:
        """Returns project with segments populated."""
        ...

# Auto: langsung mark semua silence sebagai is_removed=True
class AutoDetectionStrategy(IDetectionStrategy):
    def apply(self, project, config):
        # semua silence segment → is_removed = True
        ...

# Manual: mark silence tapi biarkan user yang toggle
class ManualDetectionStrategy(IDetectionStrategy):
    def apply(self, project, config):
        # semua silence segment → is_removed = False (user yang putuskan)
        ...
```

### 7.2 Adapter Pattern — FFmpeg & Silero

Semua library eksternal dibungkus adapter yang implement interface domain. Ini yang membuat sistem testable (bisa mock adapter saat unit test):

```python
# infrastructure/vad/silero_vad_adapter.py
from application.ports.i_vad_detector import IVADDetector
from domain.value_objects.time_range import TimeRange
from silero_vad import load_silero_vad, read_audio, get_speech_timestamps

class SileroVADAdapter(IVADDetector):
    def __init__(self):
        self._model = load_silero_vad()

    def detect(self, audio_path: str) -> list[TimeRange]:
        wav = read_audio(audio_path)
        timestamps = get_speech_timestamps(wav, self._model, return_seconds=True)
        return [TimeRange(start_ms=int(t['start'] * 1000),
                          end_ms=int(t['end'] * 1000))
                for t in timestamps]
```

### 7.3 Repository Pattern — Project State

Project state (segmen yang sudah dideteksi, konfigurasi) disimpan in-memory via repository. Ini memisahkan storage concern dari use case:

```python
# application/ports/i_project_repository.py
from abc import ABC, abstractmethod
from uuid import UUID
from domain.entities.video_project import VideoProject

class IProjectRepository(ABC):
    @abstractmethod
    def save(self, project: VideoProject) -> None: ...

    @abstractmethod
    def get(self, project_id: UUID) -> VideoProject: ...
```

### 7.4 Observer via WebSocket — Progress Events

Processing video panjang harus bisa di-stream progressnya. `IProgressEmitter` diimplementasikan oleh WebSocket emitter di infrastructure layer:

```python
# Event yang di-emit saat processing
@dataclass
class ProgressEvent:
    job_id: str
    percent: float        # 0.0 - 100.0
    current_ms: int       # posisi saat ini di video
    message: str          # "Detecting silence at 00:04:23..."
    is_complete: bool = False
    error: str | None = None
```

---

## 8. Alur Data: Auto Mode

```
User drops video file
        │
        ▼
POST /project/load
  → extract audio (ffmpeg -vn -ar 16000)
  → create VideoProject entity
  → save to ProjectRepository
  → return project_id
        │
        ▼
POST /project/{id}/detect?mode=auto
  → SileroVADAdapter.detect(audio_path)
  → returns speech timestamps
  → invert → silence segments
  → AutoDetectionStrategy.apply() → mark silence as is_removed=True
  → save updated project
  → emit ProgressEvents via WebSocket
  → return segments list
        │
        ▼
POST /project/{id}/trim
  → FFmpegCutter.cut(project, output_path)
  → build ffmpeg concat filter dari kept segments
  → stream progress via WebSocket
  → return output_path
        │
        ▼
Frontend opens output file explorer
```

---

## 9. Alur Data: Manual Mode

```
User drops video file
        │
        ▼
POST /project/load  (sama seperti auto)
        │
        ▼
POST /project/{id}/detect?mode=manual
  → SileroVADAdapter.detect()
  → ManualDetectionStrategy: semua silence is_removed=False
  → return segments list ke frontend
        │
        ▼
Frontend tampilkan segment list:
  [00:00 - 00:04] SPEECH   ✅ keep
  [00:04 - 00:07] SILENCE  ☑ akan dihapus (user bisa toggle)
  [00:07 - 00:23] SPEECH   ✅ keep
  ...

User preview tiap segmen (play clip dari timestamp itu)
User toggle segmen yang ingin dihapus/dipertahankan
        │
        ▼
PATCH /project/{id}/segment/{seg_id}
  → ToggleSegmentUseCase
  → Segment.toggle()
  → save project
        │
        ▼
POST /project/{id}/trim  (sama seperti auto)
```

---

## 10. FFmpeg Cutting Strategy

Ini keputusan teknis terpenting. Ada dua pendekatan:

**Pendekatan A: Re-encode (lambat)**
```bash
ffmpeg -i input.mp4 -filter_complex "[0:v]trim=0:10,setpts=PTS-STARTPTS[v1];..." output.mp4
# Kekurangan: encode ulang seluruh video → waktu lama, quality loss
```

**Pendekatan B: Stream Copy dengan concat demuxer (cepat) ✅**
```bash
# Step 1: Buat concat list
# file 'segment_001.mp4'
# file 'segment_002.mp4'

# Step 2: Extract segments tanpa re-encode
ffmpeg -ss 0 -to 10.4 -i input.mp4 -c copy segment_001.mp4
ffmpeg -ss 23.1 -to 45.2 -i input.mp4 -c copy segment_002.mp4

# Step 3: Concat
ffmpeg -f concat -safe 0 -i segments.txt -c copy output.mp4
```

`-c copy` = tidak ada re-encoding. FFmpeg hanya memotong di container level. Untuk video 1 jam, ini selesai dalam hitungan detik bukan menit.

**Caveat:** `-c copy` cut accuracy terbatas pada keyframe boundaries. Untuk podcast/talking head video dengan keyframe tiap 2 detik, ini tidak masalah praktis. Jika presisi frame-perfect dibutuhkan, bisa fallback ke re-encode hanya di transition points (future scope).

---

## 11. Tauri Integration

```
src-tauri/
├── tauri.conf.json       # register Python sidecar
├── src/
│   └── lib.rs            # spawn sidecar on app start, kill on exit
└── binaries/
    └── silentcut-server-x86_64-pc-windows-msvc.exe  # PyInstaller output
```

```json
// tauri.conf.json (relevant section)
{
  "bundle": {
    "externalBin": ["binaries/silentcut-server"]
  },
  "security": {
    "csp": null
  }
}
```

```rust
// lib.rs: spawn Python FastAPI sidecar
.setup(|app| {
    let sidecar = app.shell().sidecar("silentcut-server")?;
    let (_rx, _child) = sidecar
        .env("SILENTCUT_PORT", "18420")
        .spawn()?;
    Ok(())
})
```

Frontend berkomunikasi ke `http://localhost:18420` — straightforward HTTP, tidak ada magic Tauri IPC untuk data transfer.

---

## 12. Frontend State Model (Zustand)

```typescript
interface ProjectStore {
  // State
  projectId: string | null
  videoPath: string | null
  duration: number           // ms
  segments: Segment[]
  mode: 'auto' | 'manual'
  processingJob: JobState | null

  // Actions
  loadVideo: (path: string) => Promise<void>
  runDetection: (config: DetectionConfig) => Promise<void>
  toggleSegment: (segmentId: string) => void
  renderOutput: (outputPath: string) => Promise<void>
}

interface Segment {
  id: string
  startMs: number
  endMs: number
  type: 'speech' | 'silence'
  isRemoved: boolean
}

interface JobState {
  jobId: string
  percent: number
  message: string
  isComplete: boolean
  error: string | null
}
```

---

## 13. Detection Config (User-Tunable)

```python
# domain/entities/detection_config.py
from pydantic import BaseModel, Field

class SilenceConfig(BaseModel):
    threshold: float = Field(default=0.5, ge=0.0, le=1.0,
        description="Silero VAD confidence threshold. Higher = more aggressive detection.")
    min_silence_duration_ms: int = Field(default=1000, ge=100,
        description="Minimum silence length to be flagged. Below this = kept as-is.")
    speech_pad_ms: int = Field(default=200, ge=0,
        description="Padding around speech segments to avoid clipping word edges.")
    min_speech_duration_ms: int = Field(default=300, ge=50,
        description="Minimum speech segment to keep. Very short segments may be noise.")
```

Parameter ini exposed ke UI sebagai slider. User bisa tuning tanpa tau implementasinya.

---

## 14. Project Structure

```
silentcut/
├── backend/
│   ├── domain/
│   │   ├── entities/
│   │   │   ├── __init__.py
│   │   │   ├── segment.py
│   │   │   ├── video_project.py
│   │   │   └── detection_config.py
│   │   └── value_objects/
│   │       └── time_range.py
│   ├── application/
│   │   ├── ports/
│   │   │   ├── i_vad_detector.py
│   │   │   ├── i_video_cutter.py
│   │   │   ├── i_project_repository.py
│   │   │   └── i_progress_emitter.py
│   │   └── use_cases/
│   │       ├── detect_silence.py
│   │       ├── apply_trim.py
│   │       └── toggle_segment.py
│   ├── infrastructure/
│   │   ├── vad/
│   │   │   └── silero_vad_adapter.py
│   │   ├── video/
│   │   │   └── ffmpeg_cutter.py
│   │   ├── repository/
│   │   │   └── in_memory_project_repo.py
│   │   └── events/
│   │       └── websocket_emitter.py
│   ├── presentation/
│   │   ├── api/
│   │   │   ├── project_router.py
│   │   │   ├── detect_router.py
│   │   │   ├── trim_router.py
│   │   │   └── segment_router.py
│   │   └── ws/
│   │       └── progress_ws.py
│   ├── main.py              # FastAPI app entry point
│   └── requirements.txt
│
├── src/                     # Tauri + React frontend
│   ├── components/
│   │   ├── DropZone.tsx
│   │   ├── SegmentList.tsx
│   │   ├── SegmentItem.tsx
│   │   ├── ConfigPanel.tsx
│   │   └── ProgressBar.tsx
│   ├── stores/
│   │   └── projectStore.ts
│   ├── services/
│   │   ├── apiClient.ts     # HTTP client ke FastAPI
│   │   └── wsClient.ts      # WebSocket progress client
│   └── App.tsx
│
├── src-tauri/
│   ├── src/lib.rs
│   ├── tauri.conf.json
│   └── binaries/            # PyInstaller output goes here
│
└── README.md
```

---

## 15. Dependency Injection & Wiring

```python
# backend/main.py
from fastapi import FastAPI
from infrastructure.vad.silero_vad_adapter import SileroVADAdapter
from infrastructure.video.ffmpeg_cutter import FFmpegCutter
from infrastructure.repository.in_memory_project_repo import InMemoryProjectRepository
from presentation.api import project_router, detect_router, trim_router, segment_router

def create_app() -> FastAPI:
    app = FastAPI(title="SilentCut API")

    # Wire dependencies
    vad_detector = SileroVADAdapter()
    video_cutter = FFmpegCutter()
    project_repo = InMemoryProjectRepository()

    # Inject ke routers via FastAPI dependency injection
    app.include_router(project_router.build(project_repo))
    app.include_router(detect_router.build(project_repo, vad_detector))
    app.include_router(trim_router.build(project_repo, video_cutter))
    app.include_router(segment_router.build(project_repo))

    return app

app = create_app()
```

---

## 16. API Contract

```
POST   /project/load
  Body: { "video_path": "/absolute/path/to/video.mp4" }
  Resp: { "project_id": "uuid", "duration_ms": 3600000 }

POST   /project/{id}/detect
  Body: { "mode": "auto|manual", "config": SilenceConfig }
  Resp: { "job_id": "uuid", "segment_count": 142 }
  → Progress via WS /ws/progress/{job_id}

GET    /project/{id}/segments
  Resp: { "segments": [Segment, ...] }

PATCH  /project/{id}/segment/{seg_id}
  Body: { "is_removed": true }
  Resp: { "segment": Segment }

POST   /project/{id}/trim
  Body: { "output_path": "/path/to/output.mp4" }
  Resp: { "job_id": "uuid" }
  → Progress via WS /ws/progress/{job_id}

WS     /ws/progress/{job_id}
  Emits: { "percent": 45.2, "message": "...", "is_complete": false }
```

---

## 17. Dependency List

```
# backend/requirements.txt
fastapi>=0.111.0
uvicorn[standard]>=0.30.0
pydantic>=2.7.0
silero-vad>=4.0.0
torch>=2.1.0           # Silero VAD dependency (CPU-only install: --index-url .../cpu)
torchaudio>=2.1.0
websockets>=12.0

# ffmpeg: system dependency, must be in PATH
# Untuk bundling: ffmpeg binary disertakan dalam app bundle
```

```json
// package.json (frontend)
{
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "zustand": "^4.5.0",
    "@tauri-apps/api": "^2.0.0",
    "@tauri-apps/plugin-dialog": "^2.0.0",
    "@tauri-apps/plugin-shell": "^2.0.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "tailwindcss": "^3.4.0",
    "@tauri-apps/cli": "^2.0.0",
    "vite": "^5.3.0"
  }
}
```

---

## 18. Milestones

```
Sprint 1 — Core Pipeline (backend only, no UI)
  ✓ Domain entities (Segment, VideoProject, SilenceConfig)
  ✓ SileroVADAdapter
  ✓ FFmpegCutter (stream copy)
  ✓ DetectSilenceUseCase + ApplyTrimUseCase
  ✓ CLI test: python -m backend.cli input.mp4 output.mp4

Sprint 2 — API Layer
  ✓ FastAPI routes
  ✓ WebSocket progress streaming
  ✓ InMemoryProjectRepository
  ✓ Manual mode (ToggleSegmentUseCase)

Sprint 3 — Tauri Shell + Basic UI
  ✓ Drag & drop video
  ✓ Trigger detect + trim
  ✓ Progress bar
  ✓ Open output folder

Sprint 4 — Manual Mode UI
  ✓ Segment list
  ✓ Toggle individual segments
  ✓ Preview clip (play from timestamp)

Sprint 5 — Polish & Bundling
  ✓ Config panel (threshold slider, duration slider)
  ✓ PyInstaller packaging
  ✓ Tauri bundle with sidecar
```

---

## 19. Trade-offs & Known Constraints

| Keputusan | Alternatif | Mengapa dipilih |
|---|---|---|
| Silero VAD | pydub silence detect | Silero ML-based, jauh lebih akurat di audio noisy. pydub hanya amplitude threshold. |
| ffmpeg subprocess | PyAV | PyAV lebih Pythonic tapi overhead lebih besar. subprocess langsung = performa maksimal. |
| FastAPI HTTP | Tauri native IPC | HTTP lebih universal, mudah di-debug, tidak terikat Tauri API specifics. |
| In-memory repo | SQLite | V1 hanya satu project per session. SQLite untuk V2 jika perlu project history. |
| stream copy | re-encode | Re-encode = lama + quality loss. Stream copy = detik. Cut accuracy di keyframe boundary (acceptable untuk podcast). |

---

*Blueprint version 1.0 — SilentCut*