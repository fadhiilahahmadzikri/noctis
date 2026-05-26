<div align="center">

<img src="https://raw.githubusercontent.com/fadhiilahahmadzikri/lethe/main/assets/logo/lethe.png" width="120" alt="Lethe Logo" />

# 🎬 Lethe

**Desktop application for removing filler words and silence from video recordings.**

[![Python](https://img.shields.io/badge/Python-3.12+-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![Tauri](https://img.shields.io/badge/Tauri-v2-FFC131?style=for-the-badge&logo=tauri&logoColor=white)](https://tauri.app)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)

<p align="center">
  <strong>Drop a video → Detect silence → Review segments → Export clean video</strong>
</p>

---

[Features](#-features) •
[Architecture](#-architecture) •
[Prerequisites](#-prerequisites) •
[Installation](#-installation) •
[Development](#-development) •
[Commands](#-commands) •
[Bundling](#-bundling) •
[Project Structure](#-project-structure) •
[API Reference](#-api-reference) •
[Troubleshooting](#-troubleshooting)

</div>

---

## ✨ Features

- **Silence Detection** — Automatically detects silence using FFmpeg amplitude analysis (no ML/GPU required)
- **Stream Copy Export** — Lightning-fast video trimming without re-encoding (preserves quality)
- **Manual Review** — Toggle individual segments before export
- **Offline-First** — All processing happens locally, no data leaves your machine
- **Cross-Platform** — Windows, macOS, Linux (via Tauri v2)
- **Black Noir UI** — Clean, professional dark interface built with shadcn/ui

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────┐
│              TAURI v2 SHELL (Rust)                   │
│         Process lifecycle + permissions              │
│                                                     │
│  ┌───────────────────┐  ┌────────────────────────┐  │
│  │  FRONTEND          │  │  PYTHON SIDECAR        │  │
│  │  React + TS        │  │  FastAPI (port 18420)  │  │
│  │  shadcn/ui         │◄─►  Clean Architecture   │  │
│  │  Tailwind CSS      │  │  FFmpeg processing     │  │
│  └───────────────────┘  └────────────────────────┘  │
│         HTTP REST + WebSocket (localhost)            │
└─────────────────────────────────────────────────────┘
```

| Layer | Tech | Role |
|-------|------|------|
| **Shell** | Rust (Tauri v2) | Window management, sidecar lifecycle, OS permissions |
| **Frontend** | React + TypeScript + Tailwind | UI rendering, state management, API calls |
| **Backend** | Python + FastAPI | Silence detection, video processing, business logic |
| **Processing** | FFmpeg | Audio analysis, video cutting, concatenation |

---

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

| Tool | Version | Purpose | Install |
|------|---------|---------|---------|
| **Node.js** | ≥ 18 LTS | Frontend build | [nodejs.org](https://nodejs.org) |
| **Rust** | stable | Tauri shell compilation | [rustup.rs](https://rustup.rs) |
| **Python** | ≥ 3.12 | Backend runtime | [python.org](https://python.org) |
| **uv** | ≥ 0.5 | Python package manager | [docs.astral.sh/uv](https://docs.astral.sh/uv) |
| **FFmpeg** | ≥ 6.0 | Audio/video processing | [ffmpeg.org](https://ffmpeg.org/download.html) |

### Verify Installation

```bash
node --version        # v18+ required
rustc --version       # stable toolchain
python --version      # 3.12+
uv --version          # 0.5+
ffmpeg -version       # must be in PATH
ffprobe -version      # must be in PATH
```

### Platform-Specific Requirements

<details>
<summary><strong>🪟 Windows</strong></summary>

1. Install [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) → select "Desktop development with C++"
2. WebView2 is pre-installed on Windows 10/11
3. FFmpeg: download from [gyan.dev](https://www.gyan.dev/ffmpeg/builds/) and add to PATH

</details>

<details>
<summary><strong>🍎 macOS</strong></summary>

```bash
xcode-select --install
brew install ffmpeg
```

</details>

<details>
<summary><strong>🐧 Linux (Debian/Ubuntu)</strong></summary>

```bash
sudo apt update
sudo apt install -y libwebkit2gtk-4.1-dev build-essential curl wget \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev ffmpeg
```

</details>

---

## 🚀 Installation

### 1. Clone the repository

```bash
git clone https://github.com/your-username/lethe.git
cd lethe
```

### 2. Install Backend Dependencies

```bash
cd backend
uv sync --all-extras
```

This installs all Python dependencies (FastAPI, uvicorn, pydantic, etc.) and dev tools (ruff, mypy, pytest).

### 3. Install Frontend Dependencies

```bash
cd frontend
npm install
```

### 4. Verify Setup

```bash
# Backend tests (from backend/)
cd backend
uv run pytest tests/ -q

# Frontend build check (from frontend/)
cd frontend
npm run build
```

---

## 💻 Development

### Running the Full App (Tauri Dev Mode)

```bash
# From project root — starts frontend dev server + Tauri window + Python sidecar
cd frontend
npm run tauri dev
```

> **Note:** This requires Rust installed. The first build takes a few minutes to compile Tauri.

### Running Backend Only (for API development)

```bash
cd backend
uv run uvicorn src.lethe.main:app --host 0.0.0.0 --port 18420 --reload
```

The API is now available at `http://localhost:18420`. Visit `http://localhost:18420/docs` for interactive Swagger UI.

### Running Frontend Only (for UI development)

```bash
cd frontend
npm run dev
```

Frontend dev server at `http://localhost:5173`. It will connect to the backend at port 18420 if running.

### Running Both (without Tauri)

Open two terminals:

```bash
# Terminal 1: Backend
cd backend && make run

# Terminal 2: Frontend
cd frontend && npm run dev
```

---

## 📝 Commands

### Backend Commands (Makefile)

Run from `backend/` directory:

| Command | Description |
|---------|-------------|
| `make install` | Install all dependencies (runtime + dev) |
| `make run` | Start FastAPI server on port 18420 with hot-reload |
| `make test` | Run all tests with coverage |
| `make test-unit` | Run unit tests only |
| `make test-integration` | Run integration tests only (requires FFmpeg) |
| `make lint` | Check code with ruff |
| `make format` | Auto-format code with ruff |
| `make typecheck` | Run mypy strict type checking |
| `make clean` | Remove cache directories |

### Frontend Commands

Run from `frontend/` directory:

| Command | Description |
|---------|-------------|
| `npm install` | Install dependencies |
| `npm run dev` | Start Vite dev server (port 5173) |
| `npm run build` | TypeScript check + production build |
| `npm run preview` | Preview production build locally |
| `npm run tauri dev` | Full Tauri development mode |
| `npm run tauri build` | Build production desktop app |

### Quick Workflow

```bash
# Daily development
cd backend && make run          # Start backend
cd frontend && npm run dev      # Start frontend (separate terminal)

# Before committing
cd backend && make lint && make typecheck && make test
cd frontend && npm run build

# Full app test
cd frontend && npm run tauri dev
```

---

## 📦 Bundling & Distribution

### Step 1: Bundle Python Backend (PyInstaller)

```bash
cd backend

# Install PyInstaller
uv add --dev pyinstaller

# Create single-directory bundle
uv run pyinstaller --name lethe-server \
  --onedir \
  --hidden-import uvicorn.logging \
  --hidden-import uvicorn.protocols.http \
  --hidden-import uvicorn.protocols.http.auto \
  --hidden-import uvicorn.protocols.websockets \
  --hidden-import uvicorn.protocols.websockets.auto \
  --hidden-import uvicorn.lifespan \
  --hidden-import uvicorn.lifespan.on \
  src/lethe/main.py
```

### Step 2: Copy Binary to Tauri

```bash
# Determine your target triple
rustc --print host-tuple
# Example output: x86_64-pc-windows-msvc

# Copy PyInstaller output to Tauri binaries
# Windows:
cp -r dist/lethe-server/* src-tauri/binaries/lethe-server-x86_64-pc-windows-msvc/

# Or for single-file (slower cold start):
cp dist/lethe-server/lethe-server.exe src-tauri/binaries/lethe-server-x86_64-pc-windows-msvc.exe
```

### Step 3: Build Tauri App

```bash
cd frontend
npm run tauri build
```

Output location:
- **Windows:** `src-tauri/target/release/bundle/nsis/Lethe_0.1.0_x64-setup.exe`
- **macOS:** `src-tauri/target/release/bundle/dmg/Lethe_0.1.0_aarch64.dmg`
- **Linux:** `src-tauri/target/release/bundle/appimage/Lethe_0.1.0_amd64.AppImage`

### Bundle Checklist

- [ ] FFmpeg binary included in app resources (or documented as system dependency)
- [ ] Python sidecar binary placed in `src-tauri/binaries/` with correct target triple suffix
- [ ] Icons generated: `npm run tauri icon path/to/icon.png`
- [ ] Version bumped in `src-tauri/tauri.conf.json` and `backend/pyproject.toml`
- [ ] Tested on clean machine without dev tools installed

---

## 🗂 Project Structure

```
lethe/
├── .editorconfig                 # Editor formatting rules
├── .pre-commit-config.yaml       # Git hooks (ruff, trailing whitespace)
├── README.md                     # This file
│
├── backend/                      # Python FastAPI sidecar
│   ├── pyproject.toml            # Single config: deps, ruff, mypy, pytest
│   ├── uv.lock                   # Locked dependencies
│   ├── .python-version           # Python 3.12
│   ├── Makefile                  # Dev commands
│   ├── src/lethe/
│   │   ├── main.py              # FastAPI app factory + uvicorn entry
│   │   ├── domain/              # Pure business logic (zero external deps)
│   │   │   ├── entities/        # Segment, VideoProject
│   │   │   ├── value_objects/   # TimeRange, ProcessingConfig
│   │   │   ├── ports/           # Protocol interfaces (VAD, Editor, etc.)
│   │   │   └── events/          # Domain events
│   │   ├── application/         # Use cases + services
│   │   │   ├── use_cases/       # DetectSilence, ApplyTrim, ToggleSegment
│   │   │   ├── services/        # EDLBuilderService
│   │   │   └── ports/           # ProjectRepository, JobRegistry
│   │   ├── infrastructure/      # Concrete implementations
│   │   │   ├── vad/             # AmplitudeVADDetector (ffmpeg)
│   │   │   ├── video/           # FFmpegVideoEditor
│   │   │   ├── audio/           # FFmpegAudioExtractor
│   │   │   ├── repository/      # InMemoryProjectRepository
│   │   │   ├── events/          # LogProgressEmitter
│   │   │   └── di/              # Dependency injection container
│   │   ├── presentation/        # FastAPI routes + schemas
│   │   │   ├── routes/          # health, project, detect, segment, trim
│   │   │   ├── schemas/         # Pydantic request/response models
│   │   │   └── ws/              # WebSocket progress streaming
│   │   └── shared/              # Exceptions, types
│   └── tests/
│       ├── unit/                # Domain + application tests (no I/O)
│       └── integration/         # API tests + E2E with real video
│
├── frontend/                     # React + TypeScript UI
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   └── src/
│       ├── components/          # Titlebar, Sidebar, AppShell
│       ├── pages/               # Import, Review, Export
│       ├── stores/              # Zustand (appStore, projectStore)
│       ├── services/            # apiClient, wsClient
│       ├── types/               # TypeScript DTOs
│       └── lib/                 # Utilities (cn)
│
├── src-tauri/                    # Tauri v2 Rust shell
│   ├── Cargo.toml
│   ├── tauri.conf.json          # App config, sidecar registration
│   ├── capabilities/            # Permission definitions
│   ├── binaries/                # Bundled sidecar binary (PyInstaller)
│   └── src/
│       ├── main.rs              # Desktop entry point
│       └── lib.rs               # Sidecar spawn/kill lifecycle
│
├── blueprint/                    # Architecture planning documents
└── assets/tester/                # Test video files
```

---

## 🔌 API Reference

Backend runs on `http://localhost:18420`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check → `{"status": "ok"}` |
| `POST` | `/project/load` | Load video file, returns project ID + duration |
| `POST` | `/project/{id}/detect` | Run silence detection on project |
| `GET` | `/project/{id}/segments` | Get all detected segments |
| `PATCH` | `/project/{id}/segment/{seg_id}` | Toggle segment removed state |
| `POST` | `/project/{id}/trim` | Export trimmed video |
| `WS` | `/ws/progress/{job_id}` | Real-time progress streaming |

### Example: Full Pipeline via cURL

```bash
# 1. Load video
curl -X POST http://localhost:18420/project/load \
  -H "Content-Type: application/json" \
  -d '{"video_path": "D:/videos/recording.mp4"}'
# → {"project_id": "abc-123", "duration_ms": 60000, "video_path": "..."}

# 2. Detect silence
curl -X POST http://localhost:18420/project/abc-123/detect \
  -H "Content-Type: application/json" \
  -d '{"mode": "auto", "config": {"threshold": 0.5, "min_silence_duration_ms": 500}}'

# 3. Get segments
curl http://localhost:18420/project/abc-123/segments

# 4. Export
curl -X POST http://localhost:18420/project/abc-123/trim \
  -H "Content-Type: application/json" \
  -d '{"output_path": "D:/videos/recording_trimmed.mp4"}'
```

---

## ⚙️ Configuration

### Detection Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `threshold` | `0.5` | Silence confidence threshold (0.0–1.0) |
| `min_silence_duration_ms` | `1000` | Minimum silence length to flag (ms) |
| `speech_pad_ms` | `200` | Padding around speech segments (ms) |

### Backend Environment

The backend uses `pydantic-settings`. Override via environment variables:

```bash
LETHE_PORT=18420          # Server port (default: 18420)
LETHE_HOST=0.0.0.0       # Server host
```

### Tauri Window

Edit `src-tauri/tauri.conf.json`:
```json
{
  "app": {
    "windows": [{
      "width": 1200,
      "height": 800,
      "minWidth": 900,
      "minHeight": 600,
      "decorations": false,
      "center": true
    }]
  }
}
```

---

## 🧪 Testing

```bash
cd backend

# Run all tests
make test

# Run only unit tests (fast, no FFmpeg needed)
make test-unit

# Run integration tests (requires FFmpeg + test video)
make test-integration

# Run with verbose output
uv run pytest tests/ -v -s

# Run specific test
uv run pytest tests/integration/test_e2e.py -v -s
```

### Test Structure

| Directory | What it tests | Dependencies |
|-----------|---------------|--------------|
| `tests/unit/domain/` | Entities, value objects | None |
| `tests/unit/application/` | Use cases, services | None (mocked ports) |
| `tests/integration/` | Full API + FFmpeg pipeline | FFmpeg, test video |

---

## 🔧 Troubleshooting

<details>
<summary><strong>FFmpeg not found</strong></summary>

Ensure `ffmpeg` and `ffprobe` are in your system PATH:
```bash
ffmpeg -version
ffprobe -version
```

Windows: Add FFmpeg's `bin/` folder to your PATH environment variable.

</details>

<details>
<summary><strong>Backend won't start (port in use)</strong></summary>

```bash
# Check what's using port 18420
# Windows:
netstat -ano | findstr 18420
# Linux/macOS:
lsof -i :18420
```

</details>

<details>
<summary><strong>Tauri build fails — Rust not found</strong></summary>

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
# Windows: winget install Rustlang.Rustup

# Verify
rustc --version
cargo --version
```

</details>

<details>
<summary><strong>Frontend build fails — TypeScript errors</strong></summary>

```bash
cd frontend
rm -rf node_modules
npm install
npm run build
```

</details>

<details>
<summary><strong>No silence detected in video</strong></summary>

The default threshold is -30dB. If your video has background noise, try lowering:
```json
{"config": {"threshold": 0.5, "min_silence_duration_ms": 300}}
```

Or adjust the FFmpeg silencedetect threshold in `backend/src/lethe/infrastructure/vad/amplitude_vad_detector.py`.

</details>

<details>
<summary><strong>Output video slightly larger than input</strong></summary>

When no silence is removed (entire video is speech), the output may be marginally larger due to container overhead from the concat demuxer. This is normal — no quality is lost.

</details>

---

## 🛣 Roadmap

- [ ] Waveform visualization (WaveSurfer.js)
- [ ] Video player with segment sync
- [ ] Batch processing (multiple files)
- [ ] Custom silence threshold slider in UI
- [ ] SRT/TXT transcript export
- [ ] GPU-accelerated re-encoding option
- [ ] Auto-updater (Tauri updater plugin)

---

## 📄 License

MIT © Lethe Contributors

---

<div align="center">
  <sub>Built with ❤️ using Tauri, React, Python, and FFmpeg</sub>
</div>
