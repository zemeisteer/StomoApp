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
from bot.i18n import t, button_labels
from bot.keyboards.inline import _name
from bot.services import lang as user_lang

router = Router()

# Per-user booking state: doctor, branch, service, date and the last offered slots.
# In-memory is fine for a single bot process; after a restart the user starts over.
user_booking_sessions: Dict[int, Dict[str, Any]] = {}



def _e(value) -> str:
    return html.escape(str(value or ""), quote=False)


def _find(items, item_id) -> Optional[dict]:
    return next((i for i in items or [] if i.get("id") == item_id), None)


def _lang(event) -> str:
    return user_lang.lang_of(event.from_user)


async def _expired(callback: CallbackQuery):
    await callback.message.edit_text(t(_lang(callback), "session_expired"))
    await callback.answer()


async def _ask_date(callback: CallbackQuery, session: Dict[str, Any]):
    lang = _lang(callback)
    await callback.message.edit_text(
        f"🏥 {_e(session['branch_name'])}\n🦷 {_e(session['service_name'])}\n\n"
        f"{t(lang, 'choose_date')}",
        reply_markup=get_date_picker_keyboard(config.TIMEZONE, lang=lang),
        parse_mode="HTML",
    )


async def _ask_service(callback: CallbackQuery, session: Dict[str, Any]):
    lang = _lang(callback)
    services = session["doctor"].get("services") or []
    if len(services) == 1:
        session["service_id"] = services[0]["id"]
        session["service_name"] = _name(services[0], lang)
        await _ask_date(callback, session)
        return
    await callback.message.edit_text(
        t(lang, "choose_service"),
        reply_markup=get_services_keyboard(services, lang),
        parse_mode="HTML",
    )


async def _show_doctors(send, user_id: int, lang: str):
    docs = await api_client.get_doctors()
    # Only doctors that can actually be booked: at least one branch and one service
    docs = [d for d in docs if d.get("branches") and d.get("services")]
    if not docs:
        await send(t(lang, "no_doctors"))
        return
    user_booking_sessions[user_id] = {"doctors": docs}
    await send(
        t(lang, "choose_doctor"),
        reply_markup=get_doctors_keyboard(docs, lang),
        parse_mode="HTML",
    )


@router.message(F.text.in_(button_labels("book")))
async def start_booking_flow(message: Message):
    await _show_doctors(message.answer, message.from_user.id, _lang(message))


@router.callback_query(F.data == "back_to_doctors")
async def handle_back_to_doctors(callback: CallbackQuery):
    await _show_doctors(callback.message.edit_text, callback.from_user.id, _lang(callback))
    await callback.answer()


@router.callback_query(F.data == "cancel_booking")
async def handle_cancel_booking(callback: CallbackQuery):
    user_booking_sessions.pop(callback.from_user.id, None)
    await callback.message.edit_text(t(_lang(callback), "booking_cancelled"))
    await callback.answer()


@router.callback_query(F.data.startswith("select_doc:"))
async def handle_select_doctor(callback: CallbackQuery):
    doc_id = callback.data.split(":", 1)[1]
    session = user_booking_sessions.get(callback.from_user.id)
    doctor = _find(session.get("doctors") if session else None, doc_id)
    if not doctor:
        await _expired(callback)
        return

    for key in ("branch_id", "branch_name", "service_id", "service_name", "date", "slots"):
        session.pop(key, None)
    session.update({"doctor": doctor, "doctor_id": doctor["id"]})

    branches = doctor.get("branches") or []
    if len(branches) == 1:
        session["branch_id"] = branches[0]["id"]
        session["branch_name"] = _name(branches[0], _lang(callback))
        await _ask_service(callback, session)
    else:
        await callback.message.edit_text(
            t(_lang(callback), "choose_branch"),
            reply_markup=get_branches_keyboard(branches, _lang(callback)),
            parse_mode="HTML",
        )
    await callback.answer()


@router.callback_query(F.data.startswith("select_branch:"))
async def handle_select_branch(callback: CallbackQuery):
    branch_id = callback.data.split(":", 1)[1]
    session = user_booking_sessions.get(callback.from_user.id) or {}
    branch = _find((session.get("doctor") or {}).get("branches"), branch_id)
    if not branch:
        await _expired(callback)
        return
    session["branch_id"] = branch["id"]
    session["branch_name"] = _name(branch, _lang(callback))
    await _ask_service(callback, session)
    await callback.answer()


@router.callback_query(F.data.startswith("select_service:"))
async def handle_select_service(callback: CallbackQuery):
    service_id = callback.data.split(":", 1)[1]
    session = user_booking_sessions.get(callback.from_user.id) or {}
    service = _find((session.get("doctor") or {}).get("services"), service_id)
    if not service or not session.get("branch_id"):
        await _expired(callback)
        return
    session["service_id"] = service["id"]
    session["service_name"] = _name(service, _lang(callback))
    await _ask_date(callback, session)
    await callback.answer()


@router.callback_query(F.data == "back_to_dates")
async def handle_back_to_dates(callback: CallbackQuery):
    session = user_booking_sessions.get(callback.from_user.id) or {}
    if not session.get("service_id"):
        await _expired(callback)
        return
    await _ask_date(callback, session)
    await callback.answer()


@router.callback_query(F.data.startswith("select_date:"))
async def handle_select_date(callback: CallbackQuery):
    date_str = callback.data.split(":", 1)[1]
    session = user_booking_sessions.get(callback.from_user.id) or {}
    if not (session.get("doctor_id") and session.get("branch_id") and session.get("service_id")):
        await _expired(callback)
        return

    session["date"] = date_str
    slots = await api_client.get_slots(
        date_str, session["doctor_id"], session["service_id"], session["branch_id"]
    )
    session["slots"] = slots

    if not slots:
        await callback.message.edit_text(
            t(_lang(callback), "no_slots"),
            reply_markup=get_date_picker_keyboard(config.TIMEZONE, lang=_lang(callback)),
        )
        await callback.answer()
        return

    await callback.message.edit_text(
        t(_lang(callback), "choose_time", date=_e(date_str)),
        reply_markup=get_time_slots_keyboard([s["time"] for s in slots], _lang(callback)),
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
        await _expired(callback)
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
            t(_lang(callback), "booking_failed"),
            reply_markup=get_date_picker_keyboard(config.TIMEZONE, lang=_lang(callback)),
        )
        await callback.answer()
        return

    # Staff are notified by the backend outbox (staff_new_booking) for every booking.
    user_booking_sessions.pop(user_id, None)

    lang = _lang(callback)
    doctor_name = (booking_res.get("doctorName") if lang != "ru" else None) or _name(session["doctor"], lang)
    await callback.message.edit_text(
        t(
            lang,
            "booked",
            doctor=_e(doctor_name),
            branch=_e(session.get("branch_name")),
            service=_e(session.get("service_name")),
            date=_e(session.get("date")),
            time=_e(slot["time"]),
        ),
        parse_mode="HTML",
    )
    await callback.answer("✅")


# Cancellation Flow
@router.callback_query(F.data.startswith("cancel_appt:"))
async def handle_cancel_request(callback: CallbackQuery):
    appt_id = callback.data.split(":", 1)[1]
    await callback.message.edit_text(
        t(_lang(callback), "cancel_confirm_q"),
        reply_markup=get_cancel_confirm_keyboard(appt_id, _lang(callback)),
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
        await callback.message.edit_text(t(_lang(callback), "cancelled"), parse_mode="HTML")
        await callback.answer("✅")
    else:
        await callback.message.edit_text(t(_lang(callback), "cancel_failed"), parse_mode="HTML")
        await callback.answer("⚠️")


@router.callback_query(F.data == "close_cancel")
async def handle_close_cancel(callback: CallbackQuery):
    await callback.message.delete()
    await callback.answer()
