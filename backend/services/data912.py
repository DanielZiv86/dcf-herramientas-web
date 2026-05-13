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

async def get_mep_ccl_al30() -> dict:
    """
    Compute MEP and CCL from the AL30/AL30D and AL30/AL30C bond pairs.
    This is the standard Argentine market convention (most liquid reference).

    MEP = Price(AL30 ARS) / Price(AL30D USD)
    CCL = Price(AL30 ARS) / Price(AL30C USD)
    Variation ≈ Δ(ratio) = pct_change(AL30) - pct_change(AL30x)
    """
    bonds = await _to_df("/live/arg_bonds")
    if bonds.empty:
        return {}

    def _row(sym: str) -> dict:
        r = bonds[bonds["symbol"] == sym]
        if r.empty:
            return {}
        row = r.iloc[0]
        try:
            price = float(str(row.get("c", "")).replace(",", "."))
        except Exception:
            price = None
        try:
            pct = float(str(row.get("pct_change", "")).replace(",", "."))
        except Exception:
            pct = None
        return {"price": price, "pct": pct}

    al30  = _row("AL30")
    al30d = _row("AL30D")
    al30c = _row("AL30C")

    result = {}

    if al30.get("price") and al30d.get("price") and al30d["price"] > 0:
        result["mep"] = round(al30["price"] / al30d["price"], 2)
        if al30.get("pct") is not None and al30d.get("pct") is not None:
            result["mep_var"] = round(al30["pct"] - al30d["pct"], 2)

    if al30.get("price") and al30c.get("price") and al30c["price"] > 0:
        result["ccl"] = round(al30["price"] / al30c["price"], 2)
        if al30.get("pct") is not None and al30c.get("pct") is not None:
            result["ccl_var"] = round(al30["pct"] - al30c["pct"], 2)

    return result


async def get_mep() -> dict:
    data = await _fetch("/live/mep")
    if isinstance(data, list) and data:
        return data[0]
    if isinstance(data, dict):
        return data
    raise ValueError("Unexpected /live/mep response")


async def get_ccl() -> list:
    """Returns full list of CCL pairs from data912.
    Each item: {ticker_usa, ticker_ar, CCL_bid, CCL_ask, CCL_close, CCL_mark, ars_volume, volume_rank}
    """
    data = await _fetch("/live/ccl")
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        return [data]
    return []


async def get_ccl_mark() -> tuple[float | None, float | None]:
    """Returns (ccl_value, pct_change) using the top 10 most liquid pairs.
    CCL_close = previous session close; CCL_mark = current real-time value.
    Variation = median of per-pair (mark-close)/close across top liquid pairs.
    """
    items = await get_ccl()
    if not items:
        return None, None

    # Sort by ars_volume, take top 10 most liquid (avoid distorted illiquid pairs)
    sorted_items = sorted(items, key=lambda x: float(x.get("ars_volume") or 0), reverse=True)
    top10 = sorted_items[:10]

    # CCL value: mark of most liquid pair
    best = top10[0]
    ccl = best.get("CCL_mark") or best.get("CCL_close") or best.get("CCL_ask")

    # Per-pair pct_change, then median (robust against outliers)
    pcts = []
    for x in top10:
        mark  = x.get("CCL_mark")
        close = x.get("CCL_close")
        if mark and close and float(close) > 0:
            pcts.append((float(mark) - float(close)) / float(close) * 100)

    pct = None
    if pcts:
        pcts.sort()
        mid = len(pcts) // 2
        pct = round(pcts[mid] if len(pcts) % 2 else (pcts[mid-1] + pcts[mid]) / 2, 2)

    return (float(ccl) if ccl else None), pct


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
