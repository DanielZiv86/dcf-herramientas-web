"""
build_cer_bd.py — Construye BD BONOS CER.xlsx con datos estaticos pre-computados.

Que guarda:
  - Hoja 'instrumentos': ticker, tipo, maturity_date, ref_base_date,
                         cer_base_value, vn_base, base_precio, coupon_rate_pct, coupon_freq
  - Hoja 'cashflows':    ticker, fecha, monto (cronograma COMPLETO, sin filtrar por settle)

Por que sirve:
  El cer_base_value es el valor del indice CER en la fecha de referencia base del bono.
  Como esa fecha ya paso, el valor es DEFINITIVO y nunca cambia.
  Guardarlo evita tener que buscar en 8500 filas historicas en cada request.

Uso:
  cd backend && python build_cer_bd.py
  (Re-correr cada vez que se agregan nuevos instrumentos a metadata_cer.xlsx)

Salida:
  backend/data/BD BONOS CER.xlsx (sobreescribe la version anterior)
"""

import asyncio
import calendar as _cal
import io
import logging
import sys
from datetime import date, timedelta
from pathlib import Path

import httpx
import numpy as np
import pandas as pd

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s  %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

DATA_DIR     = Path(__file__).resolve().parent / "data"
META_FILE    = DATA_DIR / "metadata_cer.xlsx"
OUTPUT_FILE  = DATA_DIR / "BD BONOS CER.xlsx"

URL_CER = (
    "https://infra.datos.gob.ar/catalog/sspm/dataset/94/distribution/"
    "94.2/download/cer-uva-uvi-diarios.csv"
)
URL_IPC = "https://api.argentinadatos.com/v1/finanzas/indices/inflacion"


# ── Calendario AR (weekdays only — holidays lib opcional) ─────────────────────

class _Cal:
    def __init__(self):
        self._o: set = set()
        try:
            import holidays as h
            for y in range(2018, 2032):
                self._o.update(h.country_holidays("AR", years=y).keys())
        except ImportError:
            logger.warning("'holidays' lib no disponible — usando solo dias habiles (lun-vie)")

    def is_bd(self, d: date) -> bool:
        return d.weekday() < 5 and d not in self._o

    def subtract_bd(self, d: date, n: int) -> date:
        r, rem = d, n
        while rem > 0:
            r -= timedelta(1)
            if self.is_bd(r):
                rem -= 1
        return r


# ── Fetch CER + extension IPC ─────────────────────────────────────────────────

async def _fetch_cer_extended() -> pd.Series:
    logger.info("Descargando serie CER oficial de datos.gob.ar …")
    async with httpx.AsyncClient(timeout=40) as c:
        r = await c.get(URL_CER)
        r.raise_for_status()
        df = pd.read_csv(io.StringIO(r.text))

    dc = next(col for col in df.columns if "tiempo" in col.lower() or "fecha" in col.lower())
    vc = next(col for col in df.columns if "cer" in col.lower())
    df[dc] = pd.to_datetime(df[dc])
    df[vc] = pd.to_numeric(df[vc], errors="coerce")
    s = pd.Series(df[vc].values, index=pd.DatetimeIndex(df[dc])).sort_index().dropna()
    logger.info("CER oficial: %d valores | hasta %s = %.4f", len(s), s.index.max().date(), float(s.iloc[-1]))

    # Extender con IPC mensual hacia adelante
    logger.info("Extendiendo con IPC mensual …")
    try:
        async with httpx.AsyncClient(timeout=20) as c:
            r2 = await c.get(URL_IPC)
            r2.raise_for_status()
            ipc = r2.json()
    except Exception as e:
        logger.warning("IPC fetch fallido (%s) — sin extension", e)
        return s

    rm: dict[tuple[int, int], float] = {}
    for it in ipc:
        d2 = pd.Timestamp(it["fecha"])
        rm[(d2.year, d2.month)] = float(it["valor"]) / 100.0

    last_r  = rm[max(rm.keys())]
    target  = date.today() + timedelta(days=90)   # extender 3 meses hacia adelante

    for off in range(4):
        m2 = target.month + off
        y2 = target.year + (m2 - 1) // 12
        m2 = ((m2 - 1) % 12) + 1
        if (y2, m2) not in rm:
            rm[(y2, m2)] = last_r

    last_d = s.index.max().date()
    cv     = float(s.iloc[-1])
    de, ve = [], []

    for ym in sorted(rm.keys()):
        y2, m2 = ym
        if ym < (last_d.year, last_d.month):
            continue
        if ym > (target.year, target.month):
            continue
        fd    = date(y2, m2, 1)
        ld    = date(y2, m2, _cal.monthrange(y2, m2)[1])
        bdays = pd.bdate_range(str(fd), str(ld))
        nb    = len(bdays)
        if nb == 0:
            continue
        dm = (1 + rm[ym]) ** (1.0 / nb)
        for ts in bdays:
            cv *= dm
            if ts.date() > last_d:
                de.append(ts)
                ve.append(cv)

    if de:
        ext = pd.Series(ve, index=pd.DatetimeIndex(de))
        s   = pd.concat([s, ext])
        s   = s[~s.index.duplicated(keep="first")].sort_index()
        logger.info("CER extendido: hasta %s = %.4f", s.index.max().date(), float(s.iloc[-1]))

    return s


def _cer_get(s: pd.Series, d: date) -> float | None:
    ts  = pd.Timestamp(d)
    sub = s[s.index <= ts]
    return float(sub.iloc[-1]) if not sub.empty else None


# ── Generacion de cashflows COMPLETOS (sin filtrar por settle) ────────────────

def _full_cashflow_schedule(
    tipo:          str,
    issue_date:    date,
    maturity_date: date,
    coupon_rate:   float,
    freq_per_year: int,
    vn_base:       float,
) -> list[tuple[date, float]]:
    """
    Retorna el cronograma COMPLETO de cashflows del instrumento.
    No filtra por settlement — eso se hace en tiempo de query.
    """
    is_zc = (freq_per_year == 0 or coupon_rate == 0.0
             or tipo in ("LECER", "BONCER_ZC"))

    if is_zc:
        return [(maturity_date, float(vn_base))]

    # Cupones: backward desde maturity hasta issue_date
    months_per_period = 12 // freq_per_year
    cpn_dates: list[date] = []
    current = maturity_date
    while current > issue_date:
        cpn_dates.append(current)
        m = current.month - months_per_period
        y = current.year
        while m <= 0:
            m += 12
            y -= 1
        day     = min(current.day, _cal.monthrange(y, m)[1])
        current = date(y, m, day)
    cpn_dates.sort()

    coupon_per_period = coupon_rate / freq_per_year * vn_base
    flows: list[tuple[date, float]] = []
    for i, cpn_date in enumerate(cpn_dates):
        is_last   = (i == len(cpn_dates) - 1)
        principal = vn_base if is_last else 0.0
        total     = coupon_per_period + principal
        if total > 0:
            flows.append((cpn_date, total))
    return flows


# ── Main ──────────────────────────────────────────────────────────────────────

async def build() -> None:
    if not META_FILE.exists():
        logger.error("No se encontro metadata_cer.xlsx en %s", DATA_DIR)
        sys.exit(1)

    # 1. Cargar metadata
    meta = pd.read_excel(META_FILE)
    meta.columns = [
        str(c).strip()
        .replace("ó", "o").replace("é", "e").replace("í", "i")
        .replace("á", "a").replace("ú", "u").replace("ñ", "n")
        for c in meta.columns
    ]
    # Normalizar alias de columnas (igual que _load_cer_metadata en cer.py)
    alias = {
        "Fecha Emision": "FechaEmision", "Cupon (decimal)": "CouponDecimal",
        "TasaCupon": "TasaCuponPct", "Frecuencia Cupon": "FrecCupon",
        "VN Base": "VN_Base", "Base Precio": "Base_Precio",
    }
    meta = meta.rename(columns={c: alias.get(c, c) for c in meta.columns})

    if "CouponDecimal" in meta.columns:
        meta["CouponRate"] = pd.to_numeric(meta["CouponDecimal"], errors="coerce").fillna(0.0)
    elif "TasaCuponPct" in meta.columns:
        meta["CouponRate"] = pd.to_numeric(meta["TasaCuponPct"], errors="coerce").fillna(0.0) / 100.0
    else:
        meta["CouponRate"] = 0.0

    meta["FrecCupon"]        = pd.to_numeric(meta.get("FrecCupon", 0), errors="coerce").fillna(0).astype(int)
    meta["FechaEmision"]     = pd.to_datetime(meta["FechaEmision"],     errors="coerce")
    meta["FechaVencimiento"] = pd.to_datetime(meta["FechaVencimiento"], errors="coerce")
    meta["VN_Base"]          = pd.to_numeric(meta.get("VN_Base",    100.0), errors="coerce").fillna(100.0)
    meta["Base_Precio"]      = pd.to_numeric(meta.get("Base_Precio", 100.0), errors="coerce").fillna(100.0)

    meta = meta.dropna(subset=["FechaEmision", "FechaVencimiento"])
    meta = meta[meta["Ticker"].notna()].copy()
    meta["Ticker"] = meta["Ticker"].astype(str).str.strip().str.upper()
    meta = meta[meta["Tipo"].astype(str).str.upper() != "BONCER_AMORT"].copy()

    logger.info("Metadata cargada: %d instrumentos", len(meta))

    # 2. Fetch CER
    cer = await _fetch_cer_extended()

    # 3. Calendario
    cal = _Cal()

    # 4. Computar para cada instrumento
    instr_rows:  list[dict] = []
    cf_rows:     list[dict] = []
    ok = 0
    errors = 0

    for _, row in meta.iterrows():
        ticker = str(row["Ticker"]).strip().upper()
        tipo   = str(row.get("Tipo", "")).strip().upper()

        issue_date = row["FechaEmision"].date()
        mat_date   = row["FechaVencimiento"].date()

        if mat_date <= date.today():
            logger.debug("%s: ya vencido — omitido", ticker)
            continue

        base_rule = str(row.get("CER_BaseDate_Rule", "business_days_before:10")).strip()
        n_base    = int(base_rule.rsplit(":", 1)[-1]) if ":" in base_rule else 10
        ref_base  = cal.subtract_bd(issue_date, n_base)

        cer_base  = _cer_get(cer, ref_base)
        if cer_base is None or cer_base <= 0:
            logger.warning("%s: CER en ref_base=%s no encontrado (CER llega hasta %s)",
                           ticker, ref_base, cer.index.max().date())
            errors += 1
            continue

        coupon_rate = float(row.get("CouponRate", 0.0) or 0.0)
        freq        = int(row.get("FrecCupon", 0) or 0)
        vn_base     = float(row.get("VN_Base", 100.0) or 100.0)
        base_precio = float(row.get("Base_Precio", 100.0) or 100.0)

        flows = _full_cashflow_schedule(tipo, issue_date, mat_date, coupon_rate, freq, vn_base)

        instr_rows.append({
            "ticker":          ticker,
            "tipo":            tipo,
            "maturity_date":   mat_date.isoformat(),
            "ref_base_date":   ref_base.isoformat(),
            "cer_base_value":  round(cer_base, 6),
            "vn_base":         vn_base,
            "base_precio":     base_precio,
            "coupon_rate_pct": round(coupon_rate * 100, 4),
            "coupon_freq":     freq,
            "settle_rule":     str(row.get("CER_SettleDate_Rule", "business_days_before:10")).strip(),
        })

        for d, a in flows:
            cf_rows.append({"ticker": ticker, "fecha": d.isoformat(), "monto": round(a, 6)})

        logger.info("  %-8s | ref_base=%s | cer_base=%.4f | %d flujos",
                    ticker, ref_base, cer_base, len(flows))
        ok += 1

    logger.info("Procesados: %d OK, %d errores", ok, errors)

    # 5. Guardar a Excel
    df_instr = pd.DataFrame(instr_rows)
    df_cf    = pd.DataFrame(cf_rows)

    with pd.ExcelWriter(OUTPUT_FILE, engine="openpyxl") as writer:
        df_instr.to_excel(writer, sheet_name="instrumentos", index=False)
        df_cf.to_excel(writer,    sheet_name="cashflows",    index=False)

    logger.info("Guardado: %s", OUTPUT_FILE)
    logger.info("  Hoja 'instrumentos': %d filas", len(df_instr))
    logger.info("  Hoja 'cashflows':    %d filas", len(df_cf))
    logger.info("")
    logger.info("PROXIMO PASO: reiniciar el backend para que use la BD nueva.")
    logger.info("Si se agregan bonos nuevos a metadata_cer.xlsx, re-correr este script.")


if __name__ == "__main__":
    asyncio.run(build())
