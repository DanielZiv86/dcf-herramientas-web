"""Bonos CER — real yield via Bonistas scrape + data912 prices."""
from __future__ import annotations

import json
import logging
from io import StringIO

import httpx
import numpy as np
import pandas as pd

from services import data912

logger = logging.getLogger(__name__)

URL_BONISTAS_CER = "https://bonistas.com/bonos-cer-hoy"
URL_IOL_BONOS = "https://iol.invertironline.com/mercado/cotizaciones/argentina/bonos/todos"
URL_IOL_TITPUB = "https://iol.invertironline.com/mercado/cotizaciones/argentina/titulospublicos/todos"

CER_TICKERS = [
    "TX26", "TX28", "TX29", "TX31", "DICP", "PARP",
    "TZX26", "T2X5", "T2X6", "TZX27",
]


async def _scrape_bonistas() -> pd.DataFrame:
    """Extract CER table from Bonistas.com via __NEXT_DATA__ JSON."""
    try:
        async with httpx.AsyncClient(
            timeout=15,
            headers={"User-Agent": "Mozilla/5.0 (DCF Inversiones)"},
            follow_redirects=True,
        ) as c:
            r = await c.get(URL_BONISTAS_CER)
            r.raise_for_status()
            text = r.text

        # Extract __NEXT_DATA__
        start = text.find('__NEXT_DATA__')
        if start == -1:
            raise ValueError("__NEXT_DATA__ not found")
        start = text.find('{', start)
        end = text.rfind('}') + 1
        data = json.loads(text[start:end])

        # Navigate to bonds table
        props = data.get("props", {}).get("pageProps", {})
        bonds = props.get("bonds", props.get("bonos", []))
        if not bonds:
            raise ValueError("No bonds in __NEXT_DATA__")

        df = pd.DataFrame(bonds)
        df.columns = [str(c).strip() for c in df.columns]
        return df

    except Exception as e:
        logger.warning("Bonistas scrape failed: %s", e)
        return pd.DataFrame()


async def _fetch_prices_cer() -> dict[str, float]:
    prices = {}
    try:
        bonds = await data912.prices_arg_bonds()
        for tk in CER_TICKERS:
            if tk in bonds.index:
                prices[tk] = float(bonds[tk])
        return prices
    except Exception:
        pass

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
                    sym = next((c for c in df.columns if c.lower() in {"símbolo", "simbolo", "ticker"}), df.columns[0])
                    px_col = next((c for c in df.columns if c.lower() in {"último", "ultimo", "precio"}), df.columns[1])
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
    try:
        v = float(str(x).replace("%", "").replace(",", ".").strip())
        return v if abs(v) < 100 else v / 100  # handle 0.05 vs 5%
    except Exception:
        return np.nan


async def get_cer_table() -> list[dict]:
    """Returns CER bonds with TIR real, nominal, price, duration, maturity."""
    bonistas_df, prices = pd.DataFrame(), {}

    # Parallel fetch
    import asyncio
    bonistas_task = asyncio.create_task(_scrape_bonistas())
    prices_task = asyncio.create_task(_fetch_prices_cer())
    bonistas_df, prices = await asyncio.gather(bonistas_task, prices_task)

    if bonistas_df.empty:
        return []

    rows = []
    for _, row in bonistas_df.iterrows():
        ticker = str(row.get("ticker", row.get("symbol", ""))).strip().upper()
        if not ticker:
            continue

        # Try to extract TIR real from Bonistas
        tir_real_raw = row.get("tir_real", row.get("tirReal", row.get("yield_real", None)))
        tir_nom_raw = row.get("tir", row.get("tir_nominal", row.get("yield", None)))
        duration_raw = row.get("duration", row.get("modified_duration", None))
        maturity_raw = row.get("vencimiento", row.get("maturity", row.get("fecha_vencimiento", None)))
        var_dia_raw = row.get("var_dia", row.get("varDia", row.get("pct_change", None)))

        price = prices.get(ticker)
        if price is None:
            price_raw = row.get("precio", row.get("price", row.get("ultimo", None)))
            try:
                price = float(str(price_raw).replace(",", "."))
                if price > 1000:
                    price /= 100
            except Exception:
                price = None

        rows.append({
            "ticker": ticker,
            "precio": round(float(price), 4) if price is not None else None,
            "tir_real": _to_pct(tir_real_raw) if tir_real_raw is not None else None,
            "tir_nominal": _to_pct(tir_nom_raw) if tir_nom_raw is not None else None,
            "duration": round(float(str(duration_raw).replace(",", ".")), 2) if duration_raw is not None else None,
            "vencimiento": str(maturity_raw) if maturity_raw is not None else None,
            "var_dia": _to_pct(var_dia_raw) if var_dia_raw is not None else None,
        })

    # Sort by maturity
    rows = sorted(rows, key=lambda x: (x.get("vencimiento") or "9999"))
    return rows


async def get_cer_curva() -> list[dict]:
    rows = await get_cer_table()
    return [
        {"ticker": r["ticker"], "duration": r["duration"], "tir_real": r["tir_real"]}
        for r in rows
        if r["duration"] is not None and r["tir_real"] is not None
    ]
