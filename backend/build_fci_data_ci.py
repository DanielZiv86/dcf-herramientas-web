"""
build_fci_data_ci.py — Versión para GitHub Actions (sin archivos locales de Streamlit).

Llama a la API de CAFCI directamente con DNS público (8.8.8.8) para superar
problemas de resolución DNS que ocurren en algunos proveedores cloud.

Uso:
  python backend/build_fci_data_ci.py
"""
from __future__ import annotations

import json
import socket
import time
from datetime import date, timedelta
from pathlib import Path
from typing import Optional

import requests
from requests.adapters import HTTPAdapter, Retry

BASE_URL = "https://api.pub.cafci.org.ar"
OUTPUT   = Path(__file__).parent / "data" / "fci_data.json"

# ── DNS patch: usa Google DNS para resolver cafci.org.ar ────────────────────

_orig_getaddrinfo = socket.getaddrinfo

def _patched_getaddrinfo(host, port, family=0, type=0, proto=0, flags=0):
    if isinstance(host, str) and "cafci.org.ar" in host:
        try:
            import dns.resolver
            r = dns.resolver.Resolver(configure=False)
            r.nameservers = ["8.8.8.8", "1.1.1.1"]
            r.timeout = 5; r.lifetime = 5
            ip = str(r.resolve(host, "A")[0])
            return _orig_getaddrinfo(ip, port, family, type, proto, flags)
        except Exception:
            pass
    return _orig_getaddrinfo(host, port, family, type, proto, flags)

socket.getaddrinfo = _patched_getaddrinfo


# ── HTTP session ─────────────────────────────────────────────────────────────

def _session() -> requests.Session:
    s = requests.Session()
    retry = Retry(total=2, backoff_factor=0.3,
                  status_forcelist=(429, 500, 502, 503, 504))
    s.mount("https://", HTTPAdapter(max_retries=retry))
    s.headers.update({
        "User-Agent": "Mozilla/5.0 (DCF Inversiones CI)",
        "Accept": "application/json",
        "Referer": "https://www.cafci.org.ar/",
        "Origin": "https://www.cafci.org.ar",
    })
    return s


_sess = _session()


def _get(path: str, params: dict | None = None) -> dict:
    r = _sess.get(f"{BASE_URL}{path}", params=params, timeout=20)
    r.raise_for_status()
    return r.json()


# ── Mapeos ────────────────────────────────────────────────────────────────────

_TIPO_MAP = {
    "Mercado de Dinero": "Money Market",
    "Renta Fija": "Renta Fija",
    "Renta Variable": "Renta Variable",
    "Renta Mixta": "Renta Mixta",
    "Retorno Total": "Retorno Total",
    "PyMEs/Infraestructura": "PyMEs / Infra",
    "Infraestructura": "PyMEs / Infra",
    "PyMes": "PyMEs / Infra",
}
_AGENTE_LABELS = {
    "balanz capital sociedad de bolsa": "Balanz",
    "invertir on line": "IOL",
}
_GERENTE_LABELS = {
    "cocos asset management": "Cocos Capital",
    "balanz s.g.f.c.i": "Balanz",
}


def _detect_alyc(fondo: dict) -> Optional[str]:
    for a in fondo.get("agentes", []):
        n = a.get("nombre", "").lower()
        for frag, label in _AGENTE_LABELS.items():
            if frag in n:
                return label
    g = fondo.get("gerente") or {}
    gn = g.get("nombre", "").lower() if isinstance(g, dict) else ""
    for frag, label in _GERENTE_LABELS.items():
        if frag in gn:
            return label
    return None


def _tipo(fondo: dict) -> str:
    tr = fondo.get("tipoRenta") or {}
    raw = tr.get("nombre", "") if isinstance(tr, dict) else str(tr)
    return _TIPO_MAP.get(raw, raw)


def _moneda(fondo: dict) -> str:
    m = fondo.get("moneda") or {}
    code = (m.get("codigoCafci", "") or m.get("nombre", "")) if isinstance(m, dict) else str(m)
    return "USD" if ("usd" in code.lower() or "dolar" in code.lower()) else "ARS"


def _parse_rend(ficha: dict) -> dict:
    def _pct(rend_dict, key):
        obj = rend_dict.get(key)
        if obj is None:
            return None
        val = obj.get("rendimiento") if isinstance(obj, dict) else obj
        try:
            return round(float(val), 2)
        except Exception:
            return None
    try:
        rend = ficha["data"]["info"]["diaria"]["rendimientos"]
    except (KeyError, TypeError):
        rend = {}
    return {
        "rend_dia":  _pct(rend, "day"),
        "rend_mes":  _pct(rend, "month"),
        "rend_year": _pct(rend, "oneYear"),
        "rend_ytd":  _pct(rend, "year"),
    }


def main():
    print("[fci-ci] Descargando lista de fondos de CAFCI...")
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

    print(f"[fci-ci] Total fondos: {len(all_fondos)}")

    rows: list[dict] = []
    seen: set[str] = set()

    for fondo in all_fondos:
        alyc = _detect_alyc(fondo)
        if not alyc:
            continue

        clases = fondo.get("clase_fondos", [])
        clase_a = next((c for c in clases if str(c.get("nombre", "")).strip().endswith("- Clase A")), None)
        if not clase_a:
            continue

        clase_nombre = clase_a.get("nombre", "").strip()
        key = f"{alyc}:{clase_nombre}"
        if key in seen:
            continue
        seen.add(key)

        fondo_id = str(fondo.get("id", ""))
        clase_id = str(clase_a.get("id", ""))

        # Fetch /ficha para rendimientos
        rend = {}
        try:
            ficha = _get(f"/fondo/{fondo_id}/clase/{clase_id}/ficha")
            rend  = _parse_rend(ficha)
        except Exception as e:
            print(f"  Ficha {fondo_id}/{clase_id} falló: {e}")
        time.sleep(0.15)

        rows.append({
            "fondo_id":    fondo_id,
            "clase_id":    clase_id,
            "nombre":      fondo.get("nombre", "").strip(),
            "clase_nombre": clase_nombre,
            "alyc":        alyc,
            "tipo":        _tipo(fondo),
            "moneda":      _moneda(fondo),
            **rend,
        })

    rows.sort(key=lambda r: (r["alyc"], r["tipo"], -(r.get("rend_year") or -9999)))

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT, "w", encoding="utf-8") as f:
        json.dump({"generated_at": date.today().isoformat(), "fondos": rows}, f,
                  ensure_ascii=False, indent=2)

    by_alyc = {}
    for r in rows:
        by_alyc[r["alyc"]] = by_alyc.get(r["alyc"], 0) + 1
    print(f"[fci-ci] JSON generado: {OUTPUT} | {len(rows)} fondos")
    for k, v in sorted(by_alyc.items()):
        print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
