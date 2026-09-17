# Working in this repository

Guidance for Claude Code and any other agent working on LinkAnalysisTool.

## What this is

A US-wide microwave, RF, and Wi-Fi link analysis and siting tool. Read [`docs/BUILD_PLAN.md`](docs/BUILD_PLAN.md) before making architectural decisions. Read [`docs/VALIDATION.md`](docs/VALIDATION.md) before touching the terrain or coverage engine.

## Non-negotiables

**Units.** Store SI internally: meters, kilometers, hertz, watts, degrees. Convert only at the display and report boundary. Every function that takes a distance or a frequency names its unit in the parameter name (`distance_km`, `freq_ghz`, `height_m`). Mixing feet into the engine is how this produces a confidently wrong answer.

**Geodesy.** Use `geographiclib` for distance and azimuth on the WGS84 ellipsoid. Do not use spherical great-circle approximations. Work in a local projected CRS (UTM zone selected from the AOI centroid, or local azimuthal equidistant) for anything involving area or raster cell geometry, never in EPSG:4326 or Web Mercator.

**Vertical datums.** 3DEP is NAVD88 orthometric. GPS reports ellipsoidal height. Apply the appropriate NGS geoid model before mixing them. Never assume they are interchangeable.

**Do not write propagation models from scratch.** Use the reference implementations named in the build plan. They are the code regulators use and they have published validation datasets. A hand-rolled path loss model is a liability.

**Do not claim area coverage above 6 GHz.** P.1812 stops at 6 GHz, ITM at 20 GHz. Above that, produce deterministic LOS geometry and a P.530 link design, and say so in the output.

## Validation is a contract

The Colbert County acceptance case in `docs/VALIDATION.md` is the regression fixture. Its expected values are in `tests/fixtures/waterfall_valley/`. Any change to terrain sampling, viewshed, or coverage accounting runs against it. Drift from 80.7 % network coverage or 155 ft minimum clearance on the S3-S4 link fails the build. Do not adjust the expected values to make a test pass without a written reason in the commit message.

## Data source rules

- Query the 3DEP elevation index before sampling, cache the answer with the project, and record which product was used. Never silently mix 1 m and 10 m data across one AOI.
- Use `getSamples` for path profiles, `exportImage` for area grids. Never loop `identify`.
- Request rasters in the analysis projection via `imageSR`, not Web Mercator.
- Throttle external requests, back off on 429 and 503, cache aggressively. These are free government services and should be treated as a shared resource.
- Every export records source versions and dates: 3DEP product and vintage, canopy model version, land cover year, ULS refresh date, FAA DOF cycle.

## Output honesty

The tool must never present a prediction as more certain than it is:

- Coverage polygons carry a confidence level, not a hard edge. The propagation model standard deviation is 6 to 14 dB.
- Geometric line of sight is labeled as geometric line of sight, not as coverage.
- Screening is labeled as screening. Frequency coordination and FAA determinations still require the actual processes.
- Every report prints its error budget.

## Code layout

```
linkanalysis/
  core/        geodesy, projections, units
  data/        source fetchers and the cache
  terrain/     sampling, profiles, viewshed, HAAT
  propagation/ model wrappers, link budgets, interference
  wifi/        802.11 layer
  regulatory/  ULS, FAA, AFC, exposure, jurisdiction
  optimize/    candidate generation, set cover
  report/      templates and export builders
api/           FastAPI app
web/           React front end
tests/         unit tests and fixtures
docs/          plan and reference notes
```

Keep `propagation/` wrappers isolated. The ITU reference implementations carry ITU terms rather than OSI licenses, and that boundary should stay clean.

## Practical notes

- Workers run as separate processes. Propagation libraries are C/C++ underneath and will segfault on degenerate input; one bad path profile should fail a job, not the service.
- Viewshed is the hot path. Profile before optimizing, then use numba on the inner loop.
- Build the engine before the UI. A library with a CLI driver is testable in a way a map interface is not.

## Scope

This does link analysis and siting. It is not a GIS platform. Push back on features that do not answer "will this link work" or "where should this go".
