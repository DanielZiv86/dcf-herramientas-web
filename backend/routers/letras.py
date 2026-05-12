from __future__ import annotations

from fastapi import APIRouter, Cookie, HTTPException
from typing import Optional

from auth import require_auth
from services import letras as svc

router = APIRouter(tags=["letras"])





@router.get("/carry")
async def get_carry(dcf_session: Optional[str] = Cookie(default=None)):
    require_auth(dcf_session)
    rows, mep = await svc.get_carry_table()
    return {"rows": rows, "mep": mep}


@router.get("/curva")
async def get_curva(dcf_session: Optional[str] = Cookie(default=None)):
    require_auth(dcf_session)
    return await svc.get_curva_points()

