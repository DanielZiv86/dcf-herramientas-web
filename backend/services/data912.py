"""Async client for data912.com — no authentication required."""
from __future__ import annotations

import logging
from typing import Any

import httpx
import pandas as pd

logger = logging.getLogger(__name__)

BASE_URL = "https://data912.com"
TIMEOUT = 12.0
_LIMITS = httpx.Limits(max_connections=20, max_keepalive_connections=10)


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        base_url=BASE_URL,
        timeout=TIMEOUT,
        limits=_LIMITS,
        headers={"User-Agent": "DCF-Inversiones/2.0 (data912 async client)"},
        transport=httpx.AsyncHTTPTransport(retries=3),
    )


async def _fetch(path: str) -> Any:
    async with _client() as c:
        r = await c.get(path)
        r.raise_for_status()
        return r.json()


async def _to_df(path: str, symbol_field: str = "symbol") -> pd.DataFrame:
    data = await _fetch(path)
    df = pd.DataFrame(data)
    if symbol_field not in df.columns and "ticker" in df.columns:
        df = df.rename(columns={"ticker": symbol_field})
    return df


# ── Public API ───────────────────────────────────────────────────────────────

async def get_mep() -> dict:
    data = await _fetch("/live/mep")
    if isinstance(data, list) and data:
        return data[0]
    if isinstance(data, dict):
        return data
    raise ValueError("Unexpected /live/mep response")


async def get_ccl() -> dict:
    data = await _fetch("/live/ccl")
    if isinstance(data, list) and data:
        return data[0]
    if isinstance(data, dict):
        return data
    raise ValueError("Unexpected /live/ccl response")


async def get_mep_value(prefer: str = "mark") -> float:
    d = await get_mep()
    for key in [prefer, "mark", "close", "bid", "ask"]:
        v = d.get(key)
        if v is not None:
            try:
                return float(v)
            except Exception:
                continue
    raise ValueError(f"Cannot extract MEP from {d}")


async def get_arg_bonds() -> pd.DataFrame:
    return await _to_df("/live/arg_bonds")


async def get_arg_corp() -> pd.DataFrame:
    return await _to_df("/live/arg_corp")


async def get_arg_notes() -> pd.DataFrame:
    return await _to_df("/live/arg_notes")


async def get_arg_stocks() -> pd.DataFrame:
    return await _to_df("/live/arg_stocks")


async def get_arg_cedears() -> pd.DataFrame:
    return await _to_df("/live/arg_cedears", symbol_field="ticker")


async def get_bond_history(ticker: str) -> pd.DataFrame:
    return await _to_df(f"/historical/bonds/{ticker.upper()}")


async def prices_arg_bonds() -> pd.Series:
    df = await get_arg_bonds()
    df = df.dropna(subset=["symbol", "c"])
    return df.set_index("symbol")["c"].astype(float)


async def prices_arg_corp() -> pd.Series:
    df = await get_arg_corp()
    df = df.dropna(subset=["symbol", "c"])
    return df.set_index("symbol")["c"].astype(float)


async def prices_arg_notes() -> pd.Series:
    df = await get_arg_notes()
    df = df.dropna(subset=["symbol", "c"])
    return df.set_index("symbol")["c"].astype(float)
