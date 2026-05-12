"""Market hours utilities and bond classification."""
from __future__ import annotations

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

try:
    import holidays as _holidays_lib
    _AR_HOLIDAYS = _holidays_lib.country_holidays("AR")
except Exception:
    _AR_HOLIDAYS = {}

TZ_AR = ZoneInfo("America/Argentina/Buenos_Aires")
MARKET_OPEN = time(11, 1)
MARKET_CLOSE = time(18, 0)
STEP_MINUTES = 20


def now_ar() -> datetime:
    return datetime.now(TZ_AR)


def _is_holiday(d: date) -> bool:
    return d in _AR_HOLIDAYS


def is_market_open(dt: datetime | None = None) -> bool:
    dt = dt or now_ar()
    if dt.weekday() >= 5 or _is_holiday(dt.date()):
        return False
    open_dt = _at(MARKET_OPEN, dt)
    close_dt = _at(MARKET_CLOSE, dt)
    return open_dt <= dt <= close_dt


def _at(t: time, dt: datetime) -> datetime:
    return datetime(dt.year, dt.month, dt.day, t.hour, t.minute, tzinfo=TZ_AR)


def _prev_trading_day_close(dt: datetime) -> datetime:
    d = dt.date() - timedelta(days=1)
    while True:
        if d.weekday() < 5 and not _is_holiday(d):
            break
        d -= timedelta(days=1)
    return datetime(d.year, d.month, d.day, MARKET_CLOSE.hour, MARKET_CLOSE.minute, tzinfo=TZ_AR)


def market_bucket_dt(dt: datetime | None = None) -> datetime:
    dt = dt or now_ar()
    if dt.weekday() >= 5 or _is_holiday(dt.date()):
        return _prev_trading_day_close(dt)
    open_dt = _at(MARKET_OPEN, dt)
    close_dt = _at(MARKET_CLOSE, dt)
    if dt < open_dt:
        return _prev_trading_day_close(dt)
    if dt >= close_dt:
        return close_dt
    delta_min = int((dt - open_dt).total_seconds() // 60)
    step = (delta_min // STEP_MINUTES) * STEP_MINUTES
    bucket = open_dt + timedelta(minutes=step)
    return min(bucket, close_dt)


def market_bucket(dt: datetime | None = None) -> str:
    return market_bucket_dt(dt).strftime("%Y-%m-%d %H:%M")


# ── Bond classification ───────────────────────────────────────────────────────

_BONAR_PREFIXES = ("AL", "AE", "AN", "AO")
_GLOBAL_PREFIXES = ("GD",)

FAMILY_GLOBALES = "Globales (Ley NY)"
FAMILY_BONARES = "Bonares (Ley AR)"
FAMILY_OTROS = "Otros"


def classify_sovereign(ticker: str) -> str:
    t = str(ticker).strip().upper()
    if t.startswith(_GLOBAL_PREFIXES):
        return FAMILY_GLOBALES
    if t.startswith(_BONAR_PREFIXES):
        return FAMILY_BONARES
    return FAMILY_OTROS


def is_global(ticker: str) -> bool:
    return classify_sovereign(ticker) == FAMILY_GLOBALES


def is_bonar(ticker: str) -> bool:
    return classify_sovereign(ticker) == FAMILY_BONARES
