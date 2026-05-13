"""Dashboard data — macro, indices, treemaps, ticker band."""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Optional

import httpx
import numpy as np
import pandas as pd

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
                val = float(data[-1].get("valor", 0))
                prev = float(data[-2].get("valor", val)) if len(data) >= 2 else val
                pct = round((val - prev) / prev * 100, 2) if prev else 0.0
                return val, pct
        except Exception:
            pass
    try:
        async with httpx.AsyncClient(timeout=8) as c:
            r = await c.get(URL_RIESGO_PAIS_FALLBACK)
            r.raise_for_status()
            d = r.json()
            val = float(str(d.get("value", "0")).replace(",", "."))
            change = float(str(d.get("value_change", "0")).replace(",", "."))
            pct = round((change / (val - change) * 100), 2) if (val - change) else 0.0
            return val, pct
    except Exception as e:
        logger.warning("Riesgo País failed: %s", e)
        return None, None


async def _fetch_oficial() -> Optional[float]:
    try:
        async with httpx.AsyncClient(timeout=6) as c:
            r = await c.get(URL_OFICIAL)
            r.raise_for_status()
            return float(r.json()["venta"])
    except Exception:
        return None


def _safe_float(d: dict, *keys) -> Optional[float]:
    """Try multiple keys until one returns a valid float."""
    for k in keys:
        v = d.get(k)
        if v is not None:
            try:
                f = float(v)
                if not (f == 0 or (isinstance(f, float) and np.isnan(f))):
                    return f
            except Exception:
                continue
    return None


# ── Macro ─────────────────────────────────────────────────────────────────────

async def load_macro() -> dict[str, Any]:
    results = await asyncio.gather(
        data912.get_mep_ccl_al30(),  # MEP & CCL from AL30/AL30D and AL30/AL30C
        _fetch_oficial(),
        _fetch_riesgo_pais_value(),
        return_exceptions=True,
    )

    al30_data = results[0] if not isinstance(results[0], Exception) else {}
    oficial   = results[1] if not isinstance(results[1], Exception) else None
    rp_r      = results[2] if not isinstance(results[2], Exception) else (None, None)

    mep     = al30_data.get("mep")
    mep_var = al30_data.get("mep_var")
    ccl     = al30_data.get("ccl")
    ccl_var = al30_data.get("ccl_var")
    rp_val, rp_pct = rp_r if isinstance(rp_r, tuple) else (None, None)

    brecha_mep = round((mep / oficial - 1) * 100, 1) if (mep and oficial and oficial > 0) else None
    brecha_ccl = round((ccl / oficial - 1) * 100, 1) if (ccl and oficial and oficial > 0) else None

    return {
        "mep": mep,
        "mep_var": mep_var,
        "ccl": ccl,
        "ccl_var": ccl_var,
        "oficial": oficial,
        "brecha_mep": brecha_mep,
        "brecha_ccl": brecha_ccl,
        "riesgo_pais": rp_val,
        "riesgo_pais_var": rp_pct,
    }


# ── Indices ───────────────────────────────────────────────────────────────────

async def load_indices() -> list[dict]:
    tickers = list(yahoo.GLOBAL_INDICES.values())
    quotes = await yahoo.get_quotes(tickers)
    return [
        {
            "label": label,
            "ticker": tk,
            "price": quotes.get(tk, {}).get("price"),
            "pct_change": quotes.get(tk, {}).get("pct_change"),
        }
        for label, tk in yahoo.GLOBAL_INDICES.items()
    ]


# ── Ticker band ───────────────────────────────────────────────────────────────

async def load_ticker_band() -> list[dict]:
    tickers = list(yahoo.TICKER_BAND.values())
    quotes = await yahoo.get_quotes(tickers)
    return [
        {
            "label": label,
            "ticker": tk,
            "price": quotes.get(tk, {}).get("price"),
            "pct_change": quotes.get(tk, {}).get("pct_change"),
        }
        for label, tk in yahoo.TICKER_BAND.items()
    ]


# ── Tasas soberanas ───────────────────────────────────────────────────────────

async def load_tasas_soberanas() -> tuple[list[dict], Optional[float]]:
    """TIR de AL30D, GD30D, AL35D, GD35D — calculada desde cashflows."""
    try:
        from services.bonds import get_hd_table
        # Timeout de 15s para no bloquear el dashboard en cold start
        hd = await asyncio.wait_for(get_hd_table("MEP"), timeout=15)

        tickers = ["AL30D", "GD30D", "AL35D", "GD35D"]
        # Base tickers (sin D) to match the table
        base_map = {f"{b}D": b for b in ["AL30", "GD30", "AL35", "GD35"]}

        result = []
        for tk in tickers:
            base = base_map.get(tk, tk.rstrip("D"))
            row = next((r for r in hd if r.get("ticker") == tk or r.get("base") == base), None)
            tir = row.get("tir") if row else None
            result.append({"ticker": tk, "tir": tir, "price": row.get("precio") if row else None})

        # Spread Ley AR vs NY
        gd30 = next((x["tir"] for x in result if x["ticker"] == "GD30D"), None)
        al30 = next((x["tir"] for x in result if x["ticker"] == "AL30D"), None)
        spread = round(al30 - gd30, 0) if (al30 is not None and gd30 is not None) else None
        # Convert spread to bps
        spread_bps = round(spread * 100) if spread is not None else None

        return result, spread_bps
    except Exception as e:
        logger.warning("load_tasas_soberanas failed: %s", e)
        return [], None


# ── S&P 500 treemap ───────────────────────────────────────────────────────────

async def load_sp500_treemap() -> list[dict]:
    """
    S&P500 treemap — todos los sectores, 6 tickers por sector.
    Tamaño de celda = dollar_vol (precio × volumen), igual que Streamlit.
    Usa llamadas individuales al chart (v8) que sí funcionan desde cloud.
    """
    try:
        sectors_df = await yahoo.get_sp500_sectors()
        if sectors_df.empty:
            return []

        # Top 12 por sector ordenados por market cap (CSV ya ordenado así).
        # Streamlit usa todos 340 via batch yfinance; nosotros hacemos llamadas
        # paralelas individuales — 12×11 sectores = ~132 tickers, manejable.
        sampled = (
            sectors_df.dropna(subset=["ticker"])
            .groupby("sector", group_keys=False)
            .apply(lambda g: g.head(12))
            .reset_index(drop=True)
        )
        tickers = sampled["ticker"].tolist()

        # Parallel individual chart calls (v8 endpoint — no bloqueado)
        quotes = await yahoo.get_quotes(tickers)

        rows = []
        for _, row in sampled.iterrows():
            tk = row["ticker"]
            sector = row.get("sector", "Other")
            q = quotes.get(tk, {})
            pct    = q.get("pct_change")
            price  = q.get("price")
            volume = q.get("volume") or 0

            if price is None:
                continue

            dollar_vol = float(price) * float(volume) if volume else float(price or 1)

            rows.append({
                "ticker": tk,
                "sector": sector,
                "pct_change": round(float(pct), 2) if pct is not None else 0.0,
                "price": round(float(price), 2),
                "dollar_vol": dollar_vol,
            })

        return rows
    except Exception as e:
        logger.warning("load_sp500_treemap failed: %s", e)
        return []


async def load_sp500_treemap_period(period: str = "1M") -> list[dict]:
    """Returns S&P500 treemap with period returns for coloring."""
    try:
        sectors_df = await yahoo.get_sp500_sectors()
        if sectors_df.empty:
            return []
        tickers = sectors_df["ticker"].dropna().tolist()[:80]

        # Get historical data for period
        hist = await yahoo.get_history(tickers, period=period)
        quotes = await yahoo.get_quotes(tickers)

        rows = []
        for _, row in sectors_df.iterrows():
            tk = row["ticker"]
            if tk not in tickers:
                continue
            sector = row.get("sector", "Other")
            q = quotes.get(tk, {})
            price = q.get("price")

            # Period return
            period_pct = None
            if tk in hist.columns and not hist[tk].dropna().empty:
                series = hist[tk].dropna()
                if len(series) >= 2:
                    period_pct = round((series.iloc[-1] / series.iloc[0] - 1) * 100, 2)

            # Daily change
            daily_pct = q.get("pct_change")

            if period_pct is not None:
                rows.append({
                    "ticker": tk,
                    "sector": sector,
                    "pct_change": period_pct,      # used for coloring (period)
                    "pct_1d": round(daily_pct, 2) if daily_pct else None,
                    "price": round(float(price), 2) if price else None,
                })
        return rows
    except Exception as e:
        logger.warning("load_sp500_treemap_period failed: %s", e)
        return []


# ── MERVAL treemap ────────────────────────────────────────────────────────────

async def load_merval_treemap() -> list[dict]:
    """Panel Líder — tamaño de celda = volumen operado (igual que Streamlit)."""
    try:
        stocks_df = await data912.get_arg_stocks()
        rows = []
        for tk in yahoo.PANEL_LIDER:
            row = stocks_df[stocks_df["symbol"] == tk]
            if row.empty:
                continue
            r = row.iloc[0]
            pct    = r.get("pct_change", 0)
            volume = float(r.get("v", 1) or 1)   # volumen operado en ARS
            price  = float(r.get("c", 0) or 0)
            rows.append({
                "ticker": tk,
                "price": price,
                "pct_change": float(pct) if pct is not None else 0,
                "volume": volume,
                "dollar_vol": volume,   # sizeKey en frontend
            })
        # Ordenar por volumen para que los más operados sean los más visibles
        rows.sort(key=lambda x: x["volume"], reverse=True)
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

async def load_performance(period_label: str = "1M") -> dict[str, list]:
    tickers = ["^GSPC", "QQQ", "^MERV"]
    df = await yahoo.get_history(tickers, period=period_label)
    if df.empty:
        return {}
    df_pct = (df / df.iloc[0] - 1) * 100
    result = {"dates": df_pct.index.strftime("%Y-%m-%d").tolist()}
    labels = {"^GSPC": "S&P 500", "QQQ": "QQQ", "^MERV": "MERVAL"}
    for tk in tickers:
        if tk in df_pct.columns:
            result[labels[tk]] = [
                round(v, 2) if not np.isnan(v) else None
                for v in df_pct[tk].tolist()
            ]
    return result
