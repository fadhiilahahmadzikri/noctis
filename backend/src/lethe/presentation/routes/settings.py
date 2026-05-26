"""Settings endpoint — store/retrieve user preferences in local SQLite."""

import sqlite3

from fastapi import APIRouter
from pydantic import BaseModel

from lethe.main import DB_PATH

router = APIRouter(prefix="/settings", tags=["settings"])


class SettingRequest(BaseModel):
    key: str
    value: str


class SettingsResponse(BaseModel):
    groq_api_key: str = ""


@router.get("", response_model=SettingsResponse)
async def get_settings() -> SettingsResponse:
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)")
    rows = conn.execute("SELECT key, value FROM settings").fetchall()
    conn.close()
    data = {k: v for k, v in rows}
    # Mask API key for display
    key = data.get("groq_api_key", "")
    masked = f"{key[:8]}...{key[-4:]}" if len(key) > 12 else key
    return SettingsResponse(groq_api_key=masked)


@router.post("")
async def save_setting(request: SettingRequest) -> dict:
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)")
    conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (request.key, request.value))
    conn.commit()
    conn.close()
    return {"ok": True}
