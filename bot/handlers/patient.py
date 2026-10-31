from datetime import datetime
from aiogram import Router, F
from aiogram.types import Message, CallbackQuery
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload

from bot.database import AsyncSessionLocal
from app.models import Appointment, PatientProfile, DoctorProfile, OdontogramRecord, User, Invoice
from bot.keyboards.inline import get_appointment_actions_keyboard

router = Router()

@router.message(F.text == "📅 Qabullarim")
async def show_my_appointments(message: Message):
    async with AsyncSessionLocal() as db:
        # Fetch the latest patient profile
        p_stmt = select(PatientProfile).options(selectinload(PatientProfile.user)).limit(1)
        p_res = await db.execute(p_stmt)
        patient = p_res.scalar_one_or_none()

        if not patient:
            await message.answer("Bemor hisobi topilmadi. Iltimos, /start buyrug'i orqali raqamingizni yuboring.")
            return

        stmt = (
            select(Appointment)
            .options(selectinload(Appointment.doctor).selectinload(DoctorProfile.user))
            .where(
                and_(
                    Appointment.patient_id == patient.id,
                    Appointment.status.in_(["scheduled", "checked_in", "in_progress"]),
                )
            )
            .order_by(Appointment.start_time.asc())
        )
        res = await db.execute(stmt)
        appts = res.scalars().all()

        if not appts:
            await message.answer(
                "📅 <b>Sizda hozirda faol qabullar yo'q.</b>\n\n"
                "Yangi qabulga yozilish uchun <b>📝 Yangi qabulga yozilish</b> tugmasini bosing.",
                parse_mode="HTML",
            )
            return

        for appt in appts:
            doc_name = appt.doctor.user.full_name if appt.doctor and appt.doctor.user else "Shifokor"
            spec = appt.doctor.specialization if appt.doctor else "Stomatolog"
            date_str = appt.start_time.strftime("%d.%m.%Y")
            time_str = appt.start_time.strftime("%H:%M")

            status_badge = "🟢 Rejalashtirilgan" if appt.status == "scheduled" else "🟡 Klinikada"

            text = (
                f"📋 <b>QABUL MA'LUMOTI</b>\n\n"
                f"👨‍⚕️ <b>Shifokor:</b> {doc_name} ({spec})\n"
                f"📅 <b>Sana:</b> {date_str}\n"
                f"⏰ <b>Vaqt:</b> {time_str}\n"
                f"Holati: <b>{status_badge}</b>\n"
                f"Izoh: <i>{appt.notes or 'Profilaktik tekshiruv'}</i>"
            )
            await message.answer(
                text,
                reply_markup=get_appointment_actions_keyboard(appt.id),
                parse_mode="HTML",
            )

@router.message(F.text == "🦷 Davolash rejasi")
async def show_treatment_plan(message: Message):
    async with AsyncSessionLocal() as db:
        p_stmt = select(PatientProfile).limit(1)
        p_res = await db.execute(p_stmt)
        patient = p_res.scalar_one_or_none()

        if not patient:
            await message.answer("Bemor profili topilmadi.")
            return

        stmt = (
            select(OdontogramRecord)
            .where(
                and_(
                    OdontogramRecord.patient_id == patient.id,
                    OdontogramRecord.condition != "HEALTHY",
                )
            )
            .order_by(OdontogramRecord.tooth_number_fdi.asc())
        )
        res = await db.execute(stmt)
        records = res.scalars().all()

        if not records:
            await message.answer(
                "✨ <b>Sizda rejalashtirilgan davolash muolajalari yo'q!</b>\n"
                "Tishlaringiz holati yaxshi. Profilaktik ko'rik uchun har 6 oyda kelib turishingizni tavsiya qilamiz.",
                parse_mode="HTML",
            )
            return

        lines = ["🦷 <b>FAOL DAVOLASH REJANGIZ (ODONTOGRAMMA):</b>\n"]
        total_sum = 0.0
        for rec in records:
            total_sum += rec.price
            lines.append(
                f"• <b>Tish #{rec.tooth_number_fdi}</b> ({rec.surface}): "
                f"{rec.procedure_name} — <b>{int(rec.price):,} so'm</b>"
            )

        lines.append(f"\n💰 <b>Jami rejalashtirilgan qiymat:</b> <b>{int(total_sum):,} so'm</b>")
        lines.append("\n<i>To'liq ko'rik va davolash uchun shifokor bilan maslahatlashing.</i>")

        await message.answer("\n".join(lines), parse_mode="HTML")

@router.message(F.text == "💳 Qarzdorlik holati")
async def show_debt_status(message: Message):
    async with AsyncSessionLocal() as db:
        p_stmt = select(PatientProfile).options(selectinload(PatientProfile.user)).limit(1)
        p_res = await db.execute(p_stmt)
        patient = p_res.scalar_one_or_none()

        if not patient:
            await message.answer("Bemor hisobi topilmadi.")
            return

        total_debt = patient.total_debt or 0.0

        if total_debt > 0:
            msg = (
                f"💳 <b>HISOB-KITOB VA QARZDORLIK HOLATI</b>\n\n"
                f"👤 <b>Bemor:</b> {patient.user.full_name}\n"
                f"⚠️ <b>Qarzdorlik miqdori:</b> <b>{int(total_debt):,} so'm</b>\n\n"
                f"<i>To'lovlarni klinika qabulxonasida (Naqd, Uzcard/Humo) yoki Payme/Click ilovalari orqali to'lashingiz mumkin.</i>\n\n"
                f"Kassa ma'lumotlari: +998 71 200 55 44"
            )
        else:
            msg = (
                f"💳 <b>HISOB-KITOB HOLATI</b>\n\n"
                f"👤 <b>Bemor:</b> {patient.user.full_name}\n"
                f"✅ <b>Qarzdorlik mavjud emas!</b>\n\n"
                f"Barcha muolajalar to'liq to'langan. Ishonchingiz uchun rahmat!"
            )

        await message.answer(msg, parse_mode="HTML")
