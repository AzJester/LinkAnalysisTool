"""Same-origin public API with bounded, capability-protected ephemeral runs."""

import asyncio
import hashlib
import logging
import os
import secrets
import time
from collections import OrderedDict, deque
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from . import __version__
from .engine import calculate, geometry
from .models import Project
from .terrain import TerrainProvider, TerrainUnavailable

logger = logging.getLogger("linkanalysis")
MAX_BODY_BYTES = 512_000
RUN_TTL = 900
MAX_ACTIVE = 16
MAX_RETAINED = 40


class BodyLimit:
    """Count actual bytes, including chunked requests, before parsing JSON."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope.get("method") not in {
            "POST",
            "PUT",
            "PATCH",
        }:
            return await self.app(scope, receive, send)
        messages, total = [], 0
        while True:
            message = await receive()
            total += len(message.get("body", b""))
            if total > MAX_BODY_BYTES:
                response = JSONResponse(
                    {"detail": "Request exceeds the 512 KB limit."}, status_code=413
                )
                return await response(scope, receive, send)
            messages.append(message)
            if message["type"] == "http.disconnect" or not message.get(
                "more_body", False
            ):
                break

        async def replay():
            if messages:
                return messages.pop(0)
            return await receive()

        return await self.app(scope, replay, send)


class RunStore:
    def __init__(self, provider=None):
        self.provider = provider or TerrainProvider()
        self.jobs = OrderedDict()
        self.slots = asyncio.Semaphore(2)
        self.rate = OrderedDict()
        self.global_rate = deque()

    def clean(self):
        now = time.monotonic()
        for job_id, job in list(self.jobs.items()):
            if now - job["created"] > RUN_TTL:
                job["task"].cancel()
                del self.jobs[job_id]
        while len(self.jobs) >= MAX_RETAINED:
            removable = next(
                (
                    i
                    for i, j in self.jobs.items()
                    if j["state"] in {"complete", "failed", "cancelled"}
                ),
                None,
            )
            if removable is None:
                break
            del self.jobs[removable]

    def admission(self, visitor: str):
        self.clean()
        now = time.monotonic()
        self.global_rate = deque(t for t in self.global_rate if now - t < 60)
        recent = deque(t for t in self.rate.get(visitor, []) if now - t < 60)
        if len(recent) >= 6 or len(self.global_rate) >= 30:
            raise HTTPException(
                429,
                "Analysis request limit reached. Please wait one minute.",
                headers={"Retry-After": "60"},
            )
        if (
            sum(j["state"] in {"queued", "running"} for j in self.jobs.values())
            >= MAX_ACTIVE
        ):
            raise HTTPException(
                503,
                "The analysis queue is full. Please try again shortly.",
                headers={"Retry-After": "20"},
            )
        recent.append(now)
        self.rate[visitor] = recent
        self.rate.move_to_end(visitor)
        while len(self.rate) > 2048:
            self.rate.popitem(last=False)
        self.global_rate.append(now)

    async def execute(self, job, project):
        try:
            async with asyncio.timeout(120):
                await self.slots.acquire()
            try:
                job["state"] = "running"
                terrain, terrain_error = None, None
                if project.terrain_mode == "usgs":
                    try:
                        async with asyncio.timeout(90):
                            terrain = await self.provider.fetch(project)
                    except TerrainUnavailable as error:
                        terrain_error = str(error)
                    except (
                        httpx.HTTPError,
                        TimeoutError,
                        ValueError,
                        KeyError,
                        TypeError,
                    ):
                        terrain_error = "Live terrain is unavailable right now. The nominal budget is retained. Retry or import a terrain profile."
                elif project.terrain_mode == "uploaded":
                    terrain = {
                        "samples": [p.model_dump() for p in project.profile],
                        "sources": [
                            {
                                "id": "uploaded",
                                "name": project.profile_source,
                                "vertical_datum": "User supplied; elevations must share one reference",
                            }
                        ],
                        "warnings": [
                            "Imported terrain has not been independently verified. Distance is normalized within the documented endpoint tolerance."
                        ],
                    }
                job["result"] = calculate(project, terrain, terrain_error)
                job["result"]["build_commit"] = os.getenv("RENDER_GIT_COMMIT", "local")
                job["result"]["terrain_profile_sha256"] = (
                    terrain.get("profile_sha256") if terrain else None
                )
                job["state"] = "complete"
            finally:
                self.slots.release()
        except asyncio.CancelledError:
            job["state"] = "cancelled"
        except (ValueError, TimeoutError) as error:
            job.update(
                state="failed",
                error=str(error)
                or "This job exceeded its queue timeout. Please retry.",
            )
        except Exception:
            logger.exception("Analysis failed")
            job.update(
                state="failed",
                error="This analysis could not be completed. Check the inputs and try again.",
            )


def create_app(provider=None, static_dir: Path | None = None):
    store = RunStore(provider)

    @asynccontextmanager
    async def lifespan(app):
        async def expire():
            while True:
                await asyncio.sleep(30)
                store.clean()
                if isinstance(store.provider, TerrainProvider):
                    for key, (created, _) in list(store.provider.cache.items()):
                        if time.monotonic() - created > 14400:
                            del store.provider.cache[key]

        janitor = asyncio.create_task(expire())
        yield
        janitor.cancel()
        tasks = [j["task"] for j in store.jobs.values()]
        for task in tasks:
            task.cancel()
        await asyncio.gather(janitor, *tasks, return_exceptions=True)

    app = FastAPI(
        title="Link Budget",
        version=__version__,
        lifespan=lifespan,
        docs_url=None,
        redoc_url=None,
    )
    app.state.store = store
    app.add_middleware(BodyLimit)

    @app.middleware("http")
    async def security_headers(request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Permissions-Policy"] = (
            "camera=(), microphone=(), geolocation=()"
        )
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://tile.openstreetmap.org; connect-src 'self' https://tile.openstreetmap.org; worker-src 'self' blob:; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
        )
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        return response

    @app.get("/api/health")
    async def health():
        return {
            "status": "ok",
            "version": __version__,
            "commit": os.getenv("RENDER_GIT_COMMIT", "local"),
        }

    @app.post("/api/runs", status_code=202)
    async def run(project: Project, request: Request):
        try:
            geometry(project)
        except ValueError as error:
            raise HTTPException(422, str(error)) from error
        visitor = hashlib.sha256(
            (request.client.host if request.client else "unknown").encode()
        ).hexdigest()
        store.admission(visitor)
        job_id, capability = secrets.token_urlsafe(24), secrets.token_urlsafe(32)
        job = {
            "state": "queued",
            "created": time.monotonic(),
            "capability": hashlib.sha256(capability.encode()).digest(),
        }
        store.jobs[job_id] = job
        job["task"] = asyncio.create_task(store.execute(job, project))
        return {
            "id": job_id,
            "token": capability,
            "state": job["state"],
            "expires_in_seconds": RUN_TTL,
        }

    def authorized(job_id, request):
        store.clean()
        job = store.jobs.get(job_id)
        token = request.headers.get("authorization", "").removeprefix("Bearer ")
        if not job or not secrets.compare_digest(
            job["capability"], hashlib.sha256(token.encode()).digest()
        ):
            raise HTTPException(
                404, "Run not found or expired. Recalculate from your saved project."
            )
        return job

    @app.get("/api/runs/{job_id}")
    async def get_run(job_id: str, request: Request):
        job = authorized(job_id, request)
        return {
            "id": job_id,
            "state": job["state"],
            "result": job.get("result"),
            "error": job.get("error"),
        }

    @app.delete("/api/runs/{job_id}")
    async def cancel_run(job_id: str, request: Request):
        job = authorized(job_id, request)
        if job["state"] in {"queued", "running"}:
            job["task"].cancel()
            job["state"] = "cancelled"
        return {"state": job["state"]}

    public = static_dir or Path(__file__).resolve().parent.parent / "web" / "dist"
    if public.is_dir():
        app.mount("/", StaticFiles(directory=public, html=True), name="web")
    return app


app = create_app()
