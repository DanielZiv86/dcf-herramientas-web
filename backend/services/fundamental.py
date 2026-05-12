"""Fundamental analysis — Finnhub API client (async)."""
from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import Any, Optional

import httpx
import numpy as np
import pandas as pd

from config import settings

logger = logging.getLogger(__name__)

BASE_URL = "https://finnhub.io/api/v1"
PARQUET_DIR = Path(__file__).resolve().parents[1] / "data" / "fundamental"
PARQUET_TTL = 43200  # 12h in seconds

CURATED_TICKERS = [
    "CRWD", "ANET", "O", "GLNG", "SNDK", "NBIS", "HIMS",
    "ONDS", "COP", "NEE", "MP", "CCJ", "FISV",
]

TICKER_INFO = {
    "CRWD": {"name": "CrowdStrike", "sector": "Technology"},
    "ANET": {"name": "Arista Networks", "sector": "Technology"},
    "O": {"name": "Realty Income", "sector": "Real Estate"},
    "GLNG": {"name": "Golar LNG", "sector": "Energy"},
    "SNDK": {"name": "SanDisk", "sector": "Technology"},
    "NBIS": {"name": "Nebius Group", "sector": "Technology"},
    "HIMS": {"name": "Hims & Hers", "sector": "Healthcare"},
    "ONDS": {"name": "Ondas Holdings", "sector": "Technology"},
    "COP": {"name": "ConocoPhillips", "sector": "Energy"},
    "NEE": {"name": "NextEra Energy", "sector": "Utilities"},
    "MP": {"name": "MP Materials", "sector": "Materials"},
    "CCJ": {"name": "Cameco", "sector": "Energy"},
    "FISV": {"name": "Fiserv", "sector": "Financial"},
}


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        base_url=BASE_URL,
        timeout=15,
        headers={"X-Finnhub-Token": settings.finnhub_token},
        transport=httpx.AsyncHTTPTransport(retries=2),
    )


def _parquet_path(ticker: str, kind: str) -> Path:
    PARQUET_DIR.mkdir(parents=True, exist_ok=True)
    return PARQUET_DIR / f"{ticker.upper()}_{kind}.parquet"


def _is_fresh(path: Path) -> bool:
    if not path.exists():
        return False
    return (time.time() - path.stat().st_mtime) < PARQUET_TTL


async def _get(path: str, **params) -> Any:
    async with _client() as c:
        r = await c.get(path, params={k: v for k, v in params.items() if v is not None})
        r.raise_for_status()
        return r.json()


# ── Profile ───────────────────────────────────────────────────────────────────

async def get_profile(ticker: str) -> dict:
    try:
        data = await _get("/stock/profile2", symbol=ticker.upper())
        return {
            "ticker": ticker.upper(),
            "name": data.get("name", TICKER_INFO.get(ticker.upper(), {}).get("name", ticker)),
            "sector": data.get("finnhubIndustry", TICKER_INFO.get(ticker.upper(), {}).get("sector", "")),
            "exchange": data.get("exchange", ""),
            "market_cap": data.get("marketCapitalization"),
            "shares": data.get("shareOutstanding"),
            "logo": data.get("logo", ""),
            "website": data.get("weburl", ""),
            "country": data.get("country", "US"),
            "currency": data.get("currency", "USD"),
            "ipo_date": data.get("ipo", ""),
            "employees": data.get("employeeTotal"),
        }
    except Exception as e:
        logger.warning("profile %s failed: %s", ticker, e)
        info = TICKER_INFO.get(ticker.upper(), {})
        return {"ticker": ticker.upper(), "name": info.get("name", ticker), "sector": info.get("sector", "")}


# ── Quote ─────────────────────────────────────────────────────────────────────

async def get_quote(ticker: str) -> dict:
    try:
        data = await _get("/quote", symbol=ticker.upper())
        current = data.get("c", 0)
        prev = data.get("pc", 0)
        change = data.get("d", current - prev)
        pct = data.get("dp", (change / prev * 100) if prev else 0)
        return {
            "price": current,
            "change": round(change, 2),
            "pct_change": round(pct, 2),
            "high": data.get("h"),
            "low": data.get("l"),
            "open": data.get("o"),
            "prev_close": prev,
        }
    except Exception as e:
        logger.warning("quote %s failed: %s", ticker, e)
        return {}


# ── Financial metrics ─────────────────────────────────────────────────────────

async def get_metrics(ticker: str) -> dict:
    try:
        data = await _get("/stock/metric", symbol=ticker.upper(), metric="all")
        m = data.get("metric", {})

        def _v(k):
            v = m.get(k)
            return round(float(v), 4) if v is not None else None

        return {
            "pe_ttm": _v("peTTM"),
            "pe_annual": _v("peAnnual"),
            "ev_ebitda_ttm": _v("evEbitdaTTM"),
            "ps_ttm": _v("psTTM"),
            "pb_annual": _v("pbAnnual"),
            "roe_ttm": _v("roeTTM"),
            "roe_annual": _v("roeAnnual"),
            "roic_ttm": _v("roicTTM"),
            "gross_margin_ttm": _v("grossMarginTTM"),
            "ebitda_margin_ttm": _v("ebitdaMarginTTM"),
            "net_margin_ttm": _v("netProfitMarginTTM"),
            "fcf_margin_ttm": _v("fcfMarginTTM"),
            "beta": _v("beta"),
            "week52_high": _v("52WeekHigh"),
            "week52_low": _v("52WeekLow"),
            "eps_ttm": _v("epsTTM"),
            "revenue_ttm": _v("revenueTTM"),
            "total_debt": _v("totalDebt/totalEquityAnnual"),
            "dividend_yield": _v("dividendYieldIndicatedAnnual"),
        }
    except Exception as e:
        logger.warning("metrics %s failed: %s", ticker, e)
        return {}


# ── Financials reported ───────────────────────────────────────────────────────

_XBRL_MAP = {
    "revenue": ["Revenues", "Revenue", "SalesRevenueNet", "RevenueFromContractWithCustomerExcludingAssessedTax"],
    "net_income": ["NetIncomeLoss", "NetIncome", "ProfitLoss"],
    "gross_profit": ["GrossProfit"],
    "operating_income": ["OperatingIncomeLoss"],
    "ebitda": ["EBITDADepreciation", "EBITDA"],
    "cfo": ["NetCashProvidedByUsedInOperatingActivities"],
    "capex": ["PaymentsToAcquirePropertyPlantAndEquipment", "CapitalExpenditurePurchaseOfPropertyPlantAndEquipment"],
    "cash": ["CashAndCashEquivalentsAtCarryingValue", "Cash"],
    "total_debt": ["LongTermDebtAndCapitalLeaseObligation", "LongTermDebt"],
    "equity": ["StockholdersEquity", "Equity"],
    "total_assets": ["Assets"],
    "eps_diluted": ["EarningsPerShareDiluted"],
}

_XBRL_PREFIXES = ["us-gaap_", "crwd_", "dei_", "srt_", "ifrs-full_", ""]


def _extract_xbrl(report: dict, concept: str) -> Optional[float]:
    """Try multiple XBRL prefixes to find concept value."""
    for pfx in _XBRL_PREFIXES:
        v = report.get(f"{pfx}{concept}")
        if v is not None:
            try:
                return float(v)
            except Exception:
                pass
    return None


def _parse_annual_financials(reports: list[dict]) -> pd.DataFrame:
    rows = []
    for rep in reports:
        year = rep.get("year") or rep.get("period", {}).get("year")
        period = rep.get("form", "")
        if "10-K" not in period and "annual" not in str(period).lower():
            continue
        fin = rep.get("report", {})
        ic = {k: v for section in [fin.get("ic", {}), fin.get("bs", {}), fin.get("cf", {})] for k, v in section.items()}

        row = {"year": year}
        for col, concepts in _XBRL_MAP.items():
            for c in concepts:
                v = _extract_xbrl(ic, c)
                if v is not None:
                    row[col] = v / 1e6  # convert to millions
                    break
            if col not in row:
                row[col] = None

        if row.get("capex") and row["capex"] > 0:
            row["capex"] = -row["capex"]  # capex should be negative

        rows.append(row)

    df = pd.DataFrame(rows)
    if not df.empty:
        df = df.sort_values("year").drop_duplicates("year", keep="last")
        # Derived
        if "cfo" in df.columns and "capex" in df.columns:
            df["fcf"] = df["cfo"] + df["capex"].fillna(0)
        if "total_debt" in df.columns and "cash" in df.columns:
            df["net_cash"] = df["cash"].fillna(0) - df["total_debt"].fillna(0)
    return df


async def get_financials(ticker: str) -> dict:
    """Returns parsed annual financials — uses disk cache."""
    cache_path = _parquet_path(ticker, "financials")
    if _is_fresh(cache_path):
        try:
            df = pd.read_parquet(cache_path)
            return {"ticker": ticker, "data": df.to_dict(orient="records")}
        except Exception:
            pass

    try:
        raw = await _get("/stock/financials-reported", symbol=ticker.upper(), freq="annual")
        reports = raw.get("data", [])
        df = _parse_annual_financials(reports)
        if not df.empty:
            df.to_parquet(cache_path, index=False)
        return {"ticker": ticker, "data": df.to_dict(orient="records")}
    except Exception as e:
        logger.warning("financials %s failed: %s", ticker, e)
        return {"ticker": ticker, "data": []}


# ── Candles (price history) ───────────────────────────────────────────────────

async def get_candles(ticker: str, resolution: str = "W", from_ts: int = None, to_ts: int = None) -> dict:
    try:
        now = int(time.time())
        params = {
            "symbol": ticker.upper(),
            "resolution": resolution,
            "from": from_ts or (now - 3 * 365 * 86400),
            "to": to_ts or now,
        }
        data = await _get("/stock/candle", **params)
        if data.get("s") != "ok":
            return {"status": "no_data", "dates": [], "closes": []}
        return {
            "status": "ok",
            "dates": [pd.Timestamp(ts, unit="s").strftime("%Y-%m-%d") for ts in data.get("t", [])],
            "opens": data.get("o", []),
            "highs": data.get("h", []),
            "lows": data.get("l", []),
            "closes": data.get("c", []),
            "volumes": data.get("v", []),
        }
    except Exception as e:
        logger.warning("candles %s failed: %s", ticker, e)
        return {"status": "error", "dates": [], "closes": []}


# ── Full profile endpoint ─────────────────────────────────────────────────────

async def get_full_profile(ticker: str) -> dict:
    """Combines profile + quote + metrics for ticker card."""
    import asyncio
    profile, quote, metrics = await asyncio.gather(
        get_profile(ticker),
        get_quote(ticker),
        get_metrics(ticker),
    )
    return {"profile": profile, "quote": quote, "metrics": metrics}
