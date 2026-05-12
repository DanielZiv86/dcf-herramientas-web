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
    mep_task = asyncio.create_task(data912.get_mep())
    ccl_task = asyncio.create_task(data912.get_ccl())
    oficial_task = asyncio.create_task(_fetch_oficial())
    rp_task = asyncio.create_task(_fetch_riesgo_pais_value())

    mep_d, ccl_raw, oficial, (rp_val, rp_pct) = await asyncio.gather(
        mep_task, ccl_task, oficial_task, rp_task
    )

    # MEP: data912 returns {bid, ask, close, mark, pct_change, var}
    mep = _safe_float(mep_d, "mark", "close", "ask", "bid")
    mep_var = _safe_float(mep_d, "pct_change", "var")

    # CCL: log raw response so we can see the actual structure in Render logs
    logger.info("CCL raw response: %s", str(ccl_raw)[:300])

    ccl = None
    ccl_var = None

    def _extract_ccl_value(obj) -> Optional[float]:
        """Recursively try to find a CCL-sized float (> 100) in any dict/list structure."""
        if isinstance(obj, (int, float)):
            try:
                f = float(obj)
                return f if f > 100 else None
            except Exception:
                return None
        if isinstance(obj, dict):
            for k in ["mark", "close", "c", "ccl", "mep", "value", "price", "ask", "bid", "venta", "compra", "last"]:
                v = obj.get(k)
                if v is not None:
                    result = _extract_ccl_value(v)
                    if result:
                        return result
        if isinstance(obj, list):
            for item in obj:
                result = _extract_ccl_value(item)
                if result:
                    return result
        return None

    def _extract_ccl_pct(obj) -> Optional[float]:
        if isinstance(obj, dict):
            for k in ["pct_change", "var", "change_pct", "change", "variacion", "variation"]:
                v = obj.get(k)
                if v is not None:
                    try:
                        return float(v)
                    except Exception:
                        pass
        if isinstance(obj, list) and obj:
            return _extract_ccl_pct(obj[0])
        return None

    ccl = _extract_ccl_value(ccl_raw)
    ccl_var = _extract_ccl_pct(ccl_raw)

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
    try:
        sectors_df = await yahoo.get_sp500_sectors()
        if sectors_df.empty:
            return []
        tickers = sectors_df["ticker"].dropna().tolist()[:120]
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
        rows = []
        for tk in yahoo.PANEL_LIDER:
            row = stocks_df[stocks_df["symbol"] == tk]
            if row.empty:
                continue
            r = row.iloc[0]
            pct = r.get("pct_change", 0)
            rows.append({
                "ticker": tk,
                "price": float(r.get("c", 0)),
                "pct_change": float(pct) if pct is not None else 0,
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
