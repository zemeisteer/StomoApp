from aiogram import Router, F
from aiogram.filters import CommandStart
from aiogram.types import Message
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from bot.database import AsyncSessionLocal
from app.models import User, PatientProfile
from bot.keyboards.reply import get_contact_keyboard, get_main_menu_keyboard

router = Router()

def clean_phone(phone: str) -> str:
    cleaned = "".join(filter(str.isdigit, phone))
    if not cleaned.startswith("998") and len(cleaned) == 9:
        cleaned = "998" + cleaned
    return "+" + cleaned

@router.message(CommandStart())
async def handle_start(message: Message):
    async with AsyncSessionLocal() as db:
        # Check if user already exists
        # In a real environment, telegram_chat_id or phone is stored
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

    raw_phone = contact.phone_number
    normalized_phone = clean_phone(raw_phone)

    async with AsyncSessionLocal() as db:
        stmt = (
            select(User)
            .options(selectinload(User.patient_profile))
            .where(User.phone == normalized_phone)
        )
        res = await db.execute(stmt)
        user = res.scalar_one_or_none()

        if not user:
            # Create user and patient profile
            user = User(
                full_name=contact.first_name + (f" {contact.last_name}" if contact.last_name else ""),
                phone=normalized_phone,
                password_hash="telegram_oauth_linked",
                role="patient",
            )
            db.add(user)
            await db.flush()

            patient_profile = PatientProfile(user_id=user.id)
            db.add(patient_profile)
            await db.commit()
            status_note = "Yangi hisob yaratildi va ulandi!"
        else:
            if not user.patient_profile:
                patient_profile = PatientProfile(user_id=user.id)
                db.add(patient_profile)
                await db.commit()
            status_note = "Mavjud hisobingiz muvaffaqiyatli bog'landi!"

        success_msg = (
            f"✅ <b>Tabriklaymiz! {status_note}</b>\n\n"
            f"👤 <b>F.I.Sh:</b> {user.full_name}\n"
            f"📱 <b>Telefon:</b> {user.phone}\n\n"
            f"Endi siz pastdagi menyu orqali qabullaringizni ko'rishingiz, "
            f"shifokor ko'rigiga yozilishingiz yoki davolash rejangizni kuzatishingiz mumkin."
        )
        await message.answer(
            success_msg,
            reply_markup=get_main_menu_keyboard(),
            parse_mode="HTML",
        )
