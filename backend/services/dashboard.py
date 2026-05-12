"""Dashboard data — macro, indices, treemaps, ticker band."""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Optional

import httpx
import numpy as np
import pandas as pd

from cache import cached
from services import data912, yahoo

logger = logging.getLogger(__name__)

URL_OFICIAL = "https://dolarapi.com/v1/dolares/oficial"
URL_RIESGO_PAIS = "https://api.argentinadatos.com/v1/finanzas/indices/riesgo-pais"
URL_RIESGO_PAIS_FALLBACK = "https://mercados.ambito.com/riesgo_pais/variacion"


# ── Riesgo País ──────────────────────────────────────────────────────────────

async def _fetch_riesgo_pais_value() -> tuple[Optional[float], Optional[float]]:
    async with httpx.AsyncClient(timeout=8) as c:
        try:
            r = await c.get(URL_RIESGO_PAIS)
            r.raise_for_status()
            data = r.json()
            if isinstance(data, list) and data:
                entry = data[-1]
                val = float(entry.get("valor", 0))
                prev = float(data[-2].get("valor", val)) if len(data) >= 2 else val
                pct = (val - prev) / prev * 100 if prev else 0.0
                return val, round(pct, 2)
        except Exception:
            pass

    # Fallback: Ámbito
    try:
        async with httpx.AsyncClient(timeout=8) as c:
            r = await c.get(URL_RIESGO_PAIS_FALLBACK)
            r.raise_for_status()
            d = r.json()
            val = float(str(d.get("value", "0")).replace(",", "."))
            change = float(str(d.get("value_change", "0")).replace(",", "."))
            pct = (change / (val - change) * 100) if (val - change) else 0.0
            return val, round(pct, 2)
    except Exception as e:
        logger.warning("Riesgo País fetch failed: %s", e)
        return None, None


async def _fetch_oficial() -> Optional[float]:
    try:
        async with httpx.AsyncClient(timeout=6) as c:
            r = await c.get(URL_OFICIAL)
            r.raise_for_status()
            return float(r.json()["venta"])
    except Exception:
        return None


# ── Macro ─────────────────────────────────────────────────────────────────────

async def load_macro() -> dict[str, Any]:
    """MEP, CCL, Oficial, spreads, Riesgo País — all in parallel."""
    mep_task = asyncio.create_task(data912.get_mep())
    ccl_task = asyncio.create_task(data912.get_ccl())
    oficial_task = asyncio.create_task(_fetch_oficial())
    rp_task = asyncio.create_task(_fetch_riesgo_pais_value())

    mep_d, ccl_d, oficial, (rp_val, rp_pct) = await asyncio.gather(
        mep_task, ccl_task, oficial_task, rp_task
    )

    def _f(d: dict, key: str) -> Optional[float]:
        v = d.get(key)
        try:
            return float(v) if v is not None else None
        except Exception:
            return None

    mep = _f(mep_d, "mark") or _f(mep_d, "close") or _f(mep_d, "bid")
    mep_var = _f(mep_d, "pct_change")
    ccl = _f(ccl_d, "mark") or _f(ccl_d, "close")
    ccl_var = _f(ccl_d, "pct_change")

    brecha_mep = ((mep / oficial - 1) * 100) if (mep and oficial and oficial > 0) else None
    brecha_ccl = ((ccl / oficial - 1) * 100) if (ccl and oficial and oficial > 0) else None

    return {
        "mep": mep,
        "mep_var": mep_var,
        "ccl": ccl,
        "ccl_var": ccl_var,
        "oficial": oficial,
        "brecha_mep": round(brecha_mep, 1) if brecha_mep is not None else None,
        "brecha_ccl": round(brecha_ccl, 1) if brecha_ccl is not None else None,
        "riesgo_pais": rp_val,
        "riesgo_pais_var": rp_pct,
    }


# ── Indices ───────────────────────────────────────────────────────────────────

async def load_indices() -> list[dict]:
    tickers = yahoo.GLOBAL_INDICES + [yahoo.MERVAL_TICKER]
    quotes = await yahoo.get_quotes(tickers)
    labels = {"^GSPC": "S&P 500", "QQQ": "QQQ", "^DJI": "Dow Jones", "^MERV": "MERVAL"}
    return [
        {
            "label": labels.get(tk, tk),
            "ticker": tk,
            "price": quotes[tk]["price"],
            "pct_change": quotes[tk]["pct_change"],
        }
        for tk in tickers
        if tk in quotes
    ]


# ── Ticker band ───────────────────────────────────────────────────────────────

async def load_ticker_band() -> list[dict]:
    tickers = list(yahoo.TICKER_BAND.values())
    quotes = await yahoo.get_quotes(tickers)
    result = []
    for label, tk in yahoo.TICKER_BAND.items():
        q = quotes.get(tk, {})
        result.append({
            "label": label,
            "ticker": tk,
            "price": q.get("price"),
            "pct_change": q.get("pct_change"),
        })
    return result


# ── Tasas soberanas ───────────────────────────────────────────────────────────

async def load_tasas_soberanas() -> list[dict]:
    """AL30D, GD30D, AL35D, GD35D TIR + spread Ley AR vs NY."""
    try:
        bonds_df = await data912.get_arg_bonds()
        rate_tickers = ["AL30D", "GD30D", "AL35D", "GD35D"]
        result = []
        for tk in rate_tickers:
            row = bonds_df[bonds_df["symbol"] == tk]
            if row.empty:
                result.append({"ticker": tk, "tir": None})
                continue
            r = row.iloc[0]
            result.append({
                "ticker": tk,
                "tir": float(r.get("ytm") or r.get("tir") or 0) if "ytm" in r.index or "tir" in r.index else None,
                "price": float(r.get("c", 0)),
                "pct_change": float(r.get("pct_change", 0)),
            })
        # Spread calculation
        gd30 = next((x for x in result if x["ticker"] == "GD30D"), {})
        al30 = next((x for x in result if x["ticker"] == "AL30D"), {})
        spread = None
        if gd30.get("tir") and al30.get("tir"):
            spread = round((al30["tir"] - gd30["tir"]) * 100, 0)
        return result, spread
    except Exception as e:
        logger.warning("load_tasas_soberanas failed: %s", e)
        return [], None


# ── S&P 500 treemap ───────────────────────────────────────────────────────────

async def load_sp500_treemap() -> list[dict]:
    try:
        sectors_df = await yahoo.get_sp500_sectors()
        if sectors_df.empty:
            return []

        tickers = sectors_df["ticker"].dropna().tolist()[:100]
        quotes = await yahoo.get_quotes(tickers)

        rows = []
        for _, row in sectors_df.iterrows():
            tk = row["ticker"]
            sector = row.get("sector", "Other")
            q = quotes.get(tk, {})
            pct = q.get("pct_change")
            if pct is not None:
                rows.append({"ticker": tk, "sector": sector, "pct_change": round(pct, 2)})

        return rows
    except Exception as e:
        logger.warning("load_sp500_treemap failed: %s", e)
        return []


# ── MERVAL treemap ────────────────────────────────────────────────────────────

async def load_merval_treemap() -> list[dict]:
    try:
        stocks_df = await data912.get_arg_stocks()
        panel = yahoo.PANEL_LIDER
        rows = []
        for tk in panel:
            row = stocks_df[stocks_df["symbol"] == tk]
            if row.empty:
                continue
            r = row.iloc[0]
            rows.append({
                "ticker": tk,
                "price": float(r.get("c", 0)),
                "pct_change": float(r.get("pct_change", 0)),
                "volume": float(r.get("v", 0)),
            })
        return rows
    except Exception as e:
        logger.warning("load_merval_treemap failed: %s", e)
        return []


# ── CEDEARs ──────────────────────────────────────────────────────────────────

async def load_cedears(top_n: int = 20) -> list[dict]:
    try:
        df = await data912.get_arg_cedears()
        if df.empty:
            return []
        for col in ["v_ars", "v_usd"]:
            if col not in df.columns:
                df[col] = 0
        df = df.sort_values("v_ars", ascending=False).head(top_n)
        return df.to_dict(orient="records")
    except Exception as e:
        logger.warning("load_cedears failed: %s", e)
        return []


# ── Performance chart ─────────────────────────────────────────────────────────

_PERF_PERIODS = {"1S": "5d", "1M": "1mo", "3M": "3mo", "YTD": "ytd", "1A": "1y"}


async def load_performance(period_label: str = "1M") -> dict[str, list]:
    period = _PERF_PERIODS.get(period_label, "1mo")
    tickers = ["^GSPC", "QQQ", "^MERV"]
    df = await yahoo.get_history(tickers, period=period)
    if df.empty:
        return {}

    # Normalize to % from start
    df_pct = (df / df.iloc[0] - 1) * 100
    result = {"dates": df_pct.index.strftime("%Y-%m-%d").tolist()}
    labels = {"^GSPC": "S&P 500", "QQQ": "QQQ", "^MERV": "MERVAL"}
    for tk in tickers:
        if tk in df_pct.columns:
            result[labels[tk]] = [round(v, 2) if not np.isnan(v) else None for v in df_pct[tk].tolist()]
    return result
