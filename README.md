# Link Budget

A public, independently hosted radio link budget workbench for **[linkbudget.st-dba.com](https://linkbudget.st-dba.com)**. It runs from this GitHub repository on Render, with no ChatGPT account or hosting dependency.

## Implemented in 1.0

- Place two sites on a map, drag markers, or enter WGS84 coordinates.
- Configure both radios independently: power, antenna gain, feeder losses, sensitivity and noise figure.
- Calculate ellipsoidal distance, true bearings, free-space loss, both directional received powers, margins and thermal-noise baselines.
- Retrieve live USGS 3DEP terrain, recording actual product names, acquisition dates, datum and resolution metadata.
- Plot effective-Earth terrain, the antenna ray, first Fresnel zone and selected clearance boundary. Add known obstacles and a uniform clutter envelope.
- Identify blocked paths and the controlling clearance point, including the equal antenna-height increase needed to reach the sampled clearance boundary.
- Save up to 20 projects in the browser. Import/export versioned project JSON, full calculation JSON, budget/profile CSV and a printable report for PDF.
- Use metric or imperial display units, keyboard inputs and a responsive mobile layout.

The budget is a **free-space reference calculation**, with explicit user-entered additional losses. It does not automatically model diffraction, foliage attenuation, rain/gas losses, interference, annual availability, area coverage, network optimization, Wi-Fi throughput or regulatory approval. These remain validation-gated stages in the [build plan](docs/BUILD_PLAN.md). Favorable margin on a blocked path is never presented as a successful link.

The example's radio settings are illustrative. Replace receiver sensitivity with the equipment's documented threshold at the selected bandwidth, modulation and required error performance.

## Run locally

Requires Python 3.12 and Node.js 22.12 or newer.

```sh
python -m venv .venv
# Activate .venv for your shell, then:
python -m pip install -r requirements-lock.txt -r requirements-dev.txt
npm --prefix web ci
npm --prefix web run build
python -m uvicorn linkanalysis.api:app --host 127.0.0.1 --port 8000
```

Open `http://127.0.0.1:8000`. For frontend development, run `npm --prefix web run dev` in a second terminal; Vite proxies `/api` to port 8000.

```sh
python -m pytest
ruff check linkanalysis tests/test_engine.py tests/test_api.py tests/test_terrain.py tests/conftest.py
npm --prefix web test
npm --prefix web run build
```

`docker compose up --build` runs the production container on localhost. See [deployment and recovery](docs/DEPLOYMENT.md). CI checks the engine, API, data adapter, imports, frontend build and actual Docker image.

## Limits and privacy

Paths: 10 m to 200 km. Frequency: 0.03 to 100 GHz for the free-space reference. USGS sampling: nominal 10 m spacing, capped at 2,001 samples. Longer paths have larger gaps. Native DEM resolution may be coarser than the sampling interval.

Anonymous runs: 6 requests/minute per client IP, 30/minute globally, 2 active workers and 16 admitted jobs. Inputs: 512 KB, 30 obstacles and 2,001 imported samples. Live terrain has a 90-second deadline; queue wait is capped at 120 seconds.

Saved projects live in browser storage. Export JSON for a durable backup. Server results use separate random job IDs and bearer capabilities, are never publicly listed, and expire after 15 minutes or earlier under bounded retention. Terrain cache entries last up to four hours, capped at 32 entries. A restart clears jobs/cache; browser projects survive and can be recalculated. No database, user tracking or paid terrain API is required.

Calculations send inputs to this service and live terrain coordinates to USGS. The browser requests OpenStreetMap tiles under its [tile policy](https://operations.osmfoundation.org/policies/tiles/). Map availability is best effort; coordinate entry remains usable if tiles fail. Do not submit sensitive site data to an anonymous public service.

## Engineering record

- [Current build plan](docs/BUILD_PLAN.md)
- [Original-plan review](docs/PLAN_REVIEW.md)
- [Validation and historical fixture reconciliation](docs/VALIDATION.md)
- [Architecture decision](docs/ARCHITECTURE.md)
- [Deployment and recovery](docs/DEPLOYMENT.md)

Original planning and validation narratives are preserved in `docs/ORIGINAL_BUILD_PLAN.md` and `docs/HISTORICAL_VALIDATION.md`. Historical expectations were not changed to force acceptance. The original 80.7% coverage and 155 ft clearance claims are not validated by the original 12 fixture consistency tests.
