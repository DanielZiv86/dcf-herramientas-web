"""Yahoo Finance via httpx (no yfinance library — cloud-friendly)."""
from __future__ import annotations

import asyncio
import logging
from typing import Optional

import httpx
import pandas as pd

logger = logging.getLogger(__name__)

# Yahoo Finance chart API — works from cloud with browser headers
_YF_CHART = "https://query1.finance.yahoo.com/v8/finance/chart/{ticker}"
_YF_QUOTE = "https://query2.finance.yahoo.com/v7/finance/quote"

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://finance.yahoo.com/",
}

PANEL_LIDER = [
    "ALUA", "BBAR", "BMA", "BYMA", "CECO2", "CEPU", "COME", "CRES",
    "EDN", "GGAL", "LOMA", "MIRG", "PAMP", "SUPV", "TECO2",
    "TGNO4", "TGSU2", "TXAR", "VALO", "VIST", "YPF",
]

GLOBAL_INDICES = {
    "S&P 500":  "^GSPC",
    "QQQ":      "QQQ",
    "Dow Jones": "^DJI",
    "MERVAL":   "^MERV",
}

CRYPTO_COMM = {
    "BTC":    "BTC-USD",
    "ETH":    "ETH-USD",
    "SOL":    "SOL-USD",
    "XRP":    "XRP-USD",
    "Oro":    "GC=F",
    "Plata":  "SI=F",
    "Cobre":  "HG=F",
    "WTI":    "CL=F",
    "Gas":    "NG=F",
    "Soja":   "ZS=F",
    "Trigo":  "ZW=F",
    "Maíz":   "ZC=F",
    "Café":   "KC=F",
}

TICKER_BAND = {**{"S&P 500": "^GSPC", "QQQ": "QQQ", "DJI": "^DJI", "MERVAL": "^MERV"}, **CRYPTO_COMM}


async def _fetch_chart(ticker: str, range_: str = "5d", interval: str = "1d") -> Optional[dict]:
    url = _YF_CHART.format(ticker=ticker)
    params = {"range": range_, "interval": interval, "includePrePost": "false"}
    try:
        async with httpx.AsyncClient(headers=_HEADERS, timeout=10, follow_redirects=True) as c:
            r = await c.get(url, params=params)
            r.raise_for_status()
            data = r.json()
            result = data.get("chart", {}).get("result", [])
            return result[0] if result else None
    except Exception as e:
        logger.debug("Yahoo chart %s failed: %s", ticker, e)
        return None


async def _fetch_quotes_batch(tickers: list[str]) -> dict[str, dict]:
    """Fetch multiple quotes in one request via Yahoo quote endpoint."""
    if not tickers:
        return {}
    symbols = ",".join(tickers)
    try:
        async with httpx.AsyncClient(headers=_HEADERS, timeout=15, follow_redirects=True) as c:
            r = await c.get(
                _YF_QUOTE,
                params={"symbols": symbols, "fields": "regularMarketPrice,regularMarketPreviousClose,regularMarketChangePercent"},
            )
            r.raise_for_status()
            items = r.json().get("quoteResponse", {}).get("result", [])
            return {
                item["symbol"]: {
                    "price": item.get("regularMarketPrice"),
                    "pct_change": item.get("regularMarketChangePercent"),
                }
                for item in items
            }
    except Exception as e:
        logger.debug("Yahoo batch quote failed: %s", e)
        return {}


async def get_quote(ticker: str) -> dict:
    result = await _fetch_chart(ticker, range_="2d", interval="1d")
    if not result:
        return {"price": None, "pct_change": None}
    meta = result.get("meta", {})
    price = meta.get("regularMarketPrice")
    prev = meta.get("chartPreviousClose") or meta.get("previousClose")
    pct = None
    if price and prev and prev != 0:
        pct = round((price - prev) / prev * 100, 2)
    return {"price": price, "pct_change": pct}


async def get_quotes(tickers: list[str]) -> dict[str, dict]:
    """Fetch multiple tickers — batch first, fallback to individual."""
    result = await _fetch_quotes_batch(tickers)
    missing = [t for t in tickers if t not in result or result[t]["price"] is None]
    if missing:
        tasks = [get_quote(t) for t in missing]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        for t, r in zip(missing, results):
            if not isinstance(r, Exception):
                result[t] = r
    return result


async def get_history(tickers: list[str], period: str = "1mo") -> pd.DataFrame:
    """Fetch historical closes for multiple tickers."""
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

    tasks = await asyncio.gather(*[_get(t) for t in tickers])
    frames = {t: s for t, s in tasks if s is not None}
    if not frames:
        return pd.DataFrame()
    return pd.DataFrame(frames)


async def get_sp500_sectors() -> pd.DataFrame:
    from pathlib import Path
    from config import settings
    candidates = [
        settings.data_path / "sp500_sectors.csv",
        Path(__file__).resolve().parents[1] / "data" / "sp500_sectors.csv",
    ]
    for p in candidates:
        if p.exists():
            return pd.read_csv(p)
    return pd.DataFrame(columns=["ticker", "sector"])
