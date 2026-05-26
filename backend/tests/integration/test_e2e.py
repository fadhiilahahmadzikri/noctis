"""End-to-end test: complete pipeline with assets/tester/tester.mkv.

Tests the full user journey:
1. Load video file
2. Run silence detection
3. Verify segments are created
4. Toggle a segment (manual edit)
5. Export trimmed video
6. Verify output is valid
"""

import os
import tempfile
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from lethe.main import app

TESTER_VIDEO = str(Path(__file__).resolve().parents[3] / "assets" / "tester" / "tester.mkv")


@pytest.fixture
async def client() -> AsyncClient:  # type: ignore[misc]
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c  # type: ignore[misc]


@pytest.mark.skipif(not os.path.exists(TESTER_VIDEO), reason="tester.mkv not found")
async def test_e2e_tester_mkv(client: AsyncClient) -> None:
    """Full end-to-end test with real video file."""
    print("\n=== Lethe E2E Test: tester.mkv ===")

    # --- Step 1: Health check ---
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"
    print("[1/6] Health check: OK")

    # --- Step 2: Load video ---
    resp = await client.post("/project/load", json={"video_path": TESTER_VIDEO})
    assert resp.status_code == 200
    project = resp.json()
    project_id = project["project_id"]
    assert project["duration_ms"] > 0
    duration_s = project["duration_ms"] / 1000
    print(f"[2/6] Loaded: {duration_s:.1f}s video")

    # --- Step 3: Detect silence ---
    resp = await client.post(
        f"/project/{project_id}/detect",
        json={
            "mode": "auto",
            "config": {
                "threshold": 0.5,
                "min_silence_duration_ms": 300,
                "speech_pad_ms": 100,
            },
        },
    )
    assert resp.status_code == 200
    print(f"[3/6] Detection complete: {resp.json()['status']}")

    # --- Step 4: Get and verify segments ---
    resp = await client.get(f"/project/{project_id}/segments")
    assert resp.status_code == 200
    segments = resp.json()["segments"]
    assert len(segments) >= 1, "Expected at least 1 segment"

    speech_segs = [s for s in segments if s["type"] == "speech"]
    silence_segs = [s for s in segments if s["type"] == "silence"]
    print(f"[4/6] Segments: {len(speech_segs)} speech, {len(silence_segs)} silence")

    # --- Step 5: Toggle first segment (simulate manual edit) ---
    first_seg = segments[0]
    resp = await client.patch(
        f"/project/{project_id}/segment/{first_seg['id']}",
        json={"is_removed": not first_seg["is_removed"]},
    )
    assert resp.status_code == 200
    toggled = resp.json()
    assert toggled["is_removed"] != first_seg["is_removed"]

    # Toggle back to restore original state for trim
    resp = await client.patch(
        f"/project/{project_id}/segment/{first_seg['id']}",
        json={"is_removed": first_seg["is_removed"]},
    )
    assert resp.status_code == 200
    print("[5/6] Toggle segment: OK (toggled and restored)")

    # --- Step 6: Export trimmed video ---
    output_path = str(Path(tempfile.gettempdir()) / "lethe_e2e_output.mkv")
    # Clean up any previous run
    Path(output_path).unlink(missing_ok=True)

    resp = await client.post(
        f"/project/{project_id}/trim",
        json={"output_path": output_path},
    )
    assert resp.status_code == 200, f"Trim failed: {resp.text}"

    # Verify output
    assert Path(output_path).exists(), "Output file not created"
    output_size = Path(output_path).stat().st_size
    assert output_size > 0, "Output file is empty"

    input_size = Path(TESTER_VIDEO).stat().st_size
    print(f"[6/6] Export: {output_size:,} bytes (input: {input_size:,} bytes)")

    # Verify output is playable (ffprobe can read it)
    import subprocess
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", output_path],
        capture_output=True, text=True,
    )
    output_duration = float(probe.stdout.strip())
    assert output_duration > 0, "Output video has no duration"
    print(f"      Output duration: {output_duration:.1f}s")

    # Cleanup
    Path(output_path).unlink(missing_ok=True)

    print("\n=== E2E TEST PASSED ===")
