# Lethe

Desktop application for removing filler words and silence from video recordings.

## Architecture

- **Frontend**: Tauri v2 + React + TypeScript + shadcn/ui (black noir theme)
- **Backend**: Python FastAPI sidecar (Clean Architecture)
- **Shell**: Rust (Tauri v2 process lifecycle)

## Project Structure

```
frontend/     → React UI (Vite + Tailwind CSS + shadcn/ui)
src-tauri/    → Tauri v2 Rust shell (sidecar management)
backend/      → Python FastAPI server (Clean Architecture)
blueprint/    → Architecture planning documents
```

## Development

```bash
# Backend
cd backend && uv sync && make test

# Frontend
cd frontend && npm install && npm run dev

# Full app (Tauri dev mode)
cd frontend && npm run tauri dev
```
