"""Fundamental analysis service.

Fuentes:
- yfinance: financial statements (income, balance, cashflow) y price history — primario
- Finnhub: profile, real-time quote, market metrics — suplementario
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


# ── yfinance: price history (velas semanales) ─────────────────────────────────

def _candles_yfinance_sync(ticker: str, years: int = 5) -> dict:
    """Histórico de precios semanal via yfinance. Primary source para velas."""
    try:
        import yfinance as yf
        df = yf.download(ticker, period=f"{years}y", interval="1wk",
                         auto_adjust=True, progress=False, multi_level_index=False)
        if df is None or df.empty:
            return {"status": "no_data", "dates": [], "closes": []}

        df = df.reset_index()
        # Normalizar columnas
        df.columns = [str(c).lower() for c in df.columns]
        date_col  = next((c for c in df.columns if "date" in c), None)
        close_col = next((c for c in df.columns if "close" in c), None)
        if not date_col or not close_col:
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
        dy_raw = info.get("dividendYield") or 0
        # yfinance devuelve dividendYield como fracción (0.037 = 3.7%)
        dy_pct = round(dy_raw * 100, 2) if 0 < dy_raw < 1 else (round(dy_raw, 2) if dy_raw > 0 else None)

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
            "dividend_yield":      pct(info.get("dividendYield")),
            "target_price":        target_price,
            "upside":              upside,
            "recommendation":      info.get("recommendationKey", ""),
            "num_analysts":        info.get("numberOfAnalystOpinions"),
            "enterprise_value_m":  val(info.get("enterpriseValue"), 1e6),  # millones
        }
    except Exception as e:
        logger.warning("[fund] yfinance metrics %s failed: %s", ticker, e)
        return {}


# ══════════════════════════════════════════════════════════════════════════════
# Derived metrics (espejo de calcs.py Streamlit)
# ══════════════════════════════════════════════════════════════════════════════

def _compute_derived(df: pd.DataFrame) -> list[dict]:
    if df.empty:
        return []

    df = df.sort_values("year").reset_index(drop=True).copy()

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

    # Prioridad: Finnhub para datos en tiempo real, yfinance para descripción/empleados
    return {
        "ticker":       tkr,
        "name":         fh_data.get("name") or yf_data.get("name") or curated_info.get("name", tkr),
        "sector":       fh_data.get("finnhubIndustry") or yf_data.get("sector") or curated_info.get("sector", ""),
        "industry":     yf_data.get("industry", ""),
        "exchange":     fh_data.get("exchange") or yf_data.get("exchange", ""),
        "market_cap":   fh_data.get("marketCapitalization") or yf_data.get("market_cap"),
        "shares":       fh_data.get("shareOutstanding") or yf_data.get("shares"),
        "logo":         fh_data.get("logo", "") or yf_data.get("logo", ""),
        "website":      fh_data.get("weburl", "") or yf_data.get("website", ""),
        "country":      fh_data.get("country", "US") or yf_data.get("country", "US"),
        "currency":     fh_data.get("currency", "USD") or yf_data.get("currency", "USD"),
        "ipo_date":     fh_data.get("ipo", "") or yf_data.get("ipo_date", ""),
        "employees":    yf_data.get("employees") or fh_data.get("employeeTotal"),
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
# Metrics (yfinance primario — más completo que Finnhub free tier)
# ══════════════════════════════════════════════════════════════════════════════

async def get_metrics(ticker: str) -> dict:
    tkr = ticker.upper()
    try:
        metrics = await asyncio.get_event_loop().run_in_executor(
            _yf_pool, _metrics_yfinance_sync, tkr
        )
        return metrics
    except Exception as e:
        logger.warning("[fund] metrics %s: %s", tkr, e)
        return {}


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

    # 2. yfinance (primario — no requiere API key, fiable para los 13 curados)
    try:
        df = await asyncio.get_event_loop().run_in_executor(
            _yf_pool, _financials_yfinance_sync, tkr
        )
        if not df.empty:
            records = _compute_derived(df)
            logger.info("[fund] yfinance financials %s: %d rows", tkr, len(records))
            return {"ticker": tkr, "data": records}
    except Exception as e:
        logger.warning("[fund] yfinance financials %s failed: %s", tkr, e)

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
                r = await c.get("/stock/candle", params={**params, "token": settings.finnhub_token})
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
# Build / refresh ticker JSON (llamado desde build_fundamental_data.py)
# ══════════════════════════════════════════════════════════════════════════════

async def build_ticker_json(ticker: str) -> dict:
    """Genera y guarda el JSON completo de un ticker."""
    tkr = ticker.upper()
    logger.info("[fund] building JSON for %s ...", tkr)

    profile_full, fin, candles = await asyncio.gather(
        get_full_profile(tkr),
        get_financials(tkr),
        get_candles(tkr),
    )

    payload = {
        "ticker":      tkr,
        "profile":     profile_full.get("profile", {}),
        "quote":       profile_full.get("quote", {}),
        "metrics":     profile_full.get("metrics", {}),
        "description": profile_full.get("description", ""),
        "tags":        profile_full.get("tags", []),
        "financials":  fin.get("data", []),
        "candles":     candles,
    }

    _static_save(tkr, payload)
    return payload
