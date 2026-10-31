import os
from dotenv import load_dotenv

load_dotenv()

def resolve_db_url() -> str:
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
                return sqlite_fallback
        return url

    db_env = os.getenv("DATABASE_URL")
    if db_env and db_env.startswith("postgresql"):
        try:
            import asyncpg
            return db_env.replace("postgresql://", "postgresql+asyncpg://")
        except ImportError:
            return sqlite_fallback

    return sqlite_fallback

class BotConfig:
    BOT_TOKEN: str = os.getenv("BOT_TOKEN", "mock_bot_token_for_tests")
    STAFF_GROUP_CHAT_ID: int = int(os.getenv("STAFF_GROUP_CHAT_ID", "-1001234567890"))
    
    DATABASE_URL: str = resolve_db_url()
    
    CLINIC_NAME: str = os.getenv("CLINIC_NAME", "DentaCare Stomatologiya Klinikasi")
    CLINIC_PHONE: str = os.getenv("CLINIC_PHONE", "+998 71 200 55 44")
    CLINIC_LOCATION_URL: str = os.getenv("CLINIC_LOCATION_URL", "https://maps.google.com/?q=41.311081,69.240562")
    TIMEZONE: str = os.getenv("CLINIC_TIMEZONE", "Asia/Tashkent")

config = BotConfig()
