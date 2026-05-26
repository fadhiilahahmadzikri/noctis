"""Shared database path — avoids circular imports."""

from pathlib import Path
import platformdirs

DATA_DIR = Path(platformdirs.user_data_dir("Noctis", ensure_exists=True))
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "noctis.db"
