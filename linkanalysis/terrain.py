"""Bounded USGS 3DEP service adapter. No synthetic elevation fallback."""

import asyncio
import hashlib
import json
import math
import time
from collections import OrderedDict
from datetime import datetime, timezone

import httpx

from .engine import geometry, path_coordinates
from .models import Project

SAMPLES_URL = "https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/getSamples"
INDEX_URL = "https://index.nationalmap.gov/arcgis/rest/services/3DEPElevationIndex/MapServer/18/query"
CACHE_TTL_SECONDS = 14400
MAX_SAMPLES = 2001


class TerrainUnavailable(ValueError):
    pass


class TerrainProvider:
    def __init__(self):
        self.cache = OrderedDict()
        self.upstream = asyncio.Semaphore(2)

    async def request(self, client, url, data):
        for attempt in range(3):
            async with self.upstream:
                response = await client.post(url, data=data)
            if response.status_code in (429, 503) and attempt < 2:
                await asyncio.sleep(0.5 * 2**attempt)
                continue
            response.raise_for_status()
            content = response.json()
            if "error" in content:
                raise TerrainUnavailable(
                    "USGS could not supply this terrain request. Try again or import a measured profile."
                )
            return content
        raise TerrainUnavailable("USGS is busy. Try again later.")

    async def fetch(self, project: Project) -> dict:
        distance_m = geometry(project)["distance_m"]
        count = min(MAX_SAMPLES, max(3, math.ceil(distance_m / 10) + 1))
        points = path_coordinates(project, count)
        key = hashlib.sha256(
            json.dumps({"adapter": 1, "points": points}, sort_keys=True).encode()
        ).hexdigest()
        cached = self.cache.get(key)
        if cached and time.monotonic() - cached[0] < CACHE_TTL_SECONDS:
            self.cache.move_to_end(key)
            return cached[1]
        warnings = []
        sources = {}
        samples = []
        index = {
            "url": INDEX_URL,
            "layer": "1 Meter",
            "status": "unavailable",
            "projects": [],
        }
        async with httpx.AsyncClient(
            timeout=20,
            headers={
                "User-Agent": "LinkAnalysisTool/1.0 (+https://github.com/AzJester/LinkAnalysisTool)"
            },
        ) as client:
            # The index is advisory coverage metadata. getSamples metadata identifies
            # each product actually selected by the multi-resolution image service.
            stride = max(1, (len(points) - 1) // 20)
            path = points[::stride]
            if path[-1] != points[-1]:
                path.append(points[-1])
            try:
                indexed = await self.request(
                    client,
                    INDEX_URL,
                    {
                        "f": "json",
                        "geometryType": "esriGeometryPolyline",
                        "inSR": "4326",
                        "geometry": json.dumps(
                            {
                                "paths": [
                                    [[p["longitude"], p["latitude"]] for p in path]
                                ],
                                "spatialReference": {"wkid": 4326},
                            }
                        ),
                        "spatialRel": "esriSpatialRelIntersects",
                        "returnGeometry": "false",
                        "outFields": "project,project_id,pub_date,product_link",
                        "resultRecordCount": "100",
                    },
                )
                index.update(
                    status="checked",
                    projects=[f["attributes"] for f in indexed.get("features", [])],
                    truncated=indexed.get("exceededTransferLimit", False),
                )
            except (httpx.HTTPError, ValueError, KeyError):
                warnings.append(
                    "The 1 m coverage index was unavailable. Product metadata was obtained directly from every elevation sample."
                )
            for offset in range(0, len(points), 250):
                chunk = points[offset : offset + 250]
                response = await self.request(
                    client,
                    SAMPLES_URL,
                    {
                        "f": "json",
                        "geometryType": "esriGeometryMultipoint",
                        "geometry": json.dumps(
                            {
                                "points": [
                                    [p["longitude"], p["latitude"]] for p in chunk
                                ],
                                "spatialReference": {"wkid": 4326},
                            }
                        ),
                        "returnFirstValueOnly": "true",
                        "interpolation": "RSP_BilinearInterpolation",
                        "outFields": "*",
                    },
                )
                returned = {
                    int(s["locationId"]): s for s in response.get("samples", [])
                }
                if len(returned) != len(chunk) or set(returned) != set(
                    range(len(chunk))
                ):
                    raise TerrainUnavailable(
                        "USGS has missing elevation samples on this path. Clearance is unavailable; import a complete profile to continue."
                    )
                for i, point in enumerate(chunk):
                    sample = returned[i]
                    try:
                        elevation = float(sample["value"])
                    except (KeyError, TypeError, ValueError) as error:
                        raise TerrainUnavailable(
                            "USGS returned nodata on this path. Clearance is unavailable."
                        ) from error
                    if not math.isfinite(elevation) or not -500 <= elevation <= 9000:
                        raise TerrainUnavailable(
                            "USGS returned invalid elevation values. Clearance is unavailable."
                        )
                    attrs = sample.get("attributes", {})
                    product_id = str(sample.get("rasterId", "unknown"))
                    datum = attrs.get("VerticalDatum") or "Unknown"
                    source = sources.setdefault(
                        product_id,
                        {
                            "id": product_id,
                            "name": attrs.get("title")
                            or attrs.get("Name")
                            or "USGS 3DEP unnamed product",
                            "product": attrs.get("ProductName", "USGS 3DEP"),
                            "vertical_datum": datum,
                            "acquisition_start": str(
                                attrs.get("StartDate") or "Unknown"
                            ),
                            "acquisition_end": str(attrs.get("EndDate") or "Unknown"),
                            "publication_date": str(attrs.get("pubdate") or "Unknown"),
                            "url": attrs.get("URL")
                            if str(attrs.get("URL", "")).startswith("https://")
                            else None,
                            "native_resolution_service_value": sample.get("resolution"),
                            "resolution_note": "Native resolution is identified in the product title. The raw service value may be in degrees, not meters.",
                            "sample_count": 0,
                        },
                    )
                    source["sample_count"] += 1
                    samples.append(
                        {**point, "elevation_m": elevation, "source_id": product_id}
                    )
        datums = {s["vertical_datum"] for s in sources.values()}
        if len(datums) != 1 or "Unknown" in datums:
            raise TerrainUnavailable(
                "The terrain products have mixed or unknown vertical datums. Clearance requires a profile in one documented vertical reference."
            )
        if len(sources) > 1:
            warnings.append(
                f"This path uses {len(sources)} terrain products. Review their resolution and acquisition dates below."
            )
        spacing = distance_m / (count - 1)
        warnings.append(
            f"Terrain was sampled with bilinear interpolation every {spacing:.1f} m. This spacing is not a statement of DEM accuracy or native resolution."
        )
        if spacing > 10.01:
            warnings.append(
                "The 2,001-sample limit increases spacing on long paths. Narrow ridges and obstructions may be missed."
            )
        result = {
            "samples": samples,
            "sources": list(sources.values()),
            "index": index,
            "retrieved_at": datetime.now(timezone.utc).isoformat(),
            "warnings": warnings,
            "profile_sha256": hashlib.sha256(
                json.dumps(samples, sort_keys=True).encode()
            ).hexdigest(),
        }
        self.cache[key] = (time.monotonic(), result)
        self.cache.move_to_end(key)
        while len(self.cache) > 32:
            self.cache.popitem(last=False)
        return result
