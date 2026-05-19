"""Argentine market hours — schedule, holidays, refresh state tracking."""
from __future__ import annotations

import logging
from datetime import datetime, date, time, timedelta
from typing import Optional
from zoneinfo import ZoneInfo

import holidays as hol_lib

logger = logging.getLogger(__name__)

ART = ZoneInfo("America/Argentina/Buenos_Aires")

MARKET_OPEN_TIME  = time(10, 35)   # primer refresh del día
MARKET_CLOSE_TIME = time(18,  0)   # último refresh (inclusive)
REFRESH_INTERVAL  = timedelta(minutes=10)

# Estado global — actualizado por el scheduler en main.py
_last_refresh: Optional[datetime] = None


# ── Días hábiles argentinos ───────────────────────────────────────────────

def _ar_holidays(year: int) -> set[date]:
    return set(hol_lib.Argentina(years=year).keys())


def is_trading_day(d: date) -> bool:
    """True si d es un día hábil bursátil argentino (no feriado, no fin de semana)."""
    if d.weekday() >= 5:          # sábado=5, domingo=6
        return False
    return d not in _ar_holidays(d.year)


def is_market_open() -> bool:
    """True si el horario actual ART está dentro del rango de actualizaciones."""
    now = datetime.now(ART)
    if not is_trading_day(now.date()):
        return False
    t = now.time().replace(second=0, microsecond=0)
    return MARKET_OPEN_TIME <= t <= MARKET_CLOSE_TIME


# ── Schedule de refreshes ─────────────────────────────────────────────────

def _slots_for_day(d: date) -> list[datetime]:
    """Todos los horarios de refresh de un día hábil: 10:35, 10:45, …, 18:00."""
    slots: list[datetime] = []
    cursor = datetime(d.year, d.month, d.day,
                      MARKET_OPEN_TIME.hour, MARKET_OPEN_TIME.minute, tzinfo=ART)
    end    = datetime(d.year, d.month, d.day,
                      MARKET_CLOSE_TIME.hour, MARKET_CLOSE_TIME.minute, tzinfo=ART)
    while cursor <= end:
        slots.append(cursor)
        cursor += REFRESH_INTERVAL
    return slots


def next_refresh_after(dt: Optional[datetime] = None) -> Optional[datetime]:
    """Próximo refresh programado estrictamente después de dt (default: ahora ART)."""
    if dt is None:
        dt = datetime.now(ART)

    # Slots restantes hoy
    if is_trading_day(dt.date()):
        future = [s for s in _slots_for_day(dt.date()) if s > dt]
        if future:
            return future[0]

    # Próximo día hábil (máximo 14 días calendario)
    d = dt.date() + timedelta(days=1)
    for _ in range(14):
        if is_trading_day(d):
            return datetime(d.year, d.month, d.day,
                            MARKET_OPEN_TIME.hour, MARKET_OPEN_TIME.minute, tzinfo=ART)
        d += timedelta(days=1)

    return None


# ── Accesores de estado ───────────────────────────────────────────────────

def get_last_refresh() -> Optional[datetime]:
    return _last_refresh


def set_last_refresh(dt: datetime) -> None:
    global _last_refresh
    _last_refresh = dt


def get_status() -> dict:
    now  = datetime.now(ART)
    last = _last_refresh
    nxt  = next_refresh_after(now)
    return {
        "market_open":    is_market_open(),
        "is_trading_day": is_trading_day(now.date()),
        "last_refresh":   last.isoformat() if last else None,
        "next_refresh":   nxt.isoformat()  if nxt  else None,
        "server_time":    now.strftime("%Y-%m-%dT%H:%M:%S"),
    }
