#!/usr/bin/env python3
"""
Descarga el universo de símbolos USA desde Finnhub y genera el archivo
us_symbols_search.json usado por el buscador de Análisis Fundamental.

Uso:
    cd dcf-herramientas-web/
    python scripts/update_finnhub_us_symbols.py

Requiere:
    FINNHUB_TOKEN en el archivo .env o como variable de entorno.

Output:
    backend/data/fundamental/us_symbols_search.json

Actualizar periódicamente (recomendado: mensual) para mantener el
universo de búsqueda actualizado con nuevos listings y delists.

Filtros aplicados:
    - Solo exchange US
    - Tipos: Common Stock, ETP (ETF), ADR, REIT
    - Símbolo: solo letras y dígitos (sin puntos ni guiones)
    - Descripción no vacía
    - Máximo 5 caracteres de ticker
"""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

import httpx

# ── Configuración ─────────────────────────────────────────────────────────────

OUTPUT_PATH  = Path(__file__).resolve().parents[1] / "backend" / "data" / "fundamental" / "us_symbols_search.json"
FINNHUB_URL  = "https://finnhub.io/api/v1"
VALID_TYPES  = {"Common Stock", "ETP", "ADR", "REIT", "Closed-End Fund"}
MAX_SYMBOL   = 5  # tickers más largos suelen ser preferidas, warrants, etc.


def load_token() -> str:
    """Lee FINNHUB_TOKEN desde .env o variable de entorno."""
    # Intentar cargar .env si existe
    env_path = Path(__file__).resolve().parents[1] / ".env"
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("FINNHUB_TOKEN="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")

    token = os.getenv("FINNHUB_TOKEN", "")
    if not token:
        print("ERROR: FINNHUB_TOKEN no encontrado en .env ni en variables de entorno.")
        sys.exit(1)
    return token


def fetch_symbols(token: str) -> list[dict]:
    """Llama a Finnhub /stock/symbol?exchange=US y retorna la lista cruda."""
    print("Descargando símbolos desde Finnhub (exchange=US)...")
    with httpx.Client(timeout=60) as client:
        r = client.get(
            f"{FINNHUB_URL}/stock/symbol",
            params={"exchange": "US", "token": token},
        )
        r.raise_for_status()
        data = r.json()
    print(f"  Recibidos: {len(data):,} símbolos en total")
    return data


def filter_and_normalize(raw: list[dict]) -> list[dict]:
    """Filtra y normaliza a la estructura liviana."""
    seen: set[str] = set()
    result: list[dict] = []

    for item in raw:
        sym   = (item.get("symbol") or "").strip().upper()
        name  = (item.get("description") or "").strip()
        typ   = (item.get("type") or "").strip()
        mic   = (item.get("mic") or "").strip()
        curr  = (item.get("currency") or "").strip()

        # Filtros
        if not sym or not name:
            continue
        if len(sym) > MAX_SYMBOL:
            continue
        if not sym.isalnum():          # excluir BRK.B, preferidas con guión, etc.
            continue
        if curr and curr != "USD":     # solo USD
            continue
        if typ and typ not in VALID_TYPES:
            continue
        if sym in seen:
            continue

        seen.add(sym)
        result.append({
            "symbol": sym,
            "name":   name,
            "type":   typ or "Common Stock",
            "mic":    mic,
        })

    # Ordenar: símbolos cortos primero (más relevantes en autocomplete), luego alfabético
    result.sort(key=lambda x: (len(x["symbol"]), x["symbol"]))
    print(f"  Conservados después de filtrar: {len(result):,} símbolos")
    return result


def main() -> None:
    token = load_token()

    start = time.time()
    raw   = fetch_symbols(token)
    clean = filter_and_normalize(raw)

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(clean, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    elapsed = time.time() - start
    size_kb = OUTPUT_PATH.stat().st_size / 1024
    print(f"\n✓ Guardado en {OUTPUT_PATH}")
    print(f"  {len(clean):,} símbolos · {size_kb:.0f} KB · {elapsed:.1f}s")
    print("\nActualizar mensualmente para mantener el universo al día.")


if __name__ == "__main__":
    main()
