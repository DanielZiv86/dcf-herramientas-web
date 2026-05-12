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


@router.get("/todos")
async def get_todos(dcf_session: Optional[str] = Cookie(default=None)):
    require_auth(dcf_session)
    return await svc.get_full_table()


@router.get("/riesgo-pais")
async def get_riesgo_pais(dcf_session: Optional[str] = Cookie(default=None)):
    require_auth(dcf_session)
    return await svc.get_riesgo_pais_history()


@router.get("/sensibilidad")
async def get_sensibilidad(
    tipo: str = Query(default="GLOBALES", pattern="^(GLOBALES|BONARES|BOPREAL)$"),
    dcf_session: Optional[str] = Cookie(default=None),
):
    require_auth(dcf_session)
    return await svc.get_sensibilidad(tipo)
