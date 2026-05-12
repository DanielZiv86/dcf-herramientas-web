"""FCI — CAFCI API client (async)."""
from __future__ import annotations

import asyncio
import logging
from datetime import date, timedelta
from pathlib import Path
from typing import Optional

import httpx
import pandas as pd

logger = logging.getLogger(__name__)

BASE_URL = "https://api.pub.cafci.org.ar"
REFERER = "https://www.cafci.org.ar/"

ALYCS_BY_AGENT = {
    "Balanz Capital Sociedad de Bolsa S.A.": "Balanz",
    "Invertir On Line": "IOL",
    "InvertirOnLine": "IOL",
}
ALYCS_BY_MANAGER = {
    "Cocos Asset Management S.A.": "Cocos Capital",
}

TIPO_RENTA_MAP = {
    "Mercado de Dinero": "Money Market",
    "Renta Fija": "Renta Fija",
    "Renta Variable": "Renta Variable",
    "Renta Mixta": "Renta Mixta",
    "Retorno Total": "Retorno Total",
    "PyMEs/Infraestructura": "PyMEs / Infra",
    "Infrastructura": "PyMEs / Infra",
}

_CACHE_TTL = 1800  # 30 min


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        base_url=BASE_URL,
        timeout=20,
        headers={
            "Referer": REFERER,
            "Origin": "https://www.cafci.org.ar",
            "User-Agent": "Mozilla/5.0 (DCF Inversiones)",
        },
        transport=httpx.AsyncHTTPTransport(retries=2),
    )


async def _fetch_fondos_list() -> list[dict]:
    """Fetch paginated fund list from CAFCI."""
    all_funds = []
    page = 1
    async with _client() as c:
        while True:
            try:
                params = {
                    "include": "entidad;agentes,entidad;gerente,tipoRenta,clase_fondo,moneda",
                    "estado": 1,
                    "limit": 200,
                    "page": page,
                }
                r = await c.get("/fondo", params=params)
                r.raise_for_status()
                data = r.json()
                items = data.get("data", [])
                if not items:
                    break
                all_funds.extend(items)
                total = data.get("total", 0)
                if len(all_funds) >= total:
                    break
                page += 1
            except Exception as e:
                logger.warning("CAFCI page %d failed: %s", page, e)
                break
    return all_funds


async def _fetch_fund_detail(fondo_id: int, clase_id: int) -> Optional[dict]:
    try:
        async with _client() as c:
            r = await c.get(f"/fondo/{fondo_id}/clase/{clase_id}/ficha")
            r.raise_for_status()
            return r.json()
    except Exception:
        return None


def _parse_alyc(fund: dict) -> Optional[str]:
    agents = fund.get("agentes", [])
    for agent in agents:
        name = agent.get("entidad", {}).get("nombre", "")
        for k, v in ALYCS_BY_AGENT.items():
            if k.lower() in name.lower():
                return v
    manager = fund.get("gerente", {}).get("entidad", {}).get("nombre", "")
    for k, v in ALYCS_BY_MANAGER.items():
        if k.lower() in manager.lower():
            return v
    return None


def _tipo_renta(fund: dict) -> str:
    raw = fund.get("tipoRenta", {}).get("nombre", "")
    return TIPO_RENTA_MAP.get(raw, raw)


def _moneda(fund: dict) -> str:
    m = fund.get("moneda", {}).get("nombre", "")
    if "dolar" in m.lower() or "usd" in m.lower():
        return "USD"
    return "ARS"


async def get_fondos(alyc: Optional[str] = None, tipo: Optional[str] = None, moneda: Optional[str] = None) -> list[dict]:
    """Returns fund list with returns, optionally filtered."""
    all_funds = await _fetch_fondos_list()

    result = []
    detail_tasks = []
    fund_meta = []

    for fund in all_funds:
        fund_alyc = _parse_alyc(fund)
        if not fund_alyc:
            continue  # only curated ALyCs
        if alyc and fund_alyc != alyc:
            continue

        fund_tipo = _tipo_renta(fund)
        if tipo and fund_tipo != tipo:
            continue

        fund_moneda = _moneda(fund)
        if moneda and fund_moneda != moneda:
            continue

        # Find Clase A
        clases = fund.get("clases", [])
        clase = next((c for c in clases if "A" in str(c.get("nombre", "")).upper()), clases[0] if clases else None)
        if not clase:
            continue

        fondo_id = fund.get("id")
        clase_id = clase.get("id")
        fund_meta.append({
            "fondo_id": fondo_id,
            "clase_id": clase_id,
            "nombre": fund.get("nombre", ""),
            "clase_nombre": clase.get("nombre", ""),
            "alyc": fund_alyc,
            "tipo": fund_tipo,
            "moneda": fund_moneda,
        })
        detail_tasks.append(_fetch_fund_detail(fondo_id, clase_id))

    details = await asyncio.gather(*detail_tasks)

    for meta, detail in zip(fund_meta, details):
        if not detail:
            continue
        d = detail.get("data", detail)
        rendimientos = d.get("rendimientos", d.get("rentabilidades", {}))

        def _pct(key):
            v = rendimientos.get(key)
            try:
                return round(float(v) * 100, 2)
            except Exception:
                return None

        result.append({
            **meta,
            "rend_dia": _pct("dia") or _pct("diario"),
            "rend_mes": _pct("mes") or _pct("mensual"),
            "rend_year": _pct("anio") or _pct("anual") or _pct("12meses"),
            "rend_ytd": _pct("ytd") or _pct("anioEnCurso"),
            "patrimonio": d.get("patrimonio"),
            "vcp": d.get("vcp") or d.get("vcpActual"),
        })

    return result


async def get_historico(fondo_id: int, clase_id: int, meses: int = 12) -> list[dict]:
    """12-month VCP history for a fund."""
    today = date.today()
    tipo_renta_id = 2  # default
    rows = []

    tasks = []
    dates = []
    for i in range(meses, -1, -1):
        d = today - timedelta(days=i * 30)
        fecha_str = d.strftime("%Y-%m-%d")
        dates.append(fecha_str)
        tasks.append(_fetch_vcp(tipo_renta_id, fecha_str, fondo_id, clase_id))

    results = await asyncio.gather(*tasks, return_exceptions=True)
    for fecha, res in zip(dates, results):
        if isinstance(res, Exception) or res is None:
            continue
        rows.append({"fecha": fecha, "vcp": res})

    return rows


async def _fetch_vcp(tipo_renta_id: int, fecha: str, fondo_id: int, clase_id: int) -> Optional[float]:
    try:
        detail = await _fetch_fund_detail(fondo_id, clase_id)
        if detail:
            d = detail.get("data", detail)
            return d.get("vcp") or d.get("vcpActual")
    except Exception:
        return None
    return None
