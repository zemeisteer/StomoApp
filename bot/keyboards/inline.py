from datetime import datetime, timedelta
from typing import List

import pytz
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton

from bot.i18n import t, money, norm_lang


def _name(item: dict, lang: str, key: str = "name") -> str:
    """Localized name: prefers `<key>Ru` for Russian when present."""
    if norm_lang(lang) == "ru" and item.get(f"{key}Ru"):
        return item[f"{key}Ru"]
    return item.get(key) or ""


def get_language_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[[
            InlineKeyboardButton(text="🇺🇿 O'zbekcha", callback_data="set_lang:uz"),
            InlineKeyboardButton(text="🇷🇺 Русский", callback_data="set_lang:ru"),
        ]]
    )


def get_appointment_actions_keyboard(appointment_id: str, lang: str = "uz") -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[[
            InlineKeyboardButton(text=t(lang, "cancel_appt_button"), callback_data=f"cancel_appt:{appointment_id}")
        ]]
    )


def get_cancel_confirm_keyboard(appointment_id: str, lang: str = "uz") -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[[
            InlineKeyboardButton(text=t(lang, "cancel_yes"), callback_data=f"confirm_cancel:{appointment_id}"),
            InlineKeyboardButton(text=t(lang, "back"), callback_data="close_cancel"),
        ]]
    )


def get_doctors_keyboard(doctors: List[dict], lang: str = "uz") -> InlineKeyboardMarkup:
    buttons = [
        [InlineKeyboardButton(
            text=f"👨‍⚕️ {_name(doc, lang)} ({_name(doc, lang, 'spec')})",
            callback_data=f"select_doc:{doc['id']}",
        )]
        for doc in doctors
    ]
    buttons.append([InlineKeyboardButton(text=t(lang, "cancel"), callback_data="cancel_booking")])
    return InlineKeyboardMarkup(inline_keyboard=buttons)


def get_branches_keyboard(branches: List[dict], lang: str = "uz") -> InlineKeyboardMarkup:
    buttons = [
        [InlineKeyboardButton(text=f"🏥 {_name(b, lang)}", callback_data=f"select_branch:{b['id']}")]
        for b in branches
    ]
    buttons.append([InlineKeyboardButton(text=t(lang, "back"), callback_data="back_to_doctors")])
    return InlineKeyboardMarkup(inline_keyboard=buttons)


def get_services_keyboard(services: List[dict], lang: str = "uz") -> InlineKeyboardMarkup:
    buttons = []
    for svc in services:
        price = money(lang, svc["priceFrom"], "price_from") if svc.get("priceFrom") else ""
        label = f"🦷 {_name(svc, lang)}" + (f" — {price}" if price else "")
        buttons.append([InlineKeyboardButton(text=label, callback_data=f"select_service:{svc['id']}")])
    buttons.append([InlineKeyboardButton(text=t(lang, "back"), callback_data="back_to_doctors")])
    return InlineKeyboardMarkup(inline_keyboard=buttons)


def get_date_picker_keyboard(timezone: str = "Asia/Tashkent", days: int = 5, lang: str = "uz") -> InlineKeyboardMarkup:
    """Next `days` dates in the clinic timezone (server clock may be UTC)."""
    today = datetime.now(pytz.timezone(timezone)).date()
    buttons, row = [], []
    for i in range(days):
        d = today + timedelta(days=i)
        label = t(lang, "today") if i == 0 else t(lang, "tomorrow") if i == 1 else d.strftime("%d.%m")
        row.append(InlineKeyboardButton(text=label, callback_data=f"select_date:{d.isoformat()}"))
        if len(row) == 3:
            buttons.append(row)
            row = []
    if row:
        buttons.append(row)
    buttons.append([InlineKeyboardButton(text=t(lang, "back"), callback_data="back_to_doctors")])
    return InlineKeyboardMarkup(inline_keyboard=buttons)


def get_time_slots_keyboard(slot_labels: List[str], lang: str = "uz") -> InlineKeyboardMarkup:
    """Buttons carry the slot index: labels like "10:00" contain ':' (the callback separator)."""
    buttons, row = [], []
    for idx, label in enumerate(slot_labels):
        row.append(InlineKeyboardButton(text=label, callback_data=f"select_slot:{idx}"))
        if len(row) == 3:
            buttons.append(row)
            row = []
    if row:
        buttons.append(row)
    buttons.append([InlineKeyboardButton(text=t(lang, "other_date"), callback_data="back_to_dates")])
    return InlineKeyboardMarkup(inline_keyboard=buttons)
