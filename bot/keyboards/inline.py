from datetime import datetime, timedelta
from typing import List
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

def get_date_picker_keyboard() -> InlineKeyboardMarkup:
    today = datetime.now()
    buttons = []
    
    # 5 available days
    row1 = []
    for i in range(3):
        d = today + timedelta(days=i)
        label = "Bugun" if i == 0 else "Ertaga" if i == 1 else d.strftime("%d.%m")
        row1.append(
            InlineKeyboardButton(
                text=label,
                callback_data=f"select_date:{d.strftime('%Y-%m-%d')}",
            )
        )
    buttons.append(row1)

    row2 = []
    for i in range(3, 5):
        d = today + timedelta(days=i)
        row2.append(
            InlineKeyboardButton(
                text=d.strftime("%d.%m"),
                callback_data=f"select_date:{d.strftime('%Y-%m-%d')}",
            )
        )
    buttons.append(row2)
    buttons.append([InlineKeyboardButton(text="⬅️ Ortga", callback_data="back_to_doctors")])

    return InlineKeyboardMarkup(inline_keyboard=buttons)

def get_time_slots_keyboard(available_slots: List[str]) -> InlineKeyboardMarkup:
    buttons = []
    row = []
    for slot in available_slots:
        row.append(
            InlineKeyboardButton(
                text=slot,
                callback_data=f"select_slot:{slot}",
            )
        )
        if len(row) == 3:
            buttons.append(row)
            row = []
    if row:
        buttons.append(row)

    buttons.append([InlineKeyboardButton(text="⬅️ Boshqa sana", callback_data="back_to_dates")])
    return InlineKeyboardMarkup(inline_keyboard=buttons)
