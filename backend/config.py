from __future__ import annotations
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(Path(__file__).resolve().parents[1] / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Google OAuth
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:8000/auth/callback"

    # Google Sheets whitelist
    google_sheet_id: str = ""
    google_sheet_gid: int = 0
    google_service_account_json: str = ""

    # JWT
    jwt_secret: str = "change-me-32chars-minimum-secret"
    jwt_algorithm: str = "HS256"
    jwt_expire_hours: int = 24

    # APIs
    finnhub_token: str = ""

    # Data path (shared with Streamlit app)
    streamlit_data_path: str = ""

    # App
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    debug: bool = False
    allowed_origins: str = "http://localhost:8000"

    # Dev only — bypasses Google OAuth entirely for local testing
    # Set DEV_BYPASS_AUTH=true in .env to skip login
    dev_bypass_auth: bool = False
    dev_bypass_email: str = "dev@dcfinversiones.com"

    @property
    def data_path(self) -> Path:
        if self.streamlit_data_path:
            return Path(self.streamlit_data_path)
        # fallback: data/ next to backend/
        return Path(__file__).resolve().parent / "data"

    @property
    def origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


settings = Settings()
