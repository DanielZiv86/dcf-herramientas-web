"""Fundamental analysis service.

Fuentes:
- Finnhub /stock/financials-reported: financial statements anuales (XBRL) — primario, hasta 5 años
- yfinance: financial statements fallback (4 años), price history y profile
- JSON estático: backend/data/fundamental/tickers/{TICKER}.json — más rápido que API

Espejo de fundamental/client.py + fundamental/calcs.py del proyecto Streamlit.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

import httpx
import numpy as np
import pandas as pd

from config import settings

logger = logging.getLogger(__name__)

BASE_URL     = "https://finnhub.io/api/v1"
STATIC_DIR   = Path(__file__).resolve().parents[1] / "data" / "fundamental" / "tickers"
PARQUET_DIR  = Path(__file__).resolve().parents[1] / "data" / "fundamental"
SYMBOLS_PATH = Path(__file__).resolve().parents[1] / "data" / "fundamental" / "us_symbols_search.json"
STATIC_TTL   = 86400  # 24h — tiempo máximo antes de regenerar el JSON estático
FINNHUB_TTL  = 43200  # 12h — cache de parquet Finnhub

# Thread pool para yfinance (síncrono)
_yf_pool = ThreadPoolExecutor(max_workers=4, thread_name_prefix="yfinance")


# ── Universo curado ───────────────────────────────────────────────────────────

CURATED_TICKERS: list[str] = [
    "CRWD", "ANET", "O", "GLNG", "SNDK", "NBIS", "HIMS",
    "ONDS", "COP", "NEE", "MP", "CCJ", "FISV",
]

TICKER_INFO: dict[str, dict] = {
    "CRWD": {"name": "CrowdStrike",       "sector": "Technology"},
    "ANET": {"name": "Arista Networks",   "sector": "Technology"},
    "O":    {"name": "Realty Income",     "sector": "Real Estate"},
    "GLNG": {"name": "Golar LNG",         "sector": "Energy"},
    "SNDK": {"name": "SanDisk",           "sector": "Technology"},
    "NBIS": {"name": "Nebius Group",      "sector": "Technology"},
    "HIMS": {"name": "Hims & Hers",       "sector": "Healthcare"},
    "ONDS": {"name": "Ondas Holdings",    "sector": "Technology"},
    "COP":  {"name": "ConocoPhillips",    "sector": "Energy"},
    "NEE":  {"name": "NextEra Energy",    "sector": "Utilities"},
    "MP":   {"name": "MP Materials",      "sector": "Materials"},
    "CCJ":  {"name": "Cameco",            "sector": "Energy"},
    "FISV": {"name": "Fiserv",            "sector": "Financial"},
}

TICKER_CONFIG: dict[str, dict] = {
    "CRWD": {
        "description": "Líder global en ciberseguridad nativa en la nube. Plataforma Falcon con 28+ módulos unificados. Modelo 100% SaaS con NRR >120%, protegiendo endpoints, cloud e identidades en tiempo real con IA.",
        "tags": ["Cybersecurity", "Cloud Native", "SaaS", "AI/ML", "Zero Trust"],
    },
    "ANET": {
        "description": "Líder en redes cloud de alta velocidad (100G/400G). Infraestructura de red para hyperscalers, data centers y empresas Fortune 500. Plataforma EOS con automatización y telemetría avanzada.",
        "tags": ["Networking", "Cloud Infra", "Data Center", "AI Infra"],
    },
    "O": {
        "description": "REIT triple-net-lease con +15.600 propiedades en 90+ sectores. Dividend Aristocrat con más de 650 dividendos mensuales consecutivos. Enfoque en inquilinos retail investment-grade.",
        "tags": ["REIT", "Dividendo Mensual", "Net Lease", "Defensive"],
    },
    "GLNG": {
        "description": "Operador global de infraestructura LNG: FLNGs (floating LNG), FSRUs y terminales. Contratos long-term con utilities y gasistas internacionales. Exposición estructural al gas natural global.",
        "tags": ["LNG", "Energía", "Infraestructura", "Midstream"],
    },
    "SNDK": {
        "description": "Líder mundial en almacenamiento flash NAND y SSDs. Portfolio de productos para data centers, edge computing y consumo. Spin-off de Western Digital con foco en memoria de alta densidad.",
        "tags": ["Semiconductores", "Storage", "NAND", "Data Center"],
    },
    "NBIS": {
        "description": "Holding de infraestructura de IA: GPU clouds, data centers y servicios de IA generativa. Antiguo Yandex N.V., reposicionado como plataforma de compute para modelos de lenguaje y entrenamientos.",
        "tags": ["AI Infra", "GPU Cloud", "Data Center", "Generative AI"],
    },
    "HIMS": {
        "description": "Plataforma de telesalud y bienestar DTC con foco en tratamientos personalizados: GLP-1/obesidad, disfunción eréctil, caída del cabello y salud mental. Modelo de suscripción con alta retención.",
        "tags": ["Telesalud", "GLP-1", "DTC", "Suscripción", "Wellness"],
    },
    "ONDS": {
        "description": "Empresa de redes inalámbricas privadas para industrias críticas: ferroviaria, defensa y utilities. Tecnología eMTC/private 5G para automatización e IoT en sectores regulados.",
        "tags": ["Private 5G", "IoT", "Defensa", "Ferroviario", "Small Cap"],
    },
    "COP": {
        "description": "Una de las mayores independientes de E&P del mundo. Activos diversificados: Permian, Alaska, Qatar LNG. Disciplina de capital con retorno al accionista via dividendos + buybacks.",
        "tags": ["Oil & Gas", "E&P", "Permian", "LNG", "Dividendo"],
    },
    "NEE": {
        "description": "Mayor generador de energía renovable del mundo (eólica + solar). Utility regulada en Florida (FPL) más brazo de renovables (NextEra Energy Resources). Líder en transición energética.",
        "tags": ["Renewables", "Solar", "Eólica", "Utility", "ESG"],
    },
    "MP": {
        "description": "Único productor de tierras raras de escala en EE.UU. (mina Mountain Pass). Procesamiento de NdPr para motores de vehículos eléctricos y turbinas eólicas. Soberanía estratégica vs China.",
        "tags": ["Tierras Raras", "Critical Minerals", "EV Supply Chain", "Defense"],
    },
    "CCJ": {
        "description": "Segundo mayor productor mundial de uranio (Cigar Lake, McArthur River). Contratos long-term con utilities nucleares globales. Beneficiario del renacimiento nuclear para descarbonización.",
        "tags": ["Uranio", "Nuclear", "Energía", "Critical Minerals"],
    },
    "FISV": {
        "description": "Proveedor global de tecnología financiera: procesamiento de pagos, core banking y soluciones merchant. Clover (POS) como plataforma de alto crecimiento. +6M negocios en red.",
        "tags": ["Fintech", "Pagos", "Core Banking", "POS", "B2B"],
    },
}


# ══════════════════════════════════════════════════════════════════════════════
# JSON estático — cache en disco (no efímero en Render si se pre-genera)
# ══════════════════════════════════════════════════════════════════════════════

def _static_path(ticker: str) -> Path:
    STATIC_DIR.mkdir(parents=True, exist_ok=True)
    return STATIC_DIR / f"{ticker.upper()}.json"


def _static_is_fresh(path: Path, ttl: int = STATIC_TTL) -> bool:
    if not path.exists():
        return False
    return (time.time() - path.stat().st_mtime) < ttl


def _static_load(ticker: str) -> Optional[dict]:
    path = _static_path(ticker)
    if not _static_is_fresh(path):
        return None
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.warning("[fund] static load %s failed: %s", ticker, e)
        return None


def _static_save(ticker: str, data: dict) -> None:
    try:
        path = _static_path(ticker)
        data["generated_at"] = datetime.utcnow().isoformat()
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, default=str, allow_nan=False)
        logger.info("[fund] static JSON saved: %s", path.name)
    except Exception as e:
        logger.warning("[fund] static save %s failed: %s", ticker, e)


# ══════════════════════════════════════════════════════════════════════════════
# yfinance — helpers síncronos (ejecutados en thread pool)
# ══════════════════════════════════════════════════════════════════════════════

def _yf_run(fn, *args):
    """Ejecuta fn(*args) síncrono en el thread pool de yfinance."""
    loop = asyncio.get_event_loop()
    return loop.run_in_executor(_yf_pool, fn, *args)


def _nan_to_none(v):
    """Convierte NaN/inf → None para JSON serialization."""
    if v is None:
        return None
    try:
        f = float(v)
        return None if (f != f or abs(f) == float("inf")) else f
    except Exception:
        return None


def _yield_pct(v) -> Optional[float]:
    """
    Convierte dividendYield de yfinance a %.
    yfinance puede retornar fracción (0.0087 = 0.87%) o ya en % (0.87) según versión.
    Umbral 0.5: valores por debajo se tratan como fracción (×100); por encima, ya son %.
    Cubre el caso práctico: fracción máx realista ~45% → 0.45 < 0.5.
    """
    v2 = _nan_to_none(v)
    if v2 is None or v2 <= 0:
        return None
    if v2 < 0.5:
        return round(v2 * 100, 2)
    elif v2 <= 100:
        return round(v2, 2)
    return None


def _safe_float(v, divisor=1.0) -> Optional[float]:
    """Convierte v a float dividido por divisor; NaN → None."""
    v2 = _nan_to_none(v)
    if v2 is None:
        return None
    return round(v2 / divisor, 4)


# ── yfinance: financial statements ───────────────────────────────────────────

def _financials_yfinance_sync(ticker: str) -> pd.DataFrame:
    """
    Construye DataFrame anual desde yfinance.
    Equivalente a _financials_yfinance() en Streamlit's fundamental/client.py.
    Columnas en MILLONES USD; capex positivo (monto de inversión).
    """
    try:
        import yfinance as yf
        tkr = yf.Ticker(ticker)

        inc = tkr.income_stmt
        bal = tkr.balance_sheet
        cf  = tkr.cashflow

        if inc is None or inc.empty:
            logger.warning("[fund] yfinance income_stmt empty for %s", ticker)
            return pd.DataFrame()

        rows = []
        for col in inc.columns:
            try:
                year = int(str(col)[:4])
            except Exception:
                continue
            end_date = str(col)[:10]

            def g(df, *names):
                """Busca primera fila que coincide (case-insensitive, match parcial)."""
                if df is None or df.empty:
                    return None
                idx_lower = {str(i).lower(): i for i in df.index}
                for name in names:
                    for k, orig in idx_lower.items():
                        if name.lower() in k:
                            try:
                                v = df.loc[orig, col]
                                return float(v) if pd.notna(v) else None
                            except Exception:
                                return None
                return None

            capex_raw = g(cf, "capital expenditure")
            capex_mm  = abs(capex_raw) / 1e6 if capex_raw is not None else None

            row = {
                "year":             year,
                "end_date":         end_date,
                "revenue":          _safe_float(g(inc, "total revenue", "revenue"), 1e6),
                "gross_profit":     _safe_float(g(inc, "gross profit"), 1e6),
                "operating_income": _safe_float(g(inc, "operating income", "ebit"), 1e6),
                "net_income":       _safe_float(g(inc, "net income"), 1e6),
                "da":               _safe_float(
                    g(inc, "depreciation & amortization", "reconciled depreciation",
                      "depreciation amortization"), 1e6),
                "eps_diluted":      _nan_to_none(g(inc, "diluted eps", "basic eps")),
                "cfo":              _safe_float(g(cf, "operating cash flow"), 1e6),
                "capex":            capex_mm,
                "cash":             _safe_float(
                    g(bal, "cash and cash equivalents",
                      "cash cash equivalents and short term investments"), 1e6),
                "debt_lt":          _safe_float(g(bal, "long term debt"), 1e6),
                "debt_st":          _safe_float(g(bal, "current debt", "current long term debt"), 1e6),
                "equity":           _safe_float(
                    g(bal, "stockholders equity", "total equity gross minority interest",
                      "total equity"), 1e6),
                "total_assets":     _safe_float(g(bal, "total assets"), 1e6),
            }

            has_data = any(row[k] is not None for k in ("revenue", "net_income", "cfo", "total_assets"))
            if not has_data:
                continue

            rows.append(row)

        if not rows:
            logger.warning("[fund] yfinance: no rows for %s", ticker)
            return pd.DataFrame()

        df = pd.DataFrame(rows).sort_values("year").drop_duplicates("year").reset_index(drop=True)
        # Solo últimos 5 años con revenue real
        if "revenue" in df.columns:
            df = df[df["revenue"].notna() & (df["revenue"].abs() > 0.001)]
        df = df.tail(5).reset_index(drop=True)

        logger.info("[fund] yfinance financials %s: %d years", ticker, len(df))
        return df

    except Exception as e:
        logger.warning("[fund] yfinance financials %s failed: %s", ticker, e)
        return pd.DataFrame()


# ── Finnhub: financial statements via XBRL (hasta 5 años) ───────────────────

async def _financials_finnhub_async(ticker: str) -> pd.DataFrame:
    """
    Financial statements anuales desde Finnhub /stock/financials-reported (XBRL).
    Retorna DataFrame en el mismo formato que _financials_yfinance_sync.
    Valores en MILLONES USD; capex positivo.

    Nota: Finnhub usa underscore como separador XBRL (us-gaap_Concept), no colon.
    """
    if not settings.finnhub_token:
        return pd.DataFrame()

    from_date = "2019-01-01"
    to_date   = datetime.utcnow().strftime("%Y-%m-%d")

    try:
        params = {"symbol": ticker, "freq": "annual", "from": from_date, "to": to_date}
        async with _finnhub_client() as c:
            r = await c.get("/stock/financials-reported", params=params)
            r.raise_for_status()
            data = r.json()
    except Exception as e:
        logger.warning("[fund] Finnhub financials-reported %s: %s", ticker, e)
        return pd.DataFrame()

    # Solo reportes anuales (quarter=0)
    reports = [r for r in data.get("data", []) if r.get("quarter") == 0]
    if not reports:
        logger.warning("[fund] Finnhub: no annual reports for %s", ticker)
        return pd.DataFrame()

    def _cv(items: list, *concepts) -> Optional[float]:
        """Busca el primer concepto XBRL que coincide; ignora prefijo de namespace."""
        idx: dict = {}
        for item in items:
            c = item.get("concept", "")
            v = item.get("value")
            if c and v is not None:
                idx[c.lower()] = v
        for c in concepts:
            v = idx.get(c.lower())
            if v is not None:
                try:
                    f = float(v)
                    if f == f:  # no NaN
                        return f
                except Exception:
                    pass
        return None

    rows = []
    for rep in reports:
        year = rep.get("year")
        if not year:
            try:
                year = int(rep.get("filedDate", "")[:4])
            except Exception:
                continue

        rpt = rep.get("report", {})
        ic  = rpt.get("ic", [])
        bs  = rpt.get("bs", [])
        cf  = rpt.get("cf", [])

        # Revenue — orden de preferencia por especificidad
        rev = _cv(ic,
            "us-gaap_RevenueFromContractWithCustomerExcludingAssessedTax",
            "us-gaap_RevenueFromContractWithCustomerIncludingAssessedTax",
            "us-gaap_Revenues",
            "us-gaap_SalesRevenueNet",
            "us-gaap_TotalRevenues",
        )
        gp = _cv(ic, "us-gaap_GrossProfit")
        oi = _cv(ic, "us-gaap_OperatingIncomeLoss")
        ni = _cv(ic,
            "us-gaap_NetIncomeLoss",
            "us-gaap_ProfitLoss",
            "us-gaap_NetIncomeLossAttributableToParent",
        )
        # D&A: buscar en IC primero; fallback a CF donde aparece como ajuste al CFO
        da = _cv(ic,
            "us-gaap_DepreciationDepletionAndAmortization",
            "us-gaap_DepreciationAndAmortization",
        )
        if da is None:
            da = _cv(cf,
                "us-gaap_DepreciationDepletionAndAmortization",
                "us-gaap_DepreciationAndAmortization",
                "us-gaap_DepreciationAmortizationAndAccretionNet",
                # Suma de sub-conceptos: amortización de intangibles como proxy parcial
                "us-gaap_AmortizationOfIntangibleAssets",
            )
        eps = _cv(ic,
            "us-gaap_EarningsPerShareDiluted",
            "us-gaap_EarningsPerShareBasicAndDiluted",
            "us-gaap_EarningsPerShareBasic",
        )
        cfo = _cv(cf, "us-gaap_NetCashProvidedByUsedInOperatingActivities")
        # Capex: Finnhub reporta pagos como positivos en CF
        capex_raw = _cv(cf,
            "us-gaap_PaymentsToAcquirePropertyPlantAndEquipment",
            "us-gaap_PaymentsForCapitalImprovements",
        )
        capex_mm = capex_raw / 1e6 if capex_raw is not None else None

        cash = _cv(bs,
            "us-gaap_CashAndCashEquivalentsAtCarryingValue",
            "us-gaap_CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents",
            "us-gaap_CashCashEquivalentsAndShortTermInvestments",
        )
        debt_lt = _cv(bs,
            "us-gaap_LongTermDebtNoncurrent",
            "us-gaap_LongTermDebt",
            "us-gaap_LongTermDebtAndCapitalLeaseObligations",
        )
        debt_st = _cv(bs,
            "us-gaap_LongTermDebtCurrent",
            "us-gaap_ShortTermBorrowings",
            "us-gaap_DebtCurrent",
        )
        equity = _cv(bs,
            "us-gaap_StockholdersEquity",
            "us-gaap_StockholdersEquityAttributableToParent",
        )
        total_assets = _cv(bs, "us-gaap_Assets")

        row = {
            "year":             int(year),
            "end_date":         rep.get("filedDate", "")[:10],
            "revenue":          _safe_float(rev, 1e6),
            "gross_profit":     _safe_float(gp, 1e6),
            "operating_income": _safe_float(oi, 1e6),
            "net_income":       _safe_float(ni, 1e6),
            "da":               _safe_float(da, 1e6),
            "eps_diluted":      _nan_to_none(eps),
            "cfo":              _safe_float(cfo, 1e6),
            "capex":            capex_mm,
            "cash":             _safe_float(cash, 1e6),
            "debt_lt":          _safe_float(debt_lt, 1e6),
            "debt_st":          _safe_float(debt_st, 1e6),
            "equity":           _safe_float(equity, 1e6),
            "total_assets":     _safe_float(total_assets, 1e6),
        }
        has_data = any(row[k] is not None for k in ("revenue", "net_income", "cfo", "total_assets"))
        if has_data:
            rows.append(row)

    if not rows:
        logger.warning("[fund] Finnhub: no rows parsed for %s", ticker)
        return pd.DataFrame()

    df = pd.DataFrame(rows).sort_values("year").drop_duplicates("year").reset_index(drop=True)
    if "revenue" in df.columns:
        df = df[df["revenue"].notna() & (df["revenue"].abs() > 0.001)]
    df = df.tail(5).reset_index(drop=True)
    logger.info("[fund] Finnhub financials %s: %d years %s", ticker, len(df), list(df["year"]))
    return df


def _finnhub_data_is_reliable(df: pd.DataFrame) -> bool:
    """
    Valida que el DataFrame de Finnhub sea usable como fuente primaria:
    - ≥4 años de datos
    - Sin gaps en ningún par de años consecutivos
    - El año más reciente es ≥ 2024 (datos actualizados)
    """
    if df.empty:
        return False
    years = list(df["year"].dropna().astype(int))
    if len(years) < 4:
        return False
    has_gap = any(years[i+1] - years[i] > 1 for i in range(len(years)-1))
    if has_gap:
        return False
    return years[-1] >= 2024


async def _fetch_financials_live(ticker: str) -> list[dict]:
    """
    Fetches financials desde API (Finnhub → yfinance), sin cache estático.
    Usado por build_ticker_json para garantizar datos frescos.

    Lógica de fuente:
    - Finnhub primario: 5 años si los datos son completos y actualizados
    - yfinance fallback: 4 años, siempre consecutivos — para issuers no-US, FY no-calendarios, etc.
    - Si yfinance también falla, usa lo que haya en Finnhub como último recurso.
    """
    tkr = ticker.upper()

    finnhub_df = pd.DataFrame()
    if settings.finnhub_token:
        try:
            finnhub_df = await _financials_finnhub_async(tkr)
        except Exception as e:
            logger.warning("[fund] Finnhub financials %s: %s", tkr, e)

    # Usar Finnhub solo si da ≥4 años consecutivos y datos actualizados
    if _finnhub_data_is_reliable(finnhub_df):
        logger.info("[fund] live financials %s via Finnhub: %d years", tkr, len(finnhub_df))
        return _compute_derived(finnhub_df)

    # yfinance fallback — siempre da años consecutivos (generalmente 4)
    try:
        yf_df = await asyncio.get_event_loop().run_in_executor(
            _yf_pool, _financials_yfinance_sync, tkr
        )
        if not yf_df.empty:
            logger.info("[fund] live financials %s via yfinance: %d years", tkr, len(yf_df))
            return _compute_derived(yf_df)
    except Exception as e:
        logger.warning("[fund] yfinance financials %s: %s", tkr, e)

    # Último recurso: Finnhub aunque sea incompleto
    if not finnhub_df.empty:
        logger.warning("[fund] live financials %s: usando Finnhub incompleto (%d años)", tkr, len(finnhub_df))
        return _compute_derived(finnhub_df)

    return []


# ── yfinance: price history (velas semanales) ─────────────────────────────────

def _candles_yfinance_sync(ticker: str, years: int = 5) -> dict:
    """Histórico de precios semanal via yfinance. Primary source para velas."""
    try:
        import yfinance as yf
        # multi_level_index=False evita MultiIndex en yfinance ≥0.2.40;
        # versiones anteriores lo ignoran con TypeError — manejamos ambos casos.
        try:
            df = yf.download(ticker, period=f"{years}y", interval="1wk",
                             auto_adjust=True, progress=False, multi_level_index=False)
        except TypeError:
            df = yf.download(ticker, period=f"{years}y", interval="1wk",
                             auto_adjust=True, progress=False)

        if df is None or df.empty:
            return {"status": "no_data", "dates": [], "closes": []}

        df = df.reset_index()

        # Normalizar columnas — manejar MultiIndex (columnas tipo ('Close', 'NVDA'))
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = [col[0].lower() if isinstance(col, tuple) else str(col).lower()
                          for col in df.columns]
        else:
            df.columns = [str(c).lower() for c in df.columns]

        # Buscar columna fecha con nombre exacto primero, luego parcial
        date_col = next((c for c in df.columns if c in ("date", "datetime", "timestamp")), None)
        if not date_col:
            date_col = next((c for c in df.columns if "date" in c), None)

        # Buscar columna close evitando strings tipo "('close', 'nvda')"
        close_col = next((c for c in df.columns if c == "close"), None)
        if not close_col:
            close_col = next((c for c in df.columns if "close" in c and "(" not in c), None)
        if not close_col:
            close_col = next((c for c in df.columns if "close" in c), None)

        if not date_col or not close_col:
            logger.warning("[fund] yfinance candles %s: cols not found in %s", ticker, list(df.columns))
            return {"status": "no_data", "dates": [], "closes": []}

        df = df[[date_col, close_col]].dropna()
        dates  = [str(d)[:10] for d in df[date_col]]
        closes = [round(float(v), 4) for v in df[close_col]]

        logger.info("[fund] yfinance candles %s: %d weeks", ticker, len(dates))
        return {"status": "ok", "dates": dates, "closes": closes}

    except Exception as e:
        logger.warning("[fund] yfinance candles %s failed: %s", ticker, e)
        return {"status": "error", "dates": [], "closes": []}


# ── yfinance: profile enrichment ──────────────────────────────────────────────

def _profile_yfinance_sync(ticker: str) -> dict:
    """Datos de perfil desde yfinance.info (complemento a Finnhub)."""
    try:
        import yfinance as yf
        info = yf.Ticker(ticker).info or {}
        mcap = info.get("marketCap")
        shares = info.get("sharesOutstanding")
        dy_pct = _yield_pct(info.get("dividendYield"))

        return {
            "name":         info.get("longName") or info.get("shortName") or ticker,
            "sector":       info.get("sector") or info.get("industry", ""),
            "industry":     info.get("industry", ""),
            "exchange":     info.get("exchange") or info.get("fullExchangeName", ""),
            "market_cap":   round(mcap / 1e6, 2) if mcap else None,  # millones
            "shares":       round(shares / 1e6, 4) if shares else None,  # millones
            "logo":         info.get("logo_url", ""),
            "website":      info.get("website", ""),
            "country":      info.get("country", "US"),
            "currency":     info.get("currency", "USD"),
            "ipo_date":     info.get("ipoExpectedDate") or "",
            "employees":    info.get("fullTimeEmployees"),
            "description":  info.get("longBusinessSummary", ""),
            "dividend_yield": dy_pct,
        }
    except Exception as e:
        logger.warning("[fund] yfinance profile %s failed: %s", ticker, e)
        return {}


# ── yfinance: metrics ─────────────────────────────────────────────────────────

def _metrics_yfinance_sync(ticker: str) -> dict:
    """Métricas fundamentales desde yfinance.info."""
    try:
        import yfinance as yf
        info = yf.Ticker(ticker).info or {}

        def pct(v):
            """Convierte fracción yfinance a %; NaN → None."""
            v2 = _nan_to_none(v)
            if v2 is None:
                return None
            # yfinance margins/returns están en fracción (0.12 = 12%)
            return round(v2 * 100, 2) if abs(v2) < 10 else round(v2, 2)

        def val(v, divisor=1.0):
            v2 = _nan_to_none(v)
            return round(v2 / divisor, 4) if v2 is not None else None

        price        = _nan_to_none(info.get("currentPrice") or info.get("regularMarketPrice"))
        target_price = _nan_to_none(info.get("targetMeanPrice"))
        upside       = None
        if price and target_price and price > 0:
            upside = round((target_price - price) / price * 100, 2)

        return {
            "pe_ttm":              val(info.get("trailingPE")),
            "pe_forward":          val(info.get("forwardPE")),
            "ps_ttm":              val(info.get("priceToSalesTrailing12Months")),
            "pb_annual":           val(info.get("priceToBook")),
            "ev_ebitda_ttm":       val(info.get("enterpriseToEbitda")),
            "ev_sales_ttm":        val(info.get("enterpriseToRevenue")),
            "beta":                val(info.get("beta")),
            "week52_high":         val(info.get("fiftyTwoWeekHigh")),
            "week52_low":          val(info.get("fiftyTwoWeekLow")),
            "eps_ttm":             val(info.get("trailingEps")),
            "eps_forward":         val(info.get("forwardEps")),
            "roe_ttm":             pct(info.get("returnOnEquity")),
            "roa_ttm":             pct(info.get("returnOnAssets")),
            "roic_ttm":            None,  # yfinance no tiene ROIC directamente
            "gross_margin_ttm":    pct(info.get("grossMargins")),
            "ebitda_margin_ttm":   pct(info.get("ebitdaMargins")),
            "net_margin_ttm":      pct(info.get("profitMargins")),
            "operating_margin_ttm":pct(info.get("operatingMargins")),
            "fcf_margin_ttm":      None,  # calculado desde financials
            "revenue_ttm_m":       val(info.get("totalRevenue"), 1e6),   # millones
            "ebitda_ttm_m":        val(info.get("ebitda"), 1e6),          # millones
            "fcf_ttm_m":           val(info.get("freeCashflow"), 1e6),    # millones
            "dividend_yield":      _yield_pct(info.get("dividendYield")),
            "target_price":        target_price,
            "upside":              upside,
            "recommendation":      info.get("recommendationKey", ""),
            "num_analysts":        info.get("numberOfAnalystOpinions"),
            "enterprise_value_m":  val(info.get("enterpriseValue"), 1e6),  # millones
        }
    except Exception as e:
        logger.warning("[fund] yfinance metrics %s failed: %s", ticker, e)
        return {}


# ── Finnhub: métricas desde /stock/metric (más fiable que yfinance en prod) ──────

async def _metrics_finnhub_async(ticker: str) -> dict:
    """
    Métricas fundamentales desde Finnhub /stock/metric?symbol=X&metric=all.
    Ventaja: evita rate-limits de Yahoo Finance; valores ya en % (sin conversión).
    """
    if not settings.finnhub_token:
        return {}
    try:
        data = await _fh_get("/stock/metric", symbol=ticker, metric="all")
        m = data.get("metric", {})
        if not m:
            return {}

        def gm(*keys) -> Optional[float]:
            for k in keys:
                v = _nan_to_none(m.get(k))
                if v is not None:
                    return v
            return None

        def parse_annual_series(key: str) -> Optional[list]:
            """Convierte series.annual[key] → [{year, v}] para charts históricos."""
            items = data.get("series", {}).get("annual", {}).get(key, [])
            result = []
            for item in items:
                period = item.get("period", "")
                v = _nan_to_none(item.get("v"))
                if period and v is not None:
                    try:
                        result.append({"year": int(str(period)[:4]), "v": v})
                    except Exception:
                        pass
            return result if result else None

        return {
            "pe_ttm":               gm("peExclExtraTTM", "peNormalizedAnnual"),
            "pe_forward":           None,           # no en /stock/metric básico
            "ps_ttm":               gm("psTTM", "psAnnual"),
            "pb_annual":            gm("pbAnnual", "pbQuarterly"),
            "ev_ebitda_ttm":        gm("evToEbitdaTTM"),
            "ev_sales_ttm":         gm("evToRevenueTTM"),
            "beta":                 gm("beta"),
            "week52_high":          gm("52WeekHigh"),
            "week52_low":           gm("52WeekLow"),
            "eps_ttm":              gm("epsTTM", "epsNormalizedAnnual"),
            "eps_forward":          None,
            "roe_ttm":              gm("roeTTM"),           # ya en %
            "roa_ttm":              gm("roaTTM"),           # ya en %
            "roic_ttm":             None,
            "gross_margin_ttm":     gm("grossMarginTTM", "grossMarginAnnual"),  # ya en %
            "ebitda_margin_ttm":    None,           # no en basic /stock/metric
            "net_margin_ttm":       gm("netMarginTTM"),     # ya en %
            "operating_margin_ttm": gm("operatingMarginTTM"),
            "fcf_margin_ttm":       None,
            "revenue_ttm_m":        None,
            "ebitda_ttm_m":         None,
            "fcf_ttm_m":            None,
            "dividend_yield":       gm("dividendYieldIndicatedAnnual"),  # ya en %
            "target_price":         None,
            "upside":               None,
            "recommendation":       "",
            "num_analysts":         None,
            "enterprise_value_m":   None,
            # Series históricas anuales — para charts de Valuación sin candles
            "hist_pe":              parse_annual_series("peNormalizedAnnual"),
            "hist_ps":              parse_annual_series("psAnnual"),
            "hist_pb":              parse_annual_series("pbAnnual"),
            "hist_ev_ebitda":       parse_annual_series("evToEbitdaAnnual"),
        }
    except Exception as e:
        logger.warning("[fund] Finnhub metrics %s: %s", ticker, e)
        return {}


# ══════════════════════════════════════════════════════════════════════════════
# Derived metrics (espejo de calcs.py Streamlit)
# ══════════════════════════════════════════════════════════════════════════════

def _compute_derived(df: pd.DataFrame) -> list[dict]:
    if df.empty:
        return []

    df = df.sort_values("year").reset_index(drop=True).copy()

    # Convertir columnas numéricas a float64 (XBRL Finnhub puede entregar None como objeto)
    numeric_cols = [c for c in df.columns if c not in ("end_date",)]
    for col in numeric_cols:
        if col in df.columns and df[col].dtype == object:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    # Total debt = LT + ST (ambos en millones)
    if "debt_lt" in df.columns and "debt_st" in df.columns:
        df["total_debt"] = df["debt_lt"].fillna(0) + df["debt_st"].fillna(0)
    elif "debt_lt" in df.columns:
        df["total_debt"] = df["debt_lt"]
    else:
        df["total_debt"] = np.nan

    # FCF = CFO - capex  (capex viene positivo)
    if "cfo" in df.columns and "capex" in df.columns:
        df["fcf"] = df["cfo"].fillna(0) - df["capex"].abs().fillna(0)
    elif "cfo" in df.columns:
        df["fcf"] = df["cfo"]
    else:
        df["fcf"] = np.nan

    # Net cash = cash - total_debt (positivo = net cash; negativo = net debt)
    if "cash" in df.columns and "total_debt" in df.columns:
        df["net_cash"] = df["cash"].fillna(0) - df["total_debt"].fillna(0)
    else:
        df["net_cash"] = np.nan

    # EBITDA estimado = Operating Income + D&A
    if "operating_income" in df.columns and "da" in df.columns:
        df["ebitda_est"] = df["operating_income"].fillna(0) + df["da"].fillna(0)
    elif "operating_income" in df.columns:
        df["ebitda_est"] = df["operating_income"]
    else:
        df["ebitda_est"] = np.nan

    # Márgenes (%)
    if "revenue" in df.columns:
        rev = df["revenue"].replace(0, np.nan)
        for col, out in [
            ("gross_profit",     "gross_margin"),
            ("operating_income", "ebit_margin"),
            ("ebitda_est",       "ebitda_margin"),
            ("net_income",       "net_margin"),
            ("fcf",              "fcf_margin"),
        ]:
            if col in df.columns:
                df[out] = (df[col] / rev * 100).round(2)

    # YoY growth (%) — solo para años estrictamente consecutivos (gap=1)
    years_list = df["year"].tolist() if "year" in df.columns else []
    for col, out in [
        ("revenue",    "revenue_yoy"),
        ("net_income", "net_income_yoy"),
        ("fcf",        "fcf_yoy"),
    ]:
        if col in df.columns:
            yoys = [None] * len(df)
            for i in range(1, len(df)):
                gap = (years_list[i] - years_list[i-1]) if len(years_list) > i else 2
                if gap != 1:
                    continue
                prev = df[col].iloc[i-1]
                curr = df[col].iloc[i]
                if pd.notna(prev) and pd.notna(curr) and prev != 0:
                    yoys[i] = round(float((curr - prev) / abs(prev) * 100), 1)
            df[out] = yoys

    # Deuda / Equity
    if "equity" in df.columns and "total_debt" in df.columns:
        with np.errstate(divide="ignore", invalid="ignore"):
            df["de_ratio"] = np.where(
                df["equity"].notna() & (df["equity"] != 0),
                (df["total_debt"] / df["equity"]).round(2),
                np.nan,
            )

    # Rev CAGR 3Y (scalar, solo en última fila)
    rev_cagr: Optional[float] = None
    if "revenue" in df.columns and len(df) >= 2:
        recent = df["revenue"].dropna()
        if len(recent) >= 2:
            n = min(len(recent) - 1, 3)
            try:
                first, last = float(recent.iloc[0]), float(recent.iloc[-1])
                if first > 0 and last > 0:
                    cagr = (last / first) ** (1.0 / n) - 1.0
                    if np.isfinite(cagr):
                        rev_cagr = round(cagr * 100, 1)
            except Exception:
                pass

    # Convertir a list[dict], NaN → None
    records = []
    for rec in df.to_dict(orient="records"):
        clean: dict = {}
        for k, v in rec.items():
            if isinstance(v, float) and (v != v or abs(v) == float("inf")):
                clean[k] = None
            else:
                clean[k] = v
        records.append(clean)

    if records:
        records[-1]["rev_cagr_3y"] = rev_cagr

    return records


# ══════════════════════════════════════════════════════════════════════════════
# Finnhub HTTP client (para profile y quote en tiempo real)
# ══════════════════════════════════════════════════════════════════════════════

def _finnhub_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        base_url=BASE_URL,
        timeout=12,
        headers={"X-Finnhub-Token": settings.finnhub_token},
        transport=httpx.AsyncHTTPTransport(retries=1),
    )


async def _fh_get(path: str, **params) -> dict:
    async with _finnhub_client() as c:
        r = await c.get(path, params={k: v for k, v in params.items() if v is not None})
        r.raise_for_status()
        return r.json()


# ══════════════════════════════════════════════════════════════════════════════
# Config
# ══════════════════════════════════════════════════════════════════════════════

def get_config() -> dict:
    return {"tickers": CURATED_TICKERS, "info": TICKER_INFO, "config": TICKER_CONFIG}


def get_symbols() -> list[dict]:
    """Retorna el archivo liviano de símbolos USA para el buscador.
    Generado por scripts/update_finnhub_us_symbols.py.
    Si el archivo no existe, retorna la lista curada como fallback."""
    if SYMBOLS_PATH.exists():
        try:
            return json.loads(SYMBOLS_PATH.read_text(encoding="utf-8"))
        except Exception as e:
            logger.warning("[fund] get_symbols: error leyendo archivo: %s", e)
    # Fallback: retornar tickers curados en el mismo formato
    return [
        {"symbol": tk, "name": info.get("name", tk).upper(), "type": "Common Stock", "mic": ""}
        for tk, info in TICKER_INFO.items()
    ]


# ══════════════════════════════════════════════════════════════════════════════
# Profile (Finnhub primario + yfinance enriquecimiento)
# ══════════════════════════════════════════════════════════════════════════════

async def get_profile(ticker: str) -> dict:
    tkr = ticker.upper()

    # Finnhub profile (logo, exchange, market cap en tiempo real)
    fh_data: dict = {}
    if settings.finnhub_token:
        try:
            fh_data = await _fh_get("/stock/profile2", symbol=tkr)
        except Exception as e:
            logger.warning("[fund] Finnhub profile %s: %s", tkr, e)

    # yfinance profile como fuente complementaria
    yf_data: dict = {}
    try:
        yf_data = await asyncio.get_event_loop().run_in_executor(
            _yf_pool, _profile_yfinance_sync, tkr
        )
    except Exception as e:
        logger.warning("[fund] yfinance profile %s: %s", tkr, e)

    curated_info = TICKER_INFO.get(tkr, {})
    curated_cfg  = TICKER_CONFIG.get(tkr, {})

    # Finnhub employeeTotal puede venir como string — normalizar a int
    fh_employees = fh_data.get("employeeTotal")
    if fh_employees is not None:
        try:
            fh_employees = int(fh_employees)
        except (ValueError, TypeError):
            fh_employees = None

    # yfinance sector es más amplio ("Technology") que finnhubIndustry ("Semiconductors")
    # industry: yfinance primero; fallback a Finnhub gind/finnhubIndustry si yfinance falla
    return {
        "ticker":       tkr,
        "name":         fh_data.get("name") or yf_data.get("name") or curated_info.get("name", tkr),
        "sector":       yf_data.get("sector") or fh_data.get("finnhubIndustry") or curated_info.get("sector", ""),
        "industry":     yf_data.get("industry") or fh_data.get("gind") or fh_data.get("finnhubIndustry") or "",
        "exchange":     fh_data.get("exchange") or yf_data.get("exchange", ""),
        "market_cap":   fh_data.get("marketCapitalization") or yf_data.get("market_cap"),
        "shares":       fh_data.get("shareOutstanding") or yf_data.get("shares"),
        "logo":         fh_data.get("logo", "") or yf_data.get("logo", ""),
        "website":      fh_data.get("weburl", "") or yf_data.get("website", ""),
        "country":      fh_data.get("country", "US") or yf_data.get("country", "US"),
        "currency":     fh_data.get("currency", "USD") or yf_data.get("currency", "USD"),
        "ipo_date":     fh_data.get("ipo", "") or yf_data.get("ipo_date", ""),
        "employees":    yf_data.get("employees") or fh_employees,
        "description":  curated_cfg.get("description") or yf_data.get("description", ""),
        "dividend_yield": yf_data.get("dividend_yield"),
    }


# ══════════════════════════════════════════════════════════════════════════════
# Quote (Finnhub primario + yfinance fallback)
# ══════════════════════════════════════════════════════════════════════════════

async def get_quote(ticker: str) -> dict:
    tkr = ticker.upper()
    if settings.finnhub_token:
        try:
            data = await _fh_get("/quote", symbol=tkr)
            price = _nan_to_none(data.get("c"))
            if price and price > 0:
                prev    = _nan_to_none(data.get("pc")) or 0
                change  = _nan_to_none(data.get("d")) or (price - prev)
                pct     = _nan_to_none(data.get("dp")) or ((change / prev * 100) if prev else 0)
                return {
                    "price":      price,
                    "change":     round(change, 2),
                    "pct_change": round(pct, 2),
                    "high":       _nan_to_none(data.get("h")),
                    "low":        _nan_to_none(data.get("l")),
                    "prev_close": _nan_to_none(data.get("pc")),
                }
        except Exception as e:
            logger.warning("[fund] Finnhub quote %s: %s", tkr, e)

    # yfinance fallback
    try:
        import yfinance as yf
        info = await asyncio.get_event_loop().run_in_executor(
            _yf_pool, lambda: yf.Ticker(tkr).fast_info
        )
        price = _nan_to_none(getattr(info, "last_price", None))
        prev  = _nan_to_none(getattr(info, "previous_close", None)) or 0
        if price:
            change = round(price - prev, 2) if prev else 0
            pct    = round(change / prev * 100, 2) if prev else 0
            return {"price": price, "change": change, "pct_change": pct,
                    "prev_close": prev}
    except Exception as e:
        logger.warning("[fund] yfinance quote %s: %s", tkr, e)

    return {}


# ══════════════════════════════════════════════════════════════════════════════
# Metrics (Finnhub primario + yfinance complemento)
# ══════════════════════════════════════════════════════════════════════════════

async def get_metrics(ticker: str) -> dict:
    """
    Métricas fundamentales: Finnhub como fuente primaria (evita rate-limits de Yahoo),
    yfinance como complemento para campos no disponibles en Finnhub
    (pe_forward, ebitda_ttm_m, enterprise_value_m, fcf_ttm_m, target_price, etc.).
    """
    tkr = ticker.upper()

    # Finnhub primario
    fh_metrics: dict = {}
    if settings.finnhub_token:
        try:
            fh_metrics = await _metrics_finnhub_async(tkr)
        except Exception as e:
            logger.warning("[fund] Finnhub metrics %s: %s", tkr, e)

    # yfinance complemento
    yf_metrics: dict = {}
    try:
        yf_metrics = await asyncio.get_event_loop().run_in_executor(
            _yf_pool, _metrics_yfinance_sync, tkr
        )
    except Exception as e:
        logger.warning("[fund] yfinance metrics %s: %s", tkr, e)

    if not yf_metrics and not fh_metrics:
        return {}

    # Finnhub sobrescribe los ratios clave donde es más fiable
    _FH_PRIORITY = {
        "pe_ttm", "ps_ttm", "pb_annual", "ev_ebitda_ttm", "ev_sales_ttm",
        "beta", "week52_high", "week52_low", "eps_ttm",
        "roe_ttm", "roa_ttm", "gross_margin_ttm", "net_margin_ttm",
        "operating_margin_ttm", "dividend_yield",
    }
    result = {**yf_metrics}
    for key in _FH_PRIORITY:
        fh_val = fh_metrics.get(key)
        if fh_val is not None:
            result[key] = fh_val

    # Series históricas anuales de Finnhub — no disponibles en yfinance
    for hist_key in ("hist_pe", "hist_ps", "hist_pb", "hist_ev_ebitda"):
        if fh_metrics.get(hist_key):
            result[hist_key] = fh_metrics[hist_key]

    return result


# ══════════════════════════════════════════════════════════════════════════════
# Financials (yfinance primario — evita complejidad XBRL de Finnhub)
# ══════════════════════════════════════════════════════════════════════════════

async def get_financials(ticker: str) -> dict:
    tkr = ticker.upper()

    # 1. JSON estático (más rápido — pre-generado con build_fundamental_data.py)
    static = _static_load(tkr)
    if static and static.get("financials"):
        logger.info("[fund] static cache hit: %s financials", tkr)
        return {"ticker": tkr, "data": static["financials"]}

    # 2. API en vivo: Finnhub primario (5 años), yfinance fallback (4 años)
    records = await _fetch_financials_live(tkr)
    if records:
        return {"ticker": tkr, "data": records}

    logger.warning("[fund] financials %s: no data from any source", tkr)
    return {"ticker": tkr, "data": []}


# ══════════════════════════════════════════════════════════════════════════════
# Candles (yfinance primario — confiable, 5 años)
# ══════════════════════════════════════════════════════════════════════════════

async def get_candles(ticker: str, resolution: str = "W", from_ts: int = None, to_ts: int = None) -> dict:
    tkr = ticker.upper()

    # 1. JSON estático
    static = _static_load(tkr)
    if static and static.get("candles", {}).get("status") == "ok":
        logger.info("[fund] static cache hit: %s candles", tkr)
        return static["candles"]

    # 2. yfinance (primario para histórico — no requiere API key)
    try:
        candles = await asyncio.get_event_loop().run_in_executor(
            _yf_pool, _candles_yfinance_sync, tkr
        )
        if candles.get("status") == "ok" and candles.get("dates"):
            return candles
    except Exception as e:
        logger.warning("[fund] yfinance candles %s: %s", tkr, e)

    # 3. Finnhub fallback
    if settings.finnhub_token:
        try:
            now     = int(time.time())
            from_ts = from_ts or (now - 5 * 365 * 86400)
            params  = dict(symbol=tkr, resolution=resolution, to=to_ts or now)
            params["from"] = from_ts  # 'from' es keyword Python → dict directo
            async with _finnhub_client() as c:
                r = await c.get("/stock/candle", params=params)  # token ya en X-Finnhub-Token header
                r.raise_for_status()
                data = r.json()
            if data.get("s") == "ok":
                return {
                    "status":  "ok",
                    "dates":   [pd.Timestamp(ts, unit="s").strftime("%Y-%m-%d") for ts in data.get("t", [])],
                    "closes":  data.get("c", []),
                }
        except Exception as e:
            logger.warning("[fund] Finnhub candles %s: %s", tkr, e)

    return {"status": "no_data", "dates": [], "closes": []}


# ══════════════════════════════════════════════════════════════════════════════
# Full profile (batch para la UI: profile + quote + metrics + description + tags)
# ══════════════════════════════════════════════════════════════════════════════

async def get_full_profile(ticker: str) -> dict:
    tkr = ticker.upper()

    # JSON estático
    static = _static_load(tkr)
    if static and static.get("profile"):
        logger.info("[fund] static cache hit: %s profile", tkr)
        return {
            "profile":     static["profile"],
            "quote":       static.get("quote", {}),
            "metrics":     static.get("metrics", {}),
            "description": static.get("description", ""),
            "tags":        static.get("tags", []),
        }

    profile, quote, metrics = await asyncio.gather(
        get_profile(tkr),
        get_quote(tkr),
        get_metrics(tkr),
    )

    cfg = TICKER_CONFIG.get(tkr, {})
    return {
        "profile":     profile,
        "quote":       quote,
        "metrics":     metrics,
        "description": cfg.get("description") or profile.get("description", ""),
        "tags":        cfg.get("tags", []),
    }


# ══════════════════════════════════════════════════════════════════════════════
# Compare summary — lee todos los JSONs estáticos para la tab Comparar
# ══════════════════════════════════════════════════════════════════════════════

def get_compare_summary() -> list[dict]:
    """
    Devuelve resumen de métricas clave para todos los tickers curados.
    Lee desde los JSONs estáticos pre-generados (una sola llamada desde el frontend).
    Si el JSON no existe o está vencido, intenta igual con force=True.
    """
    summaries = []
    for tkr in CURATED_TICKERS:
        # Intentar JSON fresco primero, luego forzar lectura aunque sea stale
        data = _static_load(tkr)
        if data is None:
            # Intento forzado (JSON existe pero es >24h)
            path = _static_path(tkr)
            if path.exists():
                try:
                    with open(path, encoding="utf-8") as f:
                        data = json.load(f)
                except Exception:
                    pass

        if not data:
            info = TICKER_INFO.get(tkr, {})
            summaries.append({"ticker": tkr, "name": info.get("name", tkr), "error": "no_data"})
            continue

        financials = data.get("financials", [])
        last       = financials[-1] if financials else {}
        metrics    = data.get("metrics", {}) or {}
        profile    = data.get("profile", {}) or {}
        quote      = data.get("quote", {}) or {}

        summaries.append({
            "ticker":       tkr,
            "name":         profile.get("name", ""),
            "sector":       profile.get("sector", ""),
            "industry":     profile.get("industry", ""),
            "logo":         profile.get("logo", ""),
            "price":        quote.get("price"),
            "pct_change":   quote.get("pct_change"),
            "market_cap":   profile.get("market_cap"),    # millones
            "enterprise_value_m": metrics.get("enterprise_value_m"),  # millones
            "fiscal_year":  last.get("year"),
            "revenue":      last.get("revenue"),           # millones
            "revenue_yoy":  last.get("revenue_yoy"),
            "gross_profit": last.get("gross_profit"),
            "net_income":   last.get("net_income"),
            "fcf":          last.get("fcf"),
            "gross_margin": last.get("gross_margin") or metrics.get("gross_margin_ttm"),
            "ebitda_margin":last.get("ebitda_margin") or metrics.get("ebitda_margin_ttm"),
            "net_margin":   last.get("net_margin") or metrics.get("net_margin_ttm"),
            "fcf_margin":   last.get("fcf_margin") or metrics.get("fcf_margin_ttm"),
            "roe":          metrics.get("roe_ttm"),
            "roa":          metrics.get("roa_ttm"),
            "roic":         metrics.get("roic_ttm"),
            "pe_ttm":       metrics.get("pe_ttm"),
            "pe_forward":   metrics.get("pe_forward"),
            "ps_ttm":       metrics.get("ps_ttm"),
            "pb_annual":    metrics.get("pb_annual"),
            "ev_ebitda":    metrics.get("ev_ebitda_ttm"),
            "ev_sales":     metrics.get("ev_sales_ttm"),
            "beta":         metrics.get("beta"),
            "week52_high":  metrics.get("week52_high"),
            "week52_low":   metrics.get("week52_low"),
            "rev_cagr_3y":  last.get("rev_cagr_3y"),
            "net_cash":     last.get("net_cash"),
            "total_debt":   last.get("total_debt"),
        })

    return summaries


# ══════════════════════════════════════════════════════════════════════════════
# Build / refresh ticker JSON (llamado desde build_fundamental_data.py)
# ══════════════════════════════════════════════════════════════════════════════

async def build_ticker_json(ticker: str) -> dict:
    """
    Genera y guarda el JSON completo de un ticker.
    Siempre fetchea datos frescos desde la API — no usa cache estático.
    """
    tkr = ticker.upper()
    logger.info("[fund] building JSON for %s ...", tkr)

    # Fetch en paralelo — profile/quote/metrics van a Finnhub+yfinance directamente,
    # financials va a Finnhub (5 años) con fallback a yfinance (4 años),
    # candles va a yfinance (5 años).
    profile, quote, metrics, fin_data, candles = await asyncio.gather(
        get_profile(tkr),
        get_quote(tkr),
        get_metrics(tkr),
        _fetch_financials_live(tkr),
        asyncio.get_event_loop().run_in_executor(_yf_pool, _candles_yfinance_sync, tkr),
    )

    cfg = TICKER_CONFIG.get(tkr, {})
    payload = {
        "ticker":      tkr,
        "profile":     profile,
        "quote":       quote,
        "metrics":     metrics,
        "description": cfg.get("description") or profile.get("description", ""),
        "tags":        cfg.get("tags", []),
        "financials":  fin_data,
        "candles":     candles,
    }

    _static_save(tkr, payload)
    return payload
