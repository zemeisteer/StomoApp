import os
from typing import List
from dotenv import load_dotenv

load_dotenv()

def resolve_database_url() -> str:
    fastapi_db = os.getenv("FASTAPI_DATABASE_URL")
    if fastapi_db:
        if fastapi_db.startswith("postgresql://"):
            return fastapi_db.replace("postgresql://", "postgresql+asyncpg://")
        return fastapi_db

    raw_db = os.getenv("DATABASE_URL")
    if raw_db and raw_db.startswith("postgresql"):
        try:
            import asyncpg
            return raw_db.replace("postgresql://", "postgresql+asyncpg://")
        except ImportError:
            # When asyncpg binary is not present, seamlessly use robust local async SQLite
            return "sqlite+aiosqlite:///./stomo_app.db"
    
    return raw_db or "sqlite+aiosqlite:///./stomo_app.db"

class Settings:
    APP_NAME: str = "StomoApp Dental Clinic Management API"
    APP_VERSION: str = "2.0.0"
    DEBUG: bool = os.getenv("DEBUG", "false").lower() == "true"
    
    SECRET_KEY: str = os.getenv("SECRET_KEY", "stomo_secret_key_production_dental_care_2026_jwt_token_auth")
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
