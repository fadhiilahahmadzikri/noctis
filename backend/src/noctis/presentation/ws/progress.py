"""WebSocket endpoint for progress streaming."""

from fastapi import APIRouter, WebSocket

router = APIRouter(tags=["ws"])


@router.websocket("/ws/progress/{job_id}")
async def progress_stream(websocket: WebSocket, job_id: str) -> None:
    await websocket.accept()
    await websocket.send_json({"error": f"Job {job_id} not found"})
    await websocket.close()
