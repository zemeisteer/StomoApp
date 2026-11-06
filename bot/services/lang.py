"""Per-user bot language.

Explicit choices (/lang or the language button) are cached here and saved to
the backend (Patient.preferredLanguage) so scheduled reminders use them too.
Without a choice, the Telegram client language decides (ru* -> ru, else uz).
"""
from typing import Dict

from bot.api_client import api_client
from bot.i18n import norm_lang

_user_lang: Dict[int, str] = {}


def lang_of(user) -> str:
    """`user` is an aiogram User (message.from_user / callback.from_user)."""
    if user is None:
        return "uz"
    cached = _user_lang.get(user.id)
    if cached:
        return cached
    code = getattr(user, "language_code", None)
    return "ru" if isinstance(code, str) and code.lower().startswith("ru") else "uz"


def remember(user_id: int, lang: str) -> None:
    _user_lang[user_id] = norm_lang(lang)


async def choose(user_id: int, lang: str) -> None:
    remember(user_id, lang)
    # Best effort: unregistered users have no patient row yet; sync sends it later
    await api_client.set_patient_language(str(user_id), norm_lang(lang))
