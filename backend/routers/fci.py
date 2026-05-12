from __future__ import annotations

from fastapi import APIRouter, Cookie, HTTPException, Query
from typing import Optional

from auth import require_auth
from services import fci as svc

router = APIRouter(tags=["fci"])





@router.get("/fondos")
async def get_fondos(
    alyc: Optional[str] = Query(default=None),
    tipo: Optional[str] = Query(default=None),
    moneda: Optional[str] = Query(default=None),
    dcf_session: Optional[str] = Cookie(default=None),
):
    require_auth(dcf_session)
    return await svc.get_fondos(alyc=alyc, tipo=tipo, moneda=moneda)


@router.get("/historico")
async def get_historico(
    fondo_id: int = Query(...),
    clase_id: int = Query(...),
    meses: int = Query(default=12, ge=1, le=36),
    dcf_session: Optional[str] = Cookie(default=None),
):
    require_auth(dcf_session)
    return await svc.get_historico(fondo_id, clase_id, meses)

