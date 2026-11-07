import html

from aiogram import Router, F
from aiogram.filters import CommandStart, CommandObject, Command
from aiogram.types import Message, CallbackQuery

from bot.api_client import api_client
from bot.config import config
from bot.i18n import t, button_labels
from bot.keyboards.inline import get_language_keyboard
from bot.keyboards.reply import get_contact_keyboard, get_main_menu_keyboard
from bot.services import lang as user_lang

router = Router()


def clean_phone(phone: str) -> str:
    cleaned = "".join(filter(str.isdigit, phone))
    if not cleaned.startswith("998") and len(cleaned) == 9:
        cleaned = "998" + cleaned
    return "+" + cleaned


def _e(value) -> str:
    return html.escape(str(value or ""), quote=False)


async def _clinic_name(lang: str) -> str:
    info = await api_client.get_clinic_info()
    if info:
        return info.get("nameRu" if lang == "ru" else "name") or config.CLINIC_NAME
    return config.CLINIC_NAME


@router.message(CommandStart())
async def handle_start(message: Message, command: CommandObject = None):
    lang = user_lang.lang_of(message.from_user)
    payload = (command.args or "").strip() if command else ""

    # Staff self-service linking: deep link from the admin panel (/start link_...)
    if payload.startswith("link_"):
        res = await api_client.link_staff_telegram(payload, str(message.from_user.id))
        if res and res.get("linked"):
            await message.answer(t(lang, "staff_linked", name=_e(res.get("fullName"))), parse_mode="HTML")
        else:
            await message.answer(t(lang, "staff_link_failed"), parse_mode="HTML")
        return

    await message.answer(
        t(lang, "welcome", name=_e(message.from_user.first_name), clinic=_e(await _clinic_name(lang))),
        reply_markup=get_contact_keyboard(lang),
        parse_mode="HTML",
    )


@router.message(Command("lang"))
@router.message(F.text.in_(button_labels("language")))
async def handle_language_menu(message: Message):
    await message.answer(t(user_lang.lang_of(message.from_user), "choose_language"), reply_markup=get_language_keyboard())


@router.callback_query(F.data.startswith("set_lang:"))
async def handle_set_language(callback: CallbackQuery):
    lang = callback.data.split(":", 1)[1]
    await user_lang.choose(callback.from_user.id, lang)
    lang = user_lang.lang_of(callback.from_user)
    await callback.message.edit_text(t(lang, "language_set"))
    await callback.message.answer(t(lang, "language_set"), reply_markup=get_main_menu_keyboard(lang))
    await callback.answer()


@router.message(F.contact)
async def handle_contact(message: Message):
    contact = message.contact
    if not contact:
        return
    lang = user_lang.lang_of(message.from_user)

    # Security: users can only share their own contact card
    if contact.user_id != message.from_user.id:
        await message.answer(t(lang, "contact_foreign"), reply_markup=get_contact_keyboard(lang), parse_mode="HTML")
        return

    normalized_phone = clean_phone(contact.phone_number)
    full_name = contact.first_name + (f" {contact.last_name}" if contact.last_name else "")

    patient_res = await api_client.sync_patient(normalized_phone, full_name, str(message.from_user.id), lang)

    if not patient_res:
        await message.answer(t(lang, "sync_error"), parse_mode="HTML")
        return
    if patient_res.get("ambiguous"):
        await message.answer(t(lang, "sync_ambiguous"), parse_mode="HTML")
        return

    if patient_res.get("preferredLanguage"):
        user_lang.remember(message.from_user.id, patient_res["preferredLanguage"])
        lang = user_lang.lang_of(message.from_user)

    await message.answer(
        t(lang, "linked", name=_e(patient_res.get("fullName")), phone=_e(patient_res.get("phone"))),
        reply_markup=get_main_menu_keyboard(lang),
        parse_mode="HTML",
    )
