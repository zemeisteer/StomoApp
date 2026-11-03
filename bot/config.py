import os
from dotenv import load_dotenv

load_dotenv()

def resolve_bot_token() -> str:
    is_prod = os.getenv("NODE_ENV") == "production" or os.getenv("ENVIRONMENT") == "production"
    token = os.getenv("BOT_TOKEN")
    if is_prod and (not token or token == "mock_bot_token_for_tests"):
        raise RuntimeError("FAIL-CLOSED: Production requires valid BOT_TOKEN")
    return token or "mock_bot_token_for_tests"


class BotConfig:
    BOT_TOKEN: str = resolve_bot_token()
    STAFF_GROUP_CHAT_ID: int = int(os.getenv("STAFF_GROUP_CHAT_ID", "-1001234567890"))

    # NestJS REST API Gateway Configuration
    API_BASE_URL: str = (
        os.getenv("BACKEND_API_URL")
        or os.getenv("API_BASE_URL")
        or os.getenv("NESTJS_API_URL")
        or "http://localhost:3001/api"
    ).rstrip("/")

    SERVICE_TOKEN: str = (
        os.getenv("SERVICE_TOKEN")
        or os.getenv("BOT_SERVICE_TOKEN")
        or "stomo_bot_service_secret_token_2026"
    )

    CLINIC_NAME: str = os.getenv("CLINIC_NAME", "DentaCare Stomatologiya Klinikasi")
    CLINIC_PHONE: str = os.getenv("CLINIC_PHONE", "+998 71 200 55 44")
    CLINIC_LOCATION_URL: str = os.getenv("CLINIC_LOCATION_URL", "https://maps.google.com/?q=41.311081,69.240562")
    TIMEZONE: str = os.getenv("CLINIC_TIMEZONE", "Asia/Tashkent")


config = BotConfig()
