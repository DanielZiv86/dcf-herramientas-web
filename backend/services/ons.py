"""ONs YTM — YTM bisection (30/360 day count)."""
from __future__ import annotations

import logging
from io import StringIO
from pathlib import Path

import httpx
import numpy as np
import pandas as pd

from config import settings
from services import data912

logger = logging.getLogger(__name__)

URL_IOL_BONOS = "https://iol.invertironline.com/mercado/cotizaciones/argentina/bonos/todos"
URL_MEP = "https://dolarapi.com/v1/dolares/bolsa"
BD_ONS = "BD ONs.xlsx"


def _data_path() -> Path:
    return settings.data_path


# ── YTM solver (30/360) ───────────────────────────────────────────────────────

def _days_30_360(d1: pd.Timestamp, d2: pd.Timestamp) -> float:
    y1, m1, day1 = d1.year, d1.month, min(d1.day, 30)
    y2, m2, day2 = d2.year, d2.month, min(d2.day, 30)
    return (y2 - y1) * 360 + (m2 - m1) * 30 + (day2 - day1)


def _npv_30_360(rate: float, cashflows: list[float], dates: list[pd.Timestamp]) -> float:
    t0 = dates[0]
    pv = 0.0
    for cf, dt in zip(cashflows, dates):
        t = _days_30_360(t0, dt) / 360.0
        pv += cf / (1.0 + rate) ** t
    return pv


def solve_ytm(cashflows: list[float], dates: list[pd.Timestamp], price: float) -> float:
    """YTM via bisection, 30/360 day count."""
    all_cfs = [-price] + list(cashflows)
    all_dates = dates  # first date = settlement

    def f(r):
        return _npv_30_360(r, all_cfs[1:], all_dates[1:]) - price

    lo, hi = -0.9999, 5.0
    try:
        flo, fhi = f(lo), f(hi)
        if np.isnan(flo) or np.isnan(fhi) or np.sign(flo) == np.sign(fhi):
            return np.nan
        for _ in range(250):
            mid = (lo + hi) / 2.0
            fmid = f(mid)
            if abs(fmid) < 1e-8:
                return mid
            if np.sign(flo) == np.sign(fmid):
                lo, flo = mid, fmid
            else:
                hi = mid
        return (lo + hi) / 2.0
    except Exception:
        return np.nan


# ── Cashflow loading ──────────────────────────────────────────────────────────

def load_bd_ons() -> pd.DataFrame:
    path = _data_path() / BD_ONS
    if not path.exists():
        raise FileNotFoundError(f"BD ONs not found: {path}")
    df = pd.read_excel(path)
    df.columns = [str(c).strip() for c in df.columns]
    if "Ticker" not in df.columns:
        raise ValueError(f"'Ticker' column not found. Available: {df.columns.tolist()}")
    df["Ticker"] = df["Ticker"].astype(str).str.strip().str.upper()
    df["Fecha"] = pd.to_datetime(df.get("Date", df.get("Fecha")), dayfirst=True, errors="coerce")
    for col in ["Principal", "Int.", "CF"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)
    df["Cashflow"] = df.get("CF", df.get("Cashflow", 0))
    return df.dropna(subset=["Fecha"]).copy()


# ── Price fetching ────────────────────────────────────────────────────────────

async def _fetch_mep() -> float:
    try:
        return await data912.get_mep_value()
    except Exception:
        pass
    try:
        async with httpx.AsyncClient(timeout=8) as c:
            r = await c.get(URL_MEP)
            r.raise_for_status()
            return float(r.json()["venta"])
    except Exception:
        return 1200.0


async def _fetch_prices_ons(tickers: list[str]) -> dict[str, dict]:
    """data912 primary; returns dict ticker → {price_ars, pct_change}."""
    result: dict[str, dict] = {}
    try:
        corp_df = await data912.get_arg_corp()
        for tk in tickers:
            row = corp_df[corp_df["symbol"] == tk]
            if not row.empty:
                r = row.iloc[0]
                result[tk] = {
                    "price_ars": float(r.get("c", np.nan)),
                    "pct_change": float(r.get("pct_change", np.nan)),
                }
    except Exception:
        pass

    # IOL fallback for missing
    missing = [tk for tk in tickers if tk not in result]
    if missing:
        try:
            async with httpx.AsyncClient(timeout=20, headers={"User-Agent": "Mozilla/5.0"}) as c:
                r = await c.get(URL_IOL_BONOS)
                r.raise_for_status()
                tables = pd.read_html(StringIO(r.text))
                if tables:
                    df = tables[0]
                    df.columns = [str(x).strip() for x in df.columns]
                    sym = next((c for c in df.columns if c.lower() in {"símbolo", "simbolo", "ticker"}), df.columns[0])
                    px_col = next((c for c in df.columns if c.lower() in {"último", "ultimo", "precio"}), df.columns[1])
                    for tk in missing:
                        row = df[df[sym].astype(str).str.strip().str.upper() == tk]
                        if not row.empty:
                            px = row.iloc[0][px_col]
                            try:
                                px_f = float(str(px).replace(",", ".").replace(".", "", str(px).count(".") - 1))
                                if px_f > 1000:
                                    px_f /= 100
                                result[tk] = {"price_ars": px_f, "pct_change": None}
                            except Exception:
                                pass
        except Exception as e:
            logger.warning("IOL ONs fallback failed: %s", e)

    return result


# ── Public functions ─────────────────────────────────────────────────────────

async def get_ytm_table() -> list[dict]:
    try:
        cf_df = load_bd_ons()
    except FileNotFoundError as e:
        logger.error(str(e))
        return []

    base_tickers = cf_df["Ticker"].unique().tolist()
    mep = await _fetch_mep()
    prices = await _fetch_prices_ons(base_tickers)

    today = pd.Timestamp.today().normalize()
    rows = []
    for ticker, group in cf_df.groupby("Ticker"):
        future = group[group["Fecha"] > today].sort_values("Fecha")
        if future.empty:
            rows.append({"ticker": ticker, "status": "NO_FUTURE_CASHFLOWS"})
            continue

        px_info = prices.get(ticker, {})
        price_ars = px_info.get("price_ars", np.nan)
        pct_change = px_info.get("pct_change")

        if np.isnan(price_ars):
            rows.append({"ticker": ticker, "status": "NO_PRICE"})
            continue

        price_usd = price_ars / mep if mep > 0 else np.nan
        cfs = future["Cashflow"].astype(float).tolist()
        dates = [today] + future["Fecha"].tolist()

        ytm = solve_ytm(cfs, dates, float(price_usd) if not np.isnan(price_usd) else price_ars)

        # Next coupon
        next_cf = future.iloc[0]
        last_cf = future.iloc[-1]

        # Legislation guess from ticker suffix
        leg = "NY" if ticker.endswith(("D", "C")) else "AR"

        rows.append({
            "ticker": ticker,
            "price_ars": round(float(price_ars), 4),
            "price_usd": round(float(price_usd), 4) if not np.isnan(price_usd) else None,
            "mep": round(mep, 2),
            "ytm": round(float(ytm) * 100, 2) if not np.isnan(ytm) else None,
            "pct_change": round(float(pct_change), 2) if pct_change is not None else None,
            "next_coupon": next_cf["Fecha"].strftime("%Y-%m-%d"),
            "maturity": last_cf["Fecha"].strftime("%Y-%m-%d"),
            "legislacion": leg,
            "status": "OK",
        })

    return rows
