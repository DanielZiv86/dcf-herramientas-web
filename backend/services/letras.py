"""Letras y Boncaps — carry, TNA/TEM, bandas cambiarias."""
from __future__ import annotations

import logging
from datetime import date, timedelta
from pathlib import Path

import httpx
import numpy as np
import pandas as pd

from config import settings
from services import data912

logger = logging.getLogger(__name__)

URL_DOLAR_MEP = "https://dolarapi.com/v1/dolares/bolsa"
ANCHOR = date(2025, 4, 11)


def _data_path() -> Path:
    return settings.data_path


def _to_float(x) -> float:
    if x is None or (isinstance(x, float) and np.isnan(x)):
        return np.nan
    s = str(x).strip().replace("$", "").replace(" ", "")
    if "," in s and "." in s:
        if s.rfind(",") > s.rfind("."):
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "")
    elif "," in s:
        s = s.replace(",", ".")
    try:
        return float(s)
    except Exception:
        return np.nan


async def _fetch_mep() -> float:
    try:
        return await data912.get_mep_value()
    except Exception:
        pass
    try:
        async with httpx.AsyncClient(timeout=8) as c:
            r = await c.get(URL_DOLAR_MEP)
            r.raise_for_status()
            return float(r.json()["venta"])
    except Exception:
        return 1200.0


async def _fetch_prices() -> pd.Series:
    try:
        notes = await data912.prices_arg_notes()
        bonds = await data912.prices_arg_bonds()
        return notes.combine_first(bonds)
    except Exception:
        return pd.Series(dtype=float)


def _load_xlsx() -> pd.DataFrame:
    path = _data_path() / "Letras Activas.xlsx"
    if not path.exists():
        raise FileNotFoundError(f"Letras Activas.xlsx not found: {path}")
    df = pd.read_excel(path, usecols=["Ticker", "Fecha Vencimiento", "Valor Final"], decimal=",")
    df.columns = [c.strip() for c in df.columns]
    df["Ticker"] = df["Ticker"].astype(str).str.strip()
    df["Fecha Vencimiento"] = pd.to_datetime(df["Fecha Vencimiento"], dayfirst=True, errors="coerce")
    df["Valor Final"] = pd.to_numeric(df["Valor Final"], errors="coerce")
    df = df.dropna(subset=["Ticker", "Fecha Vencimiento", "Valor Final"])
    return df.sort_values(["Ticker", "Fecha Vencimiento"]).drop_duplicates("Ticker", keep="last")


def _bandas_simple(exp_dates: pd.Series) -> tuple[pd.Series, pd.Series]:
    days = (exp_dates - pd.Timestamp(ANCHOR)).dt.days.clip(lower=0)
    months = days / 30.0
    techo = (1400 * (1.01 ** months)).round().astype("Int64")
    piso = (1000 * (0.99 ** months)).round().astype("Int64")
    return techo, piso


async def get_carry_table() -> tuple[list[dict], float]:
    """Returns (carry_table, mep_value)."""
    try:
        df_xls = _load_xlsx()
    except FileNotFoundError as e:
        logger.error(str(e))
        return [], 0.0

    prices, mep = await _fetch_prices(), await _fetch_mep()

    carry = pd.DataFrame({
        "Ticker": df_xls["Ticker"].values,
        "expiration": df_xls["Fecha Vencimiento"].values,
        "payoff": df_xls["Valor Final"].values,
    })
    carry["bond_price"] = carry["Ticker"].map(prices)

    today = pd.Timestamp.today().normalize().date()
    exp_dates = pd.to_datetime(carry["expiration"])
    maturity = exp_dates.dt.date.map(lambda d: d - timedelta(days=1))
    carry["days"] = (pd.to_datetime(maturity) - pd.Timestamp(today)).dt.days.clip(lower=0)

    px = pd.to_numeric(carry["bond_price"], errors="coerce")
    ratio = carry["payoff"] / px
    valid = carry["days"].astype(float).mask(lambda x: x <= 0, np.nan)

    carry["tna"] = ((ratio - 1) / valid * 365).replace([np.inf, -np.inf], np.nan)
    carry["tea"] = (ratio ** (365 / valid) - 1).replace([np.inf, -np.inf], np.nan)
    carry["tem"] = ((1 + carry["tea"]) ** (30 / 365) - 1).replace([np.inf, -np.inf], np.nan)
    carry["MEP_BE"] = (mep * ratio).round(0)

    techo, piso = _bandas_simple(exp_dates)
    carry["banda_sup"] = techo.values
    carry["banda_inf"] = piso.values

    carry = carry.sort_values("days")
    carry = carry.dropna(subset=["bond_price"])

    def _fmt(v):
        return None if (v is None or (isinstance(v, float) and np.isnan(v))) else v

    result = []
    for _, row in carry.iterrows():
        result.append({
            "ticker": row["Ticker"],
            "precio": _fmt(row.get("bond_price")),
            "dias": int(row["days"]) if pd.notna(row["days"]) else None,
            "tna": round(float(row["tna"]) * 100, 2) if pd.notna(row.get("tna")) else None,
            "tea": round(float(row["tea"]) * 100, 2) if pd.notna(row.get("tea")) else None,
            "tem": round(float(row["tem"]) * 100, 2) if pd.notna(row.get("tem")) else None,
            "mep_be": int(row["MEP_BE"]) if pd.notna(row.get("MEP_BE")) else None,
            "banda_sup": int(row["banda_sup"]) if pd.notna(row.get("banda_sup")) else None,
            "banda_inf": int(row["banda_inf"]) if pd.notna(row.get("banda_inf")) else None,
            "vencimiento": row["expiration"].strftime("%Y-%m-%d") if pd.notna(row["expiration"]) else None,
        })

    return result, round(float(mep), 2)


async def get_curva_points() -> list[dict]:
    """Scatter points for TNA/TEM curve vs days."""
    rows, _ = await get_carry_table()
    return [
        {"ticker": r["ticker"], "dias": r["dias"], "tna": r["tna"], "tem": r["tem"]}
        for r in rows
        if r["tna"] is not None and r["dias"] is not None and r["dias"] > 0
    ]
