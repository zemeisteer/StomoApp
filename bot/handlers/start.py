from aiogram import Router, F
from aiogram.filters import CommandStart
from aiogram.types import Message

from bot.api_client import api_client
from bot.keyboards.reply import get_contact_keyboard, get_main_menu_keyboard

router = Router()


def clean_phone(phone: str) -> str:
    cleaned = "".join(filter(str.isdigit, phone))
    if not cleaned.startswith("998") and len(cleaned) == 9:
        cleaned = "998" + cleaned
    return "+" + cleaned


@router.message(CommandStart())
async def handle_start(message: Message):
    welcome_text = (
        f"Assalomu alaykum, <b>{message.from_user.first_name}</b>!\n\n"
        f"🦷 <b>DentaCare Stomatologiya Klinikasi</b> rasmiy Telegram botiga xush kelibsiz!\n\n"
        f"Tizimdan to'liq foydalanish, qabullaringizni ko'rish va davolash rejangizni kuzatish uchun "
        f"iltimos, pastdagi tugma orqali telefon raqamingizni yuboring:"
    )
    await message.answer(
        welcome_text,
        reply_markup=get_contact_keyboard(),
        parse_mode="HTML",
    )


@router.message(F.contact)
async def handle_contact(message: Message):
    contact = message.contact
    if not contact:
        return

    # Security check: User can ONLY share their own contact card
    if contact.user_id != message.from_user.id:
        await message.answer(
            "⚠️ <b>Xavfsizlik xatosi:</b> Faqat o'zingizga tegishli telefon raqamingizni ulashishingiz mumkin!\n\n"
            "Iltimos, pastdagi <b>📱 Telefon raqamni ulashish</b> tugmasini bosing.",
            reply_markup=get_contact_keyboard(),
            parse_mode="HTML",
        )
        return

    raw_phone = contact.phone_number
    normalized_phone = clean_phone(raw_phone)
    full_name = contact.first_name + (f" {contact.last_name}" if contact.last_name else "")

    patient_res = await api_client.sync_patient(
        normalized_phone, full_name, str(message.from_user.id)
    )

    if not patient_res:
        await message.answer(
            "⚠️ Tizim bilan bog'lanishda xatolik yuz berdi. Iltimos, birozdan keyin qayta urinib ko'ring.",
            parse_mode="HTML",
        )
        return

    success_msg = (
        f"✅ <b>Tabriklaymiz! Hisobingiz muvaffaqiyatli bog'landi!</b>\n\n"
        f"👤 <b>F.I.Sh:</b> {patient_res.get('fullName')}\n"
        f"📱 <b>Telefon:</b> {patient_res.get('phone')}\n\n"
        f"Endi siz pastdagi menyu orqali qabullaringizni ko'rishingiz, "
        f"shifokor ko'rigiga yozilishingiz yoki davolash rejangizni kuzatishingiz mumkin."
    )
    await message.answer(
        success_msg,
        reply_markup=get_main_menu_keyboard(),
        parse_mode="HTML",
    )
