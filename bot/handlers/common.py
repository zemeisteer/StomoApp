import html

from aiogram import Router, F
from aiogram.filters import Command
from aiogram.types import Message

from bot.api_client import api_client
from bot.config import config
from bot.i18n import t, button_labels, format_working_hours
from bot.services import lang as user_lang

router = Router()


def _e(value) -> str:
    return html.escape(str(value or ""), quote=False)


def _loc(item: dict, key: str, lang: str):
    return (item.get(f"{key}Ru") if lang == "ru" else None) or item.get(key)


@router.message(Command("myid"))
async def show_my_telegram_id(message: Message):
    lang = user_lang.lang_of(message.from_user)
    await message.answer(t(lang, "myid", id=message.from_user.id), parse_mode="HTML")


@router.message(F.text.in_(button_labels("location")))
async def show_location(message: Message):
    """Branches with address, hours, phone and map, from the clinic's own settings."""
    lang = user_lang.lang_of(message.from_user)
    info = await api_client.get_clinic_info() or {}
    clinic = _loc(info, "name", lang) or config.CLINIC_NAME
    lines = [t(lang, "location_title", clinic=_e(clinic))]

    branches = info.get("branches") or []
    for b in branches:
        lines.append(t(lang, "branch_block", name=_e(_loc(b, "name", lang)), address=_e(_loc(b, "address", lang))))
        hours = format_working_hours(lang, b.get("workingHours") or {})
        if hours:
            lines.append(t(lang, "hours", hours=_e(hours)))
        if b.get("phone"):
            lines.append(t(lang, "phone", phone=_e(b["phone"])))
        if b.get("mapUrl"):
            lines.append(t(lang, "map", url=html.escape(b["mapUrl"])))

    if not branches:
        # Backend unreachable: fall back to the env-configured contacts
        if config.CLINIC_LOCATION_URL:
            lines.append(t(lang, "map", url=html.escape(config.CLINIC_LOCATION_URL)))
        if config.CLINIC_PHONE:
            lines.append(t(lang, "phone", phone=_e(config.CLINIC_PHONE)))

    await message.answer("\n".join(lines), parse_mode="HTML", disable_web_page_preview=True)


@router.message(F.text.in_(button_labels("contacts")))
async def show_contacts(message: Message):
    lang = user_lang.lang_of(message.from_user)
    info = await api_client.get_clinic_info() or {}
    lines = [t(lang, "contacts_title")]

    phone = info.get("phone") or config.CLINIC_PHONE
    if phone:
        lines.append(t(lang, "phone", phone=_e(phone)))
    if info.get("telegramLink"):
        lines.append(t(lang, "telegram_channel", link=_e(info["telegramLink"])))
    website = info.get("website") or config.CLINIC_WEBSITE
    if website:
        lines.append(t(lang, "website", url=html.escape(website)))

    await message.answer("\n".join(lines), parse_mode="HTML")
