import html
from typing import Dict, Any, Optional
from aiogram import Router, F
from aiogram.types import Message, CallbackQuery

from bot.api_client import api_client
from bot.config import config
from bot.keyboards.inline import (
    get_doctors_keyboard,
    get_branches_keyboard,
    get_services_keyboard,
    get_date_picker_keyboard,
    get_time_slots_keyboard,
    get_cancel_confirm_keyboard,
)
from bot.services.notifier import notify_staff_cancellation

router = Router()

# Per-user booking state: doctor, branch, service, date and the last offered slots.
# In-memory is fine for a single bot process; after a restart the user starts over.
user_booking_sessions: Dict[int, Dict[str, Any]] = {}

SESSION_EXPIRED = (
    "Qabul sessiyasi eskirgan. Iltimos, \"📝 Yangi qabulga yozilish\" tugmasidan qaytadan boshlang."
)


def _e(value) -> str:
    return html.escape(str(value or ""), quote=False)


def _find(items, item_id) -> Optional[dict]:
    return next((i for i in items or [] if i.get("id") == item_id), None)


async def _ask_date(callback: CallbackQuery, session: Dict[str, Any]):
    await callback.message.edit_text(
        f"🏥 {_e(session['branch_name'])}\n🦷 {_e(session['service_name'])}\n\n"
        f"📅 <b>Qabul kunini tanlang:</b>",
        reply_markup=get_date_picker_keyboard(config.TIMEZONE),
        parse_mode="HTML",
    )


async def _ask_service(callback: CallbackQuery, session: Dict[str, Any]):
    services = session["doctor"].get("services") or []
    if len(services) == 1:
        session["service_id"] = services[0]["id"]
        session["service_name"] = services[0]["name"]
        await _ask_date(callback, session)
        return
    await callback.message.edit_text(
        "🦷 <b>Xizmatni tanlang:</b>",
        reply_markup=get_services_keyboard(services),
        parse_mode="HTML",
    )


async def _show_doctors(send, user_id: int):
    docs = await api_client.get_doctors()
    # Only doctors that can actually be booked: at least one branch and one service
    docs = [d for d in docs if d.get("branches") and d.get("services")]
    if not docs:
        await send("Hozirda onlayn band qilish uchun faol shifokorlar mavjud emas.")
        return
    user_booking_sessions[user_id] = {"doctors": docs}
    await send(
        "👨‍⚕️ <b>Iltimos, ko'rigiga yozilmoqchi bo'lgan shifokorni tanlang:</b>",
        reply_markup=get_doctors_keyboard(docs),
        parse_mode="HTML",
    )


@router.message(F.text == "📝 Yangi qabulga yozilish")
async def start_booking_flow(message: Message):
    await _show_doctors(message.answer, message.from_user.id)


@router.callback_query(F.data == "back_to_doctors")
async def handle_back_to_doctors(callback: CallbackQuery):
    await _show_doctors(callback.message.edit_text, callback.from_user.id)
    await callback.answer()


@router.callback_query(F.data == "cancel_booking")
async def handle_cancel_booking(callback: CallbackQuery):
    user_booking_sessions.pop(callback.from_user.id, None)
    await callback.message.edit_text("Qabulga yozilish bekor qilindi.")
    await callback.answer()


@router.callback_query(F.data.startswith("select_doc:"))
async def handle_select_doctor(callback: CallbackQuery):
    doc_id = callback.data.split(":", 1)[1]
    session = user_booking_sessions.get(callback.from_user.id)
    doctor = _find(session.get("doctors") if session else None, doc_id)
    if not doctor:
        await callback.message.edit_text(SESSION_EXPIRED)
        await callback.answer()
        return

    for key in ("branch_id", "branch_name", "service_id", "service_name", "date", "slots"):
        session.pop(key, None)
    session.update({"doctor": doctor, "doctor_id": doctor["id"]})

    branches = doctor.get("branches") or []
    if len(branches) == 1:
        session["branch_id"] = branches[0]["id"]
        session["branch_name"] = branches[0]["name"]
        await _ask_service(callback, session)
    else:
        await callback.message.edit_text(
            "🏥 <b>Filialni tanlang:</b>",
            reply_markup=get_branches_keyboard(branches),
            parse_mode="HTML",
        )
    await callback.answer()


@router.callback_query(F.data.startswith("select_branch:"))
async def handle_select_branch(callback: CallbackQuery):
    branch_id = callback.data.split(":", 1)[1]
    session = user_booking_sessions.get(callback.from_user.id) or {}
    branch = _find((session.get("doctor") or {}).get("branches"), branch_id)
    if not branch:
        await callback.message.edit_text(SESSION_EXPIRED)
        await callback.answer()
        return
    session["branch_id"] = branch["id"]
    session["branch_name"] = branch["name"]
    await _ask_service(callback, session)
    await callback.answer()


@router.callback_query(F.data.startswith("select_service:"))
async def handle_select_service(callback: CallbackQuery):
    service_id = callback.data.split(":", 1)[1]
    session = user_booking_sessions.get(callback.from_user.id) or {}
    service = _find((session.get("doctor") or {}).get("services"), service_id)
    if not service or not session.get("branch_id"):
        await callback.message.edit_text(SESSION_EXPIRED)
        await callback.answer()
        return
    session["service_id"] = service["id"]
    session["service_name"] = service["name"]
    await _ask_date(callback, session)
    await callback.answer()


@router.callback_query(F.data == "back_to_dates")
async def handle_back_to_dates(callback: CallbackQuery):
    session = user_booking_sessions.get(callback.from_user.id) or {}
    if not session.get("service_id"):
        await callback.message.edit_text(SESSION_EXPIRED)
    else:
        await _ask_date(callback, session)
    await callback.answer()


@router.callback_query(F.data.startswith("select_date:"))
async def handle_select_date(callback: CallbackQuery):
    date_str = callback.data.split(":", 1)[1]
    session = user_booking_sessions.get(callback.from_user.id) or {}
    if not (session.get("doctor_id") and session.get("branch_id") and session.get("service_id")):
        await callback.message.edit_text(SESSION_EXPIRED)
        await callback.answer()
        return

    session["date"] = date_str
    slots = await api_client.get_slots(
        date_str, session["doctor_id"], session["service_id"], session["branch_id"]
    )
    session["slots"] = slots

    if not slots:
        await callback.message.edit_text(
            "⚠️ Tanlangan kunda bo'sh vaqtlar qolmagan. Iltimos, boshqa kunni tanlang:",
            reply_markup=get_date_picker_keyboard(config.TIMEZONE),
        )
        await callback.answer()
        return

    await callback.message.edit_text(
        f"⏰ <b>{_e(date_str)}</b> sanasi uchun bo'sh qabul vaqtini tanlang:",
        reply_markup=get_time_slots_keyboard([s["time"] for s in slots]),
        parse_mode="HTML",
    )
    await callback.answer()


@router.callback_query(F.data.startswith("select_slot:"))
async def handle_confirm_slot(callback: CallbackQuery):
    user_id = callback.from_user.id
    session = user_booking_sessions.get(user_id) or {}
    slots = session.get("slots") or []
    try:
        slot = slots[int(callback.data.split(":", 1)[1])]
    except (ValueError, IndexError):
        slot = None

    if not slot or not session.get("service_id"):
        await callback.message.edit_text(SESSION_EXPIRED)
        await callback.answer()
        return

    booking_res = await api_client.create_booking(
        doctor_id=session["doctor_id"],
        branch_id=session["branch_id"],
        service_id=session["service_id"],
        start_time=slot["startTime"],
        telegram_user_id=str(user_id),
        notes="Telegram bot orqali band qilingan",
    )

    if not booking_res or not booking_res.get("appointmentId"):
        await callback.message.edit_text(
            "Kechirasiz, qabulni band qilib bo'lmadi: vaqt hozirgina band qilingan bo'lishi mumkin. "
            "Agar hali telefon raqamingizni ulashmagan bo'lsangiz, avval /start buyrug'ini yuboring.\n\n"
            "Boshqa kunni tanlang:",
            reply_markup=get_date_picker_keyboard(config.TIMEZONE),
        )
        await callback.answer()
        return

    # Staff are notified by the backend outbox (staff_new_booking) for every booking.
    user_booking_sessions.pop(user_id, None)

    await callback.message.edit_text(
        f"✅ <b>QABULINGIZ BAND QILINDI!</b>\n\n"
        f"👨‍⚕️ <b>Shifokor:</b> {_e(booking_res.get('doctorName') or session['doctor'].get('name'))}\n"
        f"🏥 <b>Filial:</b> {_e(session.get('branch_name'))}\n"
        f"🦷 <b>Xizmat:</b> {_e(session.get('service_name'))}\n"
        f"📅 <b>Sana:</b> {_e(session.get('date'))}\n"
        f"⏰ <b>Vaqt:</b> {_e(slot['time'])}\n\n"
        f"<i>Klinika qabulni tasdiqlaydi. Qabuldan 24 soat oldin shu yerda, "
        f"2 soat oldin SMS orqali eslatma yuboramiz.</i>",
        parse_mode="HTML",
    )
    await callback.answer("Qabul band qilindi!")


# Cancellation Flow
@router.callback_query(F.data.startswith("cancel_appt:"))
async def handle_cancel_request(callback: CallbackQuery):
    appt_id = callback.data.split(":", 1)[1]
    await callback.message.edit_text(
        "⚠️ <b>Haqiqatan ham ushbu qabulni bekor qilmoqchimisiz?</b>",
        reply_markup=get_cancel_confirm_keyboard(appt_id),
        parse_mode="HTML",
    )
    await callback.answer()


@router.callback_query(F.data.startswith("confirm_cancel:"))
async def handle_confirm_cancel(callback: CallbackQuery):
    appt_id = callback.data.split(":", 1)[1]

    cancel_res = await api_client.cancel_appointment(appt_id, str(callback.from_user.id))

    if cancel_res and cancel_res.get("success"):
        d_name = cancel_res.get("doctorName", "Shifokor")
        # Clinic-local date/time from the backend (startTime is UTC)
        d_str = cancel_res.get("dateStr", "")
        t_str = cancel_res.get("timeStr", "")

        await notify_staff_cancellation(
            bot=callback.bot,
            doctor_name=d_name,
            date_str=d_str,
            time_str=t_str,
        )
        await callback.message.edit_text("❌ <b>Qabulingiz bekor qilindi.</b>", parse_mode="HTML")
        await callback.answer("Bekor qilindi")
    else:
        await callback.message.edit_text(
            "⚠️ <b>Xatolik:</b> Ushbu qabulni bekor qilib bo'lmaydi (yakunlangan qabul yoki ruxsat etilmagan).",
            parse_mode="HTML",
        )
        await callback.answer("Bekor qilish rad etildi")


@router.callback_query(F.data == "close_cancel")
async def handle_close_cancel(callback: CallbackQuery):
    await callback.message.delete()
    await callback.answer()
