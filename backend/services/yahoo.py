"""yfinance wrapper — runs sync calls in asyncio's ThreadPoolExecutor."""
from __future__ import annotations

import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from typing import Optional

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="yfinance")

PANEL_LIDER = [
    "ALUA", "BBAR", "BMA", "BYMA", "CECO2", "CEPU", "COME", "CRES",
    "EDN", "GGAL", "LOMA", "MIRG", "PAMP", "SUPV", "TECO2",
    "TGNO4", "TGSU2", "TXAR", "VALO", "VIST", "YPF",
]

GLOBAL_INDICES = ["^GSPC", "QQQ", "^DJI"]
MERVAL_TICKER = "^MERV"

CRYPTO_COMM = {
    "Bitcoin": "BTC-USD",
    "Ethereum": "ETH-USD",
    "Solana": "SOL-USD",
    "XRP": "XRP-USD",
    "Oro": "GC=F",
    "Plata": "SI=F",
    "Cobre": "HG=F",
    "WTI": "CL=F",
    "Gas": "NG=F",
    "Soja": "ZS=F",
    "Trigo": "ZW=F",
    "Maíz": "ZC=F",
    "Café": "KC=F",
}

TICKER_BAND = {
    "S&P 500": "^GSPC",
    "QQQ": "QQQ",
    "DJI": "^DJI",
    "MERVAL": "^MERV",
    "BTC": "BTC-USD",
    "ETH": "ETH-USD",
    "SOL": "SOL-USD",
    "XRP": "XRP-USD",
    "Oro": "GC=F",
    "Plata": "SI=F",
    "Cobre": "HG=F",
    "WTI": "CL=F",
    "Gas": "NG=F",
    "Soja": "ZS=F",
    "Trigo": "ZW=F",
    "Maíz": "ZC=F",
    "Café": "KC=F",
}


def _safe_float(v) -> Optional[float]:
    try:
        f = float(v)
        return None if (np.isnan(f) or np.isinf(f)) else f
    except Exception:
        return None


def _yf_fast_info(tickers: list[str]) -> dict[str, dict]:
    import yfinance as yf
    result = {}
    for tk in tickers:
        try:
            obj = yf.Ticker(tk)
            fi = obj.fast_info
            price = _safe_float(getattr(fi, "last_price", None))
            prev = _safe_float(getattr(fi, "previous_close", None))
            pct = ((price - prev) / prev * 100) if (price and prev and prev != 0) else None
            result[tk] = {"price": price, "pct_change": pct}
        except Exception:
            result[tk] = {"price": None, "pct_change": None}
    return result


def _download_batch(tickers: list[str], period: str = "2d") -> dict[str, dict]:
    import yfinance as yf
    if not tickers:
        return {}
    try:
        data = yf.download(
            tickers,
            period=period,
            interval="1d",
            auto_adjust=True,
            group_by="ticker",
            progress=False,
            threads=True,
        )
    except Exception as e:
        logger.warning("yfinance batch download failed: %s", e)
        return _yf_fast_info(tickers)

    result = {}
    for tk in tickers:
        try:
            if len(tickers) == 1:
                close_series = data["Close"].dropna() if "Close" in data.columns else pd.Series(dtype=float)
            else:
                if isinstance(data.columns, pd.MultiIndex):
                    if ("Close", tk) in data.columns:
                        close_series = data[("Close", tk)].dropna()
                    else:
                        close_series = pd.Series(dtype=float)
                else:
                    close_series = pd.Series(dtype=float)

            if len(close_series) >= 2:
                price = _safe_float(close_series.iloc[-1])
                prev = _safe_float(close_series.iloc[-2])
                pct = ((price - prev) / prev * 100) if (price and prev and prev != 0) else None
            elif len(close_series) == 1:
                price = _safe_float(close_series.iloc[-1])
                pct = None
            else:
                price = pct = None

            result[tk] = {"price": price, "pct_change": pct}
        except Exception:
            result[tk] = {"price": None, "pct_change": None}

    return result


def _download_history(tickers: list[str], period: str) -> pd.DataFrame:
    import yfinance as yf
    try:
        data = yf.download(
            tickers,
            period=period,
            interval="1d",
            auto_adjust=True,
            group_by="ticker",
            progress=False,
        )
    except Exception as e:
        logger.warning("yfinance history download failed: %s", e)
        return pd.DataFrame()

    if data.empty:
        return pd.DataFrame()

    if len(tickers) == 1:
        return data[["Close"]].rename(columns={"Close": tickers[0]})

    if isinstance(data.columns, pd.MultiIndex):
        close_cols = {}
        for tk in tickers:
            if ("Close", tk) in data.columns:
                close_cols[tk] = data[("Close", tk)]
        return pd.DataFrame(close_cols)

    return pd.DataFrame()


async def _run(fn, *args, **kwargs):
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(_executor, lambda: fn(*args, **kwargs))


# ── Public async API ─────────────────────────────────────────────────────────

async def get_quotes(tickers: list[str]) -> dict[str, dict]:
    return await _run(_download_batch, tickers)


async def get_fast_info(tickers: list[str]) -> dict[str, dict]:
    return await _run(_yf_fast_info, tickers)


async def get_history(tickers: list[str], period: str = "1mo") -> pd.DataFrame:
    return await _run(_download_history, tickers, period)


async def get_sp500_sectors() -> pd.DataFrame:
    """Load S&P 500 sector mapping from CSV."""
    from pathlib import Path
    from config import settings
    csv_path = settings.data_path.parent.parent / "data" / "sp500_sectors.csv"
    if not csv_path.exists():
        csv_path = Path(__file__).resolve().parents[2] / "backend" / "data" / "sp500_sectors.csv"
    if not csv_path.exists():
        return pd.DataFrame(columns=["ticker", "sector"])
    return pd.read_csv(csv_path)
