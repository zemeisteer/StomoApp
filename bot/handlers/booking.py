from datetime import datetime
from typing import Dict, Any
from aiogram import Router, F
from aiogram.types import Message, CallbackQuery

from bot.api_client import api_client
from bot.handlers.start import user_patient_data
from bot.keyboards.inline import (
    get_doctors_keyboard,
    get_date_picker_keyboard,
    get_time_slots_keyboard,
    get_cancel_confirm_keyboard,
)
from bot.services.notifier import notify_staff_new_booking, notify_staff_cancellation

router = Router()

user_booking_sessions: Dict[int, Dict[str, Any]] = {}

@router.message(F.text == "📝 Yangi qabulga yozilish")
async def start_booking_flow(message: Message):
    docs = await api_client.get_doctors()

    if not docs:
        await message.answer("Hozirda band qilish uchun faol shifokorlar mavjud emas.")
        return

    user_booking_sessions[message.from_user.id] = {}

    await message.answer(
        "👨‍⚕️ <b>Iltimos, ko'rigiga yozilmoqchi bo'lgan shifokorni tanlang:</b>",
        reply_markup=get_doctors_keyboard(docs),
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

    doc_id = user_booking_sessions[user_id].get("doctor_id")

    available_slots = await api_client.get_slots(date_str, doc_id) if doc_id else []

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

    patient = user_patient_data.get(user_id)
    if not patient:
        patient_name = callback.from_user.full_name or "Telegram Bemor"
        patient_phone = "+998900000000"
    else:
        patient_name = patient.get("fullName", callback.from_user.full_name)
        patient_phone = patient.get("phone", "+998900000000")

    # Construct ISO string for start time: "YYYY-MM-DDTHH:mm:00"
    start_time_iso = f"{date_str}T{slot_time}:00"

    booking_res = await api_client.create_booking(
        doctor_id=doc_id,
        start_time=start_time_iso,
        patient_name=patient_name,
        patient_phone=patient_phone,
        notes="Telegram Bot orqali band qilingan",
    )

    if not booking_res or not booking_res.get("appointmentId"):
        await callback.message.edit_text(
            "Kechirasiz, ushbu vaqt hozirgina boshqa bemor tomonidan band qilindi yoki texnik xatolik yuz berdi. Iltimos, boshqa vaqt tanlang:",
            reply_markup=get_date_picker_keyboard(),
        )
        await callback.answer()
        return

    doctor_name = booking_res.get("doctorName", "Shifokor")

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

    cancel_res = await api_client.cancel_appointment(appt_id)

    if cancel_res and cancel_res.get("success"):
        p_name = cancel_res.get("patientName", "Bemor")
        d_name = cancel_res.get("doctorName", "Shifokor")
        st_raw = cancel_res.get("startTime", "")
        d_str = st_raw[:10] if len(st_raw) >= 10 else ""
        t_str = st_raw[11:16] if len(st_raw) >= 16 else ""

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
