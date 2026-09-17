import json
from urllib.parse import parse_qs

import httpx
import pytest

from linkanalysis.terrain import TerrainProvider, TerrainUnavailable


@pytest.mark.asyncio
@pytest.mark.parametrize("problem", [None, "nodata", "missing", "datum"])
async def test_provider_rejects_incomplete_or_incompatible_data(
    project, monkeypatch, problem
):
    calls = []

    def handle(request):
        calls.append(request.url.path)
        if request.url.path.endswith("query"):
            return httpx.Response(200, json={"features": []})
        query = parse_qs(request.content.decode())
        points = json.loads(query["geometry"][0])["points"]
        samples = [
            {
                "locationId": i,
                "value": "100",
                "rasterId": 1,
                "attributes": {"VerticalDatum": "NAVD88", "title": "USGS 1 Meter test"},
            }
            for i in range(len(points))
        ]
        if problem == "nodata":
            samples[1]["value"] = "NoData"
        if problem == "missing":
            samples.pop()
        if problem == "datum":
            samples[1]["rasterId"] = 2
            samples[1]["attributes"]["VerticalDatum"] = "Unknown"
        return httpx.Response(200, json={"samples": samples})

    original = httpx.AsyncClient
    monkeypatch.setattr(
        httpx,
        "AsyncClient",
        lambda **kwargs: original(transport=httpx.MockTransport(handle), **kwargs),
    )
    provider = TerrainProvider()
    if problem:
        with pytest.raises(TerrainUnavailable):
            await provider.fetch(project)
    else:
        result = await provider.fetch(project)
        assert len(result["samples"]) == 262
        assert calls[0].endswith("query")
        assert len(calls) == 3
        assert result["sources"][0]["sample_count"] == 262
        assert await provider.fetch(project) is result
        assert len(calls) == 3  # Cached request never repeats upstream traffic.


@pytest.mark.asyncio
async def test_retry_on_service_overload(project, monkeypatch):
    attempts = []

    def handle(request):
        attempts.append(request.url.path)
        if len(attempts) < 3:
            return httpx.Response(503)
        return httpx.Response(200, json={"samples": []})

    async def no_sleep(_):
        pass

    monkeypatch.setattr("linkanalysis.terrain.asyncio.sleep", no_sleep)
    async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as client:
        response = await TerrainProvider().request(
            client, "https://example.test/getSamples", {}
        )
    assert response == {"samples": []}
    assert len(attempts) == 3
