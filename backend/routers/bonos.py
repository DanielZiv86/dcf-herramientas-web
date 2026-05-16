from __future__ import annotations

from fastapi import APIRouter, Cookie, HTTPException, Query
from typing import Optional

from auth import require_auth
from services import bonds as svc

router = APIRouter(tags=["bonos"])


@router.get("/hd")
async def get_hd(
    mercado: str = Query(default="MEP", pattern="^(PESOS|MEP|CCL)$"),
    dcf_session: Optional[str] = Cookie(default=None),
):
    require_auth(dcf_session)
    return await svc.get_hd_table(mercado)


@router.get("/bopreal")
async def get_bopreal(
    mercado: str = Query(default="MEP", pattern="^(PESOS|MEP|CCL)$"),
    dcf_session: Optional[str] = Cookie(default=None),
):
    require_auth(dcf_session)
    return await svc.get_bopreal_table(mercado)


@router.get("/todos")
async def get_todos(
    mercado: str = Query(default="MEP", pattern="^(PESOS|MEP|CCL)$"),
    dcf_session: Optional[str] = Cookie(default=None),
):
    require_auth(dcf_session)
    # Return HD + BOPREAL in parallel
    from services.bonds import get_hd_table, get_bopreal_table
    import asyncio
    hd, bop = await asyncio.gather(
        get_hd_table(mercado),
        get_bopreal_table(mercado),
        return_exceptions=True,
    )
    result = []
    if not isinstance(hd, Exception):
        for r in hd: r["group"] = "HD"; result.append(r)
    if not isinstance(bop, Exception):
        for r in bop: r.setdefault("group", "BOPREAL"); result.append(r)
    return result


@router.get("/riesgo-pais")
async def get_riesgo_pais(dcf_session: Optional[str] = Cookie(default=None)):
    require_auth(dcf_session)
    return await svc.get_riesgo_pais_history()


@router.get("/cashflows")
async def get_cashflows(
    ticker: str = Query(description="Base ticker sin sufijo D/C"),
    dcf_session: Optional[str] = Cookie(default=None),
):
    require_auth(dcf_session)
    return await svc.get_bond_cashflows(ticker)


@router.get("/sensibilidad")
async def get_sensibilidad(
    tipo: str = Query(default="GLOBALES", pattern="^(GLOBALES|BONARES|BOPREAL)$"),
    dcf_session: Optional[str] = Cookie(default=None),
):
    require_auth(dcf_session)
    return await svc.get_sensibilidad(tipo)
