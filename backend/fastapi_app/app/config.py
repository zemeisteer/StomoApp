import os
from typing import List
from dotenv import load_dotenv

load_dotenv()

def resolve_database_url() -> str:
    is_prod = os.getenv("NODE_ENV") == "production" or os.getenv("ENVIRONMENT") == "production"
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
    canonical_db_path = os.path.join(repo_root, "stomo_app.db")
    sqlite_fallback = f"sqlite+aiosqlite:///{canonical_db_path}"

    fastapi_db = os.getenv("FASTAPI_DATABASE_URL")
    if fastapi_db:
        if fastapi_db.startswith("postgresql://"):
            try:
                import asyncpg
                return fastapi_db.replace("postgresql://", "postgresql+asyncpg://")
            except ImportError:
                if is_prod:
                    raise RuntimeError("FAIL-CLOSED: asyncpg driver is required for PostgreSQL in production")
                return sqlite_fallback
        return fastapi_db

    raw_db = os.getenv("DATABASE_URL")
    if raw_db and raw_db.startswith("postgresql"):
        try:
            import asyncpg
            return raw_db.replace("postgresql://", "postgresql+asyncpg://")
        except ImportError:
            if is_prod:
                raise RuntimeError("FAIL-CLOSED: asyncpg driver is required for PostgreSQL in production")
            return sqlite_fallback
        return raw_db
    
    if is_prod:
        raise RuntimeError("FAIL-CLOSED: Production requires explicit PostgreSQL DATABASE_URL. SQLite fallback is strictly forbidden.")

    return sqlite_fallback


def resolve_secret_key() -> str:
    is_prod = os.getenv("NODE_ENV") == "production" or os.getenv("ENVIRONMENT") == "production"
    secret = os.getenv("SECRET_KEY")
    if is_prod:
        if not secret or secret == "stomo_secret_key_production_dental_care_2026_jwt_token_auth":
            raise RuntimeError("FAIL-CLOSED: Production requires strong, explicit SECRET_KEY in environment variables")
    return secret or "stomo_secret_key_development_dental_care_jwt_auth"


class Settings:
    APP_NAME: str = "StomoApp Dental Clinic Management API"
    APP_VERSION: str = "2.0.0"
    DEBUG: bool = os.getenv("DEBUG", "false").lower() == "true"
    
    SECRET_KEY: str = resolve_secret_key()
    ALGORITHM: str = os.getenv("ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))
    
    DATABASE_URL: str = resolve_database_url()
    
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:4000",
        "https://stomoapp.uz",
    ]
    
    CLINIC_TIMEZONE: str = os.getenv("CLINIC_TIMEZONE", "Asia/Tashkent")
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))

settings = Settings()
