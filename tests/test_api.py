import asyncio

import httpx
import pytest

from linkanalysis.api import MAX_BODY_BYTES, RUN_TTL, create_app
from linkanalysis.terrain import TerrainUnavailable


async def create(client, project):
    response = await client.post("/api/runs", json=project.model_dump())
    assert response.status_code == 202
    body = response.json()
    return body, {"Authorization": f"Bearer {body['token']}"}


async def finish(client, body, headers):
    for _ in range(100):
        response = await client.get(f"/api/runs/{body['id']}", headers=headers)
        if response.json()["state"] in {"complete", "failed", "cancelled"}:
            return response.json()
        await asyncio.sleep(0.001)
    raise AssertionError("Job did not complete")


@pytest.mark.asyncio
async def test_public_run_and_capability_isolation(project):
    app = create_app()
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        body, headers = await create(client, project)
        assert (await client.get(f"/api/runs/{body['id']}")).status_code == 404
        assert (
            await client.delete(
                f"/api/runs/{body['id']}", headers={"Authorization": "Bearer wrong"}
            )
        ).status_code == 404
        result = await finish(client, body, headers)
        assert result["state"] == "complete"
        assert result["result"]["status"] == "unverified"
        assert (await client.get("/api/health")).headers[
            "x-content-type-options"
        ] == "nosniff"


@pytest.mark.asyncio
async def test_upstream_failure_is_not_fake_terrain(project):
    class Offline:
        async def fetch(self, project):
            raise TerrainUnavailable("No elevation coverage on this path.")

    app = create_app(Offline())
    project.terrain_mode = "usgs"
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        body, headers = await create(client, project)
        output = (await finish(client, body, headers))["result"]
        assert output["profile"] is None
        assert output["status"] == "unverified"
        assert "No elevation coverage on this path." in output["warnings"]


@pytest.mark.asyncio
async def test_cancel_and_expiry(project):
    class Slow:
        async def fetch(self, project):
            await asyncio.sleep(20)

    app = create_app(Slow())
    project.terrain_mode = "usgs"
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        body, headers = await create(client, project)
        response = await client.delete(f"/api/runs/{body['id']}", headers=headers)
        assert response.json()["state"] == "cancelled"
        app.state.store.jobs[body["id"]]["created"] -= RUN_TTL + 1
        assert (
            await client.get(f"/api/runs/{body['id']}", headers=headers)
        ).status_code == 404
        await asyncio.sleep(0)


@pytest.mark.asyncio
async def test_rate_and_byte_limits(project):
    app = create_app()
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        for _ in range(6):
            await create(client, project)
        limited = await client.post("/api/runs", json=project.model_dump())
        assert limited.status_code == 429
        assert limited.headers["Retry-After"] == "60"

        async def chunks():
            yield b" " * (MAX_BODY_BYTES // 2)
            yield b" " * (MAX_BODY_BYTES // 2 + 1)

        assert (await client.post("/api/runs", content=chunks())).status_code == 413
        await asyncio.sleep(0)


@pytest.mark.asyncio
async def test_invalid_and_unknown_fields_rejected(project):
    app = create_app()
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        data = project.model_dump()
        data["source_url"] = "http://127.0.0.1/secret"
        assert (await client.post("/api/runs", json=data)).status_code == 422
        del data["source_url"]
        data["b"] = data["a"]
        assert (await client.post("/api/runs", json=data)).status_code == 422
