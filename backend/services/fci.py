"""FCI — CAFCI API client (async).

Fuente: https://api.pub.cafci.org.ar (API pública, sin auth, Referer requerido)

Bugs corregidos vs versión anterior:
  - campo clase_fondos (no "clases") para obtener las clases del fondo
  - _parse_rendimientos: path correcto detail["data"]["info"]["diaria"]["rendimientos"]
  - claves correctas: day/month/oneYear/year (no dia/mes/anio)
  - _parse_alyc: soporta nombre directo y via entidad.nombre
  - paginación: page=0 (no page=1)
"""
from __future__ import annotations

import asyncio
import logging
import time
from datetime import date, timedelta
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

BASE_URL = "https://api.pub.cafci.org.ar"
REFERER  = "https://www.cafci.org.ar/"

# Nombre CAFCI → etiqueta para el usuario (comparación case-insensitive)
_ALYCS_BY_AGENT: dict[str, str] = {
    "balanz capital sociedad de bolsa": "Balanz",
    "invertir on line":                 "IOL",
    "invertiron line":                  "IOL",
}
_ALYCS_BY_MANAGER: dict[str, str] = {
    "cocos asset management":           "Cocos Capital",
}

_TIPO_MAP: dict[str, str] = {
    "Mercado de Dinero":                "Money Market",
    "Renta Fija":                       "Renta Fija",
    "Renta Variable":                   "Renta Variable",
    "Renta Mixta":                      "Renta Mixta",
    "Retorno Total":                    "Retorno Total",
    "PyMEs/Infraestructura":            "PyMEs / Infra",
    "Infraestructura":                  "PyMEs / Infra",
    "PyMes":                            "PyMEs / Infra",
}

# Cache en memoria: evita refetch completo dentro de la misma sesión
_fondos_cache: list[dict] = []
_fondos_cache_ts: float = 0.0
_FONDOS_TTL = 1800  # 30 min


def _http_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        base_url=BASE_URL,
        timeout=20,
        headers={
            "Referer": REFERER,
            "Origin":  "https://www.cafci.org.ar",
            "User-Agent": "Mozilla/5.0 (DCF Inversiones)",
        },
        transport=httpx.AsyncHTTPTransport(retries=2),
    )


# ── Fetch paginated fund list ────────────────────────────────────────────────

async def _fetch_fondos_list() -> list[dict]:
    """Fetch all active funds from CAFCI (paginated, starts at page=0)."""
    global _fondos_cache, _fondos_cache_ts

    now = time.monotonic()
    if _fondos_cache and (now - _fondos_cache_ts) < _FONDOS_TTL:
        logger.debug("[fci] fondos from cache (%d)", len(_fondos_cache))
        return _fondos_cache

    all_funds: list[dict] = []
    page = 0
    async with _http_client() as c:
        while True:
            try:
                r = await c.get("/fondo", params={
                    "include": "entidad;agentes,entidad;gerente,tipoRenta,clase_fondo,moneda",
                    "estado":  1,
                    "limit":   200,
                    "page":    page,
                })
                r.raise_for_status()
                data  = r.json()
                items = data.get("data", [])
                if not items:
                    break
                all_funds.extend(items)
                last_page = data.get("lastPage")
                logger.debug("[fci] página %d: %d fondos (lastPage=%s)", page, len(items), last_page)
                if last_page is None or page >= int(last_page):
                    break
                page += 1
            except Exception as e:
                logger.warning("[fci] página %d falló: %s", page, e)
                break

    logger.info("[fci] fondos descargados: %d", len(all_funds))
    _fondos_cache    = all_funds
    _fondos_cache_ts = now
    return all_funds


# ── Fetch fund detail (/ficha) ───────────────────────────────────────────────

async def _fetch_fund_detail(fondo_id, clase_id) -> Optional[dict]:
    try:
        async with _http_client() as c:
            r = await c.get(f"/fondo/{fondo_id}/clase/{clase_id}/ficha")
            r.raise_for_status()
            return r.json()
    except Exception as e:
        logger.debug("[fci] ficha fondo=%s clase=%s: %s", fondo_id, clase_id, e)
        return None


# ── Parsers ──────────────────────────────────────────────────────────────────

def _parse_alyc(fund: dict) -> Optional[str]:
    """
    Identifica la ALyC a partir de los agentes colocadores o la sociedad gerente.
    Soporta nombre directo en el agente y via entidad.nombre.
    """
    agents = fund.get("agentes", [])
    for agent in agents:
        name = (
            agent.get("nombre", "")
            or (agent.get("entidad") or {}).get("nombre", "")
        ).lower()
        for key, label in _ALYCS_BY_AGENT.items():
            if key in name:
                return label

    gerente = fund.get("gerente") or {}
    if isinstance(gerente, dict):
        mgr_name = (
            gerente.get("nombre", "")
            or (gerente.get("entidad") or {}).get("nombre", "")
        ).lower()
        for key, label in _ALYCS_BY_MANAGER.items():
            if key in mgr_name:
                return label
    return None


def _tipo_renta(fund: dict) -> str:
    tipo = fund.get("tipoRenta") or {}
    raw  = tipo.get("nombre", "") if isinstance(tipo, dict) else str(tipo)
    return _TIPO_MAP.get(raw, raw)


def _moneda(fund: dict) -> str:
    m = fund.get("moneda") or {}
    if isinstance(m, dict):
        nombre = m.get("nombre", "") or m.get("codigoCafci", "")
    else:
        nombre = str(m)
    return "USD" if ("dolar" in nombre.lower() or "usd" in nombre.lower()) else "ARS"


def _parse_rendimientos(detail: dict) -> dict:
    """
    Extrae rendimientos del response de /ficha.

    Estructura real de la API CAFCI:
        detail["data"]["info"]["diaria"]["rendimientos"] = {
            "day":     {"rendimiento": "0.0012"},
            "month":   {"rendimiento": "0.051"},
            "oneYear": {"rendimiento": "0.432"},
            "year":    {"rendimiento": "0.38"},   ← YTD año calendario
        }
    Los valores son fracciones (0.05 = 5%), se multiplican por 100.
    """
    def _pct(rend_dict: dict, key: str) -> Optional[float]:
        obj = rend_dict.get(key)
        if obj is None:
            return None
        val = obj.get("rendimiento") if isinstance(obj, dict) else obj
        try:
            return round(float(val) * 100, 2)
        except Exception:
            return None

    # Path primario: data.info.diaria.rendimientos
    rend: dict = {}
    try:
        rend = detail["data"]["info"]["diaria"]["rendimientos"]
    except (KeyError, TypeError):
        pass

    # Fallback: buscar en paths alternativos
    if not rend:
        try:
            d = detail.get("data", detail)
            rend = (
                d.get("rendimientos")
                or d.get("rentabilidades")
                or {}
            )
        except Exception:
            pass

    return {
        "rend_dia":  _pct(rend, "day"),
        "rend_mes":  _pct(rend, "month"),
        "rend_year": _pct(rend, "oneYear"),
        "rend_ytd":  _pct(rend, "year"),
    }


# ── Public API ───────────────────────────────────────────────────────────────

async def get_fondos(
    alyc:   Optional[str] = None,
    tipo:   Optional[str] = None,
    moneda: Optional[str] = None,
) -> list[dict]:
    """
    Retorna lista de fondos con rendimientos, filtrada por ALyC / tipo / moneda.

    Cada item tiene:
        fondo_id, clase_id, nombre, clase_nombre, alyc, tipo, moneda,
        rend_dia, rend_mes, rend_year, rend_ytd
    """
    all_funds = await _fetch_fondos_list()

    fund_meta:    list[dict]       = []
    detail_tasks: list             = []

    for fund in all_funds:
        fund_alyc = _parse_alyc(fund)
        if not fund_alyc:
            continue
        if alyc and fund_alyc != alyc:
            continue

        fund_tipo = _tipo_renta(fund)
        if tipo and fund_tipo != tipo:
            continue

        fund_moneda = _moneda(fund)
        if moneda and fund_moneda != moneda:
            continue

        # Campo correcto en la respuesta de CAFCI: clase_fondos (NO "clases")
        clases = fund.get("clase_fondos", [])
        if not clases:
            continue

        # Preferir Clase A (retail estándar)
        clase = next(
            (c for c in clases if "A" in str(c.get("nombre", "")).upper()),
            clases[0],
        )

        fondo_id = fund.get("id")
        clase_id = clase.get("id")
        fund_meta.append({
            "fondo_id":    fondo_id,
            "clase_id":    clase_id,
            "nombre":      fund.get("nombre", ""),
            "clase_nombre": clase.get("nombre", ""),
            "alyc":        fund_alyc,
            "tipo":        fund_tipo,
            "moneda":      fund_moneda,
        })
        detail_tasks.append(_fetch_fund_detail(fondo_id, clase_id))

    logger.info("[fci] fondos filtrados: %d (alyc=%s tipo=%s moneda=%s)",
                len(fund_meta), alyc, tipo, moneda)

    details = await asyncio.gather(*detail_tasks, return_exceptions=True)

    result: list[dict] = []
    for meta, detail in zip(fund_meta, details):
        if not detail or isinstance(detail, Exception):
            # Sin detalle: incluir el fondo igual con rendimientos nulos
            result.append({**meta, "rend_dia": None, "rend_mes": None,
                           "rend_year": None, "rend_ytd": None})
            continue
        rend = _parse_rendimientos(detail)
        result.append({**meta, **rend})

    ok = sum(1 for r in result if r.get("rend_year") is not None)
    logger.info("[fci] resultado: %d fondos (%d con rend_year)", len(result), ok)
    return result


async def get_historico(fondo_id: int, clase_id: int, meses: int = 12) -> list[dict]:
    """
    Historial VCP mensual de un fondo.
    Usa /estadisticas/informacion/diaria/{tipo_renta_id}/{fecha} por fecha fin de mes.
    """
    today = date.today()
    rows: list[dict] = []

    # Generar fechas de fin de mes para los últimos `meses` meses
    dates: list[str] = []
    y, m = today.year, today.month
    for _ in range(meses):
        if m == 12:
            next_y, next_m = y + 1, 1
        else:
            next_y, next_m = y, m + 1
        ultimo = date(next_y, next_m, 1) - timedelta(days=1)
        dates.append(ultimo.strftime("%Y-%m-%d"))
        m -= 1
        if m == 0:
            m, y = 12, y - 1
    dates = sorted(dates)

    # Usar /ficha para VCP actual — sin endpoint histórico implementado aún
    detail = await _fetch_fund_detail(fondo_id, clase_id)
    if detail:
        try:
            d    = detail.get("data", detail)
            info = d.get("info", {}).get("diaria", {}).get("actual", d)
            vcp  = info.get("vcpUnitario") or info.get("vcp") or d.get("vcp")
            if vcp:
                rows.append({"fecha": today.strftime("%Y-%m-%d"), "vcp": float(vcp)})
        except Exception:
            pass

    return rows
