"""Shared TTL cache — replaces @st.cache_data without Streamlit dependency."""
from __future__ import annotations
import asyncio
import threading
from cachetools import TTLCache
from typing import Any, Callable, TypeVar

_caches: dict[str, TTLCache] = {}
_lock = threading.Lock()

F = TypeVar("F", bound=Callable)


def get_cache(name: str, ttl: int, maxsize: int = 256) -> TTLCache:
    with _lock:
        if name not in _caches:
            _caches[name] = TTLCache(maxsize=maxsize, ttl=ttl)
        return _caches[name]


def cached(name: str, ttl: int, key_fn: Callable | None = None):
    """Decorator that caches the return value with a TTL.

    Usage:
        @cached("my_data", ttl=300)
        def fetch_something():
            ...
    """
    def decorator(fn: F) -> F:
        cache = get_cache(name, ttl)
        lock = threading.Lock()

        def wrapper(*args, **kwargs):
            cache_key = key_fn(*args, **kwargs) if key_fn else (args, tuple(sorted(kwargs.items())))
            with lock:
                if cache_key in cache:
                    return cache[cache_key]
            result = fn(*args, **kwargs)
            with lock:
                cache[cache_key] = result
            return result

        wrapper.__wrapped__ = fn  # type: ignore
        return wrapper  # type: ignore

    return decorator


def invalidate(name: str) -> None:
    with _lock:
        if name in _caches:
            _caches[name].clear()


def async_cached(name: str, ttl: int, key_fn: Callable | None = None):
    """Decorator for async functions — same semantics as @cached but awaits the fn.
    Uses double-checked locking so concurrent requests on a cold cache only hit
    the external API once (thundering-herd protection).
    """
    def decorator(fn: F) -> F:
        cache = get_cache(name, ttl)
        lock = asyncio.Lock()

        async def wrapper(*args, **kwargs):
            cache_key = key_fn(*args, **kwargs) if key_fn else (args, tuple(sorted(kwargs.items())))
            if cache_key in cache:
                return cache[cache_key]
            async with lock:
                if cache_key in cache:
                    return cache[cache_key]
                result = await fn(*args, **kwargs)
                cache[cache_key] = result
                return result

        wrapper.__wrapped__ = fn  # type: ignore
        return wrapper  # type: ignore

    return decorator


def cache_info() -> dict[str, dict[str, Any]]:
    with _lock:
        return {
            name: {"size": len(c), "maxsize": c.maxsize, "ttl": c.ttl}
            for name, c in _caches.items()
        }
