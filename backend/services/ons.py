"""ONs YTM — YTM bisection (30/360 day count).

Fuentes de datos:
  - Cashflows: BD ONs.xlsx (backend/data/)
  - Precios:   data912 /live/arg_corp (primario) → IOL HTML (fallback)
  - MEP:       data912 → dolarapi.com (fallback)

La columna de legislacion y lamina_minima se lee directamente del Excel.
"""
from __future__ import annotations

import logging
from datetime import date
from io import StringIO
from pathlib import Path
from typing import Optional

import httpx
import numpy as np
import pandas as pd

from cache import async_cached
from config import settings
from services import data912

logger = logging.getLogger(__name__)

URL_IOL_ONS  = "https://iol.invertironline.com/mercado/cotizaciones/argentina/obligaciones-negociables/todos"
URL_MEP_DOLAR = "https://dolarapi.com/v1/dolares/bolsa"
BD_ONS = "BD ONs.xlsx"


# ── YTM solver (30/360) ──────────────────────────────────────────────────────

def _days_30_360(d1: pd.Timestamp, d2: pd.Timestamp) -> float:
    y1, m1, day1 = d1.year, d1.month, min(d1.day, 30)
    y2, m2, day2 = d2.year, d2.month, min(d2.day, 30)
    return (y2 - y1) * 360 + (m2 - m1) * 30 + (day2 - day1)


def solve_ytm(cashflows: list[float], dates: list[pd.Timestamp], price: float) -> float:
    """YTM via bisección, convención 30/360."""
    if not cashflows or not dates or price <= 0:
        return np.nan

    def f(r: float) -> float:
        t0 = dates[0]
        return sum(
            cf / (1.0 + r) ** (_days_30_360(t0, dt) / 360.0)
            for cf, dt in zip(cashflows, dates[1:])
        ) - price

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


def _macaulay_duration(cashflows: list[float], dates: list[pd.Timestamp], ytm: float) -> float:
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
    if pv_total <= 0:
        return np.nan
    return weighted / pv_total


# ── BD loader ────────────────────────────────────────────────────────────────

def load_bd_ons() -> pd.DataFrame:
    """
    Carga BD ONs.xlsx con detección de columnas case-insensitive.

    Columnas requeridas (acepta cualquier capitalización):
      ticker, date, cf (cashflow total)

    Columnas opcionales:
      Principal, Int., Tasa de Cupon, Dias, legislacion, lamina_minima
    """
    path = settings.data_path / BD_ONS
    if not path.exists():
        raise FileNotFoundError(f"BD ONs no encontrada: {path}")

    df = pd.read_excel(path)
    # Limpiar nombres de columnas (strip whitespace)
    df.columns = [str(c).strip() for c in df.columns]

    # Mapa case-insensitive para encontrar columnas sin importar mayúsculas
    col_lower = {c.lower(): c for c in df.columns}

    # Columnas requeridas (minúsculas para búsqueda)
    required = {"ticker": "ticker", "date": "date", "cf": "cf"}
    missing = [k for k in required if k not in col_lower]
    if missing:
        raise ValueError(
            f"Columnas requeridas no encontradas: {missing}. "
            f"Disponibles: {df.columns.tolist()}"
        )

    # Construir mapa de renombrado (solo las que existen y necesitan normalización)
    rename = {}
    for lower_name, std_name in {
        "ticker": "ticker",
        "date": "date",
        "cf": "cf",
        "principal": "Principal",
        "int.": "Int.",
        "tasa de cupon": "Tasa de Cupon",
        "dias": "Dias",
        "legislacion": "legislacion",
        "lamina_minima": "lamina_minima",
    }.items():
        if lower_name in col_lower and col_lower[lower_name] != std_name:
            rename[col_lower[lower_name]] = std_name

    if rename:
        df = df.rename(columns=rename)

    # Tipos
    df["ticker"] = df["ticker"].astype(str).str.strip().str.upper()
    df["date"]   = pd.to_datetime(df["date"], errors="coerce")
    df["cf"]     = pd.to_numeric(df["cf"],  errors="coerce").fillna(0.0)

    for col in ["Principal", "Int.", "Tasa de Cupon", "Dias"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)

    # Quitar filas sin fecha válida o ticker vacío
    df = df.dropna(subset=["date"]).copy()
    df = df[df["ticker"].str.len() > 0].copy()

    logger.info("[ons] BD cargada: %d filas, %d tickers",
                len(df), df["ticker"].nunique())
    return df.sort_values(["ticker", "date"]).reset_index(drop=True)


# ── Precio / MEP ─────────────────────────────────────────────────────────────

async def _fetch_mep() -> float:
    """MEP: data912 primario → dolarapi fallback → hardcode 1200."""
    try:
        return await data912.get_mep_value()
    except Exception:
        pass
    try:
        async with httpx.AsyncClient(timeout=8) as c:
            r = await c.get(URL_MEP_DOLAR)
            r.raise_for_status()
            return float(r.json()["venta"])
    except Exception:
        logger.warning("[ons] MEP no disponible, usando 1200 como fallback")
        return 1200.0


async def _fetch_prices_ons(tickers: list[str]) -> dict[str, dict]:
    """
    Precios de ONs en ARS (y pct_change).
    data912 /live/arg_corp → primario
    IOL tabla ONs          → fallback
    """
    result: dict[str, dict] = {}

    # Primario: data912
    try:
        corp_df = await data912.get_arg_corp()
        corp_df["_tk"] = corp_df["symbol"].astype(str).str.strip().str.upper()
        for tk in tickers:
            rows = corp_df[corp_df["_tk"] == tk]
            if rows.empty:
                continue
            r = rows.iloc[0]
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
        logger.warning("[ons] data912 get_arg_corp failed: %s", e)

    # Fallback IOL para los que faltan
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
                    (c for c in df.columns if c.lower() in {"símbolo", "simbolo", "ticker", "instrumento"}),
                    df.columns[0]
                )
                px_col = next(
                    (c for c in df.columns if "ltimo" in c.lower() or "precio" in c.lower() or "cierre" in c.lower()),
                    df.columns[1]
                )
                df["_tk"] = df[sym_col].astype(str).str.strip().str.upper()
                for tk in missing:
                    row = df[df["_tk"] == tk]
                    if row.empty:
                        continue
                    try:
                        px_raw = str(row.iloc[0][px_col]).replace(".", "").replace(",", ".")
                        px = float(px_raw)
                        if px > 1000:
                            px /= 100
                        result[tk] = {"price_ars": px, "pct_change": None, "volume": None}
                    except Exception:
                        pass
            logger.info("[ons] IOL fallback: ahora %d/%d tickers con precio", len(result), len(tickers))
        except Exception as e:
            logger.warning("[ons] IOL ONs fallback failed: %s", e)

    return result


def _normalize_leg(val) -> str:
    """Normaliza legislación a 'AR' o 'NY'."""
    if val is None or (isinstance(val, float) and np.isnan(val)):
        return "AR"
    s = str(val).strip().upper()
    if "NY" in s or "NEW YORK" in s:
        return "NY"
    return "AR"


# ── Tabla principal ──────────────────────────────────────────────────────────

@async_cached("ons_ytm_table", ttl=300)
async def get_ytm_table() -> list[dict]:
    """
    Retorna lista de dicts con YTM y métricas por ticker.

    Estructura de cada item:
      ticker, legislacion, precio_ars, precio_usd, mep,
      ytm (decimal), duration, pct_change, next_coupon, maturity,
      dias_vencimiento, cupon, status
    """
    # 1. Cargar cashflows
    try:
        cf_df = load_bd_ons()
    except FileNotFoundError as e:
        logger.error("[ons] %s", e)
        return []
    except Exception as e:
        logger.error("[ons] Error cargando BD: %s", e)
        return []

    if cf_df.empty:
        logger.warning("[ons] BD vacía después de limpieza")
        return []

    base_tickers = cf_df["ticker"].unique().tolist()
    today = pd.Timestamp.today().normalize()

    # 2. Precios y MEP en paralelo
    import asyncio
    mep_task    = asyncio.create_task(_fetch_mep())
    prices_task = asyncio.create_task(_fetch_prices_ons(base_tickers))
    mep, prices = await asyncio.gather(mep_task, prices_task, return_exceptions=True)

    if isinstance(mep, Exception):
        logger.warning("[ons] MEP error: %s — usando 1200", mep)
        mep = 1200.0
    if isinstance(prices, Exception):
        logger.warning("[ons] Prices error: %s", prices)
        prices = {}

    rows: list[dict] = []

    for ticker, group in cf_df.groupby("ticker"):
        # Flujos futuros (fecha > hoy)
        future = group[group["date"] > today].sort_values("date")

        if future.empty:
            rows.append({
                "ticker":   ticker,
                "status":   "NO_FUTURE_CASHFLOWS",
                "legislacion": _normalize_leg(
                    group["legislacion"].dropna().iloc[0]
                    if "legislacion" in group.columns and group["legislacion"].notna().any()
                    else None
                ),
            })
            continue

        # Legislacion desde BD
        leg_raw = (
            group["legislacion"].dropna().iloc[0]
            if "legislacion" in group.columns and group["legislacion"].notna().any()
            else None
        )
        legislacion = _normalize_leg(leg_raw)

        # Cupón
        cupon = (
            float(group["Tasa de Cupon"].dropna().iloc[0])
            if "Tasa de Cupon" in group.columns and group["Tasa de Cupon"].notna().any()
            else None
        )

        # Precio
        px_info   = prices.get(ticker, {})
        price_ars = px_info.get("price_ars", np.nan)
        pct_change = px_info.get("pct_change")
        volume    = px_info.get("volume")

        if pd.isna(price_ars) or price_ars <= 0:
            rows.append({
                "ticker":     ticker,
                "legislacion": legislacion,
                "status":     "NO_PRICE",
                "maturity":   future.iloc[-1]["date"].strftime("%Y-%m-%d"),
                "next_coupon": future.iloc[0]["date"].strftime("%Y-%m-%d"),
                "cupon":      round(cupon, 6) if cupon is not None else None,
            })
            continue

        price_usd = price_ars / mep if mep > 0 else np.nan

        # YTM calculation
        cfs    = future["cf"].astype(float).tolist()
        dates  = [today] + future["date"].tolist()
        ytm    = solve_ytm(cfs, dates, float(price_usd) if np.isfinite(price_usd) else price_ars)
        dur    = _macaulay_duration(cfs, dates, ytm)
        dur_mod = dur / (1.0 + ytm / 2.0) if np.isfinite(dur) and np.isfinite(ytm) and ytm > -1 else np.nan

        # Vencimiento y próximo cupón
        next_cf   = future.iloc[0]
        last_cf   = future.iloc[-1]
        maturity  = last_cf["date"]
        dias_vto  = (maturity - today).days

        ytm_pct = round(float(ytm) * 100, 2) if np.isfinite(ytm) else None
        rows.append({
            "ticker":            ticker,
            "legislacion":       legislacion,
            # Precios — ambos nombres para compatibilidad frontend
            "price_ars":         round(float(price_ars), 2),
            "precio_ars":        round(float(price_ars), 2),
            "price_usd":         round(float(price_usd), 4) if np.isfinite(price_usd) else None,
            "precio_usd":        round(float(price_usd), 4) if np.isfinite(price_usd) else None,
            "mep":               round(float(mep), 2),
            # TIR en porcentaje (convencion del frontend: "8.50" = 8.50%)
            "ytm":               ytm_pct,
            "ytm_decimal":       round(float(ytm), 6) if np.isfinite(ytm) else None,
            # Duration
            "duration":          round(float(dur), 4) if np.isfinite(dur) else None,
            "modified_duration": round(float(dur_mod), 4) if np.isfinite(dur_mod) else None,
            # Cupón
            "cupon":             round(float(cupon) * 100, 2) if cupon is not None else None,
            # Mercado
            "pct_change":        round(float(pct_change), 2) if pct_change is not None and np.isfinite(float(pct_change)) else None,
            "volumen":           volume,
            # Fechas
            "next_coupon":       next_cf["date"].strftime("%Y-%m-%d"),
            "maturity":          maturity.strftime("%Y-%m-%d"),
            "dias_vencimiento":  dias_vto,
            "status":            "OK",
        })

        logger.debug(
            "[ons] %-10s | ARS=%.2f | USD=%.4f | YTM=%.2f%% | Dur=%.2f",
            ticker, price_ars, price_usd if np.isfinite(price_usd) else 0,
            ytm * 100 if np.isfinite(ytm) else 0,
            dur if np.isfinite(dur) else 0,
        )

    ok_count = sum(1 for r in rows if r.get("status") == "OK")
    logger.info("[ons] Tabla lista: %d filas | %d OK | MEP=%.2f", len(rows), ok_count, mep)
    return rows
