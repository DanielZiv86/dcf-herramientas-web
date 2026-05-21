"""
Genera archivos JSON estáticos para la tab Análisis Fundamental.

Uso:
    cd backend/
    python build_fundamental_data.py              # todos los tickers curados
    python build_fundamental_data.py CRWD ANET    # tickers específicos

Output: backend/data/fundamental/tickers/{TICKER}.json

Los JSON generados son leídos por services/fundamental.py como caché primario.
El backend hace fallback a la API (yfinance) si el JSON no existe o tiene > 24h.

Ejecutar:
- Localmente antes de hacer deploy
- O via GitHub Actions (ver .github/workflows/)
"""
from __future__ import annotations

import asyncio
import json
import logging
import sys
from pathlib import Path

# Agregar el directorio backend al path para importar los servicios
sys.path.insert(0, str(Path(__file__).resolve().parent))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("build_fundamental")


async def build_all(tickers: list[str]) -> None:
    # Importar aquí para que sys.path ya esté configurado
    from services.fundamental import build_ticker_json, CURATED_TICKERS

    if not tickers:
        tickers = CURATED_TICKERS

    logger.info("Generando JSON para %d tickers: %s", len(tickers), tickers)
    errors = []

    for tkr in tickers:
        try:
            logger.info("─── %s ...", tkr)
            result = await build_ticker_json(tkr)
            n_fin  = len(result.get("financials", []))
            n_can  = len(result.get("candles", {}).get("dates", []))
            logger.info("  ✓ %s — financials: %d años | candles: %d semanas", tkr, n_fin, n_can)
        except Exception as e:
            logger.error("  ✗ %s — ERROR: %s", tkr, e)
            errors.append(tkr)

    logger.info("─" * 50)
    logger.info("Completado. Errores: %s", errors if errors else "ninguno")

    if errors:
        sys.exit(1)


if __name__ == "__main__":
    tickers_arg = sys.argv[1:]
    asyncio.run(build_all([t.upper() for t in tickers_arg]))
