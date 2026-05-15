from __future__ import annotations

from fastapi import APIRouter, Cookie, HTTPException, Query
from typing import Optional

from auth import require_auth
from services import dashboard as svc

router = APIRouter(tags=["dashboard"])


@router.get("/macro")
async def get_macro(dcf_session: Optional[str] = Cookie(default=None)):
    require_auth(dcf_session)
    return await svc.load_macro()


@router.get("/indices")
async def get_indices(dcf_session: Optional[str] = Cookie(default=None)):
    require_auth(dcf_session)
    return await svc.load_indices()


@router.get("/ticker-band")
async def get_ticker_band(dcf_session: Optional[str] = Cookie(default=None)):
    require_auth(dcf_session)
    return await svc.load_ticker_band()


@router.get("/tasas-soberanas")
async def get_tasas_soberanas(dcf_session: Optional[str] = Cookie(default=None)):
    require_auth(dcf_session)
    tasas, spread, spread_pair = await svc.load_tasas_soberanas()
    return {"tasas": tasas, "spread_ley_ar_vs_ny": spread, "spread_pair": spread_pair}


@router.get("/sp500-treemap")
async def get_sp500_treemap(
    period: str = Query(default="1D"),
    dcf_session: Optional[str] = Cookie(default=None),
):
    require_auth(dcf_session)
    if period == "1D":
        return await svc.load_sp500_treemap()
    return await svc.load_sp500_treemap_period(period)


@router.get("/merval-treemap")
async def get_merval_treemap(dcf_session: Optional[str] = Cookie(default=None)):
    require_auth(dcf_session)
    return await svc.load_merval_treemap()


@router.get("/cedears")
async def get_cedears(dcf_session: Optional[str] = Cookie(default=None)):
    require_auth(dcf_session)
    return await svc.load_cedears()


@router.get("/performance")
async def get_performance(
    period: str = Query(default="1M", pattern="^(1S|1M|3M|YTD|1A)$"),
    dcf_session: Optional[str] = Cookie(default=None),
):
    require_auth(dcf_session)
    return await svc.load_performance(period)
