"""
build_cafci_sources.py — Actualiza los archivos fuente de FCI desde la API de CAFCI.

Descarga:
  cafci_fondos_con_agentes.json  — lista completa de fondos activos con metadata
  cafci_vcp_mensual.csv          — serie mensual de VCP (rendimientos % por mes)

NOTA: CAFCI bloquea IPs de datacenter (403). Este script debe correrse desde una
IP local/residencial. Para CI/CD usar solo si CAFCI no bloquea el runner.

Uso:
  python backend/build_cafci_sources.py
  python backend/build_cafci_sources.py --meses 12
"""
from __future__ import annotations

import argparse
import json
import socket
import sys
import time
from datetime import date, timedelta
from pathlib import Path

import pandas as pd
import requests
from requests.adapters import HTTPAdapter, Retry

BASE_URL = "https://api.pub.cafci.org.ar"
DATA_DIR = Path(__file__).parent / "data"
OUT_FONDOS = DATA_DIR / "cafci_fondos_con_agentes.json"
OUT_VCP    = DATA_DIR / "cafci_vcp_mensual.csv"

# Tipos de renta disponibles en el endpoint de estadísticas diarias
_TIPO_RENTA_IDS = [2, 3, 4, 5, 6, 7]  # tipos 8/9/10/11 no están en este endpoint


# ── DNS patch: usa Google/Cloudflare DNS para resolver cafci.org.ar ──────────

_orig_getaddrinfo = socket.getaddrinfo


def _patched_getaddrinfo(host, port, family=0, type=0, proto=0, flags=0):
    if isinstance(host, str) and "cafci.org.ar" in host:
        try:
            import dns.resolver
            r = dns.resolver.Resolver(configure=False)
            r.nameservers = ["8.8.8.8", "1.1.1.1"]
            r.timeout = 5
            r.lifetime = 5
            ip = str(r.resolve(host, "A")[0])
            return _orig_getaddrinfo(ip, port, family, type, proto, flags)
        except Exception:
            pass
    return _orig_getaddrinfo(host, port, family, type, proto, flags)


socket.getaddrinfo = _patched_getaddrinfo


# ── HTTP session ──────────────────────────────────────────────────────────────

def _session() -> requests.Session:
    s = requests.Session()
    retry = Retry(total=3, backoff_factor=0.5,
                  status_forcelist=(429, 500, 502, 503, 504))
    s.mount("https://", HTTPAdapter(max_retries=retry))
    s.headers.update({
        "User-Agent": "Mozilla/5.0 (DCF Inversiones)",
        "Accept":     "application/json",
        "Referer":    "https://www.cafci.org.ar/",
        "Origin":     "https://www.cafci.org.ar",
    })
    return s


_sess = _session()


def _get(path: str, params: dict | None = None) -> dict:
    r = _sess.get(f"{BASE_URL}{path}", params=params, timeout=20)
    r.raise_for_status()
    return r.json()


# ── Descargar fondos ──────────────────────────────────────────────────────────

def _download_fondos() -> list[dict]:
    """Descarga todos los fondos activos con metadata completa."""
    print("[cafci-sources] Descargando lista de fondos...")
    all_fondos: list[dict] = []
    page = 0
    while True:
        try:
            data = _get("/fondo", params={
                "include": "entidad;agentes,entidad;gerente,tipoRenta,clase_fondo,moneda",
                "estado": 1, "limit": 200, "page": page,
            })
            items = data.get("data", [])
            if not items:
                break
            all_fondos.extend(items)
            last_page = data.get("lastPage")
            print(f"  Página {page}: {len(items)} fondos (total: {len(all_fondos)})")
            if last_page is None or page >= int(last_page):
                break
            page += 1
            time.sleep(0.1)
        except Exception as e:
            print(f"  Página {page} falló: {e}")
            break

    print(f"[cafci-sources] Total fondos descargados: {len(all_fondos)}")
    return all_fondos


# ── Descargar VCP mensual ──────────────────────────────────────────────────────

def _last_business_date(d: date) -> date:
    """Retrocede hasta el último día hábil (L-V)."""
    while d.weekday() >= 5:  # 5=sábado, 6=domingo
        d -= timedelta(days=1)
    return d


def _download_vcp(n_meses: int = 12) -> pd.DataFrame:
    """
    Descarga serie VCP mensual desde el endpoint de estadísticas diarias.
    Para cada mes calcula el retorno mensual = (VCP_último_día / VCP_primer_día - 1) × 100.
    Retorna DataFrame con clase_nombre como índice y columnas 'YYYY-MM-DD' (último día del mes).
    """
    today = date.today()
    # Generar lista de meses: primero del mes actual hacia atrás n_meses
    meses = []
    for i in range(n_meses):
        year  = today.year - (today.month - 1 - i + 12) // 12 if (today.month - 1 - i) < 0 else today.year
        month = ((today.month - 1 - i) % 12) + 1
        year  = today.year - (i - today.month + 1 + 12) // 12 if month > today.month else today.year
        # Cálculo correcto de mes anterior:
        mes_date = date(today.year, today.month, 1) - timedelta(days=i * 30)
        mes_date = mes_date.replace(day=1)
        meses.append(mes_date)
    meses = sorted(set(meses))[-n_meses:]  # últimos n_meses únicos ordenados

    print(f"[cafci-sources] Descargando VCP mensual para {len(meses)} meses...")

    all_data: dict[str, dict[str, float]] = {}  # {clase_nombre: {col_fecha: retorno}}

    for mes_start in meses:
        # Último día del mes
        if mes_start.month == 12:
            mes_end = date(mes_start.year + 1, 1, 1) - timedelta(days=1)
        else:
            mes_end = date(mes_start.year, mes_start.month + 1, 1) - timedelta(days=1)

        # Solo procesar meses que ya terminaron (o el mes actual si hay datos)
        if mes_start > today:
            continue

        col_key = mes_end.isoformat()

        # Intentar obtener datos del último día hábil del mes
        target_date = _last_business_date(min(mes_end, today - timedelta(days=1)))

        succeeded = 0
        for tipo_id in _TIPO_RENTA_IDS:
            try:
                data = _get(f"/estadisticas/informacion/diaria/{tipo_id}/{target_date.isoformat()}")
                items = data.get("data", [])
                for item in items:
                    clase_nombre = item.get("claseNombre", "").strip()
                    if not clase_nombre:
                        continue
                    # El campo 'rendimientoMensual' es el retorno del mes en %
                    rend_raw = item.get("rendimientoMensual")
                    if rend_raw is None:
                        continue
                    try:
                        rend = round(float(rend_raw), 4)
                    except (ValueError, TypeError):
                        continue
                    if clase_nombre not in all_data:
                        all_data[clase_nombre] = {}
                    all_data[clase_nombre][col_key] = rend
                    succeeded += 1
                time.sleep(0.05)
            except Exception as e:
                print(f"  Error tipo {tipo_id} mes {mes_start}: {e}")

        print(f"  {mes_start.strftime('%Y-%m')}: {succeeded} registros (fecha: {target_date})")

    if not all_data:
        return pd.DataFrame()

    df = pd.DataFrame.from_dict(all_data, orient="index")
    df.index.name = "clase_nombre"
    # Ordenar columnas cronológicamente
    date_cols = sorted([c for c in df.columns if c.startswith("20")])
    return df[date_cols]


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Actualiza archivos fuente de FCI desde CAFCI")
    parser.add_argument("--meses", type=int, default=13,
                        help="Cantidad de meses de VCP mensual a descargar (default: 13)")
    parser.add_argument("--solo-fondos", action="store_true",
                        help="Solo actualizar cafci_fondos_con_agentes.json (no VCP)")
    parser.add_argument("--solo-vcp", action="store_true",
                        help="Solo actualizar cafci_vcp_mensual.csv (no fondos)")
    args = parser.parse_args()

    DATA_DIR.mkdir(parents=True, exist_ok=True)

    # ── Fondos ────────────────────────────────────────────────────────────────
    if not args.solo_vcp:
        fondos = _download_fondos()

        if not fondos:
            print("[cafci-sources] ERROR: CAFCI no devolvió fondos (posible bloqueo 403).")
            print("[cafci-sources] Abortando sin sobreescribir cafci_fondos_con_agentes.json.")
            sys.exit(1)

        with open(OUT_FONDOS, "w", encoding="utf-8") as f:
            json.dump(fondos, f, ensure_ascii=False, indent=2)
        print(f"[cafci-sources] cafci_fondos_con_agentes.json → {len(fondos)} fondos")

    # ── VCP mensual ──────────────────────────────────────────────────────────
    if not args.solo_fondos:
        df_vcp = _download_vcp(args.meses)

        if df_vcp.empty:
            print("[cafci-sources] ERROR: VCP mensual vacío (posible bloqueo 403).")
            print("[cafci-sources] Abortando sin sobreescribir cafci_vcp_mensual.csv.")
            sys.exit(1)

        df_vcp.to_csv(OUT_VCP, encoding="utf-8")
        print(f"[cafci-sources] cafci_vcp_mensual.csv → {len(df_vcp)} fondos × {len(df_vcp.columns)} meses")

    print("[cafci-sources] Listo. Correr build_fci_data.py para regenerar fci_data.json.")


if __name__ == "__main__":
    main()
