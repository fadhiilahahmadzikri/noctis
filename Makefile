SHELL := powershell.exe
.SHELLFLAGS := -NoProfile -Command

.PHONY: help dev dev-backend dev-frontend build build-sidecar build-installer test lint clean kill

help: ## Show all commands
	@Write-Output "=== noctris Build Commands ==="; Write-Output ""; Write-Output "  make dev              - Run both backend + frontend (dev mode)"; Write-Output "  make dev-backend      - Run backend only (port 18420)"; Write-Output "  make dev-frontend     - Run frontend only (Tauri dev)"; Write-Output "  make build            - Build full installer (sidecar + Tauri)"; Write-Output "  make build-sidecar    - Bundle Python backend as .exe (PyInstaller)"; Write-Output "  make build-installer  - Build Tauri installer (.exe)"; Write-Output "  make test             - Run all backend tests"; Write-Output "  make lint             - Lint + typecheck backend"; Write-Output "  make clean            - Remove build artifacts"; Write-Output "  make kill             - Kill any running noctris processes"

# ==============================================================================
# Development
# ==============================================================================

dev: ## Run backend + frontend together (2 processes)
	@Write-Output "Starting backend..."; Start-Process -NoNewWindow powershell -ArgumentList "-Command","cd D:\noctis\backend; uv run python -m noctris.main"; Start-Sleep 2; Write-Output "Starting frontend..."; cd frontend; npm run tauri dev

dev-backend: ## Run backend only (hot-reload)
	cd backend; uv run uvicorn src.noctris.main:app --host 127.0.0.1 --port 18420 --reload

dev-frontend: ## Run frontend only (Tauri dev, needs backend running)
	cd frontend; npm run tauri dev

# ==============================================================================
# Build (Production)
# ==============================================================================

build: build-sidecar build-installer ## Full production build

build-sidecar: ## Bundle Python backend as noctris-server.exe
	cd backend; uv run pyinstaller --name noctris-server --onefile --hidden-import uvicorn.logging --hidden-import uvicorn.protocols.http --hidden-import uvicorn.protocols.http.auto --hidden-import uvicorn.protocols.websockets --hidden-import uvicorn.protocols.websockets.auto --hidden-import uvicorn.lifespan --hidden-import uvicorn.lifespan.on --hidden-import noctris.presentation.routes.health --hidden-import noctris.presentation.routes.project --hidden-import noctris.presentation.routes.detect --hidden-import noctris.presentation.routes.segment --hidden-import noctris.presentation.routes.trim --hidden-import noctris.presentation.routes.waveform --hidden-import noctris.presentation.routes.thumbnails --hidden-import noctris.presentation.routes.transcription --hidden-import noctris.presentation.routes.settings --hidden-import noctris.presentation.ws.progress --hidden-import noctris.infrastructure.di.container --hidden-import noctris.infrastructure.vad.amplitude_vad_detector --hidden-import noctris.infrastructure.video.ffmpeg_video_editor --hidden-import noctris.infrastructure.audio.ffmpeg_audio_extractor --hidden-import noctris.infrastructure.repository.in_memory_project_repo --hidden-import noctris.infrastructure.events.log_progress_emitter --hidden-import noctris.infrastructure.transcription --hidden-import platformdirs src/noctris/main.py; Copy-Item dist\noctris-server.exe ..\frontend\src-tauri\binaries\noctris-server-x86_64-pc-windows-msvc.exe -Force

build-installer: ## Build Tauri installer (requires build-sidecar first)
	cd frontend; npx tauri build

# ==============================================================================
# Quality
# ==============================================================================

test: ## Run all backend tests
	cd backend; uv run pytest tests/ -q

lint: ## Lint + typecheck
	cd backend; uv run ruff check src/; uv run mypy src/

# ==============================================================================
# Utilities
# ==============================================================================

kill: ## Kill any running noctris processes
	Get-Process -Name "noctris-server","noctris" -ErrorAction SilentlyContinue | Stop-Process -Force; Write-Output "Done."

clean: ## Remove build artifacts
	Remove-Item -Recurse -Force -ErrorAction SilentlyContinue backend/dist, backend/build, backend/*.spec, frontend/dist, frontend/src-tauri/target; Write-Output "Cleaned."
