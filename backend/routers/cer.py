from __future__ import annotations

from fastapi import APIRouter, Cookie, HTTPException
from typing import Optional

from auth import require_auth
from services import cer as svc

router = APIRouter(tags=["cer"])





@router.get("/tabla")
async def get_tabla(dcf_session: Optional[str] = Cookie(default=None)):
    require_auth(dcf_session)
    return await svc.get_cer_table()


@router.get("/curva")
async def get_curva(dcf_session: Optional[str] = Cookie(default=None)):
    require_auth(dcf_session)
    return await svc.get_cer_curva()

