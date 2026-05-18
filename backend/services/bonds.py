"""Bonos HD + BOPREAL — XIRR, Duration, multi-market table."""
from __future__ import annotations

import asyncio
import logging

import re
from datetime import date
from io import StringIO
from pathlib import Path
from typing import Iterable, Optional

import httpx
import numpy as np
import pandas as pd

from config import settings
from services import data912

logger = logging.getLogger(__name__)

URL_IOL_BONOS = "https://iol.invertironline.com/mercado/cotizaciones/argentina/bonos/todos"
URL_RIESGO_PAIS_HIST = "https://api.argentinadatos.com/v1/finanzas/indices/riesgo-pais"

MERCADOS = [("PESOS", ""), ("MEP", "D"), ("CCL", "C")]

EXPECTED_BASE = (
    "AE38", "AL29", "AL30", "AL35", "AL41", "AN29", "AO27", "AO28",
    "GD29", "GD30", "GD35", "GD38", "GD41", "GD46",
)

BD_BONOS_HD  = "BD BONOS HD.xlsx"
BD_BOPREALES = "BD BOPREALES.xlsx"

# BOPREAL tickers have a different naming convention in data912:
# base (ARS pesos) → (MEP ticker, CCL ticker)
BOPREAL_TICKER_MAP: dict[str, tuple[str, str]] = {
    "BPOA7": ("BPA7D",  "BPA7C"),
    "BPOA8": ("BPA8D",  "BPA8C"),
    "BPOB7": ("BPB7D",  "BPB7C"),
    "BPOB8": ("BPB8D",  "BPB8C"),
    "BPOC7": ("BPC7D",  "BPC7C"),
    "BPOD7": ("BPD7D",  "BPD7C"),
    # BPY26 excluded — no longer commercially traded
}

# Tickers to exclude from all bond tables and charts
EXCLUDED_TICKERS = {"BPY26", "BPY6D", "BPY6C"}


def _data_path() -> Path:
    return settings.data_path


# ── Numeric helpers ──────────────────────────────────────────────────────────

def _parse_float(x) -> float:
    if pd.isna(x):
        return np.nan
    s = str(x).strip()
    if s in {"", "-", "–"}:
        return np.nan
    s = re.sub(r"[^\d\.,-]", "", s)
    if not s:
        return np.nan
    if "." in s and "," in s:
        if s.rfind(".") > s.rfind(","):
            s = s.replace(",", "")
        else:
            s = s.replace(".", "").replace(",", ".")
    elif "," in s:
        s = s.replace(",", ".")
    try:
        return float(s)
    except Exception:
        return np.nan


# ── XNPV / XIRR ──────────────────────────────────────────────────────────────

def xnpv(rate: float, cashflows: np.ndarray, dates: pd.DatetimeIndex) -> float:
    if rate <= -1.0:
        return np.nan
    t0 = dates[0]
    years = (dates - t0).days / 365.0
    return float(np.sum(cashflows / (1.0 + rate) ** years))


def _bisect(f, a: float, b: float, tol: float = 1e-8, maxiter: int = 250) -> float:
    fa, fb = f(a), f(b)
    if np.isnan(fa) or np.isnan(fb) or np.sign(fa) == np.sign(fb):
        return np.nan
    lo, hi = (a, b) if a < b else (b, a)
    flo = fa if a < b else fb
    for _ in range(maxiter):
        mid = (lo + hi) / 2.0
        fmid = f(mid)
        if np.isnan(fmid):
            return np.nan
        if abs(fmid) < tol:
            return float(mid)
        if np.sign(flo) == np.sign(fmid):
            lo, flo = mid, fmid
        else:
            hi = mid
    return float((lo + hi) / 2.0)


def xirr(cashflows: np.ndarray, dates: pd.DatetimeIndex) -> float:
    try:
        f = lambda r: xnpv(r, cashflows, dates)
        lo, hi = -0.9999, 5.0
        if np.sign(f(lo)) == np.sign(f(hi)):
            for h in [10.0, 20.0, 50.0]:
                if np.sign(f(lo)) != np.sign(f(h)):
                    hi = h
                    break
        return _bisect(f, lo, hi)
    except Exception:
        return np.nan


def macaulay_duration(cashflows: np.ndarray, dates_full: pd.DatetimeIndex, y: float) -> float:
    if np.isnan(y) or y <= -1.0:
        return np.nan
    t0 = dates_full[0]
    times = (dates_full - t0).days / 365.0
    if len(times) != len(cashflows) + 1:
        return np.nan
    disc = (1.0 + y) ** times
    pv = cashflows / disc[1:]
    pv_total = float(np.sum(pv))
    if pv_total <= 0:
        return np.nan
    mac = float(np.sum(times[1:] * pv) / pv_total)
    return mac / (1.0 + y)  # modified duration


# ── Cashflow loading ──────────────────────────────────────────────────────────

def load_cashflows(filename: str) -> pd.DataFrame:
    path = _data_path() / filename
    if not path.exists():
        raise FileNotFoundError(f"Cashflow file not found: {path}")
    df = pd.read_excel(path)
    df.columns = [str(c).strip() for c in df.columns]
    required = ["Ticker", "Fecha", "Principal", "Int", "Cashflow"]
    missing = [c for c in required if c not in df.columns]
    if missing:
        raise ValueError(f"Missing columns in {filename}: {missing}")
    df["Ticker"] = df["Ticker"].astype(str).str.strip().str.upper()
    df["Fecha"] = pd.to_datetime(df["Fecha"], dayfirst=True, errors="coerce")
    for col in ["Principal", "Int", "Cashflow"]:
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)
    return df.dropna(subset=["Fecha"]).copy()


# ── IOL fallback ──────────────────────────────────────────────────────────────

async def _fetch_iol_prices(tickers: Iterable[str]) -> dict[str, float]:
    try:
        async with httpx.AsyncClient(timeout=20, headers={"User-Agent": "Mozilla/5.0"}) as c:
            r = await c.get(URL_IOL_BONOS)
            r.raise_for_status()
            tables = pd.read_html(StringIO(r.text))
            if not tables:
                return {}
            df = tables[0].copy()
            df.columns = [str(x).strip() for x in df.columns]
            sym_col = next((c for c in df.columns if c.lower() in {"símbolo", "simbolo", "ticker", "especie"}), df.columns[0])
            px_col = next((c for c in df.columns if c.lower() in {"último", "ultimo", "últ.", "precio", "cierre"}), df.columns[1])
            df["_tk"] = df[sym_col].astype(str).str.strip().str.upper()
            df["_px"] = df[px_col].apply(_parse_float)
            df["_px"] = np.where(df["_px"] > 500, df["_px"] / 100.0, df["_px"])
            tickers_set = {str(t).strip().upper() for t in tickers}
            df = df[df["_tk"].isin(tickers_set)].dropna(subset=["_px"])
            return dict(zip(df["_tk"], df["_px"]))
    except Exception as e:
        logger.warning("IOL bonds scrape failed: %s", e)
        return {}


# ── Price + market data fetching (data912 primary, IOL price fallback) ───────

async def _fetch_all_bond_data(tickers: list[str]) -> dict[str, dict]:
    """Returns {ticker: {price, pct_change, volume}} for each requested ticker."""
    result: dict[str, dict] = {}
    tk_set = {t.upper() for t in tickers}
    try:
        df = await data912.get_arg_bonds()
        if not df.empty:
            for _, row in df.iterrows():
                sym = str(row.get("symbol", "")).strip().upper()
                if sym not in tk_set:
                    continue
                try:
                    price = float(str(row.get("c", "")).replace(",", "."))
                except Exception:
                    price = np.nan
                if not np.isfinite(price):
                    continue
                try:
                    pct = float(str(row.get("pct_change", "")).replace(",", "."))
                except Exception:
                    pct = None
                try:
                    vol = float(str(row.get("v", 0) or 0))
                except Exception:
                    vol = 0.0
                result[sym] = {"price": price, "pct_change": pct, "volume": vol}
    except Exception as e:
        logger.warning("_fetch_all_bond_data data912 failed: %s", e)

    # IOL fallback for tickers still missing a price
    missing = [t for t in tickers if t.upper() not in result]
    if missing:
        iol_prices = await _fetch_iol_prices(missing)
        for tk, px in iol_prices.items():
            result[tk.upper()] = {"price": px, "pct_change": None, "volume": 0.0}

    return result


def _prices_from_data(mdata: dict[str, dict]) -> dict[str, float]:
    return {tk: d["price"] for tk, d in mdata.items() if np.isfinite(d.get("price", np.nan))}


def _implicit_fx(prices: dict, ref: str, kind: str) -> float:
    p = prices.get(ref, np.nan)
    q = prices.get(f"{ref}D" if kind == "MEP" else f"{ref}C", np.nan)
    if not (np.isfinite(p) and np.isfinite(q)) or q == 0:
        return np.nan
    return p / q


# ── Core computation ──────────────────────────────────────────────────────────

def _compute_metrics(cf: pd.DataFrame, base_tickers: list[str], prices: dict[str, float]) -> pd.DataFrame:
    today = pd.Timestamp.today().normalize()
    # Implicit FX
    ref = next((r for r in ("AL30", "GD30") if np.isfinite(prices.get(r, np.nan)) and
                (np.isfinite(prices.get(f"{r}D", np.nan)) or np.isfinite(prices.get(f"{r}C", np.nan)))), None)
    fx_mep = _implicit_fx(prices, ref, "MEP") if ref else np.nan
    fx_ccl = _implicit_fx(prices, ref, "CCL") if ref else np.nan

    rows = []
    for base in base_tickers:
        price_ars = prices.get(base, np.nan)
        price_mep = prices.get(f"{base}D", np.nan)
        price_ccl = prices.get(f"{base}C", np.nan)

        price_usd_pesos = (price_ars / fx_mep) if np.isfinite(price_ars) and np.isfinite(fx_mep) and fx_mep > 0 else np.nan

        future = cf[cf["Ticker"] == base][cf["Fecha"] > today].sort_values("Fecha").dropna(subset=["Fecha", "Cashflow"])

        for mercado, suf, px_shown, px_usd in [
            ("PESOS", "", price_ars, price_usd_pesos),
            ("MEP", "D", price_mep, price_mep),
            ("CCL", "C", price_ccl, price_ccl),
        ]:
            tir = dur = np.nan
            if not np.isnan(px_usd) and not future.empty:
                dates_full = pd.to_datetime([today] + future["Fecha"].tolist())
                cfs = np.concatenate(([-px_usd], future["Cashflow"].astype(float).to_numpy()))
                tir = xirr(cfs, dates_full)
                if not np.isnan(tir):
                    dur = macaulay_duration(future["Cashflow"].astype(float).to_numpy(), dates_full, tir)

            rows.append({
                "base": base,
                "ticker": f"{base}{suf}",
                "mercado": mercado,
                "precio": None if np.isnan(px_shown) else round(float(px_shown), 4),
                "tir": None if np.isnan(tir) else round(float(tir) * 100, 2),
                "duration": None if np.isnan(dur) else round(float(dur), 2),
            })

    return pd.DataFrame(rows)


# ── Public functions ─────────────────────────────────────────────────────────

async def get_hd_table(mercado: str = "MEP") -> list[dict]:
    """Returns HD bonds table for a given market, with pct_change and volume."""
    try:
        cf = load_cashflows(BD_BONOS_HD)
    except FileNotFoundError as e:
        logger.error(str(e))
        return []

    base_tickers = sorted(cf["Ticker"].unique().tolist())
    all_tickers = [f"{b}{s}" for b in base_tickers for _, s in MERCADOS]
    mdata = await _fetch_all_bond_data(all_tickers)
    prices = _prices_from_data(mdata)

    df = _compute_metrics(cf, base_tickers, prices)
    rows = df[df["mercado"] == mercado.upper()].to_dict(orient="records")

    for row in rows:
        md = mdata.get(row["ticker"], {})
        row["pct_change"] = md.get("pct_change")
        row["volume"] = md.get("volume", 0.0)

    return rows


async def get_bopreal_table(mercado: str = "MEP") -> list[dict]:
    """Returns BOPREAL bonds table using the correct data912 ticker mapping."""
    try:
        cf = load_cashflows(BD_BOPREALES)
    except FileNotFoundError as e:
        logger.error(str(e))
        return []

    base_tickers = sorted(t for t in cf["Ticker"].unique().tolist() if t not in EXCLUDED_TICKERS)
    today = pd.Timestamp.today().normalize()

    # Include base (ARS), mapped MEP/CCL tickers, and AL30 for FX calculation
    all_tickers = list({t for base in base_tickers
                        for t in [base] + list(BOPREAL_TICKER_MAP.get(base, (f"{base}D", f"{base}C")))})
    all_tickers += ["AL30", "AL30D", "AL30C"]

    mdata = await _fetch_all_bond_data(all_tickers)
    prices = _prices_from_data(mdata)

    fx_mep = (prices["AL30"] / prices["AL30D"]) if ("AL30D" in prices and "AL30" in prices and prices.get("AL30D", 0) > 0) else np.nan

    rows = []
    for base in base_tickers:
        mep_tk, ccl_tk = BOPREAL_TICKER_MAP.get(base, (f"{base}D", f"{base}C"))
        price_ars = prices.get(base, np.nan)
        price_mep = prices.get(mep_tk, np.nan)
        price_ccl = prices.get(ccl_tk, np.nan)

        if mercado.upper() == "MEP":
            current_tk  = mep_tk
            px_usd      = price_mep
            precio_show = price_mep           # USD price
        elif mercado.upper() == "CCL":
            current_tk  = ccl_tk
            px_usd      = price_ccl
            precio_show = price_ccl           # USD price
        else:  # PESOS — show ARS price, use USD-equivalent for TIR calculation
            current_tk  = base
            px_usd      = (price_ars / fx_mep) if np.isfinite(price_ars) and np.isfinite(fx_mep) else np.nan
            precio_show = price_ars           # ARS price (not converted)

        future = cf[(cf["Ticker"] == base) & (cf["Fecha"] > today)].sort_values("Fecha").dropna(subset=["Fecha", "Cashflow"])

        tir = dur = np.nan
        if np.isfinite(px_usd) and not future.empty:
            dates_full = pd.to_datetime([today] + future["Fecha"].tolist())
            cfs = np.concatenate(([-px_usd], future["Cashflow"].astype(float).to_numpy()))
            tir = xirr(cfs, dates_full)
            if not np.isnan(tir):
                dur = macaulay_duration(future["Cashflow"].astype(float).to_numpy(), dates_full, tir)

        md = mdata.get(current_tk, {})
        rows.append({
            "base": base,
            "ticker": mep_tk if mercado.upper() == "MEP" else (ccl_tk if mercado.upper() == "CCL" else base),
            "mercado": mercado.upper(),
            "precio": round(float(precio_show), 4) if np.isfinite(precio_show) else None,
            "tir": round(float(tir) * 100, 2) if not np.isnan(tir) else None,
            "duration": round(float(dur), 2) if not np.isnan(dur) else None,
            "group": "BOPREAL",
            "pct_change": md.get("pct_change"),
            "volume": md.get("volume", 0.0),
        })

    return rows


async def get_full_table() -> list[dict]:
    """Returns HD + BOPREAL across all markets."""
    try:
        hd, bop = await asyncio.gather(
            get_hd_table("MEP"),
            get_bopreal_table("MEP"),
            return_exceptions=True,
        )
        result = []
        if not isinstance(hd, Exception):
            for r in hd:
                r["group"] = "HD"
                result.append(r)
        if not isinstance(bop, Exception):
            result.extend(bop)
        return result
    except Exception as e:
        logger.error("get_full_table failed: %s", e)
        return []


async def get_bond_cashflows(base_ticker: str) -> dict:
    """Future cashflows per 100 VN for a specific base ticker (HD or BOPREAL)."""
    today = pd.Timestamp.today().normalize()
    tk = base_ticker.strip().upper()

    for filename, source in [(BD_BONOS_HD, "HD"), (BD_BOPREALES, "BOPREAL")]:
        try:
            cf = load_cashflows(filename)
            bond_cf = cf[cf["Ticker"] == tk].copy()
            if bond_cf.empty:
                continue
            future = bond_cf[bond_cf["Fecha"] > today].sort_values("Fecha")
            return {
                "ticker": tk,
                "source": source,
                "vencimiento": bond_cf["Fecha"].max().strftime("%Y-%m-%d"),
                "cashflows": [
                    {
                        "fecha":     row["Fecha"].strftime("%Y-%m-%d"),
                        "principal": round(float(row["Principal"]), 4) if pd.notna(row.get("Principal")) else 0.0,
                        "interes":   round(float(row["Int"]),       4) if pd.notna(row.get("Int"))       else 0.0,
                        "cashflow":  round(float(row["Cashflow"]),  4) if pd.notna(row.get("Cashflow"))  else 0.0,
                    }
                    for _, row in future.iterrows()
                ],
            }
        except Exception as e:
            logger.warning("get_bond_cashflows(%s) from %s failed: %s", tk, filename, e)

    return {"ticker": tk, "cashflows": [], "vencimiento": None}


async def get_riesgo_pais_history() -> list[dict]:
    """Historical country risk series — robust parsing, tolerates API envelope changes."""
    urls = [
        URL_RIESGO_PAIS_HIST,
        "https://api.argentinadatos.com/v1/finanzas/indices/riesgo-pais/",
    ]
    for url in urls:
        try:
            async with httpx.AsyncClient(timeout=12) as c:
                r = await c.get(url)
                r.raise_for_status()
                raw = r.json()

            # Accept both a direct list and a dict envelope like {"data": [...]}
            data = raw if isinstance(raw, list) else raw.get("data", raw.get("riesgo_pais", []))
            if not isinstance(data, list) or not data:
                continue

            result = []
            for d in data[-180:]:
                if not isinstance(d, dict):
                    continue
                fecha = d.get("fecha") or d.get("date") or d.get("Fecha")
                valor = d.get("valor") or d.get("value") or d.get("Valor")
                if fecha is None or valor is None:
                    continue
                try:
                    result.append({"fecha": str(fecha), "valor": float(valor)})
                except (ValueError, TypeError):
                    continue

            if result:
                return result
        except Exception as e:
            logger.warning("Riesgo País history failed (%s): %s", url, e)

    return []


async def get_sensibilidad(bond_type: str = "GLOBALES") -> list[dict]:
    """Price sensitivity table (DV01 / modified duration grid)."""
    # Build range of yield shifts
    shifts = list(range(-500, 550, 50))
    try:
        cf = load_cashflows(BD_BONOS_HD)
        base_tickers = sorted(cf["Ticker"].unique())
        prices = await _fetch_prices([f"{b}D" for b in base_tickers])

        from services.market_utils import is_global, is_bonar
        if bond_type.upper() == "GLOBALES":
            bases = [b for b in base_tickers if is_global(b)]
        elif bond_type.upper() == "BONARES":
            bases = [b for b in base_tickers if is_bonar(b)]
        else:
            bases = base_tickers

        today = pd.Timestamp.today().normalize()
        rows = []
        for base in bases:
            price_usd = prices.get(f"{base}D", np.nan)
            if np.isnan(price_usd):
                continue
            future = cf[cf["Ticker"] == base][cf["Fecha"] > today].sort_values("Fecha")
            if future.empty:
                continue
            dates_full = pd.to_datetime([today] + future["Fecha"].tolist())
            cfs = np.concatenate(([-price_usd], future["Cashflow"].astype(float).to_numpy()))
            base_tir = xirr(cfs, dates_full)
            if np.isnan(base_tir):
                continue
            row = {"ticker": base, "tir_base": round(base_tir * 100, 2)}
            for shift_bps in shifts:
                new_tir = base_tir + shift_bps / 10000
                px_new = xnpv(new_tir, cfs[1:], dates_full[1:])
                chg = ((px_new / price_usd) - 1) * 100
                row[f"shift_{shift_bps:+d}"] = round(chg, 2)
            rows.append(row)
        return rows
    except Exception as e:
        logger.warning("Sensibilidad failed: %s", e)
        return []
