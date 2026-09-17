# LinkAnalysisTool

A map-driven web application for microwave, RF, and Wi-Fi link analysis anywhere in the United States.

Give it a point, a path, or a polygon. It returns terrain and canopy line of sight, ranked candidate tower sites, backbone link budgets, signal-strength coverage, regulatory screening, and a finished report package.

## Status

Planning. No code yet. The build plan is in [`docs/BUILD_PLAN.md`](docs/BUILD_PLAN.md).

## What it does

| Run type | Input | Answers | Output |
| --- | --- | --- | --- |
| Point-to-point link | Two endpoints, heights, band, radio | Will this link close, at what availability? | Path profile, Fresnel clearance, link budget, fade margin |
| Point-to-area coverage | One site, height, band, ERP | Where can this site be heard? | Signal raster, LOS raster, coverage by land class |
| Multi-site network | AOI plus candidate sites | Which sites cover the most ground? | Site ranking, combined coverage, shadow inventory, backbone topology |
| Site discovery | AOI only | Where should towers go? | Candidates generated from terrain maxima, screened and ranked |
| Wi-Fi / campus | Building footprint or site plan | How many APs, what channels, what throughput? | AP placement, channel plan, throughput map, AFC constraints |

Every run carries a regulatory overlay: FAA Part 77 triggers, nearby licensed FCC paths, band eligibility, RF exposure boundaries, and the state and local processes that apply at that coordinate.

## Why it exists

It generalizes a hand-built siting analysis of a 4,231 acre parcel in Colbert County, Alabama, which established the method: georeferenced boundary, 3DEP lidar elevation, viewsheds at multiple tower heights against four receiver definitions, exhaustive site combination search, Fresnel clearance on every backbone link, and a delivered package of report, KMZ, GeoTIFF, CSV, and workbook.

That analysis took manual georeferencing, hand-assigned canopy heights, and one-off scripts. This tool does it from a map click, anywhere in the country.

That analysis is also the acceptance test. See [`docs/VALIDATION.md`](docs/VALIDATION.md).

## Approach

Every data source is free and national, with one optional paid exception (parcels). Propagation uses the reference implementations that regulators use, not hand-rolled models:

- **Terrain** from [USGS 3DEP](https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer), 1 m lidar where flown
- **Canopy** from [NAIP-CHM](https://zenodo.org/records/17664995) at 0.6 m across CONUS
- **Propagation** from [Py1812](https://github.com/eeveetza/Py1812), [NTIA/ITS ITM](https://its.ntia.gov/software/its-open-source-software), and [ITU-Rpy](https://github.com/inigodelportillo/ITU-Rpy)
- **Regulatory** from FCC ULS bulk data, the FAA Digital Obstacle File, and AFC/SAS provider APIs

## Build phases

| Phase | Delivers | Effort |
| --- | --- | --- |
| 0 | Terrain core: fetch, cache, profiles, viewshed, Fresnel | 2 to 3 weeks |
| 1 | Minimum web app: draw AOI, place sites, see coverage | 3 to 4 weeks |
| 2 | Propagation: real RF answers, not just geometry | 3 to 4 weeks |
| 3 | Export package: report, KMZ, GeoTIFF, workbook | 2 to 3 weeks |
| 4 | Regulatory screening | 3 to 4 weeks |
| 5 | Wi-Fi layer and refinement | 3 to 4 weeks |

Phase 0 is done when the engine reproduces the Colbert County numbers from coordinates alone.

## Planned stack

Python 3.12, FastAPI, PostGIS, Redis/RQ, rasterio, geopandas, numpy/numba, React with MapLibre GL JS. Docker Compose from day one, because GDAL dependency management is not a thing to fight by hand.

## Scope discipline

This is a link analysis and siting tool. It is not a GIS platform. Any feature that does not answer "will this link work" or "where should this go" is a candidate for deletion.

## Disclaimer

The tool screens. It does not coordinate frequencies and it does not give legal advice on siting. Prior coordination with a certified frequency coordinator and an FAA determination are still required. Coverage predictions carry a 6 to 14 dB model standard deviation: the edge of a coverage polygon is an estimate, not a line on the ground.
