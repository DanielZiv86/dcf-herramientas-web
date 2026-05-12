from __future__ import annotations

from fastapi import APIRouter, Cookie, HTTPException
from typing import Optional

from auth import require_auth
from services import ons as svc

router = APIRouter(tags=["ons"])





@router.get("/tabla")
async def get_tabla(dcf_session: Optional[str] = Cookie(default=None)):
    require_auth(dcf_session)
    return await svc.get_ytm_table()

