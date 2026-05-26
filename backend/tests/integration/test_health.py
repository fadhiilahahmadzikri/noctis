"""Integration test for health endpoint."""

import pytest
from httpx import ASGITransport, AsyncClient

from lethe.main import app


@pytest.fixture
async def client() -> AsyncClient:  # type: ignore[misc]
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c  # type: ignore[misc]


async def test_health_returns_ok(client: AsyncClient) -> None:
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


async def test_project_load_returns_501(client: AsyncClient) -> None:
    response = await client.post("/project/load", json={"video_path": "/test.mp4"})
    assert response.status_code == 501
