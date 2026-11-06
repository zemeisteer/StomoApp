from datetime import datetime, timedelta
from typing import List

import pytz
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton

def get_appointment_actions_keyboard(appointment_id: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="❌ Qabulni bekor qilish",
                    callback_data=f"cancel_appt:{appointment_id}",
                )
            ]
        ]
    )

def get_cancel_confirm_keyboard(appointment_id: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="⚠️ Ha, bekor qilinsin",
                    callback_data=f"confirm_cancel:{appointment_id}",
                ),
                InlineKeyboardButton(
                    text="Ortga",
                    callback_data="close_cancel",
                ),
            ]
        ]
    )

def get_doctors_keyboard(doctors: List[dict]) -> InlineKeyboardMarkup:
    buttons = []
    for doc in doctors:
        buttons.append([
            InlineKeyboardButton(
                text=f"👨‍⚕️ {doc['name']} ({doc['spec']})",
                callback_data=f"select_doc:{doc['id']}",
            )
        ])
    buttons.append([InlineKeyboardButton(text="❌ Bekor qilish", callback_data="cancel_booking")])
    return InlineKeyboardMarkup(inline_keyboard=buttons)

def get_branches_keyboard(branches: List[dict]) -> InlineKeyboardMarkup:
    buttons = [
        [InlineKeyboardButton(text=f"🏥 {b['name']}", callback_data=f"select_branch:{b['id']}")]
        for b in branches
    ]
    buttons.append([InlineKeyboardButton(text="⬅️ Ortga", callback_data="back_to_doctors")])
    return InlineKeyboardMarkup(inline_keyboard=buttons)


def _format_price(price) -> str:
    try:
        return f"{int(price):,}".replace(",", " ") + " so'mdan"
    except (TypeError, ValueError):
        return ""


def get_services_keyboard(services: List[dict]) -> InlineKeyboardMarkup:
    buttons = []
    for svc in services:
        price = _format_price(svc.get("priceFrom")) if svc.get("priceFrom") else ""
        label = f"🦷 {svc['name']}" + (f" — {price}" if price else "")
        buttons.append([InlineKeyboardButton(text=label, callback_data=f"select_service:{svc['id']}")])
    buttons.append([InlineKeyboardButton(text="⬅️ Ortga", callback_data="back_to_doctors")])
    return InlineKeyboardMarkup(inline_keyboard=buttons)


def get_date_picker_keyboard(timezone: str = "Asia/Tashkent", days: int = 5) -> InlineKeyboardMarkup:
    """Next `days` dates in the clinic timezone (server clock may be UTC)."""
    today = datetime.now(pytz.timezone(timezone)).date()
    buttons, row = [], []
    for i in range(days):
        d = today + timedelta(days=i)
        label = "Bugun" if i == 0 else "Ertaga" if i == 1 else d.strftime("%d.%m")
        row.append(InlineKeyboardButton(text=label, callback_data=f"select_date:{d.isoformat()}"))
        if len(row) == 3:
            buttons.append(row)
            row = []
    if row:
        buttons.append(row)
    buttons.append([InlineKeyboardButton(text="⬅️ Ortga", callback_data="back_to_doctors")])
    return InlineKeyboardMarkup(inline_keyboard=buttons)


def get_time_slots_keyboard(slot_labels: List[str]) -> InlineKeyboardMarkup:
    """Buttons carry the slot index: labels like "10:00" contain ':' (the callback separator)."""
    buttons, row = [], []
    for idx, label in enumerate(slot_labels):
        row.append(InlineKeyboardButton(text=label, callback_data=f"select_slot:{idx}"))
        if len(row) == 3:
            buttons.append(row)
            row = []
    if row:
        buttons.append(row)
    buttons.append([InlineKeyboardButton(text="⬅️ Boshqa sana", callback_data="back_to_dates")])
    return InlineKeyboardMarkup(inline_keyboard=buttons)
