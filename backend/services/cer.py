"""
Bonos CER — TIR real calculada desde cashflows propios + CER index (v2).

Motor v2:
    index_ratio  = CER(ref_settle) / CER(ref_base)
    precio_real  = precio_mercado / index_ratio
    TIR real     = XIRR([-precio_real, CF1, CF2, ...], [settle, t1, t2, ...])

Los CFs contractuales no se ajustan por CER: el ratio se cancela algebraicamente,
dejando solo los flujos reales. Fuente: teoria de bonos CER (BCRA / Finanzas AR).

Fallback: Bonistas.com scraping (cuando los Excels no estén completos).
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
from datetime import date, timedelta
from io import StringIO
from typing import Optional

import httpx
import numpy as np
import pandas as pd

from cache import async_cached, cached
from config import settings
from services import data912
from services.bonds import load_cashflows, macaulay_duration, xirr

logger = logging.getLogger(__name__)

URL_BONISTAS_CER      = "https://bonistas.com/bonos-cer-hoy"
URL_ARGDATOS_CER      = "https://api.argentinadatos.com/v1/finanzas/indices/cer"
URL_ARGDATOS_INFLACION = "https://api.argentinadatos.com/v1/finanzas/indices/inflacion"
URL_DATOSGOBAR_CER    = (
    "https://infra.datos.gob.ar/catalog/sspm/dataset/94/distribution/"
    "94.2/download/cer-uva-uvi-diarios.csv"
)
URL_IOL_BONOS  = "https://iol.invertironline.com/mercado/cotizaciones/argentina/bonos/todos"
URL_IOL_TITPUB = "https://iol.invertironline.com/mercado/cotizaciones/argentina/titulospublicos/todos"

CER_TICKERS = [
    # Bonos CER con cupón (BONCER)
    "TX26", "TX28", "TX29", "TX31", "TXM8", "TXM9",
    # Bonos CER zero-coupon (TZX series)
    "TZX26", "TZXO6", "TZXD6",
    "TZXM7", "TZXA7", "TZXY7", "TZX27",
    "TZXS7", "TZXD7",
    "TZXM8", "TZX28", "TZXS8",
    "TZXM9",
    # LECERs (X series)
    "X15Y6", "X29Y6", "X31L6", "X30S6", "X30N6",
    # Amortizing (excluded from curve but needed for price fetch)
    "DICP", "PARP", "DIP0", "PAP0", "CUAP",
]

BD_CER_FILE   = "BD BONOS CER.xlsx"
META_CER_FILE = "metadata_cer.xlsx"


# ═══════════════════════════════════════════════════════════════════════════════
# Argentina business day calendar
# ═══════════════════════════════════════════════════════════════════════════════

class _ArgCal:
    """Argentine business day calendar using the holidays library."""

    def __init__(self) -> None:
        self._official: set[date] = set()
        try:
            import holidays as hol
            current_year = date.today().year
            for yr in range(current_year - 5, current_year + 5):
                self._official.update(hol.country_holidays("AR", years=yr).keys())
        except ImportError:
            logger.warning("[cer] holidays lib not available — using weekdays only")

    def is_business_day(self, d: date) -> bool:
        return d.weekday() < 5 and d not in self._official

    def business_days_before(self, d: date, n: int) -> date:
        result = d
        remaining = n
        while remaining > 0:
            result -= timedelta(days=1)
            if self.is_business_day(result):
                remaining -= 1
        return result

    def business_days_after(self, d: date, n: int) -> date:
        result = d
        remaining = n
        while remaining > 0:
            result += timedelta(days=1)
            if self.is_business_day(result):
                remaining -= 1
        return result

    def get_reference_date(self, rule: str, target: date) -> date:
        """Apply a date rule like 'business_days_before:10' to a target date."""
        rule = rule.strip().lower()
        if rule == "same_day":
            return target
        if ":" not in rule:
            raise ValueError(f"Unknown CER date rule: '{rule}'")
        rtype, n_str = rule.rsplit(":", 1)
        n = int(n_str)
        if rtype == "business_days_before":
            return self.business_days_before(target, n)
        if rtype == "business_days_after":
            return self.business_days_after(target, n)
        if rtype == "calendar_days_before":
            return target - timedelta(days=n)
        if rtype == "calendar_days_after":
            return target + timedelta(days=n)
        raise ValueError(f"Unknown CER rule type: '{rtype}'")


# ═══════════════════════════════════════════════════════════════════════════════
# Metadata loader
# ═══════════════════════════════════════════════════════════════════════════════

@cached("cer_metadata", ttl=3600)
def _load_cer_metadata() -> pd.DataFrame:
    """
    Load CER instrument metadata from metadata_cer.xlsx.

    Supports two column formats:
    - Streamlit format: "Fecha Emision", "Cupon (decimal)", "Frecuencia Cupon", ...
    - Legacy template:  "FechaEmision", "TasaCupon", "FrecCupon", ...
    Both are normalized to internal field names.
    """
    path = settings.data_path / META_CER_FILE
    if not path.exists():
        raise FileNotFoundError(f"{META_CER_FILE} not found: {path}")

    df = pd.read_excel(path)
    # Normalize column names: strip whitespace, remove tildes for robust matching
    df.columns = [
        str(c).strip()
        .replace("ó", "o").replace("é", "e").replace("í", "i")
        .replace("á", "a").replace("ú", "u").replace("ñ", "n")
        for c in df.columns
    ]

    # Unified column mapping (Streamlit names → internal names)
    col_aliases: dict[str, str] = {
        "Ticker": "Ticker",
        "Tipo": "Tipo",
        "Fecha Emision": "FechaEmision",
        "FechaEmision": "FechaEmision",
        "Fecha Vencimiento": "FechaVencimiento",
        "FechaVencimiento": "FechaVencimiento",
        "Regla CER Base": "CER_BaseDate_Rule",
        "CER_BaseDate_Rule": "CER_BaseDate_Rule",
        "Regla CER Settlement": "CER_SettleDate_Rule",
        "CER_SettleDate_Rule": "CER_SettleDate_Rule",
        "Cupon (decimal)": "CouponDecimal",      # Streamlit: fraction (0.02 = 2%)
        "TasaCupon": "TasaCuponPct",             # Legacy template: percent (2.0 = 2%)
        "Frecuencia Cupon": "FrecCupon",
        "FrecCupon": "FrecCupon",
        "VN Base": "VN_Base",
        "VN_Base": "VN_Base",
        "Base Precio": "Base_Precio",
        "Base_Precio": "Base_Precio",
        "Moneda": "Moneda",
        "ISIN": "ISIN",
    }
    rename = {c: col_aliases[c] for c in df.columns if c in col_aliases}
    df = df.rename(columns=rename)

    # Keep only valid ticker rows
    df = df[df["Ticker"].notna()].copy()
    df["Ticker"] = df["Ticker"].astype(str).str.strip().str.upper()
    df = df[df["Ticker"].str.match(r"^[A-Z0-9]{2,8}$", na=False)].copy()

    # Resolve coupon_rate: decimal (Streamlit) or percent (legacy)
    if "CouponDecimal" in df.columns:
        df["CouponRate"] = pd.to_numeric(df["CouponDecimal"], errors="coerce").fillna(0.0)
        # values are already fractions (0.02 = 2%)
    elif "TasaCuponPct" in df.columns:
        df["CouponRate"] = pd.to_numeric(df["TasaCuponPct"], errors="coerce").fillna(0.0) / 100.0
    else:
        df["CouponRate"] = 0.0

    df["FrecCupon"] = pd.to_numeric(df.get("FrecCupon", 0), errors="coerce").fillna(0).astype(int)

    # Parse dates
    df["FechaEmision"]     = pd.to_datetime(df.get("FechaEmision"),     errors="coerce")
    df["FechaVencimiento"] = pd.to_datetime(df.get("FechaVencimiento"), errors="coerce")

    # Rule columns with defaults (use :10 for both — standard AR CER convention)
    df["CER_BaseDate_Rule"]   = df.get("CER_BaseDate_Rule",   pd.Series("business_days_before:10", index=df.index)).fillna("business_days_before:10").astype(str).str.strip()
    df["CER_SettleDate_Rule"] = df.get("CER_SettleDate_Rule", pd.Series("business_days_before:10", index=df.index)).fillna("business_days_before:10").astype(str).str.strip()
    df["Tipo"]                = df.get("Tipo", pd.Series("BONCER_COUPON", index=df.index)).fillna("BONCER_COUPON").astype(str).str.strip().str.upper()
    df["VN_Base"]             = pd.to_numeric(df.get("VN_Base", 100.0), errors="coerce").fillna(100.0)

    df = df.dropna(subset=["Ticker", "FechaEmision", "FechaVencimiento"])
    logger.info("[cer] Metadata loaded: %d instruments — %s", len(df), df["Ticker"].tolist())
    return df.reset_index(drop=True)


# ═══════════════════════════════════════════════════════════════════════════════
# CER series fetch + lookup
# ═══════════════════════════════════════════════════════════════════════════════

@async_cached("cer_series", ttl=3600)
async def _fetch_cer_series() -> pd.Series:
    """
    Fetch daily CER series extended to today.

    Strategy (same as Streamlit):
      1. datos.gob.ar official CSV (accurate history, ~30-45 days behind)
      2. argentinadatos.com /cer as alternative (may return 404)
      3. Extend whichever we got using IPC mensual from argentinadatos.com

    Returns pd.Series with DatetimeIndex sorted ascending.
    """
    import calendar as _cal

    errors: list[str] = []
    official_series: pd.Series | None = None

    # Source A: datos.gob.ar CER CSV (primary — accurate BCRA IPC-GBA data)
    try:
        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.get(URL_DATOSGOBAR_CER)
            r.raise_for_status()
            df = pd.read_csv(StringIO(r.text))
        date_col = next((c for c in df.columns if "tiempo" in c.lower() or "fecha" in c.lower()), None)
        val_col  = next((c for c in df.columns if "cer" in c.lower()), None)
        if date_col and val_col:
            df[date_col] = pd.to_datetime(df[date_col])
            df[val_col]  = pd.to_numeric(df[val_col], errors="coerce")
            df = df.dropna(subset=[date_col, val_col])
            official_series = pd.Series(
                df[val_col].values, index=pd.DatetimeIndex(df[date_col])
            ).sort_index()
            logger.info("[cer] CER from datos.gob.ar: %d values, last=%s",
                        len(official_series), official_series.index.max().date())
    except Exception as e:
        errors.append(f"datos.gob.ar: {e}")
        logger.warning("[cer] datos.gob.ar CER failed: %s", e)

    # Source B: argentinadatos.com /cer (fallback, sometimes 404)
    if official_series is None:
        try:
            async with httpx.AsyncClient(timeout=20) as c:
                r = await c.get(URL_ARGDATOS_CER)
                r.raise_for_status()
                data = r.json()
            df = pd.DataFrame(data)
            df["fecha"] = pd.to_datetime(df["fecha"])
            df["valor"] = pd.to_numeric(df["valor"], errors="coerce")
            df = df.dropna(subset=["fecha", "valor"])
            official_series = pd.Series(
                df["valor"].values, index=pd.DatetimeIndex(df["fecha"])
            ).sort_index()
            logger.info("[cer] CER from argentinadatos.com: %d values, last=%s",
                        len(official_series), official_series.index.max().date())
        except Exception as e:
            errors.append(f"argentinadatos /cer: {e}")
            logger.warning("[cer] argentinadatos /cer failed: %s", e)

    if official_series is None:
        raise RuntimeError(f"Cannot fetch CER base series. Errors: {errors}")

    last_official_date = official_series.index.max().date()
    today = date.today()
    gap_days = (today - last_official_date).days

    if gap_days <= 0:
        return official_series  # already up to date

    # Extend with monthly IPC from argentinadatos.com
    try:
        async with httpx.AsyncClient(timeout=20) as c:
            r = await c.get(URL_ARGDATOS_INFLACION)
            r.raise_for_status()
            monthly_data = r.json()

        rate_map: dict[tuple[int, int], float] = {}
        for item in monthly_data:
            d = pd.Timestamp(item["fecha"])
            rate_map[(d.year, d.month)] = float(item["valor"]) / 100.0

        # Project 3 months forward with last known IPC (for settlement dates)
        last_rate = rate_map[max(rate_map.keys())]
        target_end = today + timedelta(days=60)
        for offset in range(4):
            m = today.month + offset
            y = today.year + (m - 1) // 12
            m = ((m - 1) % 12) + 1
            if (y, m) not in rate_map:
                rate_map[(y, m)] = last_rate

        start_ym = (last_official_date.year, last_official_date.month)
        last_val  = float(official_series.iloc[-1])
        cer_value = last_val
        dates_ext: list[pd.Timestamp] = []
        vals_ext:  list[float]        = []

        for ym in sorted(rate_map.keys()):
            if ym < start_ym or ym > (target_end.year, target_end.month):
                continue
            y, m = ym
            monthly_rate = rate_map[ym]
            first_day = date(y, m, 1)
            last_day  = date(y, m, _cal.monthrange(y, m)[1])
            bdays = pd.bdate_range(str(first_day), str(last_day))
            n_bd = len(bdays)
            if n_bd == 0:
                continue
            daily_mult = (1.0 + monthly_rate) ** (1.0 / n_bd)
            for ts in bdays:
                cer_value *= daily_mult
                if ts.date() > last_official_date:
                    dates_ext.append(ts)
                    vals_ext.append(cer_value)

        if dates_ext:
            extended = pd.Series(vals_ext, index=pd.DatetimeIndex(dates_ext))
            full = pd.concat([official_series, extended])
            full = full[~full.index.duplicated(keep="first")].sort_index()
            logger.info("[cer] CER extended with IPC: %d total values, last=%s (value=%.4f)",
                        len(full), full.index.max().date(), float(full.iloc[-1]))
            return full
    except Exception as e:
        logger.warning("[cer] CER IPC extension failed (%s) — using official only (gap=%d days)",
                       e, gap_days)

    return official_series


# ═══════════════════════════════════════════════════════════════════════════════
# Cashflow generation from metadata (replicates Streamlit's _build_real_cashflows)
# ═══════════════════════════════════════════════════════════════════════════════

def _generate_coupon_dates(
    issue_date:    date,
    maturity_date: date,
    freq_per_year: int,
) -> list[date]:
    """
    Generate coupon dates backward from maturity_date to issue_date.
    Same algorithm as Streamlit's _generate_coupon_schedule.
    """
    if freq_per_year <= 0:
        return []
    import calendar as _cal
    months_per_period = 12 // freq_per_year
    dates: list[date] = []
    current = maturity_date
    while current > issue_date:
        dates.append(current)
        month = current.month - months_per_period
        year  = current.year
        while month <= 0:
            month += 12
            year  -= 1
        day     = min(current.day, _cal.monthrange(year, month)[1])
        current = date(year, month, day)
    dates.sort()
    return dates


def _build_real_cashflows(
    tipo:          str,
    issue_date:    date,
    maturity_date: date,
    coupon_rate:   float,
    freq_per_year: int,
    vn_base:       float,
    settlement:    date,
) -> list[tuple[date, float]]:
    """
    Return list of (date, amount) for future real cashflows from settlement.

    The CER adjustment cancels algebraically, so contractual cashflows =
    real cashflows. No inflation projection needed.

    For ZC instruments: single cashflow of vn_base at maturity.
    For coupon instruments: coupons + final principal.
    """
    is_zc = (freq_per_year == 0 or coupon_rate == 0.0
             or tipo in ("LECER", "BONCER_ZC"))

    if is_zc:
        if maturity_date > settlement:
            return [(maturity_date, float(vn_base))]
        return []

    # Coupon bond
    coupon_dates = _generate_coupon_dates(issue_date, maturity_date, freq_per_year)
    coupon_per_period = coupon_rate / freq_per_year * vn_base
    flows: list[tuple[date, float]] = []
    for i, cpn_date in enumerate(coupon_dates):
        if cpn_date <= settlement:
            continue
        is_last   = (i == len(coupon_dates) - 1)
        principal = vn_base if is_last else 0.0
        total     = coupon_per_period + principal
        if total > 0:
            flows.append((cpn_date, total))
    return flows


def _cer_lookup(series: pd.Series, target_date: date) -> Optional[float]:
    """Return CER value for target_date with forward-fill (last known value ≤ target)."""
    if series.empty:
        return None
    ts = pd.Timestamp(target_date)
    if ts < series.index.min():
        logger.warning("[cer] Date %s is before CER series start (%s)", target_date, series.index.min().date())
        return None
    if ts in series.index:
        return float(series[ts])
    subset = series[series.index <= ts]
    return float(subset.iloc[-1]) if not subset.empty else None


# ═══════════════════════════════════════════════════════════════════════════════
# Price fetcher (data912 primary, IOL fallback)
# ═══════════════════════════════════════════════════════════════════════════════

async def _fetch_cer_prices_with_change() -> dict[str, dict]:
    """Prices + pct_change for CER tickers from data912 bonds + notes."""
    result: dict[str, dict] = {}
    try:
        bonds_df, notes_df = await asyncio.gather(
            data912.get_arg_bonds(),
            data912.get_arg_notes(),
        )
        combined = pd.concat([bonds_df, notes_df], ignore_index=True)
        combined = combined.drop_duplicates(subset=["symbol"], keep="first")
        combined["_tk"] = combined["symbol"].astype(str).str.strip().str.upper()

        for tk in CER_TICKERS:
            rows = combined[combined["_tk"] == tk]
            if rows.empty:
                continue
            row = rows.iloc[0]
            try:
                price = float(str(row.get("c", "")).replace(",", "."))
                if not np.isfinite(price) or price <= 0:
                    continue
                # CER bonds are ARS-denominated — do NOT normalize prices > 1000
                # (TX28/TX31 legitimately trade at 1000+ ARS per 100 original VN)
            except Exception:
                continue
            try:
                pct = float(str(row.get("pct_change", "")).replace(",", "."))
                if not np.isfinite(pct):
                    pct = None
            except Exception:
                pct = None
            try:
                vol = float(str(row.get("v", 0) or 0).replace(",", "."))
                if not np.isfinite(vol) or vol < 0:
                    vol = 0.0
            except Exception:
                vol = 0.0
            result[tk] = {"price": price, "pct_change": pct, "volume": vol}
    except Exception as e:
        logger.warning("[cer] data912 prices failed: %s", e)

    # IOL fallback for missing tickers
    missing = [tk for tk in CER_TICKERS if tk not in result and tk not in ("DICP", "PARP")]
    if missing:
        for url in [URL_IOL_BONOS, URL_IOL_TITPUB]:
            if not missing:
                break
            try:
                async with httpx.AsyncClient(timeout=20, headers={"User-Agent": "Mozilla/5.0"}) as c:
                    r = await c.get(url)
                    r.raise_for_status()
                    tables = pd.read_html(StringIO(r.text))
                    if not tables:
                        continue
                    df = tables[0]
                    df.columns = [str(x).strip() for x in df.columns]
                    sym_col = next((c for c in df.columns if c.lower() in {"símbolo", "simbolo", "ticker"}), df.columns[0])
                    px_col  = next((c for c in df.columns if c.lower() in {"último", "ultimo", "últ.", "precio", "cierre"}), df.columns[1])
                    df["_tk"] = df[sym_col].astype(str).str.strip().str.upper()
                    for tk in list(missing):
                        row = df[df["_tk"] == tk]
                        if row.empty:
                            continue
                        try:
                            px = float(str(row.iloc[0][px_col]).replace(",", "."))
                            if px > 1000:
                                px /= 100
                            result[tk] = {"price": px, "pct_change": None, "volume": 0.0}
                            missing.remove(tk)
                        except Exception:
                            pass
            except Exception:
                pass

    logger.info("[cer] Prices fetched: %d tickers", len(result))
    return result


# ═══════════════════════════════════════════════════════════════════════════════
# V2: Motor propio (metadata → cashflows + CER index)
# ═══════════════════════════════════════════════════════════════════════════════

@async_cached("cer_table_v2", ttl=120)
async def get_cer_table_v2() -> list[dict]:
    """
    CER bonds: TIR real calculada desde metadata propia + CER index oficial.

    Genera cashflows desde metadata_cer.xlsx (sin Excel de cashflows separado).
    Fallback automático a Bonistas cuando la metadata no está disponible.

    Fórmula:
        ref_base   = issue_date - 10 bdays  (convención AR)
        ref_settle = settle    - 10 bdays   (convención AR)
        index_ratio  = CER(ref_settle) / CER(ref_base)
        precio_real  = precio / index_ratio
        TIR real     = XIRR([-precio_real, CF1, CF2,...], [settle, t1, t2,...])
    """
    # 1. Load metadata (sync, cached)
    try:
        meta_df = _load_cer_metadata()
    except (FileNotFoundError, ValueError) as e:
        logger.error("[cer] v2 metadata load failed (%s) — fallback to Bonistas", e)
        return await get_cer_table()

    # 2. Fetch CER series + prices in parallel
    cer_series, prices_raw = await asyncio.gather(
        _fetch_cer_series(),
        _fetch_cer_prices_with_change(),
        return_exceptions=True,
    )

    if isinstance(cer_series, Exception):
        logger.warning("[cer] CER series unavailable (%s) — fallback to Bonistas", cer_series)
        return await get_cer_table()
    if isinstance(prices_raw, Exception):
        prices_raw = {}

    # 3. Calendar + settlement date (T+2 hábiles)
    cal    = _ArgCal()
    today  = date.today()
    settle = cal.business_days_after(today, 2)

    rows: list[dict] = []

    for _, meta in meta_df.iterrows():
        ticker = meta["Ticker"]
        tipo   = str(meta.get("Tipo", "")).strip().upper()

        # Exclude amortizing bonds — distort the yield curve
        if tipo == "BONCER_AMORT" or ticker in ("DICP", "PARP", "CUAP", "DIP0", "PAP0"):
            continue

        issue_date    = meta["FechaEmision"].date()     if pd.notna(meta["FechaEmision"])     else None
        maturity_date = meta["FechaVencimiento"].date() if pd.notna(meta["FechaVencimiento"]) else None
        base_rule     = str(meta.get("CER_BaseDate_Rule",   "business_days_before:10")).strip()
        settle_rule   = str(meta.get("CER_SettleDate_Rule", "business_days_before:10")).strip()
        coupon_rate   = float(meta.get("CouponRate", 0.0) or 0.0)
        freq          = int(meta.get("FrecCupon", 0) or 0)
        vn_base       = float(meta.get("VN_Base", 100.0) or 100.0)
        price_base    = float(meta.get("Base_Precio", 100.0) or 100.0)

        if issue_date is None or maturity_date is None:
            logger.warning("[cer] %s — missing dates, skipping", ticker)
            continue

        if maturity_date <= settle:
            continue  # already expired

        # Price from data912
        price_info = prices_raw.get(ticker, {})
        price      = price_info.get("price")
        var_dia    = price_info.get("pct_change")

        if not price or price <= 0:
            logger.debug("[cer] %s — no price from data912, skipping", ticker)
            continue

        # CER index ratio
        try:
            ref_base   = cal.get_reference_date(base_rule,   issue_date)
            ref_settle = cal.get_reference_date(settle_rule, settle)

            cer_base   = _cer_lookup(cer_series, ref_base)
            cer_settle = _cer_lookup(cer_series, ref_settle)

            if cer_base is None or cer_settle is None or cer_base <= 0:
                logger.warning("[cer] %s — CER lookup failed (ref_base=%s→%s, ref_settle=%s→%s)",
                               ticker, ref_base, cer_base, ref_settle, cer_settle)
                continue

            index_ratio = cer_settle / cer_base
            # Normalizar a base 100 antes de deflactar (pricing_real.py convención)
            precio_real = (price * (100.0 / price_base)) / index_ratio
        except Exception as e:
            logger.warning("[cer] %s — index_ratio error: %s", ticker, e)
            continue

        # Generate real cashflows from metadata (CER cancels algebraically)
        future_flows = _build_real_cashflows(
            tipo=tipo, issue_date=issue_date, maturity_date=maturity_date,
            coupon_rate=coupon_rate, freq_per_year=freq,
            vn_base=vn_base, settlement=settle,
        )

        if not future_flows:
            logger.warning("[cer] %s — no future cashflows (maturity=%s <= settle=%s)",
                           ticker, maturity_date, settle)
            continue

        # XIRR on real cashflows
        cf_dates   = [pd.Timestamp(settle)] + [pd.Timestamp(d) for d, _ in future_flows]
        cf_amounts = np.array([-precio_real] + [a for _, a in future_flows])
        dates_idx  = pd.DatetimeIndex(cf_dates)

        tir_real = xirr(cf_amounts, dates_idx)
        duration = np.nan
        if not np.isnan(tir_real):
            future_amounts = np.array([a for _, a in future_flows])
            duration = macaulay_duration(future_amounts, dates_idx, tir_real)

        tir_pct = round(float(tir_real * 100), 2) if not np.isnan(tir_real) else None
        dur_val = round(float(duration), 2)         if not np.isnan(duration) else None
        var_val = None
        if var_dia is not None:
            try:
                var_f = float(var_dia)
                if np.isfinite(var_f):
                    var_val = round(var_f, 2)
            except Exception:
                pass

        # días al vencimiento desde hoy (convención: trade_date, no settle)
        dias = (maturity_date - today).days

        # paridad = precio_real / vn_base * 100  (pricing_real.py, table_builder.py)
        paridad_val = round(float(precio_real) / vn_base * 100, 2)

        # TEM y TNA desde TIR real (table_builder.py, líneas 253–257)
        # TEM = (1 + TIR)^(1/12) - 1   |   TNA = TEM × 12
        tem_val = None
        tna_val = None
        if not np.isnan(tir_real):
            try:
                tem_d = (1.0 + tir_real) ** (1.0 / 12.0) - 1.0
                tna_d = tem_d * 12.0
                tem_val = round(float(tem_d * 100), 2)
                tna_val = round(float(tna_d * 100), 2)
            except Exception:
                pass

        # volumen de data912 (campo "v")
        vol_raw = price_info.get("volume", 0.0) or 0.0
        try:
            vol_f = float(vol_raw)
            volumen_val = int(vol_f) if np.isfinite(vol_f) and vol_f > 0 else None
        except Exception:
            volumen_val = None

        rows.append({
            "ticker":      ticker,
            "tipo":        tipo,
            "precio":      round(float(price), 4),
            "tir_real":    tir_pct,
            "tir_nominal": None,
            "duration":    dur_val,
            "vencimiento": maturity_date.strftime("%Y-%m-%d"),
            "var_dia":     var_val,
            "dias":        dias,
            "paridad":     paridad_val,
            "tna":         tna_val,
            "tem":         tem_val,
            "volumen":     volumen_val,
        })

        logger.info(
            "[cer] %-8s | settle=%s | px=%.2f | ratio=%.4f | px_real=%.4f | TIR=%s%% | dur=%s",
            ticker, settle, price, index_ratio, precio_real,
            f"{tir_real * 100:.2f}" if not np.isnan(tir_real) else "NaN",
            f"{duration:.2f}"       if not np.isnan(duration)  else "NaN",
        )

    if not rows:
        logger.warning("[cer] v2 produced no rows — fallback to Bonistas")
        return await get_cer_table()

    rows.sort(key=lambda x: x.get("vencimiento") or "9999")
    return rows


# ═══════════════════════════════════════════════════════════════════════════════
# Bonistas scraper (fallback cuando los Excels están incompletos)
# ═══════════════════════════════════════════════════════════════════════════════

def _find_bond_list(obj, depth: int = 0):
    """Walk JSON tree to find a list of bond-like dicts."""
    if depth > 10:
        return None
    if isinstance(obj, list) and len(obj) >= 1:
        first = obj[0]
        if isinstance(first, dict):
            keys = {str(k).lower() for k in first.keys()}
            has_ticker  = any(k in keys for k in ('ticker', 'symbol', 't', 'especie', 'simbolo'))
            has_price   = any(k in keys for k in ('last_price', 'price', 'ultimo', 'c', 'precio', 'cierre', 'close'))
            has_maturity = any(k in keys for k in ('end_date', 'maturity', 'vencimiento', 'fecha_vencimiento'))
            if has_ticker and (has_price or has_maturity):
                return obj
    if isinstance(obj, dict):
        for key in ('bonds', 'bonos', 'items', 'data', 'rows', 'instrumentos', 'results'):
            if key in obj:
                result = _find_bond_list(obj[key], depth + 1)
                if result is not None:
                    return result
        for v in obj.values():
            result = _find_bond_list(v, depth + 1)
            if result is not None:
                return result
    return None


async def _scrape_bonistas() -> pd.DataFrame:
    """Scrape Bonistas.com/bonos-cer-hoy via __NEXT_DATA__."""
    try:
        async with httpx.AsyncClient(
            timeout=20,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                              "(KHTML, like Gecko) Chrome/124 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "es-AR,es;q=0.9",
            },
            follow_redirects=True,
        ) as c:
            r = await c.get(URL_BONISTAS_CER)
            r.raise_for_status()
            text = r.text

        raw_json = None
        m = re.search(r'<script[^>]+id=["\']__NEXT_DATA__["\'][^>]*>(.*?)</script>', text, re.DOTALL)
        if m:
            raw_json = m.group(1).strip()
        if not raw_json:
            idx = text.find('__NEXT_DATA__')
            if idx != -1:
                brace = text.find('{', idx)
                if brace != -1:
                    raw_json = text[brace: text.rfind('}') + 1]
        if not raw_json:
            raise ValueError("__NEXT_DATA__ not found in page")

        data  = json.loads(raw_json)
        bonds = _find_bond_list(data)

        if bonds is None:
            pp = data.get("props", {}).get("pageProps", {})
            for key in ("bonds", "bonos", "data", "items", "instrumentos"):
                val = pp.get(key)
                if val and isinstance(val, list) and len(val) > 0:
                    bonds = val
                    break

        if not bonds:
            logger.warning("Bonistas CER: bond list not found. pageProps keys: %s",
                           list(data.get("props", {}).get("pageProps", {}).keys()))
            return pd.DataFrame()

        df = pd.DataFrame(bonds)
        df.columns = [str(c).strip() for c in df.columns]

        # Filter to CER bonds if page has mixed instruments
        cer_family_cols = [c for c in df.columns
                           if c.lower() in ('bond_family_label', 'bond_family', 'family',
                                            'curve', 'index', 'type', 'tipo', 'categoria')]
        if cer_family_cols:
            col = cer_family_cols[0]
            cer_mask = df[col].astype(str).str.upper().str.contains('CER', na=False)
            if cer_mask.any():
                df = df[cer_mask].copy()

        # Prefer 24hs / spot rows to avoid duplicates (Bonistas returns T+1 and T+2)
        settle_col = next(
            (c for c in df.columns
             if c.lower() in ('plazo', 'settlement', 'liquidacion', 'term', 'tipo', 'tipo_liquidacion')),
            None,
        )
        if settle_col:
            s = df[settle_col].astype(str).str.lower()
            mask_24 = s.str.contains(r'24|spot|ci\b|contado', na=False, regex=True)
            if mask_24.any():
                df = df[mask_24].copy()

        logger.info("Bonistas CER: %d rows, cols: %s", len(df), list(df.columns[:14]))
        return df

    except Exception as e:
        logger.warning("Bonistas CER scrape failed: %s", e)
        return pd.DataFrame()


def _to_pct(x) -> float:
    try:
        v = float(str(x).replace("%", "").replace(",", ".").strip())
        if -1.0 < v < 1.0 and v != 0:
            v = v * 100
        return v
    except Exception:
        return np.nan


@async_cached("cer_table", ttl=120)
async def get_cer_table() -> list[dict]:
    """CER bonds: TIR/Duration from Bonistas, prices from data912."""
    bonistas_df, prices = await asyncio.gather(
        _scrape_bonistas(),
        _fetch_cer_prices_with_change(),
        return_exceptions=True,
    )

    if isinstance(bonistas_df, Exception):
        bonistas_df = pd.DataFrame()
    if isinstance(prices, Exception):
        prices = {}

    # Bonistas failed → return prices-only from data912
    if bonistas_df.empty:
        logger.warning("CER: Bonistas unavailable — prices-only fallback")
        rows = []
        for tk, info in prices.items():
            if tk in ("DICP", "PARP"):
                continue
            rows.append({
                "ticker": tk, "tipo": None, "precio": round(info["price"], 4),
                "tir_real": None, "tir_nominal": None, "duration": None,
                "vencimiento": None, "var_dia": info.get("pct_change"),
                "dias": None, "paridad": None, "tna": None, "tem": None, "volumen": None,
            })
        rows.sort(key=lambda x: x["ticker"])
        return rows

    logger.info("CER Bonistas columns: %s", list(bonistas_df.columns))

    rows = []
    seen_tickers: set[str] = set()

    for _, row in bonistas_df.iterrows():
        ticker = str(
            row.get("ticker") or row.get("symbol") or row.get("Ticker") or
            row.get("especie") or row.get("t") or ""
        ).strip().upper()
        if not ticker or ticker in ("DICP", "PARP", "CUAP"):
            continue
        if ticker in seen_tickers:
            continue
        seen_tickers.add(ticker)

        # Price — prefer data912
        price_info = prices.get(ticker, {})
        price      = price_info.get("price")
        if price is None:
            for f in ("last_price", "precio", "price", "ultimo", "c", "cierre"):
                raw = row.get(f)
                if raw is not None:
                    try:
                        v = float(str(raw).replace(",", "."))
                        price = v / 100 if v > 1000 else v
                        break
                    except Exception:
                        pass

        def _get(*keys):
            for k in keys:
                v = row.get(k)
                if v is not None and str(v).strip() not in ('', 'nan', 'None', '-', '–'):
                    return v
            return None

        tir_real_raw = _get("tir_real", "tirReal", "yield_real", "real_yield",
                            "TIR_real", "TIR_%", "TIR_raw", "ttir", "tir_val",
                            "rendimiento_real", "tir_cer", "cer_yield")
        tir_nom_raw  = _get("tir", "tir_nominal", "yield", "nominal_yield",
                            "TIR_nominal", "TNA", "tna", "rendimiento", "tir_nom")
        duration_raw = _get("duration", "modified_duration", "duracion", "dur",
                            "Duration", "Duracion", "md")
        maturity_raw = _get("vencimiento", "maturity", "end_date", "fecha_vencimiento",
                            "expiration", "Vencimiento", "FechaVencimiento", "vto")
        var_dia_raw  = _get("var_dia", "varDia", "pct_change", "variacion", "var",
                            "Var%", "Variacion", "cambio", "delta")

        tir_real = _to_pct(tir_real_raw) if tir_real_raw is not None else None
        tir_nom  = _to_pct(tir_nom_raw)  if tir_nom_raw  is not None else None
        var_dia  = _to_pct(var_dia_raw)  if var_dia_raw  is not None else None

        # Override var_dia with data912 value if available
        if price_info.get("pct_change") is not None:
            var_dia = price_info["pct_change"]

        duration = None
        if duration_raw is not None:
            try:
                duration = round(float(str(duration_raw).replace(",", ".")), 2)
            except Exception:
                pass

        tir_real = None if (tir_real is not None and np.isnan(tir_real)) else tir_real
        tir_nom  = None if (tir_nom  is not None and np.isnan(tir_nom))  else tir_nom

        rows.append({
            "ticker":      ticker,
            "tipo":        None,
            "precio":      round(float(price), 4)     if price    is not None else None,
            "tir_real":    round(tir_real, 2)          if tir_real is not None else None,
            "tir_nominal": round(tir_nom, 2)           if tir_nom  is not None else None,
            "duration":    duration,
            "vencimiento": str(maturity_raw)           if maturity_raw is not None else None,
            "var_dia":     round(var_dia, 2)           if var_dia  is not None else None,
            "dias":        None,
            "paridad":     None,
            "tna":         None,
            "tem":         None,
            "volumen":     None,
        })

    if not rows:
        logger.warning("CER: Bonistas rows not parsed — prices-only fallback")
        rows = [
            {"ticker": tk, "tipo": None, "precio": round(info["price"], 4),
             "tir_real": None, "tir_nominal": None, "duration": None,
             "vencimiento": None, "var_dia": info.get("pct_change"),
             "dias": None, "paridad": None, "tna": None, "tem": None, "volumen": None}
            for tk, info in prices.items() if tk not in ("DICP", "PARP")
        ]

    rows.sort(key=lambda x: (x.get("vencimiento") or "9999"))
    return rows


# ═══════════════════════════════════════════════════════════════════════════════
# Curva helper (shared by router)
# ═══════════════════════════════════════════════════════════════════════════════

async def _get_best_table() -> list[dict]:
    """Return v2 (motor propio) si existe metadata_cer.xlsx, sino Bonistas fallback."""
    meta_path = settings.data_path / META_CER_FILE
    if meta_path.exists():
        return await get_cer_table_v2()
    return await get_cer_table()


async def get_cer_curva() -> list[dict]:
    rows = await _get_best_table()
    return [
        {"ticker": r["ticker"], "duration": r["duration"], "tir_real": r["tir_real"]}
        for r in rows
        if r["duration"] is not None and r["tir_real"] is not None
    ]


# ═══════════════════════════════════════════════════════════════════════════════
# Detalle de instrumento: metadata + cashflows (para modal de UI)
# ═══════════════════════════════════════════════════════════════════════════════

_TIPO_DISPLAY: dict[str, str] = {
    "LECER":          "LECER",
    "BONCER_ZC":      "BONCER ZC",
    "BONCER_COUPON":  "BONCER",
    "BONCER_AMORT":   "BONCER AMORT",
}


async def get_cer_instrumento(ticker: str) -> dict:
    """
    Devuelve metadata + cashflows contractuales para un ticker CER.
    Usado por el modal de detalle en la UI.
    """
    ticker = ticker.strip().upper()
    try:
        meta_df = _load_cer_metadata()
    except (FileNotFoundError, ValueError) as e:
        return {"error": f"Metadata no disponible: {e}"}

    rows = meta_df[meta_df["Ticker"] == ticker]
    if rows.empty:
        return {"error": f"Ticker {ticker} no encontrado en metadata"}

    meta       = rows.iloc[0]
    tipo       = str(meta.get("Tipo", "")).strip().upper()
    issue_date = meta["FechaEmision"].date()  if pd.notna(meta["FechaEmision"])     else None
    mat_date   = meta["FechaVencimiento"].date() if pd.notna(meta["FechaVencimiento"]) else None
    coupon     = float(meta.get("CouponRate", 0.0) or 0.0)
    freq       = int(meta.get("FrecCupon", 0) or 0)
    vn_base    = float(meta.get("VN_Base", 100.0) or 100.0)

    if issue_date is None or mat_date is None:
        return {"error": f"Fechas incompletas para {ticker}"}

    cal    = _ArgCal()
    today  = date.today()
    settle = cal.business_days_after(today, 2)

    flows = _build_real_cashflows(
        tipo=tipo, issue_date=issue_date, maturity_date=mat_date,
        coupon_rate=coupon, freq_per_year=freq,
        vn_base=vn_base, settlement=settle,
    )

    # Intentar obtener index_ratio desde la serie CER para mostrar en el modal
    index_ratio_val = None
    precio_real_val = None
    try:
        cer_series, prices_raw = await asyncio.gather(
            _fetch_cer_series(),
            _fetch_cer_prices_with_change(),
            return_exceptions=True,
        )
        if not isinstance(cer_series, Exception) and not isinstance(prices_raw, Exception):
            base_rule   = str(meta.get("CER_BaseDate_Rule",   "business_days_before:10")).strip()
            settle_rule = str(meta.get("CER_SettleDate_Rule", "business_days_before:10")).strip()
            ref_base   = cal.get_reference_date(base_rule,   issue_date)
            ref_settle = cal.get_reference_date(settle_rule, settle)
            cer_b = _cer_lookup(cer_series, ref_base)
            cer_s = _cer_lookup(cer_series, ref_settle)
            if cer_b and cer_s and cer_b > 0:
                index_ratio_val = round(cer_s / cer_b, 6)
                price = (prices_raw.get(ticker) or {}).get("price")
                if price and price > 0:
                    precio_real_val = round(price / index_ratio_val, 4)
    except Exception:
        pass

    return {
        "ticker":          ticker,
        "tipo":            tipo,
        "tipo_display":    _TIPO_DISPLAY.get(tipo, tipo),
        "fecha_emision":   issue_date.strftime("%Y-%m-%d"),
        "fecha_vencimiento": mat_date.strftime("%Y-%m-%d"),
        "dias":            (mat_date - today).days,
        "coupon_rate_pct": round(coupon * 100, 4) if coupon else 0.0,
        "coupon_freq":     freq,
        "vn_base":         vn_base,
        "settlement":      settle.strftime("%Y-%m-%d"),
        "index_ratio":     index_ratio_val,
        "precio_real":     precio_real_val,
        "cashflows": [
            {
                "fecha":          d.strftime("%Y-%m-%d"),
                "monto":          round(a, 4),
                "dias_restantes": (d - today).days,
            }
            for d, a in flows
        ],
    }
