from __future__ import annotations

from fastapi import APIRouter, Cookie, HTTPException, Query
from typing import Optional

from auth import require_auth
from services import fundamental as svc

router = APIRouter(tags=["fundamental"])





@router.get("/tickers")
async def get_tickers(dcf_session: Optional[str] = Cookie(default=None)):
    require_auth(dcf_session)
    return {"tickers": svc.CURATED_TICKERS, "info": svc.TICKER_INFO}


@router.get("/perfil")
async def get_perfil(
    ticker: str = Query(..., min_length=1, max_length=10),
    dcf_session: Optional[str] = Cookie(default=None),
):
    require_auth(dcf_session)
    return await svc.get_full_profile(ticker)


@router.get("/financieros")
async def get_financieros(
    ticker: str = Query(..., min_length=1, max_length=10),
    dcf_session: Optional[str] = Cookie(default=None),
):
    require_auth(dcf_session)
    return await svc.get_financials(ticker)


@router.get("/candles")
async def get_candles(
    ticker: str = Query(..., min_length=1, max_length=10),
    resolution: str = Query(default="W", pattern="^(D|W|M)$"),
    dcf_session: Optional[str] = Cookie(default=None),
):
    require_auth(dcf_session)
    return await svc.get_candles(ticker, resolution)

