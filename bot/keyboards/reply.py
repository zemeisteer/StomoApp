from aiogram.types import ReplyKeyboardMarkup, KeyboardButton

from bot.i18n import BUTTONS, norm_lang


def _b(key: str, lang: str) -> str:
    return BUTTONS[key][norm_lang(lang)]


def get_contact_keyboard(lang: str = "uz") -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        keyboard=[[KeyboardButton(text=_b("share_phone", lang), request_contact=True)]],
        resize_keyboard=True,
        one_time_keyboard=True,
    )


def get_main_menu_keyboard(lang: str = "uz") -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        keyboard=[
            [KeyboardButton(text=_b("appointments", lang)), KeyboardButton(text=_b("plan", lang))],
            [KeyboardButton(text=_b("debt", lang)), KeyboardButton(text=_b("book", lang))],
            [KeyboardButton(text=_b("location", lang)), KeyboardButton(text=_b("contacts", lang))],
            [KeyboardButton(text=_b("language", lang))],
        ],
        resize_keyboard=True,
    )
