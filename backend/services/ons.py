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


def _to_d_ticker(ticker: str) -> Optional[str]:
    """ARC1O → ARC1D (especie D = precio USD de mercado)."""
    t = str(ticker).strip().upper()
    if t.endswith("O") and len(t) >= 2:
        return t[:-1] + "D"
    return None


def _infer_periodicidad(dates: list) -> str:
    """Infiere frecuencia de pago a partir de gaps 30/360."""
    ts = sorted([pd.Timestamp(d) for d in dates if pd.notna(d)])
    if len(ts) < 2:
        return "Bullet"
    diffs = [_days_30_360(ts[i - 1], ts[i]) for i in range(1, len(ts))]
    med = float(np.median(diffs))
    if 25  <= med <= 35:  return "Mensual"
    if 80  <= med <= 100: return "Trimestral"
    if 170 <= med <= 190: return "Semestral"
    if 350 <= med <= 370: return "Anual"
    return "Irregular"


def _calc_valor_teorico(group: pd.DataFrame, settle: pd.Timestamp) -> dict:
    """
    Capital pendiente, interés pendiente, cupón corrido y valor teórico.
    Base: USD por 100 VN. Replicado de Streamlit ons_ytm_data.valor_teorico_ticker().
    """
    g = group.copy()
    g["date"] = pd.to_datetime(g["date"])
    future = g[g["date"] > settle].copy()
    past   = g[g["date"] <= settle].copy()

    cap_pend = float(future["Principal"].sum()) if not future.empty else 0.0
    int_pend = float(future["Int."].sum())      if not future.empty else 0.0

    cupon_corrido = 0.0
    if not future.empty and not past.empty:
        next_dt   = future["date"].min()
        last_dt   = past["date"].max()
        next_int  = float(future.loc[future["date"] == next_dt, "Int."].sum())
        period_d  = _days_30_360(last_dt, next_dt)
        elapsed_d = _days_30_360(last_dt, settle)
        if period_d > 0 and elapsed_d > 0:
            cupon_corrido = next_int * (elapsed_d / period_d)

    return {
        "capital_pendiente": round(cap_pend, 4),
        "interes_pendiente": round(int_pend, 4),
        "cupon_corrido":     round(cupon_corrido, 4),
        "valor_teorico":     round(cap_pend + cupon_corrido, 4),
    }


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


# ── Detalle por ticker ───────────────────────────────────────────────────────

async def get_detalle_ticker(ticker: str) -> dict:
    """
    Detalle completo de un ticker: métricas, cashflows futuros, valor teórico.
    Replica la lógica de Streamlit _render_detail() + valor_teorico_ticker().
    """
    ticker = str(ticker).strip().upper()

    try:
        cf_df = load_bd_ons()
    except Exception as e:
        return {"ticker": ticker, "status": "BD_ERROR", "error": str(e), "cashflows": []}

    group = cf_df[cf_df["ticker"] == ticker].copy()
    if group.empty:
        return {"ticker": ticker, "status": "NOT_FOUND", "cashflows": []}

    today   = pd.Timestamp.today().normalize()
    group["date"] = pd.to_datetime(group["date"])
    future  = group[group["date"] > today].sort_values("date")

    if future.empty:
        return {"ticker": ticker, "status": "NO_FUTURE_CASHFLOWS", "cashflows": []}

    # ── Metadata desde BD ───────────────────────────────────────────────────
    legislacion = _normalize_leg(
        group["legislacion"].dropna().iloc[0]
        if "legislacion" in group.columns and group["legislacion"].notna().any()
        else None
    )
    lamina_minima = None
    if "lamina_minima" in group.columns and group["lamina_minima"].notna().any():
        try:
            lamina_minima = int(float(str(group["lamina_minima"].dropna().iloc[0]).replace(",", ".")))
        except Exception:
            pass

    cupon_decimal = None
    if "Tasa de Cupon" in group.columns and group["Tasa de Cupon"].notna().any():
        try:
            cupon_decimal = float(group["Tasa de Cupon"].dropna().iloc[0])
        except Exception:
            pass

    periodicidad  = _infer_periodicidad(future["date"].tolist())
    maturity_ts   = future["date"].max()
    next_cf_ts    = future["date"].min()
    dias_vto      = (maturity_ts - today).days
    dias_proximo  = (next_cf_ts  - today).days
    next_int      = float(future.loc[future["date"] == next_cf_ts, "Int."].sum())
    next_amort    = float(future.loc[future["date"] == next_cf_ts, "Principal"].sum())

    vt = _calc_valor_teorico(group, today)

    # ── Precios y MEP en paralelo ───────────────────────────────────────────
    d_ticker = _to_d_ticker(ticker)
    tickers_fetch = [ticker] + ([d_ticker] if d_ticker else [])

    mep_res, prices_res = await asyncio.gather(
        _fetch_mep(),
        _fetch_prices(tickers_fetch),
        return_exceptions=True,
    )
    mep    = mep_res    if isinstance(mep_res,    float) else 1250.0
    prices = prices_res if isinstance(prices_res, dict)  else {}

    # Precio ARS (ticker O)
    ars_info   = prices.get(ticker, {})
    price_ars  = float(ars_info.get("price_ars", np.nan))
    pct_change = ars_info.get("pct_change")
    volume     = ars_info.get("volume")
    price_ars  = price_ars if np.isfinite(price_ars) and price_ars > 0 else None

    # Precio USD via MEP (ARS / MEP)
    price_usd_mep = (price_ars / mep) if (price_ars and mep > 0) else None

    # Precio USD ticker D (IOL / data912 a veces devuelve ×100 → si >1000, /100)
    price_usd_d = None
    if d_ticker and d_ticker in prices:
        raw_d = prices[d_ticker].get("price_ars")
        if raw_d is not None:
            try:
                raw_d = float(raw_d)
                if np.isfinite(raw_d) and raw_d > 0:
                    price_usd_d = raw_d / 100.0 if raw_d > 1000 else raw_d
            except Exception:
                pass

    # ── YTM y Duration ──────────────────────────────────────────────────────
    cfs   = future["cf"].astype(float).tolist()
    dates = [today] + future["date"].tolist()
    price_for_ytm = price_usd_mep or price_usd_d or np.nan

    ytm     = _solve_ytm(cfs, dates, price_for_ytm) if np.isfinite(price_for_ytm) else np.nan
    dur     = _macaulay_duration(cfs, dates, ytm)
    dur_mod = dur / (1.0 + ytm / 2.0) if (np.isfinite(dur) and np.isfinite(ytm) and ytm > -1) else np.nan

    # Paridades: (precio / valor_teorico - 1) × 100
    vt_v = vt["valor_teorico"]
    par_mep = ((price_usd_mep / vt_v) - 1) * 100 if (price_usd_mep and vt_v > 0) else None
    par_d   = ((price_usd_d   / vt_v) - 1) * 100 if (price_usd_d   and vt_v > 0) else None

    def _r(v, dec=4):
        if v is None: return None
        try:
            f = float(v)
            return round(f, dec) if np.isfinite(f) else None
        except Exception:
            return None

    # ── Cashflows futuros ───────────────────────────────────────────────────
    cashflows = []
    for _, row in future.iterrows():
        days_to = (row["date"] - today).days
        cf_total = float(row["cf"])
        pv = (cf_total / (1 + ytm) ** (days_to / 365.0)
              if np.isfinite(ytm) and days_to > 0 else None)
        cashflows.append({
            "fecha":               row["date"].strftime("%Y-%m-%d"),
            "capital_usd":         _r(float(row["Principal"]), 4),
            "interes_usd":         _r(float(row["Int."]),      4),
            "cashflow_total_usd":  _r(cf_total,                4),
            "dias_hasta_flujo":    days_to,
            "valor_presente":      _r(pv,                      4),
        })

    return {
        "ticker":               ticker,
        "ticker_d":             d_ticker,
        "legislacion":          legislacion,
        "maturity":             maturity_ts.strftime("%Y-%m-%d"),
        "periodicidad":         periodicidad,
        "lamina_minima":        lamina_minima,
        "cupon_pct":            round(cupon_decimal * 100, 4) if cupon_decimal is not None else None,
        "dias_vencimiento":     dias_vto,
        "proximo_pago":         next_cf_ts.strftime("%Y-%m-%d"),
        "dias_proximo_pago":    dias_proximo,
        "interes_proximo_pago": _r(next_int,  4),
        "amort_proximo_pago":   _r(next_amort, 4),
        "capital_pendiente":    vt["capital_pendiente"],
        "interes_pendiente":    vt["interes_pendiente"],
        "cupon_corrido":        vt["cupon_corrido"],
        "valor_teorico":        vt["valor_teorico"],
        "price_ars":            _r(price_ars, 2),
        "price_usd_mep":        _r(price_usd_mep, 4),
        "price_usd_d":          _r(price_usd_d, 4),
        "mep":                  round(float(mep), 2),
        "ytm":                  _r(ytm * 100 if np.isfinite(ytm) else None, 2),
        "duration":             _r(dur, 4)     if np.isfinite(dur) else None,
        "modified_duration":    _r(dur_mod, 4) if np.isfinite(dur_mod) else None,
        "paridad_mep":          _r(par_mep, 2),
        "paridad_d":            _r(par_d,   2),
        "pct_change":           _r(pct_change, 2),
        "volumen":              volume,
        "cashflows":            cashflows,
        "status":               "OK",
        "errors":               [],
    }
