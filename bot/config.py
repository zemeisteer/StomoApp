import os
import re
from dotenv import load_dotenv

load_dotenv()

_PLACEHOLDER = re.compile(r"change[_-]?me|^generate[_-]|^replace[_-]?with|^your[_-]", re.IGNORECASE)


_DEV_ENVIRONMENTS = {"development", "test"}


def is_dev_environment() -> bool:
    """Production is the default: dev shortcuts need NODE_ENV or ENVIRONMENT set to development/test."""
    return (os.getenv("ENVIRONMENT") or os.getenv("NODE_ENV") or "").strip().lower() in _DEV_ENVIRONMENTS


def resolve_bot_token() -> str:
    token = os.getenv("BOT_TOKEN")
    if not is_dev_environment() and (not token or token == "mock_bot_token_for_tests" or _PLACEHOLDER.search(token.strip())):
        raise RuntimeError("FAIL-CLOSED: BOT_TOKEN is required outside development/test")
    return token or "mock_bot_token_for_tests"


def resolve_staff_chat_id() -> int:
    raw = (os.getenv("STAFF_GROUP_CHAT_ID") or "").strip()
    return int(raw) if raw else 0


def resolve_service_token() -> str:
    token = os.getenv("SERVICE_TOKEN") or os.getenv("BOT_SERVICE_TOKEN")
    if not token or len(token) < 32 or _PLACEHOLDER.search(token.strip()):
        raise RuntimeError(
            "FAIL-CLOSED: SERVICE_TOKEN environment variable is missing, a template placeholder "
            "or shorter than 32 characters"
        )
    return token


class BotConfig:
    BOT_TOKEN: str = resolve_bot_token()
    STAFF_GROUP_CHAT_ID: int = resolve_staff_chat_id()

    # NestJS REST API Gateway Configuration
    API_BASE_URL: str = (
        os.getenv("BACKEND_API_URL")
        or os.getenv("API_BASE_URL")
        or os.getenv("NESTJS_API_URL")
        or "http://localhost:3001/api"
    ).rstrip("/")

    SERVICE_TOKEN: str = resolve_service_token()

    # Fallbacks only: real contacts come from /bot/clinic-info. Never invent a phone or address.
    CLINIC_NAME: str = os.getenv("CLINIC_NAME") or "Klinika"
    CLINIC_PHONE: str = os.getenv("CLINIC_PHONE", "")
    CLINIC_LOCATION_URL: str = os.getenv("CLINIC_LOCATION_URL", "")
    TIMEZONE: str = os.getenv("CLINIC_TIMEZONE", "Asia/Tashkent")
    # Fallback only: the bot reads clinic contacts and branches from /bot/clinic-info
    CLINIC_WEBSITE: str = os.getenv("CLINIC_WEBSITE", "")


config = BotConfig()
