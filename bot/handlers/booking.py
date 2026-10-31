from datetime import datetime, timedelta
from typing import Dict, Any
from aiogram import Router, F
from aiogram.types import Message, CallbackQuery
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload

from bot.database import AsyncSessionLocal
from app.models import Appointment, PatientProfile, DoctorProfile, User
from bot.keyboards.inline import (
    get_doctors_keyboard,
    get_date_picker_keyboard,
    get_time_slots_keyboard,
    get_cancel_confirm_keyboard,
)
from bot.services.notifier import notify_staff_new_booking, notify_staff_cancellation

router = Router()

# In-memory booking session state per telegram user
user_booking_sessions: Dict[int, Dict[str, Any]] = {}

@router.message(F.text == "📝 Yangi qabulga yozilish")
async def start_booking_flow(message: Message):
    async with AsyncSessionLocal() as db:
        # Fetch active doctors
        stmt = (
            select(DoctorProfile)
            .options(selectinload(DoctorProfile.user))
        )
        res = await db.execute(stmt)
        docs = res.scalars().all()

        if not docs:
            await message.answer("Hozirda band qilish uchun faol shifokorlar mavjud emas.")
            return

        doc_list = [
            {
                "id": d.id,
                "name": d.user.full_name if d.user else "Shifokor",
                "spec": d.specialization,
            }
            for d in docs
        ]

        user_booking_sessions[message.from_user.id] = {}

        await message.answer(
            "👨‍⚕️ <b>Iltimos, ko'rigiga yozilmoqchi bo'lgan shifokorni tanlang:</b>",
            reply_markup=get_doctors_keyboard(doc_list),
            parse_mode="HTML",
        )

@router.callback_query(F.data.startswith("select_doc:"))
async def handle_select_doctor(callback: CallbackQuery):
    doc_id = callback.data.split(":")[1]
    user_id = callback.from_user.id
    if user_id not in user_booking_sessions:
        user_booking_sessions[user_id] = {}
    user_booking_sessions[user_id]["doctor_id"] = doc_id

    await callback.message.edit_text(
        "📅 <b>Qabul kunini tanlang:</b>",
        reply_markup=get_date_picker_keyboard(),
        parse_mode="HTML",
    )
    await callback.answer()

@router.callback_query(F.data.startswith("select_date:"))
async def handle_select_date(callback: CallbackQuery):
    date_str = callback.data.split(":")[1]
    user_id = callback.from_user.id
    if user_id not in user_booking_sessions:
        user_booking_sessions[user_id] = {}
    user_booking_sessions[user_id]["date"] = date_str

    # Candidate time slots
    all_slots = ["09:00", "10:00", "11:00", "14:00", "15:00", "16:00", "17:00"]
    doc_id = user_booking_sessions[user_id].get("doctor_id")

    # Filter out slots that conflict in DB
    available_slots = []
    async with AsyncSessionLocal() as db:
        for s in all_slots:
            slot_start = datetime.strptime(f"{date_str} {s}", "%Y-%m-%d %H:%M")
            slot_end = slot_start + timedelta(minutes=45)

            conflict_stmt = select(Appointment).where(
                and_(
                    Appointment.doctor_id == doc_id,
                    Appointment.status != "cancelled",
                    Appointment.start_time < slot_end,
                    Appointment.end_time > slot_start,
                )
            )
            c_res = await db.execute(conflict_stmt)
            if not c_res.scalar_one_or_none():
                available_slots.append(s)

    if not available_slots:
        await callback.message.edit_text(
            "⚠️ Tanlangan kunda bo'sh vaqtlar qolmagan. Iltimos, boshqa kunni tanlang:",
            reply_markup=get_date_picker_keyboard(),
        )
        await callback.answer()
        return

    await callback.message.edit_text(
        f"⏰ <b>{date_str}</b> sanasi uchun bo'sh qabul vaqtini tanlang:",
        reply_markup=get_time_slots_keyboard(available_slots),
        parse_mode="HTML",
    )
    await callback.answer()

@router.callback_query(F.data.startswith("select_slot:"))
async def handle_confirm_slot(callback: CallbackQuery):
    slot_time = callback.data.split(":")[1]
    user_id = callback.from_user.id
    session = user_booking_sessions.get(user_id, {})

    doc_id = session.get("doctor_id")
    date_str = session.get("date")

    if not doc_id or not date_str:
        await callback.message.edit_text("Qabul vaqti sessiyasi eskirgan. Iltimos, qaytadan boshlang.")
        await callback.answer()
        return

    slot_start = datetime.strptime(f"{date_str} {slot_time}", "%Y-%m-%d %H:%M")
    slot_end = slot_start + timedelta(minutes=45)

    async with AsyncSessionLocal() as db:
        # Resolve patient
        p_stmt = select(PatientProfile).options(selectinload(PatientProfile.user)).limit(1)
        p_res = await db.execute(p_stmt)
        patient = p_res.scalar_one_or_none()

        d_stmt = select(DoctorProfile).options(selectinload(DoctorProfile.user)).where(DoctorProfile.id == doc_id)
        d_res = await db.execute(d_stmt)
        doctor = d_res.scalar_one_or_none()

        if not patient or not doctor:
            await callback.message.edit_text("Xatolik: Bemor yoki shifokor profili topilmadi.")
            await callback.answer()
            return

        # Double check conflict
        conflict_stmt = select(Appointment).where(
            and_(
                Appointment.doctor_id == doc_id,
                Appointment.status != "cancelled",
                Appointment.start_time < slot_end,
                Appointment.end_time > slot_start,
            )
        )
        c_res = await db.execute(conflict_stmt)
        if c_res.scalar_one_or_none():
            await callback.message.edit_text(
                "Kechirasiz, ushbu vaqt hozirgina boshqa bemor tomonidan band qilindi. Iltimos, boshqa vaqt tanlang:",
                reply_markup=get_date_picker_keyboard(),
            )
            await callback.answer()
            return

        # Create appointment
        appt = Appointment(
            patient_id=patient.id,
            doctor_id=doctor.id,
            start_time=slot_start,
            end_time=slot_end,
            status="scheduled",
            notes="Telegram Bot orqali band qilingan",
        )
        db.add(appt)
        await db.commit()

        # Notify staff group
        patient_name = patient.user.full_name
        patient_phone = patient.user.phone
        doctor_name = doctor.user.full_name

        await notify_staff_new_booking(
            bot=callback.bot,
            patient_name=patient_name,
            patient_phone=patient_phone,
            doctor_name=doctor_name,
            date_str=date_str,
            time_str=slot_time,
        )

        user_booking_sessions.pop(user_id, None)

        await callback.message.edit_text(
            f"✅ <b>QABULINGIZ MUVAFFAQIYATLI BAND QILINDI!</b>\n\n"
            f"👤 <b>Bemor:</b> {patient_name}\n"
            f"👨‍⚕️ <b>Shifokor:</b> {doctor_name}\n"
            f"📅 <b>Sana:</b> {date_str}\n"
            f"⏰ <b>Vaqt:</b> {slot_time}\n\n"
            f"<i>Qabul boshlanishidan 24 soat va 2 soat oldin sizga eslatma yuboramiz.</i>",
            parse_mode="HTML",
        )
        await callback.answer("Qabul tasdiqlandi!")

# Cancellation Flow
@router.callback_query(F.data.startswith("cancel_appt:"))
async def handle_cancel_request(callback: CallbackQuery):
    appt_id = callback.data.split(":")[1]
    await callback.message.edit_text(
        "⚠️ <b>Haqiqatan ham ushbu qabulni bekor qilmoqchimisiz?</b>",
        reply_markup=get_cancel_confirm_keyboard(appt_id),
        parse_mode="HTML",
    )
    await callback.answer()

@router.callback_query(F.data.startswith("confirm_cancel:"))
async def handle_confirm_cancel(callback: CallbackQuery):
    appt_id = callback.data.split(":")[1]
    async with AsyncSessionLocal() as db:
        stmt = (
            select(Appointment)
            .options(
                selectinload(Appointment.patient).selectinload(PatientProfile.user),
                selectinload(Appointment.doctor).selectinload(DoctorProfile.user),
            )
            .where(Appointment.id == appt_id)
        )
        res = await db.execute(stmt)
        appt = res.scalar_one_or_none()

        if appt:
            appt.status = "cancelled"
            await db.commit()

            p_name = appt.patient.user.full_name if appt.patient and appt.patient.user else "Bemor"
            d_name = appt.doctor.user.full_name if appt.doctor and appt.doctor.user else "Shifokor"
            d_str = appt.start_time.strftime("%d.%m.%Y")
            t_str = appt.start_time.strftime("%H:%M")

            await notify_staff_cancellation(
                bot=callback.bot,
                patient_name=p_name,
                doctor_name=d_name,
                date_str=d_str,
                time_str=t_str,
            )

        await callback.message.edit_text("❌ <b>Qabulingiz bekor qilindi.</b>", parse_mode="HTML")
        await callback.answer("Bekor qilindi")

@router.callback_query(F.data == "close_cancel")
async def handle_close_cancel(callback: CallbackQuery):
    await callback.message.delete()
    await callback.answer()
