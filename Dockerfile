# ==============================================================================
# Lethe Backend — Dockerfile for Hugging Face Spaces (Docker SDK)
# Bundles: FFmpeg + FastAPI (uvicorn)
# ==============================================================================

FROM python:3.12-slim

ENV DEBIAN_FRONTEND=noninteractive
WORKDIR /app

# System dependencies: FFmpeg + ffprobe
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Install Python dependencies
COPY backend/pyproject.toml backend/uv.lock* ./
RUN uv sync --frozen --no-dev --no-editable 2>/dev/null \
    || uv sync --no-dev --no-editable

# Copy source
COPY backend/src/ ./src/

# HF Spaces uses port 7860
ENV PORT=7860
EXPOSE 7860

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD curl -f http://localhost:7860/health || exit 1

# Start server
CMD ["uv", "run", "uvicorn", "src.lethe.main:app", "--host", "0.0.0.0", "--port", "7860"]
