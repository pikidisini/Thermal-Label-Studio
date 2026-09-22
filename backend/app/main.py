"""
Main FastAPI Application Entrypoint.
"""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .api import (
    inspect_router,
    print_agent_router,
    print_router,
    render_router,
    safe_demo_router,
    sap_router,
    templates_router,
)
from .api.routes_print_agent import (
    cleanup_print_agent_state,
    initialize_print_agent_state,
)
from .config import (
    APP_DESCRIPTION,
    APP_TITLE,
    APP_VERSION,
    CORS_ORIGINS,
    FRONTEND_DIR,
    is_safe_demo_enabled,
)

from .services.cleanup_service import storage_cleanup_worker


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan context manager managing background worker tasks."""
    initialize_print_agent_state(app)
    cleanup_task = asyncio.create_task(storage_cleanup_worker(interval_seconds=1800, max_age_seconds=7200))
    try:
        yield
    finally:
        cleanup_task.cancel()
        try:
            await cleanup_task
        except asyncio.CancelledError:
            pass
        cleanup_print_agent_state(app)


app = FastAPI(
    title=APP_TITLE,
    description=APP_DESCRIPTION,
    version=APP_VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# Setup CORS for Frontend Integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API Routers under /api/v1
app.include_router(templates_router, prefix="/api/v1")
app.include_router(render_router, prefix="/api/v1")
app.include_router(print_router, prefix="/api/v1")
app.include_router(inspect_router, prefix="/api/v1")
app.include_router(sap_router, prefix="/api/v1")
app.include_router(print_agent_router, prefix="/api/v1")
app.include_router(safe_demo_router, prefix="/api/v1")


@app.get("/health", tags=["System"])
@app.get("/api/v1/health", tags=["System"])
def health_check():
    """Health check probe endpoint for containers and load balancers."""
    return {"status": "healthy"}


@app.get("/api/status", tags=["System"])
def api_status():
    """API status endpoint providing endpoints summary and link to docs."""
    return {
        "status": "online",
        "service": APP_TITLE,
        "version": APP_VERSION,
        "docs_url": "/docs",
        "safe_demo_mode": is_safe_demo_enabled(),
        "endpoints": {
            "templates": "/api/v1/templates",
            "render": "/api/v1/render",
            "preview": "/api/v1/render/preview",
            "print_tcp": "/api/v1/print/tcp",
            "print_spooler": "/api/v1/print/spooler",
            "print_batch": "/api/v1/print/batch",
            "safe_demo": "/api/v1/safe-demo/batch",
            "inspect": "/api/v1/inspect/validate",
            "sap_ping": "/api/v1/sap/ping",
            "sap_print": "/api/v1/sap/print",
        }
    }



# Mount Static Frontend SPA if directory exists
if FRONTEND_DIR.exists() and (FRONTEND_DIR / "index.html").exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
