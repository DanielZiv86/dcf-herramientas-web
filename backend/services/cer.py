"""Bonos CER — TIR/Duration desde Bonistas + precios data912."""
from __future__ import annotations

import json
import logging
import re
from io import StringIO

import httpx
import numpy as np
import pandas as pd

from services import data912

logger = logging.getLogger(__name__)

URL_BONISTAS_CER = "https://bonistas.com/bonos-cer-hoy"
URL_IOL_BONOS    = "https://iol.invertironline.com/mercado/cotizaciones/argentina/bonos/todos"
URL_IOL_TITPUB   = "https://iol.invertironline.com/mercado/cotizaciones/argentina/titulospublicos/todos"

# Tickers CER conocidos — usados para price-fetch desde data912
CER_TICKERS = [
    "TX26", "TX28", "TX29", "TX31",
    "TZX26", "TZX27", "TZX28",
    "T2X5", "T2X6", "T2X7",
    "DICP", "PARP",
]


# ── Búsqueda recursiva de listas de bonos en JSON ─────────────────────────

def _find_bond_list(obj, depth: int = 0):
    """Walk JSON tree to find a list of bond-like dicts."""
    if depth > 10:
        return None
    if isinstance(obj, list) and len(obj) >= 1:
        first = obj[0]
        if isinstance(first, dict):
            keys = {str(k).lower() for k in first.keys()}
            has_ticker = any(k in keys for k in ('ticker', 'symbol', 't', 'especie', 'simbolo'))
            has_price  = any(k in keys for k in ('last_price', 'price', 'ultimo', 'c', 'precio', 'cierre', 'close'))
            if has_ticker and has_price:
                return obj
            # Also accept list where items have 'end_date' / 'maturity' (Bonistas style)
            has_maturity = any(k in keys for k in ('end_date', 'maturity', 'vencimiento', 'fecha_vencimiento'))
            if has_ticker and has_maturity:
                return obj
    if isinstance(obj, dict):
        # Prioritize common container keys first
        for key in ('bonds', 'bonos', 'items', 'data', 'rows', 'instrumentos', 'results'):
            if key in obj:
                result = _find_bond_list(obj[key], depth + 1)
                if result is not None:
                    return result
        # Then walk all values
        for v in obj.values():
            result = _find_bond_list(v, depth + 1)
            if result is not None:
                return result
    return None


# ── Bonistas scrape ────────────────────────────────────────────────────────

async def _scrape_bonistas() -> pd.DataFrame:
    """Scrape Bonistas.com/bonos-cer-hoy via __NEXT_DATA__ with recursive JSON search."""
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

        # 1. Prefer <script id="__NEXT_DATA__"> tag (more precise)
        raw_json = None
        m = re.search(r'<script[^>]+id=["\']__NEXT_DATA__["\'][^>]*>(.*?)</script>', text, re.DOTALL)
        if m:
            raw_json = m.group(1).strip()

        # 2. Fallback: locate the JSON object after the __NEXT_DATA__ assignment
        if not raw_json:
            idx = text.find('__NEXT_DATA__')
            if idx != -1:
                brace = text.find('{', idx)
                if brace != -1:
                    raw_json = text[brace: text.rfind('}') + 1]

        if not raw_json:
            raise ValueError("__NEXT_DATA__ not found in page")

        data = json.loads(raw_json)

        # 3. Recursive search for bond list
        bonds = _find_bond_list(data)

        # 4. Fallback: try explicit pageProps paths
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

        # 5. Filter to CER bonds if page has mixed instruments
        cer_family_cols = [c for c in df.columns
                          if c.lower() in ('bond_family_label', 'bond_family', 'family',
                                           'curve', 'index', 'type', 'tipo', 'categoria')]
        if cer_family_cols:
            col = cer_family_cols[0]
            cer_mask = df[col].astype(str).str.upper().str.contains('CER', na=False)
            if cer_mask.any():
                df = df[cer_mask].copy()

        # ── Deduplicate by settlement type ────────────────────────────────────
        # Bonistas returns T+1 and T+2 versions; prefer the 24hs / spot row.
        settle_col = next(
            (c for c in df.columns
             if c.lower() in ('plazo', 'settlement', 'liquidacion', 'term', 'tipo', 'tipo_liquidacion')),
            None
        )
        if settle_col:
            s = df[settle_col].astype(str).str.lower()
            mask_24 = s.str.contains(r'24|spot|ci\b|contado', na=False, regex=True)
            if mask_24.any():
                df = df[mask_24].copy()
            else:
                # If no 24hs, drop exact duplicates by ticker
                ticker_col = next(
                    (c for c in df.columns if c.lower() in ('ticker', 'symbol', 't', 'especie')),
                    None
                )
                if ticker_col:
                    df = df.drop_duplicates(subset=[ticker_col], keep='first')

        logger.info("Bonistas CER: %d rows (after dedup), cols: %s", len(df), list(df.columns[:14]))
        return df

    except Exception as e:
        logger.warning("Bonistas CER scrape failed: %s", e)
        return pd.DataFrame()


# ── Precios data912 + IOL fallback ────────────────────────────────────────

async def _fetch_prices_cer() -> dict[str, float]:
    """Prices for CER tickers from data912 (notes + bonds), IOL fallback."""
    prices: dict[str, float] = {}
    try:
        bonds = await data912.prices_arg_bonds()
        notes = await data912.prices_arg_notes()
        combined = notes.combine_first(bonds)
        for tk in CER_TICKERS:
            if tk in combined.index and np.isfinite(combined[tk]):
                prices[tk] = float(combined[tk])
    except Exception as e:
        logger.warning("data912 CER prices failed: %s", e)

    if len(prices) < len(CER_TICKERS) // 2:
        # IOL fallback
        for url in [URL_IOL_BONOS, URL_IOL_TITPUB]:
            try:
                async with httpx.AsyncClient(timeout=20, headers={"User-Agent": "Mozilla/5.0"}) as c:
                    r = await c.get(url)
                    r.raise_for_status()
                    tables = pd.read_html(StringIO(r.text))
                    if tables:
                        df = tables[0]
                        df.columns = [str(x).strip() for x in df.columns]
                        sym   = next((c for c in df.columns if c.lower() in {"símbolo", "simbolo", "ticker"}), df.columns[0])
                        px_col = next((c for c in df.columns if c.lower() in {"último", "ultimo", "precio", "cierre"}), df.columns[1])
                        df["_tk"] = df[sym].astype(str).str.strip().str.upper()
                        for tk in CER_TICKERS:
                            if tk not in prices:
                                row = df[df["_tk"] == tk]
                                if not row.empty:
                                    try:
                                        px = float(str(row.iloc[0][px_col]).replace(",", "."))
                                        if px > 1000:
                                            px /= 100
                                        prices[tk] = px
                                    except Exception:
                                        pass
            except Exception:
                pass

    return prices


def _to_pct(x) -> float:
    """Parse percentage value from Bonistas (handles '5.2', '5,2', '5.2%', 0.052)."""
    try:
        v = float(str(x).replace("%", "").replace(",", ".").strip())
        # Bonistas sometimes returns decimals like 0.052 instead of 5.2
        if -1.0 < v < 1.0 and v != 0:
            v = v * 100
        return v
    except Exception:
        return np.nan


# ── Fallback: build rows from data912 prices only ─────────────────────────

async def _cer_from_data912_only(prices: dict[str, float]) -> list[dict]:
    """Return partial CER data (prices only, no TIR) when Bonistas is unavailable."""
    if not prices:
        return []
    rows = []
    for tk, px in prices.items():
        if tk in ("DICP", "PARP"):  # exclude amortizing bonds
            continue
        rows.append({
            "ticker":      tk,
            "precio":      round(px, 4),
            "tir_real":    None,
            "tir_nominal": None,
            "duration":    None,
            "vencimiento": None,
            "var_dia":     None,
        })
    rows.sort(key=lambda x: x["ticker"])
    logger.info("CER fallback (data912 only): %d tickers", len(rows))
    return rows


# ── Main table builder ────────────────────────────────────────────────────

async def get_cer_table() -> list[dict]:
    """CER bonds table: TIR/Duration from Bonistas, prices from data912."""
    import asyncio

    bonistas_df, prices = await asyncio.gather(
        _scrape_bonistas(),
        _fetch_prices_cer(),
        return_exceptions=True,
    )

    if isinstance(bonistas_df, Exception):
        bonistas_df = pd.DataFrame()
    if isinstance(prices, Exception):
        prices = {}

    # Bonistas failed → return partial data from data912
    if bonistas_df.empty:
        logger.warning("CER: Bonistas unavailable, serving data912-only fallback")
        return await _cer_from_data912_only(prices)

    # Log ALL column names so we can diagnose field-name mismatches in Render logs
    logger.info("CER Bonistas columns: %s", list(bonistas_df.columns))

    rows = []
    seen_tickers: set[str] = set()   # dedup safety net

    for _, row in bonistas_df.iterrows():
        # Ticker — try multiple field names
        ticker = str(
            row.get("ticker") or row.get("symbol") or row.get("Ticker") or
            row.get("especie") or row.get("t") or ""
        ).strip().upper()
        if not ticker:
            continue

        # Skip amortizing bonds that clutter the CER chart
        if ticker in ("DICP", "PARP", "CUAP"):
            continue

        # Deduplicate: skip if we already added this ticker
        if ticker in seen_tickers:
            continue
        seen_tickers.add(ticker)

        # Price — prefer data912; fall back to Bonistas field
        price = prices.get(ticker)
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

        # Yields & metadata from Bonistas
        def _get(*keys):
            for k in keys:
                v = row.get(k)
                if v is not None and str(v).strip() not in ('', 'nan', 'None', '-', '–'):
                    return v
            return None

        # Bonistas field names vary — TIR_raw / ttir / tir_val are documented in Streamlit port
        tir_real_raw = _get(
            "tir_real", "tirReal", "yield_real", "real_yield",
            "TIR_real", "TIR_%", "TIR_raw", "ttir", "tir_val",
            "rendimiento_real", "tir_cer", "cer_yield",
        )
        tir_nom_raw = _get(
            "tir", "tir_nominal", "yield", "nominal_yield",
            "TIR_nominal", "TNA", "tna", "rendimiento", "tir_nom",
        )
        duration_raw = _get(
            "duration", "modified_duration", "duracion", "dur",
            "Duration", "Duracion", "md",
        )
        maturity_raw = _get(
            "vencimiento", "maturity", "end_date", "fecha_vencimiento",
            "expiration", "Vencimiento", "FechaVencimiento", "vto",
        )
        var_dia_raw = _get(
            "var_dia", "varDia", "pct_change", "variacion", "var",
            "Var%", "Variacion", "cambio", "delta",
        )

        tir_real  = _to_pct(tir_real_raw)  if tir_real_raw  is not None else None
        tir_nom   = _to_pct(tir_nom_raw)   if tir_nom_raw   is not None else None
        var_dia   = _to_pct(var_dia_raw)   if var_dia_raw   is not None else None
        duration  = None
        if duration_raw is not None:
            try:
                duration = round(float(str(duration_raw).replace(",", ".")), 2)
            except Exception:
                pass

        # Normalize TIR: if TIR real looks like a decimal fraction, rescale
        tir_real = None if (tir_real is not None and np.isnan(tir_real)) else tir_real
        tir_nom  = None if (tir_nom  is not None and np.isnan(tir_nom))  else tir_nom

        rows.append({
            "ticker":      ticker,
            "precio":      round(float(price), 4) if price is not None else None,
            "tir_real":    round(tir_real, 2)    if tir_real  is not None else None,
            "tir_nominal": round(tir_nom, 2)     if tir_nom   is not None else None,
            "duration":    duration,
            "vencimiento": str(maturity_raw)     if maturity_raw is not None else None,
            "var_dia":     round(var_dia, 2)     if var_dia   is not None else None,
        })

    if not rows:
        logger.warning("CER: Bonistas returned rows but none parsed correctly — falling back to data912")
        return await _cer_from_data912_only(prices)

    rows.sort(key=lambda x: (x.get("vencimiento") or "9999"))
    return rows


async def get_cer_curva() -> list[dict]:
    rows = await get_cer_table()
    return [
        {"ticker": r["ticker"], "duration": r["duration"], "tir_real": r["tir_real"]}
        for r in rows
        if r["duration"] is not None and r["tir_real"] is not None
    ]
