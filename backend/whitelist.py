"""Google Sheet whitelist checker."""
from __future__ import annotations

import json
import logging
from typing import Optional

from config import settings
from cache import cached

logger = logging.getLogger(__name__)


def _load_whitelist_sync() -> Optional[set[str]]:
    """Load whitelisted emails from Google Sheet.

    Returns:
      None      — whitelist not configured at all → caller should allow everyone.
      set()     — configured but failed to load → caller should DENY (fail closed).
      {emails}  — loaded successfully.
    """
    sa_json = settings.google_service_account_json
    if not sa_json or not settings.google_sheet_id:
        logger.warning("Google Sheet whitelist not configured — allowing all users")
        return None  # Not configured: intentionally open

    try:
        import gspread
        from google.oauth2.service_account import Credentials

        scopes = [
            "https://www.googleapis.com/auth/spreadsheets.readonly",
            "https://www.googleapis.com/auth/drive.readonly",
        ]

        # Support inline JSON or file path
        try:
            sa_info = json.loads(sa_json)
        except json.JSONDecodeError:
            with open(sa_json, "r") as f:
                sa_info = json.load(f)

        creds = Credentials.from_service_account_info(sa_info, scopes=scopes)
        gc = gspread.authorize(creds)

        sheet = gc.open_by_key(settings.google_sheet_id)
        if settings.google_sheet_gid:
            ws = sheet.get_worksheet_by_id(settings.google_sheet_gid)
        else:
            ws = sheet.sheet1

        records = ws.get_all_records()
        emails: set[str] = set()
        for row in records:
            active = str(row.get("active", "true")).lower().strip()
            if active in ("false", "0", "no"):
                continue
            email = str(row.get("email", "")).lower().strip()
            if "@" in email:
                emails.add(email)

        logger.info("Whitelist loaded: %d emails", len(emails))
        return emails

    except Exception as e:
        # Configured but unreachable → fail closed: deny everyone until it recovers.
        logger.error("Failed to load whitelist — denying all access: %s", e)
        return set()


@cached("whitelist", ttl=300)
def _get_whitelist() -> Optional[set[str]]:
    return _load_whitelist_sync()


async def is_whitelisted(email: str) -> bool:
    whitelist = _get_whitelist()
    if whitelist is None:
        return True   # Not configured → allow everyone
    if not whitelist:
        return False  # Configured but failed to load → deny (fail closed)
    return email.lower().strip() in whitelist
