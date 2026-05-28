"""FCI — Fondos Comunes de Inversión.

Fuente base: backend/data/fci_data.json (monthly_returns + metadata curados).
Refresh diario: actualiza rendimientos en memoria desde CAFCI API en background.

Flujo:
  1. Primer request del día → carga JSON estático a memoria + lanza refresh en background.
  2. Requests siguientes → sirven de memoria (< 1ms).
  3. Refresh background → llama a CAFCI /ficha para cada fondo (~40 calls con semáforo).
  4. Si CAFCI bloquea → usa datos estáticos; reintenta en 5 minutos.
  5. Cada 24h → trigger de nuevo refresh.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from pathlib import Path
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

from config import settings

_FCI_DATA_FILE = settings.data_path / "fci_data.json"

_CAFCI_BASE    = "https://api.pub.cafci.org.ar"
_CAFCI_HEADERS = {
    "User-Agent": "Mozilla/5.0 (DCF Inversiones)",
    "Accept":     "application/json",
    "Referer":    "https://www.cafci.org.ar/",
    "Origin":     "https://www.cafci.org.ar",
}

# ── In-memory cache ───────────────────────────────────────────────────────────

_cache: dict = {
    "fondos":     None,   # list[dict] — cargado desde JSON estático
    "date_cols":  [],
    "loaded_at":  0.0,
    "rend_ts":    0.0,    # timestamp del último refresh de rendimientos exitoso
    "refreshing": False,  # evita refreshes concurrentes
}
_REND_TTL = 86400  # 24 horas


# ── Carga desde disco ─────────────────────────────────────────────────────────

def _load_static_data() -> dict:
    """Lee fci_data.json del disco. Retorna {fondos, date_cols}."""
    if not _FCI_DATA_FILE.exists():
        logger.warning("[fci] fci_data.json no encontrado. Ejecutar: python backend/build_fci_data.py")
        return {"fondos": [], "date_cols": []}
    try:
        with open(_FCI_DATA_FILE, encoding="utf-8") as f:
            payload = json.load(f)
        if isinstance(payload, list):
            payload = {"fondos": payload, "date_cols": []}
        logger.info("[fci] JSON estático cargado: %d fondos (generado: %s)",
                    len(payload.get("fondos", [])), payload.get("generated_at", "?"))
        return payload
    except Exception as e:
        logger.error("[fci] Error leyendo fci_data.json: %s", e)
        return {"fondos": [], "date_cols": []}


def _ensure_loaded() -> None:
    """Carga el JSON estático al caché si todavía no fue cargado."""
    if _cache["fondos"] is None:
        payload = _load_static_data()
        _cache["fondos"]    = payload.get("fondos", [])
        _cache["date_cols"] = payload.get("date_cols", [])
        _cache["loaded_at"] = time.time()


# ── Refresh de rendimientos desde CAFCI ──────────────────────────────────────

async def _fetch_rend_one(
    client: httpx.AsyncClient, fondo_id: str, clase_id: str
) -> Optional[dict]:
    """Llama a CAFCI /ficha para un fondo. Retorna {rend_dia, rend_mes, rend_year, rend_ytd} o None."""
    try:
        r = await client.get(f"{_CAFCI_BASE}/fondo/{fondo_id}/clase/{clase_id}/ficha")
        if r.status_code != 200:
            return None
        rend = (
            r.json()
            .get("data", {})
            .get("info", {})
            .get("diaria", {})
            .get("rendimientos", {})
        )

        def _pct(key: str) -> Optional[float]:
            obj = rend.get(key)
            if obj is None:
                return None
            val = obj.get("rendimiento") if isinstance(obj, dict) else obj
            try:
                return round(float(val), 2)
            except Exception:
                return None

        return {
            "rend_dia":  _pct("day"),
            "rend_mes":  _pct("month"),
            "rend_year": _pct("oneYear"),
            "rend_ytd":  _pct("year"),
        }
    except Exception:
        return None


async def _do_refresh() -> None:
    """Actualiza rendimientos en _cache['fondos'] desde CAFCI.
    Corre en background — los requests siguen siendo servidos mientras tanto.
    """
    fondos = _cache.get("fondos") or []
    if not fondos:
        _cache["refreshing"] = False
        return

    logger.info("[fci] Iniciando refresh de rendimientos para %d fondos...", len(fondos))
    sem = asyncio.Semaphore(6)  # máx 6 requests CAFCI concurrentes

    async def _safe(client: httpx.AsyncClient, f: dict) -> tuple[str, Optional[dict]]:
        async with sem:
            result = await _fetch_rend_one(client, f["fondo_id"], f["clase_id"])
            await asyncio.sleep(0.08)  # ~75 req/min — dentro del límite de CAFCI
            return f["clase_nombre"], result

    try:
        async with httpx.AsyncClient(headers=_CAFCI_HEADERS, timeout=12) as client:
            tasks   = [_safe(client, f) for f in fondos]
            results = await asyncio.gather(*tasks, return_exceptions=True)

        succeeded = 0
        for item in results:
            if isinstance(item, Exception):
                continue
            clase_nombre, rend = item
            if rend is None:
                continue
            for f in fondos:
                if f["clase_nombre"] == clase_nombre:
                    f.update(rend)
                    succeeded += 1
                    break

        now = time.time()
        if succeeded > 0:
            _cache["rend_ts"] = now
            logger.info("[fci] Refresh OK: %d/%d fondos actualizados", succeeded, len(fondos))
        else:
            # CAFCI bloqueó desde Render — reintentar en 5 min en vez de esperar 24h
            _cache["rend_ts"] = now - _REND_TTL + 300
            logger.warning("[fci] Refresh: 0 fondos actualizados (CAFCI bloqueado?) — reintentando en 5 min")

    except Exception as e:
        logger.warning("[fci] Error en refresh CAFCI: %s", e)
        _cache["rend_ts"] = time.time() - _REND_TTL + 300
    finally:
        _cache["refreshing"] = False


def _maybe_trigger_refresh() -> None:
    """Si los rendimientos están vencidos, lanza _do_refresh() en background."""
    if _cache["refreshing"]:
        return
    if (time.time() - _cache["rend_ts"]) < _REND_TTL:
        return
    _cache["refreshing"] = True
    asyncio.create_task(_do_refresh())
    logger.info("[fci] Refresh de rendimientos programado en background")


# ── API pública ───────────────────────────────────────────────────────────────

async def get_fondos(
    alyc:   Optional[str] = None,
    tipo:   Optional[str] = None,
    moneda: Optional[str] = None,
) -> dict:
    """
    Retorna {date_cols, fondos} filtrado.
    Sirve siempre desde memoria — el refresh de CAFCI corre en background.
    """
    _ensure_loaded()
    _maybe_trigger_refresh()

    fondos = _cache["fondos"] or []
    result = fondos
    if alyc:
        result = [f for f in result if f.get("alyc") == alyc]
    if tipo:
        result = [f for f in result if f.get("tipo") == tipo]
    if moneda:
        result = [f for f in result if f.get("moneda") == moneda]

    logger.info("[fci] get_fondos(alyc=%s tipo=%s moneda=%s) → %d fondos",
                alyc, tipo, moneda, len(result))
    return {"date_cols": _cache["date_cols"], "fondos": result}


async def get_historico(fondo_id: int, clase_id: int, meses: int = 12) -> list[dict]:
    return []
