"""Yahoo Finance via httpx — cookie+crumb auth (same as yfinance internals).
Fallback: Finnhub for stocks we can't get from Yahoo.
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Optional

import httpx
import pandas as pd

logger = logging.getLogger(__name__)

_YF_FC    = "https://fc.yahoo.com"
_YF_CRUMB = "https://query2.finance.yahoo.com/v1/test/getcrumb"
_YF_QUOTE = "https://query1.finance.yahoo.com/v7/finance/quote"
_YF_CHART = "https://query1.finance.yahoo.com/v8/finance/chart/{ticker}"

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json,*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Referer": "https://finance.yahoo.com/",
    "Origin": "https://finance.yahoo.com",
}

# ── Cookie + crumb cache (expires every 50 min) ───────────────────────────

_crumb_cache: dict = {"crumb": None, "cookies": None, "ts": 0.0}
_crumb_lock = asyncio.Lock()
_CRUMB_TTL  = 3000  # 50 minutes


async def _get_crumb_and_cookies() -> tuple[str, dict]:
    """Fetch Yahoo Finance crumb + session cookies (cached 50 min)."""
    global _crumb_cache
    async with _crumb_lock:
        if time.time() - _crumb_cache["ts"] < _CRUMB_TTL and _crumb_cache["crumb"]:
            return _crumb_cache["crumb"], _crumb_cache["cookies"]

        try:
            async with httpx.AsyncClient(headers=_HEADERS, follow_redirects=True, timeout=10) as c:
                # Step 1: get session cookie
                r1 = await c.get(_YF_FC)
                cookies = dict(r1.cookies)

                # Step 2: get crumb using the cookie
                r2 = await c.get(
                    _YF_CRUMB,
                    cookies=cookies,
                    headers={**_HEADERS, "Accept": "text/plain, */*"},
                )
                crumb = r2.text.strip()

                if crumb and len(crumb) > 5:
                    _crumb_cache = {"crumb": crumb, "cookies": cookies, "ts": time.time()}
                    logger.info("Yahoo crumb refreshed: %s...", crumb[:8])
                    return crumb, cookies
        except Exception as e:
            logger.warning("Yahoo crumb fetch failed: %s", e)

        # Return stale if available
        return _crumb_cache.get("crumb") or "", _crumb_cache.get("cookies") or {}


# ── Authenticated batch quote (all tickers at once) ───────────────────────

async def _fetch_batch_auth(tickers: list[str]) -> dict[str, dict]:
    """Batch quote with cookie+crumb auth — same as yfinance internals.
    Yahoo v7/finance/quote accepts crumb-authenticated requests from cloud IPs.
    Returns dict: ticker → {price, pct_change, volume}
    """
    if not tickers:
        return {}

    crumb, cookies = await _get_crumb_and_cookies()
    if not crumb:
        return {}

    chunk_size = 300
    results: dict[str, dict] = {}

    try:
        async with httpx.AsyncClient(
            headers=_HEADERS, cookies=cookies,
            follow_redirects=True, timeout=20
        ) as c:
            for chunk in [tickers[i:i+chunk_size] for i in range(0, len(tickers), chunk_size)]:
                try:
                    r = await c.get(
                        _YF_QUOTE,
                        params={
                            "crumb": crumb,
                            "symbols": ",".join(chunk),
                            "fields": "regularMarketPrice,regularMarketPreviousClose,"
                                      "regularMarketChangePercent,regularMarketVolume",
                            "lang": "en-US",
                            "region": "US",
                            "corsDomain": "finance.yahoo.com",
                        },
                    )
                    if r.status_code == 401:
                        # Crumb expired — invalidate and retry once
                        _crumb_cache["ts"] = 0
                        logger.warning("Yahoo 401 — crumb expired, will refresh next call")
                        return {}
                    r.raise_for_status()
                    items = r.json().get("quoteResponse", {}).get("result", []) or []
                    for it in items:
                        results[it["symbol"]] = {
                            "price":      it.get("regularMarketPrice"),
                            "pct_change": it.get("regularMarketChangePercent"),
                            "volume":     it.get("regularMarketVolume"),
                        }
                    logger.debug("Yahoo batch chunk %d/%d OK", len(results), len(tickers))
                except Exception as e:
                    logger.warning("Yahoo batch chunk failed: %s", e)
    except Exception as e:
        logger.warning("Yahoo batch auth failed: %s", e)

    return results


# ── Finnhub batch (fallback for tickers Yahoo misses) ─────────────────────

async def _fetch_finnhub_quote(ticker: str, token: str) -> Optional[dict]:
    """Single Finnhub quote: price + pct_change."""
    try:
        async with httpx.AsyncClient(timeout=8) as c:
            r = await c.get(
                "https://finnhub.io/api/v1/quote",
                params={"symbol": ticker},
                headers={"X-Finnhub-Token": token},
            )
            r.raise_for_status()
            d = r.json()
            current = d.get("c", 0)
            prev    = d.get("pc", 0)
            pct     = round((current - prev) / prev * 100, 2) if prev else None
            return {"price": current, "pct_change": pct, "volume": None}
    except Exception:
        return None


async def _fetch_finnhub_batch(tickers: list[str]) -> dict[str, dict]:
    """Fetch multiple tickers from Finnhub with rate limiting (60 req/min)."""
    from config import settings
    token = settings.finnhub_token
    if not token:
        return {}

    # Semaphore: max 10 concurrent to stay within 60/min limit
    sem = asyncio.Semaphore(10)

    async def _safe(tk):
        async with sem:
            result = await _fetch_finnhub_quote(tk, token)
            await asyncio.sleep(0.15)   # ~60 req/min with 10 concurrent
            return tk, result

    tasks = [_safe(tk) for tk in tickers]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    return {tk: r for tk, r in results if not isinstance(results, Exception) and r}


# ── Individual chart fallback (always works, no volume) ───────────────────

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


async def _fetch_single(ticker: str) -> dict:
    result = await _fetch_chart(ticker)
    if not result:
        return {"price": None, "pct_change": None, "volume": None}
    meta  = result.get("meta", {})
    price = meta.get("regularMarketPrice")
    prev  = meta.get("chartPreviousClose") or meta.get("previousClose")
    pct   = round((price - prev) / prev * 100, 2) if (price and prev and prev != 0) else None
    try:
        vols   = result.get("indicators", {}).get("quote", [{}])[0].get("volume", [])
        volume = vols[-1] if vols else None
    except Exception:
        volume = None
    return {"price": price, "pct_change": pct, "volume": volume}


# ── Shared quote cache ─────────────────────────────────────────────────────

_quote_cache: dict[str, dict] = {}
_quote_cache_ts: float = 0.0
_QUOTE_TTL = 45
_quote_lock = asyncio.Lock()


async def get_quotes(tickers: list[str]) -> dict[str, dict]:
    """Cached multi-ticker quote.
    Strategy:
    1. Yahoo batch with cookie+crumb auth (all tickers, fast)
    2. Finnhub fallback for tickers Yahoo missed (rate-limited)
    3. Individual Yahoo chart calls (always works, slowest)
    """
    global _quote_cache, _quote_cache_ts

    async with _quote_lock:
        now   = time.time()
        stale = (now - _quote_cache_ts) >= _QUOTE_TTL
        needed = tickers if stale else [t for t in tickers if t not in _quote_cache]

        if stale:
            _quote_cache = {}
            _quote_cache_ts = now

        if needed:
            # 1. Yahoo batch with auth
            batch = await _fetch_batch_auth(needed)
            _quote_cache.update({k: v for k, v in batch.items() if v.get("price")})

            # 2. Individual chart for what's still missing
            still_missing = [t for t in needed if t not in _quote_cache or not _quote_cache[t].get("price")]
            if still_missing:
                tasks   = [_fetch_single(t) for t in still_missing]
                results = await asyncio.gather(*tasks, return_exceptions=True)
                for t, r in zip(still_missing, results):
                    if not isinstance(r, Exception) and r.get("price"):
                        _quote_cache[t] = r

        return {t: _quote_cache.get(t, {"price": None, "pct_change": None, "volume": None})
                for t in tickers}


# ── OHLCV History (para gráficos de velas) ───────────────────────────────

async def get_ohlcv_history(ticker: str, resolution: str = "D", days: int = 365) -> dict:
    """Histórico OHLCV via Yahoo Finance chart API.
    Usa browser headers — funciona en datacenters (Render), no requiere crumb.
    resolution='D'→diario, 'W'→semanal, 'M'→mensual.
    """
    _range_map    = {365: "1y", 730: "2y", 1825: "5y"}
    _interval_map = {"D": "1d", "W": "1wk", "M": "1mo"}
    range_   = _range_map.get(days, "1y")
    interval = _interval_map.get(resolution, "1d")
    url = _YF_CHART.format(ticker=ticker.upper())
    try:
        async with httpx.AsyncClient(headers=_HEADERS, timeout=15, follow_redirects=True) as c:
            r = await c.get(url, params={
                "range": range_, "interval": interval, "includePrePost": "false",
            })
            r.raise_for_status()
            data = r.json().get("chart", {}).get("result", [])
        if not data:
            return {"status": "no_data", "dates": [], "closes": []}
        res_data   = data[0]
        timestamps = res_data.get("timestamp", [])
        quotes     = res_data.get("indicators", {}).get("quote", [{}])[0]
        closes_raw = quotes.get("close", [])
        opens_raw  = quotes.get("open",  []) or []
        highs_raw  = quotes.get("high",  []) or []
        lows_raw   = quotes.get("low",   []) or []
        if not timestamps or not closes_raw:
            return {"status": "no_data", "dates": [], "closes": []}
        # Zip y filtrar filas donde close no es None
        n = len(timestamps)
        opens_raw  = opens_raw  if len(opens_raw)  == n else [None] * n
        highs_raw  = highs_raw  if len(highs_raw)  == n else [None] * n
        lows_raw   = lows_raw   if len(lows_raw)   == n else [None] * n
        rows = [
            (pd.Timestamp(ts, unit="s").strftime("%Y-%m-%d"), c, o, h, l)
            for ts, c, o, h, l in zip(timestamps, closes_raw, opens_raw, highs_raw, lows_raw)
            if c is not None
        ]
        if not rows:
            return {"status": "no_data", "dates": [], "closes": []}
        dates_  = [row[0] for row in rows]
        closes_ = [round(float(row[1]), 4) for row in rows]
        result: dict = {"status": "ok", "dates": dates_, "closes": closes_}
        if opens_raw and highs_raw and lows_raw:
            result["opens"] = [round(float(row[2]), 4) if row[2] is not None else closes_[i] for i, row in enumerate(rows)]
            result["highs"] = [round(float(row[3]), 4) if row[3] is not None else closes_[i] for i, row in enumerate(rows)]
            result["lows"]  = [round(float(row[4]), 4) if row[4] is not None else closes_[i] for i, row in enumerate(rows)]
        logger.info("[yf] OHLCV %s (%s/%s): %d bars", ticker, resolution, range_, len(dates_))
        return result
    except Exception as e:
        logger.warning("[yf] OHLCV chart %s: %s", ticker, e)
        return {"status": "no_data", "dates": [], "closes": []}


# ── History ───────────────────────────────────────────────────────────────

async def get_history(tickers: list[str], period: str = "1mo") -> pd.DataFrame:
    period_map = {"1S": "5d", "1M": "1mo", "3M": "3mo", "YTD": "ytd", "1A": "1y"}
    yf_period  = period_map.get(period, period)

    async def _get(ticker):
        result = await _fetch_chart(ticker, range_=yf_period, interval="1d")
        if not result:
            return ticker, None
        ts     = result.get("timestamp", [])
        closes = result.get("indicators", {}).get("quote", [{}])[0].get("close", [])
        if not ts or not closes:
            return ticker, None
        df = pd.DataFrame({"date": pd.to_datetime(ts, unit="s"), "close": closes})
        return ticker, df.dropna().set_index("date")["close"]

    results = await asyncio.gather(*[_get(t) for t in tickers])
    frames  = {t: s for t, s in results if s is not None}
    return pd.DataFrame(frames) if frames else pd.DataFrame()


# ── Constants ─────────────────────────────────────────────────────────────

PANEL_LIDER = [
    "ALUA", "BBAR", "BMA", "BYMA", "CECO2", "CEPU", "COME", "CRES",
    "EDN",  "GGAL", "LOMA", "MIRG", "PAMP", "SUPV", "TECO2",
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


async def get_sp500_sectors() -> pd.DataFrame:
    from pathlib import Path
    from config import settings
    for p in [settings.data_path / "sp500_sectors.csv",
              Path(__file__).resolve().parents[1] / "data" / "sp500_sectors.csv"]:
        if p.exists():
            return pd.read_csv(p)
    return pd.DataFrame(columns=["ticker", "sector"])
