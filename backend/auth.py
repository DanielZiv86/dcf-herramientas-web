"""Google OAuth 2.0 flow + JWT session cookies."""
from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, Cookie, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from jose import JWTError, jwt

from config import settings
from whitelist import is_whitelisted

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"

COOKIE_NAME = "dcf_session"
COOKIE_MAX_AGE = settings.jwt_expire_hours * 3600


# ── JWT helpers ─────────────────────────────────────────────────────────────

def _create_token(email: str, role: str = "user") -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=settings.jwt_expire_hours)
    payload = {"sub": email, "role": role, "exp": expire}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError as e:
        raise HTTPException(status_code=401, detail=f"Token inválido: {e}")


def get_current_user(dcf_session: Optional[str] = Cookie(default=None)) -> dict:
    from config import settings
    if settings.dev_bypass_auth:
        return {"sub": settings.dev_bypass_email, "role": "dev"}
    if not dcf_session:
        raise HTTPException(status_code=401, detail="No autenticado")
    return decode_token(dcf_session)


def require_auth(dcf_session: Optional[str]) -> dict:
    """Use in routers: returns user dict or raises 401."""
    from config import settings
    if settings.dev_bypass_auth:
        return {"sub": settings.dev_bypass_email, "role": "dev"}
    if not dcf_session:
        raise HTTPException(status_code=401, detail="No autenticado")
    return decode_token(dcf_session)


# ── OAuth routes ─────────────────────────────────────────────────────────────

@router.get("/login")
async def login(request: Request):
    """Redirect to Google consent page."""
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "prompt": "select_account",
        "state": "dcf",
    }
    query = "&".join(f"{k}={v}" for k, v in params.items())
    return RedirectResponse(url=f"{GOOGLE_AUTH_URL}?{query}")


@router.get("/callback")
async def callback(request: Request, response: Response, code: str = "", state: str = "", error: str = ""):
    if error or not code:
        return RedirectResponse(url="/login.html?error=oauth_denied")

    async with httpx.AsyncClient() as client:
        # Exchange code for tokens
        token_resp = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": settings.google_redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        if token_resp.status_code != 200:
            logger.error("Token exchange failed: %s", token_resp.text)
            return RedirectResponse(url="/login.html?error=token_failed")

        tokens = token_resp.json()
        access_token = tokens.get("access_token")

        # Get user info
        user_resp = await client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if user_resp.status_code != 200:
            return RedirectResponse(url="/login.html?error=userinfo_failed")

        userinfo = user_resp.json()
        email = userinfo.get("email", "").lower().strip()

    if not email:
        return RedirectResponse(url="/login.html?error=no_email")

    # Check whitelist
    if not await is_whitelisted(email):
        logger.warning("Unauthorized access attempt: %s", email)
        return RedirectResponse(url="/login.html?error=not_authorized")

    # Issue JWT cookie
    token = _create_token(email)
    resp = RedirectResponse(url="/#dashboard")
    resp.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=COOKIE_MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=not settings.debug,
    )
    return resp


@router.get("/logout")
async def logout():
    resp = RedirectResponse(url="/login.html")
    resp.delete_cookie(COOKIE_NAME)
    return resp


@router.get("/me")
async def me(dcf_session: Optional[str] = Cookie(default=None)):
    from config import settings
    if settings.dev_bypass_auth:
        return {"email": settings.dev_bypass_email, "role": "dev"}
    if not dcf_session:
        raise HTTPException(status_code=401, detail="No autenticado")
    payload = decode_token(dcf_session)
    return {"email": payload["sub"], "role": payload.get("role", "user")}
