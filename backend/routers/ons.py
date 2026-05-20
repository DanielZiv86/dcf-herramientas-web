from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Cookie, HTTPException
from fastapi.responses import JSONResponse

from auth import require_auth
from services import ons as svc

logger = logging.getLogger(__name__)
router = APIRouter(tags=["ons"])


@router.get("/tabla")
async def get_tabla(dcf_session: Optional[str] = Cookie(default=None)):
    """Tabla principal de ONs con YTM, Duration y precios."""
    require_auth(dcf_session)
    try:
        data = await svc.get_ytm_table()
        return data
    except Exception as e:
        logger.error("[ons/tabla] Error inesperado: %s", e, exc_info=True)
        # Devolver JSON con error para que el browser no vea un crash sin CORS
        return JSONResponse(
            status_code=500,
            content={"error": str(e), "detail": "Error interno calculando tabla ONs"},
        )


@router.get("/ping")
async def ping(dcf_session: Optional[str] = Cookie(default=None)):
    """
    Endpoint de diagnóstico.
    Verifica: BD accesible, MEP disponible, tickers en BD.
    No calcula TIR (es más rápido).
    """
    require_auth(dcf_session)
    result: dict = {
        "status":     "unknown",
        "timestamp":  datetime.utcnow().isoformat() + "Z",
        "bd":         None,
        "mep":        None,
        "errors":     [],
    }

    # Test BD
    try:
        df = svc.load_bd_ons()
        result["bd"] = {
            "filas":   len(df),
            "tickers": df["ticker"].nunique(),
            "lista":   df["ticker"].unique().tolist()[:10],
        }
    except Exception as e:
        result["errors"].append(f"BD error: {e}")
        result["status"] = "bd_error"
        return result

    # Test MEP
    try:
        mep = await svc._fetch_mep()
        result["mep"] = mep
    except Exception as e:
        result["errors"].append(f"MEP error: {e}")

    result["status"] = "ok" if not result["errors"] else "partial"
    return result
