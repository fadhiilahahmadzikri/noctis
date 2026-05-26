#!/usr/bin/env python3
"""Deploy Lethe backend to HuggingFace Spaces."""

import os
import sys
from pathlib import Path

try:
    from huggingface_hub import HfApi
except ImportError:
    print("pip install huggingface_hub")
    sys.exit(1)

# Config
SPACE_ID = os.environ.get("HF_SPACE_ID", "YOUR_USERNAME/lethe")
HF_TOKEN = os.environ.get("HF_TOKEN", "")

if not HF_TOKEN:
    env_file = Path(__file__).parent / "backend" / ".env"
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            if line.startswith("HF_TOKEN="):
                HF_TOKEN = line.split("=", 1)[1].strip()

if not HF_TOKEN:
    print("ERROR: Set HF_TOKEN in environment or backend/.env")
    sys.exit(1)

# Files to upload
INCLUDE = [
    "Dockerfile",
    "backend/pyproject.toml",
    "backend/uv.lock",
    "backend/src/",
    "backend/migration.sql",
]

IGNORE_PATTERNS = []
with open(Path(__file__).parent / ".huggingfaceignore") as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith("#"):
            IGNORE_PATTERNS.append(line)


def main() -> None:
    api = HfApi(token=HF_TOKEN)

    print(f"Deploying to: {SPACE_ID}")
    print(f"Files: {INCLUDE}")

    api.upload_folder(
        folder_path=str(Path(__file__).parent),
        repo_id=SPACE_ID,
        repo_type="space",
        ignore_patterns=IGNORE_PATTERNS,
    )

    print(f"\n✓ Deployed to https://huggingface.co/spaces/{SPACE_ID}")
    print("  Space will rebuild automatically.")


if __name__ == "__main__":
    main()
