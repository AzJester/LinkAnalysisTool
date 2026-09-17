# ADR 001: bounded public point-to-point release

Accepted 17 September 2026.

The original plan describes a large geospatial platform. Release 1.0 completes the bounded two-endpoint workflow: small deterministic arithmetic plus asynchronous USGS I/O. It does not execute native propagation wrappers, raster viewsheds or optimization.

Use one non-root Docker container: React/MapLibre/Recharts assets and same-origin FastAPI under /api. Render terminates HTTPS. One Uvicorn process owns two asynchronous analysis slots, a bounded queue, expiring capability-protected results and a 32-entry terrain cache. Only fixed official provider URLs are fetched. Bytes are bounded before parsing; Pydantic validates finite values, dimensions and unknown fields.

This replaces mandatory PostGIS, Redis and a separate worker for 1.0. Those services would add operational cost without improving the bounded calculation. Introduce them before durable account-based projects, heavy raster jobs, native crash-prone libraries or horizontal scaling. Such work must not be added to these event-loop workers.

Projects persist in browser storage and portable JSON. Server runs are temporary and never publicly enumerable. Independent random bearer capabilities authorize access. Results expire after 15 minutes on a 30-second cleanup cycle, or earlier at the 40-record cap. The 32-entry terrain cache expires after four hours and is swept. Restarts clear temporary state. Full result JSON preserves source evidence; private durable cloud storage is not claimed.

The launch uses Render's free 512 MB, shared 0.1 CPU web-service size. It avoids a new compute subscription but has idle spin-down, cold starts, shared workspace allowances and no uptime guarantee. Local memory benchmarks fit; live production sampling must pass too. Sustained traffic or exhausted shared free hours requires an explicit hosting decision, not automatic billable scaling.

Custom radios ship first. Vendor presets wait until every entry includes its actual data sheet, bandwidth, modulation and error criterion. Statistical propagation, reliability and regulatory modules retain the build plan's validation gates and remain visibly unavailable.
