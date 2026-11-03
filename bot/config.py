import os
from dotenv import load_dotenv

load_dotenv()

def resolve_db_url() -> str:
    is_prod = os.getenv("NODE_ENV") == "production" or os.getenv("ENVIRONMENT") == "production"
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    canonical_db_path = os.path.join(repo_root, "stomo_app.db")
    sqlite_fallback = f"sqlite+aiosqlite:///{canonical_db_path}"

    url = os.getenv("BOT_DATABASE_URL") or os.getenv("FASTAPI_DATABASE_URL")
    if url:
        if url.startswith("postgresql://"):
            try:
                import asyncpg
                return url.replace("postgresql://", "postgresql+asyncpg://")
            except ImportError:
                if is_prod:
                    raise RuntimeError("FAIL-CLOSED: asyncpg is required for PostgreSQL in production")
                return sqlite_fallback
        return url

    db_env = os.getenv("DATABASE_URL")
    if db_env and db_env.startswith("postgresql"):
        try:
            import asyncpg
            return db_env.replace("postgresql://", "postgresql+asyncpg://")
        except ImportError:
            if is_prod:
                raise RuntimeError("FAIL-CLOSED: asyncpg is required for PostgreSQL in production")
            return sqlite_fallback
        return db_env

    if is_prod:
        raise RuntimeError("FAIL-CLOSED: Production requires explicit PostgreSQL DATABASE_URL. SQLite fallback is strictly forbidden.")

    return sqlite_fallback


def resolve_bot_token() -> str:
    is_prod = os.getenv("NODE_ENV") == "production" or os.getenv("ENVIRONMENT") == "production"
    token = os.getenv("BOT_TOKEN")
    if is_prod and (not token or token == "mock_bot_token_for_tests"):
        raise RuntimeError("FAIL-CLOSED: Production requires valid BOT_TOKEN")
    return token or "mock_bot_token_for_tests"


class BotConfig:
    BOT_TOKEN: str = resolve_bot_token()
    STAFF_GROUP_CHAT_ID: int = int(os.getenv("STAFF_GROUP_CHAT_ID", "-1001234567890"))
    
    DATABASE_URL: str = resolve_db_url()
    
    CLINIC_NAME: str = os.getenv("CLINIC_NAME", "DentaCare Stomatologiya Klinikasi")
    CLINIC_PHONE: str = os.getenv("CLINIC_PHONE", "+998 71 200 55 44")
    CLINIC_LOCATION_URL: str = os.getenv("CLINIC_LOCATION_URL", "https://maps.google.com/?q=41.311081,69.240562")
    TIMEZONE: str = os.getenv("CLINIC_TIMEZONE", "Asia/Tashkent")

config = BotConfig()
