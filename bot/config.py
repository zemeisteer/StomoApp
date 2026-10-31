import os
from dotenv import load_dotenv

load_dotenv()

def resolve_db_url() -> str:
    url = os.getenv("BOT_DATABASE_URL") or os.getenv("FASTAPI_DATABASE_URL")
    if url:
        if url.startswith("postgresql://"):
            return url.replace("postgresql://", "postgresql+asyncpg://")
        return url

    db_env = os.getenv("DATABASE_URL")
    if db_env and db_env.startswith("postgresql"):
        try:
            import asyncpg
            return db_env.replace("postgresql://", "postgresql+asyncpg://")
        except ImportError:
            pass

    # Default to shared SQLite db
    # Resolve relative to bot directory
    base_dir = os.path.dirname(os.path.abspath(__file__))
    sqlite_path = os.path.join(base_dir, "..", "backend", "fastapi_app", "stomo_app.db")
    return f"sqlite+aiosqlite:///{os.path.abspath(sqlite_path)}"

class BotConfig:
    BOT_TOKEN: str = os.getenv("BOT_TOKEN", "mock_bot_token_for_tests")
    STAFF_GROUP_CHAT_ID: int = int(os.getenv("STAFF_GROUP_CHAT_ID", "-1001234567890"))
    
    DATABASE_URL: str = resolve_db_url()
    
    CLINIC_NAME: str = os.getenv("CLINIC_NAME", "DentaCare Stomatologiya Klinikasi")
    CLINIC_PHONE: str = os.getenv("CLINIC_PHONE", "+998 71 200 55 44")
    CLINIC_LOCATION_URL: str = os.getenv("CLINIC_LOCATION_URL", "https://maps.google.com/?q=41.311081,69.240562")
    TIMEZONE: str = os.getenv("CLINIC_TIMEZONE", "Asia/Tashkent")

config = BotConfig()
