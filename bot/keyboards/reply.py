from aiogram.types import ReplyKeyboardMarkup, KeyboardButton

def get_contact_keyboard() -> ReplyKeyboardMarkup:
    button = KeyboardButton(text="📱 Telefon raqamimni ulashish", request_contact=True)
    return ReplyKeyboardMarkup(
        keyboard=[[button]],
        resize_keyboard=True,
        one_time_keyboard=True,
    )

def get_main_menu_keyboard() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        keyboard=[
            [
                KeyboardButton(text="📅 Qabullarim"),
                KeyboardButton(text="🦷 Davolash rejasi"),
            ],
            [
                KeyboardButton(text="💳 Qarzdorlik holati"),
                KeyboardButton(text="📝 Yangi qabulga yozilish"),
            ],
            [
                KeyboardButton(text="📍 Klinika manzili"),
                KeyboardButton(text="📞 Bog'lanish"),
            ],
        ],
        resize_keyboard=True,
    )
