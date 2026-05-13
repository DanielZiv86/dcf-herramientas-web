"""Yahoo Finance via httpx (no yfinance library — cloud-friendly).
Uses shared async quote cache to avoid rate-limiting when multiple
dashboard endpoints request the same tickers in parallel.
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Optional

import httpx
import pandas as pd

logger = logging.getLogger(__name__)

_YF_CHART = "https://query1.finance.yahoo.com/v8/finance/chart/{ticker}"
_YF_QUOTE = "https://query2.finance.yahoo.com/v7/finance/quote"

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json,text/html,*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://finance.yahoo.com/",
}

# ── Shared quote cache (prevents Yahoo rate-limiting on parallel requests) ──

_quote_cache: dict[str, dict] = {}
_quote_cache_ts: float = 0.0
_QUOTE_TTL = 45  # seconds
_quote_lock = asyncio.Lock()

PANEL_LIDER = [
    "ALUA", "BBAR", "BMA", "BYMA", "CECO2", "CEPU", "COME", "CRES",
    "EDN", "GGAL", "LOMA", "MIRG", "PAMP", "SUPV", "TECO2",
    "TGNO4", "TGSU2", "TXAR", "VALO", "VIST", "YPF",
]

GLOBAL_INDICES = {
    "S&P 500":   "^GSPC",
    "QQQ":       "QQQ",
    "Dow Jones": "^DJI",
    "MERVAL":    "^MERV",
}

CRYPTO_COMM = {
    "BTC":   "BTC-USD",
    "ETH":   "ETH-USD",
    "SOL":   "SOL-USD",
    "XRP":   "XRP-USD",
    "Oro":   "GC=F",
    "Plata": "SI=F",
    "Cobre": "HG=F",
    "WTI":   "CL=F",
    "Gas":   "NG=F",
    "Soja":  "ZS=F",
    "Trigo": "ZW=F",
    "Maíz":  "ZC=F",
    "Café":  "KC=F",
}

TICKER_BAND = {**{"S&P 500": "^GSPC", "QQQ": "QQQ", "DJI": "^DJI", "MERVAL": "^MERV"}, **CRYPTO_COMM}


# ── Internal fetchers ─────────────────────────────────────────────────────────

async def _fetch_chart(ticker: str, range_: str = "2d", interval: str = "1d") -> Optional[dict]:
    url = _YF_CHART.format(ticker=ticker)
    try:
        async with httpx.AsyncClient(headers=_HEADERS, timeout=10, follow_redirects=True) as c:
            r = await c.get(url, params={"range": range_, "interval": interval, "includePrePost": "false"})
            r.raise_for_status()
            result = r.json().get("chart", {}).get("result", [])
            return result[0] if result else None
    except Exception as e:
        logger.debug("Yahoo chart %s: %s", ticker, e)
        return None


async def _fetch_batch(tickers: list[str], include_volume: bool = False) -> dict[str, dict]:
    """Batch quote via Yahoo v7 quote endpoint. Handles large batches (300+)."""
    if not tickers:
        return {}
    fields = "regularMarketPrice,regularMarketPreviousClose,regularMarketChangePercent"
    if include_volume:
        fields += ",regularMarketVolume"

    # Yahoo can handle ~300 symbols per request; chunk if needed
    chunk_size = 300
    all_results: dict[str, dict] = {}

    chunks = [tickers[i:i+chunk_size] for i in range(0, len(tickers), chunk_size)]
    try:
        async with httpx.AsyncClient(headers=_HEADERS, timeout=20, follow_redirects=True) as c:
            for chunk in chunks:
                try:
                    r = await c.get(
                        _YF_QUOTE,
                        params={"symbols": ",".join(chunk), "fields": fields},
                    )
                    r.raise_for_status()
                    items = r.json().get("quoteResponse", {}).get("result", [])
                    for it in items:
                        entry = {
                            "price": it.get("regularMarketPrice"),
                            "pct_change": it.get("regularMarketChangePercent"),
                        }
                        if include_volume:
                            entry["volume"] = it.get("regularMarketVolume")
                        all_results[it["symbol"]] = entry
                except Exception as e:
                    logger.debug("Yahoo batch chunk failed: %s", e)
    except Exception as e:
        logger.debug("Yahoo batch failed: %s", e)

    return all_results


async def _fetch_single(ticker: str) -> dict:
    result = await _fetch_chart(ticker)
    if not result:
        return {"price": None, "pct_change": None}
    meta = result.get("meta", {})
    price = meta.get("regularMarketPrice")
    prev = meta.get("chartPreviousClose") or meta.get("previousClose")
    pct = round((price - prev) / prev * 100, 2) if (price and prev and prev != 0) else None
    return {"price": price, "pct_change": pct}


# ── Public API ────────────────────────────────────────────────────────────────

async def get_quotes(tickers: list[str]) -> dict[str, dict]:
    """Cached multi-ticker quote fetch. All callers share the same cache for _QUOTE_TTL seconds."""
    global _quote_cache, _quote_cache_ts

    async with _quote_lock:
        now = time.time()
        stale = (now - _quote_cache_ts) >= _QUOTE_TTL

        needed = [t for t in tickers if t not in _quote_cache] if not stale else tickers

        if stale:
            _quote_cache = {}
            _quote_cache_ts = now

        if needed:
            # Try batch first, fallback to individual for misses
            batch = await _fetch_batch(needed)
            _quote_cache.update(batch)

            still_missing = [t for t in needed if t not in _quote_cache or _quote_cache[t]["price"] is None]
            if still_missing:
                tasks = [_fetch_single(t) for t in still_missing]
                results = await asyncio.gather(*tasks, return_exceptions=True)
                for t, r in zip(still_missing, results):
                    if not isinstance(r, Exception) and r.get("price"):
                        _quote_cache[t] = r

        return {t: _quote_cache.get(t, {"price": None, "pct_change": None}) for t in tickers}


async def get_history(tickers: list[str], period: str = "1mo") -> pd.DataFrame:
    period_map = {"1S": "5d", "1M": "1mo", "3M": "3mo", "YTD": "ytd", "1A": "1y"}
    yf_period = period_map.get(period, period)

    async def _get(ticker):
        result = await _fetch_chart(ticker, range_=yf_period, interval="1d")
        if not result:
            return ticker, None
        timestamps = result.get("timestamp", [])
        closes = result.get("indicators", {}).get("quote", [{}])[0].get("close", [])
        if not timestamps or not closes:
            return ticker, None
        df = pd.DataFrame({"date": pd.to_datetime(timestamps, unit="s"), "close": closes})
        df = df.dropna().set_index("date")["close"]
        return ticker, df

    results = await asyncio.gather(*[_get(t) for t in tickers])
    frames = {t: s for t, s in results if s is not None}
    return pd.DataFrame(frames) if frames else pd.DataFrame()


async def get_sp500_sectors() -> pd.DataFrame:
    from pathlib import Path
    from config import settings
    for p in [settings.data_path / "sp500_sectors.csv",
              Path(__file__).resolve().parents[1] / "data" / "sp500_sectors.csv"]:
        if p.exists():
            return pd.read_csv(p)
    return pd.DataFrame(columns=["ticker", "sector"])
