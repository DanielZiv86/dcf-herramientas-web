"""
build_fci_data.py — Genera backend/data/fci_data.json

Lee los archivos de caché del proyecto Streamlit y construye el JSON estático
que sirve el backend HTML. Sin dependencias de la API de CAFCI en runtime.

Fuentes:
  cafci_fondos_con_agentes.json  — lista de 1128+ fondos con metadatos
  cafci_vcp_mensual.csv          — rendimientos mensuales (% por mes) de 3943 fondos

Uso:
  python backend/build_fci_data.py
  python backend/build_fci_data.py --fondos PATH_JSON --vcp PATH_CSV

El script detecta automáticamente las rutas del proyecto Streamlit si existen.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import date
from pathlib import Path
from typing import Optional

import pandas as pd

# ── Rutas por defecto ────────────────────────────────────────────────────────

# Proyecto Streamlit (ajustar si es necesario)
_STREAMLIT_BASE = Path(
    r"G:\.shortcut-targets-by-id\1ftoIZqhxjIK-zxyM2xIG9xFIX4GG9BvJ"
    r"\DCF\Marketing\Instagram\Scripts Python\App DCF Dani"
)
_DEFAULT_FONDOS = _STREAMLIT_BASE / "cafci_fondos_con_agentes.json"
_DEFAULT_VCP    = _STREAMLIT_BASE / "cafci_vcp_mensual.csv"
_OUTPUT         = Path(__file__).parent / "data" / "fci_data.json"

# ── Mapeos ───────────────────────────────────────────────────────────────────

_TIPO_MAP = {
    "Mercado de Dinero": "Money Market",
    "Renta Fija":        "Renta Fija",
    "Renta Variable":    "Renta Variable",
    "Renta Mixta":       "Renta Mixta",
    "Retorno Total":     "Retorno Total",
    "PyMEs/Infraestructura": "PyMEs / Infra",
    "Infraestructura":       "PyMEs / Infra",
    "PyMes":                 "PyMEs / Infra",
}

# Fragmentos de nombre (lowercase) → etiqueta ALyC
_AGENTE_LABELS = {
    "balanz capital sociedad de bolsa": "Balanz",
    "invertir on line":                  "IOL",
    "invertiron line":                   "IOL",
}
_GERENTE_LABELS = {
    "cocos asset management": "Cocos Capital",
    "balanz s.g.f.c.i":       "Balanz",   # fondos propios de Balanz
}


def _detect_alyc(fondo: dict) -> Optional[str]:
    for agent in fondo.get("agentes", []):
        nombre = agent.get("nombre", "").lower().strip()
        for frag, label in _AGENTE_LABELS.items():
            if frag in nombre:
                return label
    gerente = fondo.get("gerente") or {}
    gname = gerente.get("nombre", "").lower().strip() if isinstance(gerente, dict) else ""
    for frag, label in _GERENTE_LABELS.items():
        if frag in gname:
            return label
    return None


def _tipo(fondo: dict) -> str:
    tr = fondo.get("tipoRenta") or {}
    raw = tr.get("nombre", "") if isinstance(tr, dict) else str(tr)
    return _TIPO_MAP.get(raw, raw)


def _moneda(fondo: dict) -> str:
    m = fondo.get("moneda") or {}
    if isinstance(m, dict):
        code = m.get("codigoCafci", "") or m.get("nombre", "")
    else:
        code = str(m)
    return "USD" if ("usd" in code.lower() or "dolar" in code.lower()) else "ARS"


def _compound(series: pd.Series, cols: list[str]) -> Optional[float]:
    """Retorno compuesto de una serie de retornos mensuales en %."""
    vals = series[cols].dropna()
    vals = vals[vals != 0.0]
    if vals.empty:
        return None
    c = 1.0
    for v in vals:
        c *= (1.0 + float(v) / 100.0)
    return round((c - 1.0) * 100.0, 2)


def build(fondos_path: Path, vcp_path: Path) -> list[dict]:
    print(f"[fci-build] Leyendo fondos: {fondos_path}")
    with open(fondos_path, encoding="utf-8") as f:
        fondos_raw = json.load(f)

    print(f"[fci-build] Leyendo VCP mensual: {vcp_path}")
    df_vcp = pd.read_csv(vcp_path, index_col=0)
    date_cols = sorted([c for c in df_vcp.columns if c.startswith("20")])
    curr_year = str(date.today().year)
    ytd_cols  = [c for c in date_cols if c.startswith(curr_year)]

    print(f"[fci-build] Fondos JSON: {len(fondos_raw)} | VCP filas: {len(df_vcp)} | Meses: {len(date_cols)}")

    rows: list[dict] = []
    seen: set[str] = set()

    for fondo in fondos_raw:
        alyc = _detect_alyc(fondo)
        if not alyc:
            continue

        fondo_id = str(fondo.get("id", ""))
        fondo_nombre = fondo.get("nombre", "").strip()
        tipo   = _tipo(fondo)
        moneda = _moneda(fondo)

        clases = fondo.get("clase_fondos", [])
        clase_a = next(
            (c for c in clases if str(c.get("nombre", "")).strip().endswith("- Clase A")),
            None
        )
        if not clase_a:
            # Si no hay Clase A, saltar — filtro consistente con Streamlit
            continue

        clase_id    = str(clase_a.get("id", ""))
        clase_nombre = clase_a.get("nombre", "").strip()

        key = f"{alyc}:{clase_nombre}"
        if key in seen:
            continue
        seen.add(key)

        # Rendimientos desde VCP mensual
        rend_mes  = None
        rend_year = None
        rend_ytd  = None

        if clase_nombre in df_vcp.index:
            serie = df_vcp.loc[clase_nombre]
            if date_cols:
                v = serie[date_cols[-1]]
                rend_mes = round(float(v), 2) if pd.notna(v) and float(v) != 0 else None
            rend_year = _compound(serie, date_cols)
            rend_ytd  = _compound(serie, ytd_cols)

        # Serie mensual para gráfico de líneas (retorno mensual en %)
        monthly_returns = []
        if clase_nombre in df_vcp.index:
            for c in date_cols:
                v = df_vcp.loc[clase_nombre, c]
                monthly_returns.append(round(float(v), 4) if pd.notna(v) else None)
        else:
            monthly_returns = [None] * len(date_cols)

        # Validar que el fondo tenga al menos un dato útil:
        # rendimiento puntual o al menos 2 meses de histórico no nulos.
        # Fondos sin ningún dato = inactivos/discontinuados → no incluir.
        has_puntual = any(v is not None for v in [rend_mes, rend_year, rend_ytd])
        valid_hist  = sum(1 for v in monthly_returns if v is not None)
        if not has_puntual and valid_hist < 2:
            continue   # fondo inactivo o sin datos — omitir

        rows.append({
            "fondo_id":        fondo_id,
            "clase_id":        clase_id,
            "nombre":          fondo_nombre,
            "clase_nombre":    clase_nombre,
            "alyc":            alyc,
            "tipo":            tipo,
            "moneda":          moneda,
            "rend_dia":        None,   # requiere llamada live a /ficha
            "rend_mes":        rend_mes,
            "rend_year":       rend_year,
            "rend_ytd":        rend_ytd,
            "monthly_returns": monthly_returns,
            "valid_months":    valid_hist,   # nro de meses con datos (útil en frontend)
        })

    rows.sort(key=lambda r: (r["alyc"], r["tipo"], -(r["rend_year"] or -9999)))
    return rows, date_cols


def main():
    parser = argparse.ArgumentParser(description="Genera fci_data.json desde archivos locales")
    parser.add_argument("--fondos", type=Path, default=_DEFAULT_FONDOS)
    parser.add_argument("--vcp",    type=Path, default=_DEFAULT_VCP)
    parser.add_argument("--output", type=Path, default=_OUTPUT)
    args = parser.parse_args()

    if not args.fondos.exists():
        print(f"ERROR: No se encontró {args.fondos}", file=sys.stderr)
        print("Rutas disponibles: --fondos PATH_JSON --vcp PATH_CSV", file=sys.stderr)
        sys.exit(1)
    if not args.vcp.exists():
        print(f"ERROR: No se encontró {args.vcp}", file=sys.stderr)
        sys.exit(1)

    rows, date_cols = build(args.fondos, args.vcp)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    output = {
        "generated_at": date.today().isoformat(),
        "date_cols": date_cols,   # fechas mensuales compartidas por todos los fondos
        "fondos": rows,
    }
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    # Stats
    by_alyc = {}
    for r in rows:
        by_alyc[r["alyc"]] = by_alyc.get(r["alyc"], 0) + 1
    print(f"[fci-build] Generado: {args.output}")
    print(f"[fci-build] Total fondos: {len(rows)}")
    for alyc, n in sorted(by_alyc.items()):
        print(f"  {alyc}: {n} fondos")


if __name__ == "__main__":
    main()
