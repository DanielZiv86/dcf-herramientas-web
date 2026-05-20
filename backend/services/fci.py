"""FCI — Fondos Comunes de Inversión.

Fuente primaria: backend/data/fci_data.json (generado por build_fci_data.py).
Fallback: API CAFCI en vivo si el archivo no existe.

El JSON estático se regenera diariamente via GitHub Actions.
"""
from __future__ import annotations

import json
import logging
from datetime import date
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

from config import settings

_FCI_DATA_FILE = settings.data_path / "fci_data.json"

# ── Leer desde JSON estático ─────────────────────────────────────────────────

def _load_static_data() -> dict:
    """Lee fci_data.json generado por build_fci_data.py. Retorna dict con fondos y date_cols."""
    if not _FCI_DATA_FILE.exists():
        return {"fondos": [], "date_cols": []}
    try:
        with open(_FCI_DATA_FILE, encoding="utf-8") as f:
            payload = json.load(f)
        if isinstance(payload, list):
            payload = {"fondos": payload, "date_cols": []}
        logger.info("[fci] JSON estático: %d fondos (generado: %s)",
                    len(payload.get("fondos", [])), payload.get("generated_at", "?"))
        return payload
    except Exception as e:
        logger.error("[fci] Error leyendo fci_data.json: %s", e)
        return {"fondos": [], "date_cols": []}


# ── API pública ───────────────────────────────────────────────────────────────

async def get_fondos(
    alyc:   Optional[str] = None,
    tipo:   Optional[str] = None,
    moneda: Optional[str] = None,
) -> dict:
    """
    Retorna dict { date_cols, fondos } filtrado por ALyC / tipo / moneda.
    El frontend usa date_cols para construir el eje X del gráfico de líneas.
    """
    data = _load_static_data()
    fondos = data.get("fondos", [])

    if not fondos:
        logger.warning("[fci] fci_data.json vacío. Ejecutar: python backend/build_fci_data.py")
        return {"date_cols": [], "fondos": []}

    result = fondos
    if alyc:
        result = [f for f in result if f.get("alyc") == alyc]
    if tipo:
        result = [f for f in result if f.get("tipo") == tipo]
    if moneda:
        result = [f for f in result if f.get("moneda") == moneda]

    logger.info("[fci] get_fondos(alyc=%s tipo=%s moneda=%s) → %d fondos",
                alyc, tipo, moneda, len(result))
    return {"date_cols": data.get("date_cols", []), "fondos": result}


async def get_historico(fondo_id: int, clase_id: int, meses: int = 12) -> list[dict]:
    """Historial mensual de VCP (placeholder — no disponible sin API CAFCI)."""
    return []
