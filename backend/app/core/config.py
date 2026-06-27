from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[3] / ".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    APP_ENV: str = "local"
    APP_NAME: str = "ifa-backtest-product"
    API_PREFIX: str = "/api/v1"

    # Supabase
    SUPABASE_URL: str = ""
    SUPABASE_ANON_KEY: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""
    SUPABASE_BUCKET: str = "ifa-private"

    # Storage backend: "supabase" (default, talks to SUPABASE_URL/Storage) or "local"
    # (writes/reads under <repo>/storage-local/). Use "local" for fully-offline dev
    # when Supabase is paused or unreachable.
    STORAGE_BACKEND: str = "supabase"
    # HMAC secret used to sign upload/download URLs in local mode. Any string works
    # as long as it's the same across the backend and the URLs it issues. Auto-generated
    # if empty — but then signed URLs are not portable across process restarts.
    STORAGE_LOCAL_SECRET: str = "dev-local-storage-secret-change-me"
    # Where the frontend will send PUT/GET for signed URLs in local mode. Must include
    # the API prefix because /local-storage lives under the API router.
    LOCAL_BACKEND_BASE_URL: str = "http://localhost:8000"

    # Postgres
    DATABASE_URL_SYNC: str = Field(..., description="psycopg2 connection string")

    # Firebase
    FIREBASE_PROJECT_ID: str
    FIREBASE_CREDENTIALS_PATH: str

    # Admin bootstrap
    MAIN_ADMIN_EMAIL: str
    MAIN_ADMIN_INITIAL_PASSWORD: str

    # CORS — comma-separated origins. Includes localhost fallback for dev.
    # In prod set this to your Vercel domain(s), e.g.
    #   ALLOWED_ORIGINS=https://app.example.com,https://app-staging.example.com
    ALLOWED_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"

    # VAM (Volatility-Adjusted Momentum) engine — see backtestravi.insightfusionanalytics.com
    # Our backend logs into VAM once with these credentials and uses the resulting bearer
    # token to proxy run-backtest calls on behalf of admins AND clients. Clients never see
    # the VAM URL or token; everything is server-to-server.
    VAM_BASE_URL: str = "https://backtestravi.insightfusionanalytics.com"
    VAM_ADMIN_EMAIL: str = ""
    VAM_ADMIN_PASSWORD: str = ""

    # Per-client rate limit for client-triggered VAM runs (admins are not rate-limited).
    # Defaults to 5 runs / minute / client — enough to iterate on a slider, low enough
    # that an abusive client can't DOS VAM.
    VAM_CLIENT_RUNS_PER_MINUTE: int = 5

    # Observability
    SENTRY_DSN_BACKEND: str = ""

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]

    @property
    def vam_configured(self) -> bool:
        """True when both VAM credentials are present. Endpoints return 503 if False."""
        return bool(self.VAM_ADMIN_EMAIL) and bool(self.VAM_ADMIN_PASSWORD)


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
