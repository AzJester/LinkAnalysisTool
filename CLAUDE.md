# Working in this repository

Guidance for any coding agent. Read `docs/BUILD_PLAN.md`, `docs/ARCHITECTURE.md` and `docs/VALIDATION.md` before changing calculations or architecture.

- Public deployment belongs to the user's st-dba.com domain. No ChatGPT hosting or account is required.
- Store physical quantities in named SI units; distinguish logarithmic dB, dBm and dBi. Imperial conversion belongs at display boundaries.
- Use GeographicLib for WGS84 paths/bearings; use a suitable projection or geodesic area for future area accounting.
- Read vertical datum from metadata. Do not assume every 3DEP product is NAVD88. Never mix incompatible or unknown references for clearance.
- The initial engine implements standard Friis free-space loss and effective-Earth/Fresnel geometry. It is not P.1812, ITM or P.530. Future statistical propagation adapters must use versioned, validated implementations within their validity limits.
- Name each loss and count it once. Clutter height is a geometric envelope, not attenuation. Positive free-space margin cannot make a blocked path a working-link prediction.
- Query the terrain index before new live sampling. Batch getSamples, never loop identify. Bound traffic, retry transient failures and record actual products. Missing data stays unavailable.
- Do not call margin annual availability or geometry area coverage. Regulatory approval is not provided. Do not invent confidence intervals.
- Preserve historical fixtures. The 80.7% coverage, 155 ft clearance and exact 19,430-cell claims remain unresolved; they cannot be build gates without the missing inputs and conventions.
- Run pytest, focused Ruff, frontend tests and a production build for affected changes. CI builds and smoke-tests Docker.
- Enforce anonymous input, queue, runtime and retention limits. Never place job capabilities in URLs, logs or public listings.
- Keep one Uvicorn process for the in-memory job store. Introduce durable queues and isolated processes before native propagation, heavy area analysis or horizontal scaling.

Current code: `linkanalysis/models.py` input contract, `engine.py` physics, `terrain.py` USGS adapter, `api.py` bounded jobs; `web/src/` React, MapLibre and Recharts; `tests/` offline scientific/service checks. Docker and `render.yaml` define deployment.
