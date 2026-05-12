"""DCF Herramientas Web — FastAPI backend."""
from __future__ import annotations

import logging
import sys
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles

# Add backend dir to path so relative imports work
sys.path.insert(0, str(Path(__file__).resolve().parent))

from config import settings
import auth

from routers import dashboard, bonos, letras, cer, ons, fci, fundamental

logging.basicConfig(
    level=logging.DEBUG if settings.debug else logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# ── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="DCF Herramientas — API",
    version="1.0.0",
    docs_url="/api/docs" if settings.debug else None,
    redoc_url=None,
)

# CORS — allow configured origins + any *.github.io subdomain
import re as _re

def _build_cors_origins(base_list: list[str]) -> tuple[list[str], list[str]]:
    """Split into exact origins and regex patterns for GitHub Pages."""
    exact = [o for o in base_list if "*" not in o]
    patterns = [r"https://.*\.github\.io"]  # always allow GitHub Pages
    return exact, patterns

_cors_exact, _cors_patterns = _build_cors_origins(settings.origins_list)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_exact,
    allow_origin_regex=r"https://.*\.github\.io",
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# ── Auth middleware: protect /api/* ──────────────────────────────────────────

@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    path = request.url.path

    # Dev bypass — auto-inject a dev session cookie
    if settings.dev_bypass_auth:
        if path.startswith("/api/") and not request.cookies.get("dcf_session"):
            from auth import _create_token
            dev_token = _create_token(settings.dev_bypass_email, role="dev")
            # Inject into request scope so cookie reads work
            response = await call_next(request)
            response.set_cookie("dcf_session", dev_token, httponly=True, samesite="lax", max_age=86400)
            return response
        return await call_next(request)

    # Public paths: static files, auth routes, docs
    public_prefixes = ("/auth/", "/api/auth/", "/api/docs", "/openapi.json", "/favicon")
    if any(path.startswith(p) for p in public_prefixes):
        return await call_next(request)

    # Static frontend files served at root — always public
    if not path.startswith("/api/"):
        return await call_next(request)

    # Require JWT cookie for all /api/* routes
    token = request.cookies.get("dcf_session")
    if not token:
        return RedirectResponse(url="/auth/login")

    try:
        from auth import decode_token
        decode_token(token)
    except Exception:
        resp = RedirectResponse(url="/auth/login")
        resp.delete_cookie("dcf_session")
        return resp

    return await call_next(request)


# ── Routers ──────────────────────────────────────────────────────────────────

app.include_router(auth.router)
app.include_router(dashboard.router, prefix="/api/dashboard")
app.include_router(bonos.router,     prefix="/api/bonos")
app.include_router(letras.router,    prefix="/api/letras")
app.include_router(cer.router,       prefix="/api/cer")
app.include_router(ons.router,       prefix="/api/ons")
app.include_router(fci.router,       prefix="/api/fci")
app.include_router(fundamental.router, prefix="/api/fundamental")

# ── /api/auth/me alias (JS calls this; /auth/me is the canonical route) ──────

from fastapi import Cookie as _Cookie
from typing import Optional as _Optional

@app.get("/api/auth/me", include_in_schema=False)
async def api_auth_me(dcf_session: _Optional[str] = _Cookie(default=None)):
    if settings.dev_bypass_auth:
        return {"email": settings.dev_bypass_email, "role": "dev"}
    if not dcf_session:
        raise HTTPException(status_code=401, detail="No autenticado")
    from auth import decode_token
    payload = decode_token(dcf_session)
    return {"email": payload["sub"], "role": payload.get("role", "user")}


# ── Cache status (admin) ──────────────────────────────────────────────────────

@app.get("/api/cache-info", include_in_schema=False)
async def cache_info_endpoint(request: Request):
    from cache import cache_info
    return cache_info()

# ── Static frontend ──────────────────────────────────────────────────────────

_frontend_dir = Path(__file__).resolve().parents[1] / "frontend"
if _frontend_dir.exists():
    app.mount("/", StaticFiles(directory=str(_frontend_dir), html=True), name="frontend")
else:
    logger.warning("Frontend directory not found: %s", _frontend_dir)

    @app.get("/")
    async def root():
        return {"message": "DCF Herramientas API — frontend not found"}
