"""ONs YTM — carga BD ONs.xlsx, obtiene precios, calcula TIR/Duration.

Fuentes:
  Cashflows : BD ONs.xlsx  (backend/data/)
  Precios   : data912 /live/arg_corp  →  IOL (fallback)
  MEP       : data912  →  dolarapi.com  →  1250 (fallback)
"""
from __future__ import annotations

import asyncio
import logging
from io import StringIO
from pathlib import Path
from typing import Optional

import httpx
import numpy as np
import pandas as pd

from config import settings
from services import data912

logger = logging.getLogger(__name__)

URL_IOL_ONS   = "https://iol.invertironline.com/mercado/cotizaciones/argentina/obligaciones-negociables/todos"
URL_MEP_DOLAR = "https://dolarapi.com/v1/dolares/bolsa"
BD_ONS = "BD ONs.xlsx"

# ── Convención 30/360 ────────────────────────────────────────────────────────

def _days_30_360(d1: pd.Timestamp, d2: pd.Timestamp) -> float:
    y1, m1, day1 = d1.year, d1.month, min(d1.day, 30)
    y2, m2, day2 = d2.year, d2.month, min(d2.day, 30)
    return (y2 - y1) * 360 + (m2 - m1) * 30 + (day2 - day1)


def _solve_ytm(cashflows: list[float], dates: list, price: float) -> float:
    """YTM via bisección (30/360). Retorna np.nan si no converge."""
    if not cashflows or not dates or price <= 0:
        return np.nan
    t0 = dates[0]

    def f(r: float) -> float:
        total = 0.0
        for cf, dt in zip(cashflows, dates[1:]):
            t = _days_30_360(t0, dt) / 360.0
            if t <= 0:
                continue
            total += cf / (1.0 + r) ** t
        return total - price

    lo, hi = -0.9999, 5.0
    try:
        flo, fhi = f(lo), f(hi)
        if not np.isfinite(flo) or not np.isfinite(fhi):
            return np.nan
        if np.sign(flo) == np.sign(fhi):
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


def _macaulay_duration(cashflows: list[float], dates: list, ytm: float) -> float:
    """Macaulay Duration en años (base 30/360)."""
    if not cashflows or not dates or not np.isfinite(ytm):
        return np.nan
    t0 = dates[0]
    pv_total = 0.0
    weighted = 0.0
    for cf, dt in zip(cashflows, dates[1:]):
        t = _days_30_360(t0, dt) / 360.0
        if t <= 0:
            continue
        pv = cf / (1.0 + ytm) ** t
        pv_total += pv
        weighted += t * pv
    return weighted / pv_total if pv_total > 0 else np.nan


# ── BD loader ────────────────────────────────────────────────────────────────

def load_bd_ons() -> pd.DataFrame:
    """
    Carga BD ONs.xlsx con detección de columnas case-insensitive.
    Acepta 'ticker' o 'Ticker', 'date' o 'Date', 'cf' o 'CF', etc.
    """
    path = settings.data_path / BD_ONS
    if not path.exists():
        raise FileNotFoundError(f"BD ONs no encontrada: {path}")

    df = pd.read_excel(path)
    df.columns = [str(c).strip() for c in df.columns]

    # Mapa case-insensitive
    col_lower = {c.lower(): c for c in df.columns}

    # Verificar columnas requeridas
    required = ["ticker", "date", "cf"]
    missing = [r for r in required if r not in col_lower]
    if missing:
        raise ValueError(
            f"Columnas requeridas no encontradas: {missing}. "
            f"Disponibles: {df.columns.tolist()}"
        )

    # Renombrar a nombres estándar si es necesario
    std_map = {
        "ticker": "ticker", "date": "date", "cf": "cf",
        "principal": "Principal", "int.": "Int.",
        "tasa de cupon": "Tasa de Cupon", "dias": "Dias",
        "legislacion": "legislacion", "lamina_minima": "lamina_minima",
    }
    rename = {
        col_lower[lower]: std
        for lower, std in std_map.items()
        if lower in col_lower and col_lower[lower] != std
    }
    if rename:
        df = df.rename(columns=rename)

    df["ticker"] = df["ticker"].astype(str).str.strip().str.upper()
    df["date"]   = pd.to_datetime(df["date"], errors="coerce")
    df["cf"]     = pd.to_numeric(df["cf"], errors="coerce").fillna(0.0)

    for col in ["Principal", "Int.", "Tasa de Cupon", "Dias"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)

    df = df.dropna(subset=["date"]).copy()
    df = df[df["ticker"].str.len() > 0].copy()
    df = df.sort_values(["ticker", "date"]).reset_index(drop=True)

    logger.info("[ons] BD cargada: %d filas | %d tickers", len(df), df["ticker"].nunique())
    return df


def _normalize_leg(val) -> str:
    if val is None or (isinstance(val, float) and np.isnan(val)):
        return "AR"
    s = str(val).strip().upper()
    return "NY" if "NY" in s or "NEW" in s else "AR"


# ── Price / MEP fetching ─────────────────────────────────────────────────────

async def _fetch_mep() -> float:
    """MEP: data912 → dolarapi.com → 1250 (fallback)."""
    try:
        return await data912.get_mep_value()
    except Exception:
        pass
    try:
        async with httpx.AsyncClient(timeout=8) as c:
            r = await c.get(URL_MEP_DOLAR)
            r.raise_for_status()
            return float(r.json()["venta"])
    except Exception as e:
        logger.warning("[ons] MEP no disponible (%s) — usando 1250", e)
        return 1250.0


async def _fetch_prices(tickers: list[str]) -> dict[str, dict]:
    """Precios ARS de ONs: data912 primario, IOL fallback."""
    result: dict[str, dict] = {}

    # data912
    try:
        corp_df = await data912.get_arg_corp()
        if not corp_df.empty:
            # Asegurar columna 'symbol'
            if "symbol" not in corp_df.columns:
                sym_col = next((c for c in corp_df.columns if "ticker" in c.lower() or "symbol" in c.lower()), None)
                if sym_col:
                    corp_df = corp_df.rename(columns={sym_col: "symbol"})
            if "symbol" in corp_df.columns:
                corp_df["_tk"] = corp_df["symbol"].astype(str).str.strip().str.upper()
                for tk in tickers:
                    row = corp_df[corp_df["_tk"] == tk]
                    if row.empty:
                        continue
                    r = row.iloc[0]
                    try:
                        price = float(str(r.get("c", "")).replace(",", "."))
                        if not np.isfinite(price) or price <= 0:
                            continue
                        pct = None
                        try:
                            pct = float(str(r.get("pct_change", "")).replace(",", "."))
                            if not np.isfinite(pct):
                                pct = None
                        except Exception:
                            pass
                        vol = None
                        try:
                            v = float(str(r.get("v", 0) or 0).replace(",", "."))
                            if np.isfinite(v) and v > 0:
                                vol = int(v)
                        except Exception:
                            pass
                        result[tk] = {"price_ars": price, "pct_change": pct, "volume": vol}
                    except Exception:
                        continue
        logger.info("[ons] data912: %d/%d tickers con precio", len(result), len(tickers))
    except Exception as e:
        logger.warning("[ons] data912 get_arg_corp falló: %s", e)

    # IOL fallback para los que faltan
    missing = [tk for tk in tickers if tk not in result]
    if missing:
        try:
            async with httpx.AsyncClient(
                timeout=20, headers={"User-Agent": "Mozilla/5.0"}
            ) as c:
                r = await c.get(URL_IOL_ONS)
                r.raise_for_status()
                tables = pd.read_html(StringIO(r.text))
            if tables:
                df = tables[0]
                df.columns = [str(x).strip() for x in df.columns]
                sym_col = next(
                    (c for c in df.columns if c.lower() in {"símbolo","simbolo","ticker","instrumento"}),
                    df.columns[0]
                )
                px_col = next(
                    (c for c in df.columns if "ltimo" in c.lower() or "precio" in c.lower()),
                    df.columns[1]
                )
                df["_tk"] = df[sym_col].astype(str).str.strip().str.upper()
                for tk in missing:
                    row = df[df["_tk"] == tk]
                    if row.empty:
                        continue
                    try:
                        raw = str(row.iloc[0][px_col]).replace(".", "").replace(",", ".")
                        px = float(raw)
                        if px > 1000:
                            px /= 100
                        result[tk] = {"price_ars": px, "pct_change": None, "volume": None}
                    except Exception:
                        pass
            logger.info("[ons] IOL fallback: %d/%d tickers con precio", len(result), len(tickers))
        except Exception as e:
            logger.warning("[ons] IOL fallback falló: %s", e)

    return result


# ── Tabla principal ──────────────────────────────────────────────────────────

async def get_ytm_table() -> list[dict]:
    """
    Retorna una lista de dicts con YTM y métricas por ticker.
    Cada item tiene: ticker, legislacion, price_ars, price_usd, mep,
    ytm, duration, modified_duration, cupon, pct_change, volumen,
    next_coupon, maturity, dias_vencimiento, status.
    """
    # 1. Cargar BD cashflows
    try:
        cf_df = load_bd_ons()
    except Exception as e:
        logger.error("[ons] Error al cargar BD: %s", e)
        return []

    if cf_df.empty:
        logger.warning("[ons] BD vacía después de limpieza")
        return []

    tickers = cf_df["ticker"].unique().tolist()
    today   = pd.Timestamp.today().normalize()

    # 2. Precios y MEP en paralelo (sin asyncio.create_task para máxima compatibilidad)
    mep_result, prices_result = await asyncio.gather(
        _fetch_mep(),
        _fetch_prices(tickers),
        return_exceptions=True,
    )

    mep: float = mep_result if isinstance(mep_result, float) else 1250.0
    prices: dict = prices_result if isinstance(prices_result, dict) else {}

    if isinstance(mep_result, Exception):
        logger.warning("[ons] MEP error: %s — usando 1250", mep_result)
    if isinstance(prices_result, Exception):
        logger.warning("[ons] Prices error: %s", prices_result)

    rows: list[dict] = []

    for ticker, group in cf_df.groupby("ticker"):
        try:
            future = group[group["date"] > today].sort_values("date")

            if future.empty:
                rows.append({"ticker": ticker, "status": "NO_FUTURE_CASHFLOWS"})
                continue

            # Legislacion y cupón desde BD
            legislacion = _normalize_leg(
                group["legislacion"].dropna().iloc[0]
                if "legislacion" in group.columns and group["legislacion"].notna().any()
                else None
            )
            cupon_decimal = (
                float(group["Tasa de Cupon"].dropna().iloc[0])
                if "Tasa de Cupon" in group.columns and group["Tasa de Cupon"].notna().any()
                else None
            )

            # Precio
            px_info   = prices.get(ticker, {})
            price_ars = float(px_info.get("price_ars", np.nan))
            pct_change = px_info.get("pct_change")
            volume     = px_info.get("volume")

            if not np.isfinite(price_ars) or price_ars <= 0:
                rows.append({
                    "ticker":      ticker,
                    "legislacion": legislacion,
                    "maturity":    future.iloc[-1]["date"].strftime("%Y-%m-%d"),
                    "next_coupon": future.iloc[0]["date"].strftime("%Y-%m-%d"),
                    "cupon":       round(cupon_decimal * 100, 2) if cupon_decimal is not None else None,
                    "dias_vencimiento": (future.iloc[-1]["date"] - today).days,
                    "status":      "NO_PRICE",
                })
                continue

            price_usd = price_ars / mep if mep > 0 else np.nan

            # YTM y Duration
            cfs   = future["cf"].astype(float).tolist()
            dates = [today] + future["date"].tolist()
            ytm   = _solve_ytm(cfs, dates, float(price_usd) if np.isfinite(price_usd) else price_ars)
            dur   = _macaulay_duration(cfs, dates, ytm)
            dur_mod = dur / (1.0 + ytm / 2.0) if (np.isfinite(dur) and np.isfinite(ytm) and ytm > -1) else np.nan

            maturity = future.iloc[-1]["date"]
            next_cf  = future.iloc[0]

            rows.append({
                "ticker":            ticker,
                "legislacion":       legislacion,
                "price_ars":         round(float(price_ars), 2),
                "price_usd":         round(float(price_usd), 4) if np.isfinite(price_usd) else None,
                "mep":               round(float(mep), 2),
                "ytm":               round(float(ytm) * 100, 2) if np.isfinite(ytm) else None,
                "duration":          round(float(dur), 4) if np.isfinite(dur) else None,
                "modified_duration": round(float(dur_mod), 4) if np.isfinite(dur_mod) else None,
                "cupon":             round(float(cupon_decimal) * 100, 2) if cupon_decimal is not None else None,
                "pct_change":        round(float(pct_change), 2) if pct_change is not None and np.isfinite(float(pct_change)) else None,
                "volumen":           volume,
                "next_coupon":       next_cf["date"].strftime("%Y-%m-%d"),
                "maturity":          maturity.strftime("%Y-%m-%d"),
                "dias_vencimiento":  (maturity - today).days,
                "status":            "OK",
            })

        except Exception as e:
            logger.warning("[ons] Error procesando %s: %s", ticker, e)
            rows.append({"ticker": ticker, "status": f"ERROR: {str(e)[:60]}"})

    ok_count = sum(1 for r in rows if r.get("status") == "OK")
    logger.info("[ons] Tabla lista: %d filas | %d OK | MEP=%.2f", len(rows), ok_count, mep)
    return rows
