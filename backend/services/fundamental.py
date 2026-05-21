"""Fundamental analysis — Finnhub API client (async).

Datos: Finnhub /stock/profile2, /stock/quote, /stock/metric, /stock/financials-reported, /stock/candle.
Métricas derivadas calculadas aquí: FCF, net_cash, EBITDA_est, márgenes, YoY, CAGR, D/E.
Espejo de la lógica en fundamental/client.py + fundamental/calcs.py del proyecto Streamlit.
"""
from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import Any, Optional

import httpx
import numpy as np
import pandas as pd

from config import settings

logger = logging.getLogger(__name__)

BASE_URL     = "https://finnhub.io/api/v1"
PARQUET_DIR  = Path(__file__).resolve().parents[1] / "data" / "fundamental"
PARQUET_TTL  = 43200  # 12h en segundos

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

# Descripción curada y tags por ticker (espejo de fundamental/config.py Streamlit)
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

# ── XBRL concept mappings (orden = prioridad) ─────────────────────────────────

_XBRL_PREFIXES = ("us-gaap_", "crwd_", "dei_", "srt_", "ifrs-full_", "us-gaap:", "crwd:")

_XBRL_MAP: dict[str, list[str]] = {
    "revenue": [
        "RevenueFromContractWithCustomerExcludingAssessedTax",
        "RevenueFromContractWithCustomerIncludingAssessedTax",
        "Revenues", "Revenue", "SalesRevenueNet",
    ],
    "gross_profit": ["GrossProfit"],
    "operating_income": ["OperatingIncomeLoss", "IncomeLossFromContinuingOperationsBeforeIncomeTaxes"],
    "net_income": [
        "NetIncomeLoss", "NetIncome", "ProfitLoss",
        "NetIncomeLossAvailableToCommonStockholdersBasic",
    ],
    "da": [
        "DepreciationDepletionAndAmortization", "DepreciationAndAmortization", "Depreciation",
        "DepreciationAndAmortizationExcludingIntangibleAssetsAndDeferredContractAcquisitionCosts",
    ],
    "eps_diluted": ["EarningsPerShareDiluted", "EarningsPerShareBasic"],
    "cfo": [
        "NetCashProvidedByUsedInOperatingActivities",
        "NetCashProvidedByOperatingActivities",
    ],
    "capex": [
        "PaymentsToAcquirePropertyPlantAndEquipment",
        "CapitalExpendituresIncurringObligation",
        "PurchaseOfPropertyPlantAndEquipment",
    ],
    "cash": [
        "CashAndCashEquivalentsAtCarryingValue",
        "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents",
        "CashAndCashEquivalents",
    ],
    "debt_lt": ["LongTermDebtNoncurrent", "LongTermDebt", "LongTermNotesPayable"],
    "debt_st": ["DebtCurrent", "ShortTermBorrowings", "NotesPayableCurrent"],
    "equity": [
        "StockholdersEquity",
        "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
    ],
    "total_assets": ["Assets"],
}


# ── XBRL helpers ──────────────────────────────────────────────────────────────

def _strip_prefix(concept: str) -> str:
    for p in _XBRL_PREFIXES:
        if concept.lower().startswith(p.lower()):
            return concept[len(p):]
    if ":" in concept:
        return concept.split(":", 1)[1]
    return concept


def _extract_concepts(items: list) -> dict:
    """Convierte lista [{concept, value}] en dict, indexando con y sin prefijo."""
    d: dict = {}
    for item in (items or []):
        if not isinstance(item, dict):
            continue
        concept = item.get("concept", "")
        value   = item.get("value")
        if value is None:
            continue
        d[concept] = value
        stripped = _strip_prefix(concept)
        if stripped != concept:
            d.setdefault(stripped, value)
    return d


def _pick(d: dict, concepts: list[str]) -> Optional[float]:
    for c in concepts:
        v = d.get(c)
        if v is not None:
            return v
        stripped = _strip_prefix(c)
        if stripped != c:
            v = d.get(stripped)
            if v is not None:
                return v
    return None


# ── Derived metrics ───────────────────────────────────────────────────────────

def _compute_derived(df: pd.DataFrame) -> list[dict]:
    """Agrega métricas derivadas al DataFrame anual (espejo de calcs.py Streamlit)."""
    if df.empty:
        return []

    df = df.sort_values("year").reset_index(drop=True).copy()

    # Total debt = LT + ST
    if "debt_lt" in df.columns and "debt_st" in df.columns:
        df["total_debt"] = df["debt_lt"].fillna(0) + df["debt_st"].fillna(0)
    elif "debt_lt" in df.columns:
        df["total_debt"] = df["debt_lt"]
    else:
        df["total_debt"] = np.nan

    # FCF = CFO - |capex|  (capex viene positivo del XBRL parser)
    if "cfo" in df.columns and "capex" in df.columns:
        df["fcf"] = df["cfo"].fillna(0) - df["capex"].abs().fillna(0)
    else:
        df["fcf"] = np.nan

    # Net cash (positivo = cash neto; negativo = net debt)
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

    # YoY growth (%)
    for col, out in [
        ("revenue",    "revenue_yoy"),
        ("net_income", "net_income_yoy"),
        ("fcf",        "fcf_yoy"),
    ]:
        if col in df.columns:
            df[out] = (df[col].pct_change() * 100).round(1)

    # Deuda / Equity
    if "equity" in df.columns and "total_debt" in df.columns:
        with np.errstate(divide="ignore", invalid="ignore"):
            df["de_ratio"] = np.where(
                df["equity"].notna() & (df["equity"] != 0),
                (df["total_debt"] / df["equity"]).round(2),
                np.nan,
            )

    # Rev CAGR 3Y — scalar aplicado como columna en la última fila
    rev_cagr: Optional[float] = None
    if "revenue" in df.columns and len(df) >= 2:
        recent = df["revenue"].dropna()
        if len(recent) >= 2:
            n = min(len(recent) - 1, 3)
            try:
                cagr = (recent.iloc[-1] / recent.iloc[0]) ** (1.0 / n) - 1.0
                if np.isfinite(cagr):
                    rev_cagr = round(float(cagr) * 100, 1)
            except Exception:
                pass

    # Convertir a lista de dicts; reemplazar NaN con None
    records = []
    for rec in df.to_dict(orient="records"):
        clean = {k: (None if (v is not None and isinstance(v, float) and np.isnan(v)) else v)
                 for k, v in rec.items()}
        records.append(clean)

    if records:
        records[-1]["rev_cagr_3y"] = rev_cagr

    return records


# ── HTTP client ───────────────────────────────────────────────────────────────

def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        base_url=BASE_URL,
        timeout=15,
        headers={"X-Finnhub-Token": settings.finnhub_token},
        transport=httpx.AsyncHTTPTransport(retries=2),
    )


try:
    import pyarrow  # noqa: F401
    _HAS_PARQUET = True
except ImportError:
    _HAS_PARQUET = False


def _parquet_path(ticker: str, kind: str) -> Path:
    PARQUET_DIR.mkdir(parents=True, exist_ok=True)
    return PARQUET_DIR / f"{ticker.upper()}_{kind}.parquet"


def _is_fresh(path: Path) -> bool:
    if not _HAS_PARQUET or not path.exists():
        return False
    return (time.time() - path.stat().st_mtime) < PARQUET_TTL


async def _get(path: str, **params) -> Any:
    async with _client() as c:
        r = await c.get(path, params={k: v for k, v in params.items() if v is not None})
        r.raise_for_status()
        return r.json()


# ── Public API: config ────────────────────────────────────────────────────────

def get_config() -> dict:
    """Devuelve la configuración curada (descripciones, tags) de todos los tickers."""
    return {
        "tickers": CURATED_TICKERS,
        "info":    TICKER_INFO,
        "config":  TICKER_CONFIG,
    }


# ── Profile ───────────────────────────────────────────────────────────────────

async def get_profile(ticker: str) -> dict:
    try:
        data = await _get("/stock/profile2", symbol=ticker.upper())
        return {
            "ticker":     ticker.upper(),
            "name":       data.get("name", TICKER_INFO.get(ticker.upper(), {}).get("name", ticker)),
            "sector":     data.get("finnhubIndustry", TICKER_INFO.get(ticker.upper(), {}).get("sector", "")),
            "exchange":   data.get("exchange", ""),
            "market_cap": data.get("marketCapitalization"),   # en millones USD
            "shares":     data.get("shareOutstanding"),       # en millones
            "logo":       data.get("logo", ""),
            "website":    data.get("weburl", ""),
            "country":    data.get("country", "US"),
            "currency":   data.get("currency", "USD"),
            "ipo_date":   data.get("ipo", ""),
            "employees":  data.get("employeeTotal"),
        }
    except Exception as e:
        logger.warning("profile %s failed: %s", ticker, e)
        info = TICKER_INFO.get(ticker.upper(), {})
        return {"ticker": ticker.upper(), "name": info.get("name", ticker), "sector": info.get("sector", "")}


# ── Quote ─────────────────────────────────────────────────────────────────────

async def get_quote(ticker: str) -> dict:
    try:
        data = await _get("/quote", symbol=ticker.upper())
        current = data.get("c") or 0
        prev    = data.get("pc") or 0
        change  = data.get("d") or (current - prev)
        pct     = data.get("dp") or ((change / prev * 100) if prev else 0)
        return {
            "price":      current,
            "change":     round(change, 2),
            "pct_change": round(pct, 2),
            "high":       data.get("h"),
            "low":        data.get("l"),
            "open":       data.get("o"),
            "prev_close": prev,
        }
    except Exception as e:
        logger.warning("quote %s failed: %s", ticker, e)
        return {}


# ── Metrics ───────────────────────────────────────────────────────────────────

async def get_metrics(ticker: str) -> dict:
    try:
        data = await _get("/stock/metric", symbol=ticker.upper(), metric="all")
        m = data.get("metric", {}) or {}

        def _v(k):
            v = m.get(k)
            try:
                return round(float(v), 4) if v is not None else None
            except Exception:
                return None

        return {
            "pe_ttm":           _v("peTTM"),
            "pe_forward":       _v("peAnnual"),
            "ps_ttm":           _v("psTTM"),
            "pb_annual":        _v("pbAnnual"),
            "ev_ebitda_ttm":    _v("evEbitdaTTM"),
            "roe_ttm":          _v("roeTTM"),
            "roe_annual":       _v("roeAnnual"),
            "roa_ttm":          _v("roaTTM"),
            "roic_ttm":         _v("roicTTM"),
            "gross_margin_ttm": _v("grossMarginTTM"),
            "ebitda_margin_ttm":_v("ebitdaMarginTTM"),
            "net_margin_ttm":   _v("netProfitMarginTTM"),
            "fcf_margin_ttm":   _v("fcfMarginTTM"),
            "beta":             _v("beta"),
            "week52_high":      _v("52WeekHigh"),
            "week52_low":       _v("52WeekLow"),
            "eps_ttm":          _v("epsTTM"),
            "revenue_ttm_m":    _v("revenueTTM"),   # en millones
            "ebitda_ttm_m":     _v("ebitdaTTM"),    # en millones
            "fcf_ttm_m":        _v("freeCashFlowTTM"),  # en millones
            "dividend_yield":   _v("dividendYieldIndicatedAnnual"),
        }
    except Exception as e:
        logger.warning("metrics %s failed: %s", ticker, e)
        return {}


# ── Financials reported ───────────────────────────────────────────────────────

def _parse_annual_financials(raw: dict) -> pd.DataFrame:
    """
    Parsea /stock/financials-reported de Finnhub.
    Maneja el formato XBRL: ic/bs/cf son LISTAS de {concept, value}, NO dicts.
    Espejo de _parse_financials_reported() en fundamental/client.py Streamlit.
    """
    records = raw.get("data") or []
    if not records:
        return pd.DataFrame()

    rows = []
    for report in records:
        year = report.get("year")
        if not year:
            end_date_raw = report.get("endDate", "") or ""
            year_str = end_date_raw[:4]
            year = int(year_str) if year_str.isdigit() else None
        if not year or year < 2010:
            continue

        end_date = report.get("endDate", "") or f"{year}-12-31"

        rep = report.get("report", {}) or {}
        ic  = _extract_concepts(rep.get("ic", []))
        bs  = _extract_concepts(rep.get("bs", []))
        cf  = _extract_concepts(rep.get("cf", []))

        # Revenue (IC primero)
        revenue = _pick(ic, _XBRL_MAP["revenue"])

        # Net Income: IC primero, luego CF (CRWD y otros reportan como ProfitLoss en CF)
        net_income = _pick(ic, _XBRL_MAP["net_income"]) or _pick(cf, _XBRL_MAP["net_income"])

        # D&A: IC, luego CF, variantes custom
        da = _pick(ic, _XBRL_MAP["da"]) or _pick(cf, _XBRL_MAP["da"])

        # CFO: CF
        cfo = _pick(cf, _XBRL_MAP["cfo"])

        # Capex: CF (siempre positivo en XBRL, la resta se hace en derived)
        capex_raw = _pick(cf, _XBRL_MAP["capex"])
        capex = abs(capex_raw) if capex_raw is not None else None

        row: dict = {
            "year":             year,
            "end_date":         end_date,
            "revenue":          revenue,
            "gross_profit":     _pick(ic, _XBRL_MAP["gross_profit"]),
            "operating_income": _pick(ic, _XBRL_MAP["operating_income"]),
            "net_income":       net_income,
            "da":               da,
            "eps_diluted":      _pick(ic, _XBRL_MAP["eps_diluted"]),
            "cfo":              cfo,
            "capex":            capex,
            "cash":             _pick(bs, _XBRL_MAP["cash"]),
            "debt_lt":          _pick(bs, _XBRL_MAP["debt_lt"]),
            "debt_st":          _pick(bs, _XBRL_MAP["debt_st"]),
            "equity":           _pick(bs, _XBRL_MAP["equity"]),
            "total_assets":     _pick(bs, _XBRL_MAP["total_assets"]),
        }

        # Filtrar filas sin datos útiles
        money_keys = ("revenue", "net_income", "cfo", "cash", "total_assets")
        if not any(row.get(k) is not None for k in money_keys):
            continue

        rows.append(row)

    if not rows:
        return pd.DataFrame()

    df = pd.DataFrame(rows)
    df = df.sort_values("end_date", ascending=False).drop_duplicates("year")
    df = df.sort_values("year").reset_index(drop=True)

    # Escalar a millones de USD
    money_cols = [
        "revenue", "gross_profit", "operating_income", "net_income",
        "da", "cfo", "capex", "cash", "debt_lt", "debt_st",
        "equity", "total_assets",
    ]
    for col in money_cols:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce") / 1_000_000.0

    # EPS permanece en USD por acción (no escalar)
    if "eps_diluted" in df.columns:
        df["eps_diluted"] = pd.to_numeric(df["eps_diluted"], errors="coerce")

    # Solo años con revenue real (> $1M en millones = > 0.001)
    if "revenue" in df.columns:
        df = df[df["revenue"].notna() & (df["revenue"].abs() > 0.001)]

    # Máximo 6 años recientes
    df = df.sort_values("year").tail(6).reset_index(drop=True)

    return df


async def get_financials(ticker: str) -> dict:
    """Estados financieros anuales + métricas derivadas. Usa disco como cache."""
    cache_path = _parquet_path(ticker, "financials_annual")
    if _HAS_PARQUET and _is_fresh(cache_path):
        try:
            df = pd.read_parquet(cache_path)
            records = _compute_derived(df)
            return {"ticker": ticker.upper(), "data": records}
        except Exception:
            pass

    try:
        raw = await _get("/stock/financials-reported", symbol=ticker.upper(), freq="annual")
        df  = _parse_annual_financials(raw)
        if not df.empty and _HAS_PARQUET:
            try:
                df.to_parquet(cache_path, index=False)
            except Exception:
                pass
        records = _compute_derived(df)
        return {"ticker": ticker.upper(), "data": records}
    except Exception as e:
        logger.warning("financials %s failed: %s", ticker, e)
        return {"ticker": ticker.upper(), "data": []}


# ── Candles (precio histórico) ────────────────────────────────────────────────

async def get_candles(ticker: str, resolution: str = "W", from_ts: int = None, to_ts: int = None) -> dict:
    try:
        now = int(time.time())
        data = await _get(
            "/stock/candle",
            symbol=ticker.upper(),
            resolution=resolution,
            **{"from": from_ts or (now - 5 * 365 * 86400)},
            to=to_ts or now,
        )
        if data.get("s") != "ok":
            return {"status": "no_data", "dates": [], "closes": []}
        return {
            "status":  "ok",
            "dates":   [pd.Timestamp(ts, unit="s").strftime("%Y-%m-%d") for ts in data.get("t", [])],
            "opens":   data.get("o", []),
            "highs":   data.get("h", []),
            "lows":    data.get("l", []),
            "closes":  data.get("c", []),
            "volumes": data.get("v", []),
        }
    except Exception as e:
        logger.warning("candles %s failed: %s", ticker, e)
        return {"status": "error", "dates": [], "closes": []}


# ── Full profile (batch para la UI) ──────────────────────────────────────────

async def get_full_profile(ticker: str) -> dict:
    """Combina profile + quote + metrics para el header de la empresa."""
    import asyncio
    profile, quote, metrics = await asyncio.gather(
        get_profile(ticker),
        get_quote(ticker),
        get_metrics(ticker),
    )
    cfg = TICKER_CONFIG.get(ticker.upper(), {})
    return {
        "profile": profile,
        "quote":   quote,
        "metrics": metrics,
        "description": cfg.get("description", ""),
        "tags":        cfg.get("tags", []),
    }
