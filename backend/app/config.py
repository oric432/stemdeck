import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Settings:
    database_url: str
    s3_endpoint_url: str | None
    s3_bucket: str
    s3_access_key_id: str | None
    s3_secret_access_key: str | None
    s3_region: str
    cors_allow_origins: list[str]
    modal_app_name: str
    internal_api_secret: str | None
    job_timeout_seconds: int


def _env(key: str) -> str | None:
    # A blank value in a .env file (KEY=) sets the var to "", and dict.get's
    # default only kicks in when the key is absent — so treat blank as unset too.
    return os.environ.get(key) or None


def load_settings() -> Settings:
    return Settings(
        database_url=_env("DATABASE_URL") or "sqlite:///./dev.db",
        s3_endpoint_url=_env("S3_ENDPOINT_URL"),
        s3_bucket=_env("S3_BUCKET") or "avseparate-dev",
        s3_access_key_id=_env("S3_ACCESS_KEY_ID"),
        s3_secret_access_key=_env("S3_SECRET_ACCESS_KEY"),
        s3_region=_env("S3_REGION") or "us-east-1",
        cors_allow_origins=(_env("CORS_ALLOW_ORIGINS") or "http://localhost:5173").split(","),
        modal_app_name=_env("MODAL_APP_NAME") or "avseparate",
        internal_api_secret=_env("INTERNAL_API_SECRET"),
        # A bit above Modal's function timeout (900s in modal_app.py, which now
        # also runs chord detection after separation) — if Modal kills the
        # container on its own timeout, our except/httpx-fail call never runs,
        # so the job would otherwise sit "processing" forever.
        job_timeout_seconds=int(_env("JOB_TIMEOUT_SECONDS") or "1100"),
    )


settings = load_settings()
