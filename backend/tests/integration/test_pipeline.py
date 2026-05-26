"""Integration test for the full pipeline via API routes."""

import os
import tempfile
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from noctis.main import app

TESTER_VIDEO = str(Path(__file__).resolve().parents[3] / "assets" / "tester" / "tester.mkv")


@pytest.fixture
async def client() -> AsyncClient:  # type: ignore[misc]
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c  # type: ignore[misc]


@pytest.mark.skipif(not os.path.exists(TESTER_VIDEO), reason="tester.mkv not found")
async def test_full_pipeline(client: AsyncClient) -> None:
    """Test: load → detect → get segments → trim. Verifies complete pipeline works."""
    # 1. Load project
    resp = await client.post("/project/load", json={"video_path": TESTER_VIDEO})
    assert resp.status_code == 200, resp.text
    data = resp.json()
    project_id = data["project_id"]
    assert data["duration_ms"] > 0
    print(f"  Loaded: duration={data['duration_ms']}ms")

    # 2. Detect silence (use lower threshold to find more silence)
    resp = await client.post(
        f"/project/{project_id}/detect",
        json={"mode": "auto", "config": {"threshold": 0.5, "min_silence_duration_ms": 300, "speech_pad_ms": 100}},
    )
    assert resp.status_code == 200, resp.text
    print(f"  Detection: {resp.json()['status']}")

    # 3. Get segments
    resp = await client.get(f"/project/{project_id}/segments")
    assert resp.status_code == 200, resp.text
    segments = resp.json()["segments"]
    assert len(segments) > 0
    speech_count = sum(1 for s in segments if s["type"] == "speech")
    silence_count = sum(1 for s in segments if s["type"] == "silence")
    print(f"  Segments: {len(segments)} total ({speech_count} speech, {silence_count} silence)")

    # 4. Trim
    output_path = str(Path(tempfile.gettempdir()) / "Noctis_test_output.mkv")
    resp = await client.post(
        f"/project/{project_id}/trim",
        json={"output_path": output_path},
    )
    assert resp.status_code == 200, resp.text

    # Verify output file exists and is valid
    assert Path(output_path).exists(), "Output file was not created"
    output_size = Path(output_path).stat().st_size
    assert output_size > 0, "Output file is empty"
    print(f"  Output: {output_size} bytes at {output_path}")

    # If silence was detected and removed, output should be smaller
    if silence_count > 0:
        input_size = Path(TESTER_VIDEO).stat().st_size
        assert output_size < input_size, "Output should be smaller when silence is removed"
        print(f"  Reduction: {input_size - output_size} bytes saved")

    # Cleanup
    Path(output_path).unlink(missing_ok=True)
    print("  [OK] Pipeline complete")
