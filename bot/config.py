import os
from dotenv import load_dotenv

load_dotenv()


def resolve_bot_token() -> str:
    is_prod = os.getenv("NODE_ENV") == "production" or os.getenv("ENVIRONMENT") == "production"
    token = os.getenv("BOT_TOKEN")
    if is_prod and (not token or token == "mock_bot_token_for_tests"):
        raise RuntimeError("FAIL-CLOSED: Production requires valid BOT_TOKEN")
    return token or "mock_bot_token_for_tests"


def resolve_service_token() -> str:
    token = os.getenv("SERVICE_TOKEN") or os.getenv("BOT_SERVICE_TOKEN")
    if not token or len(token) < 32:
        raise RuntimeError(
            "FAIL-CLOSED: SERVICE_TOKEN environment variable is missing or shorter than 32 characters"
        )
    return token


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

    SERVICE_TOKEN: str = resolve_service_token()

    CLINIC_NAME: str = os.getenv("CLINIC_NAME", "DentaCare Stomatologiya Klinikasi")
    CLINIC_PHONE: str = os.getenv("CLINIC_PHONE", "+998 71 200 55 44")
    CLINIC_LOCATION_URL: str = os.getenv("CLINIC_LOCATION_URL", "https://maps.google.com/?q=41.311081,69.240562")
    TIMEZONE: str = os.getenv("CLINIC_TIMEZONE", "Asia/Tashkent")
    # Optional contact details; lines are hidden in bot replies when empty
    CLINIC_ADDRESS: str = os.getenv("CLINIC_ADDRESS", "")
    CLINIC_LANDMARK: str = os.getenv("CLINIC_LANDMARK", "")
    CLINIC_WORKING_HOURS: str = os.getenv("CLINIC_WORKING_HOURS", "")
    CLINIC_TELEGRAM_SUPPORT: str = os.getenv("CLINIC_TELEGRAM_SUPPORT", "")
    CLINIC_WEBSITE: str = os.getenv("CLINIC_WEBSITE", "")


config = BotConfig()
