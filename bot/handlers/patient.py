import html

from aiogram import Router, F
from aiogram.types import Message

from bot.api_client import api_client
from bot.i18n import t, money, button_labels
from bot.keyboards.inline import get_appointment_actions_keyboard
from bot.services import lang as user_lang

router = Router()


def _e(value) -> str:
    return html.escape(str(value or ""), quote=False)


def _status(lang: str, status: str) -> str:
    if status == "CHECKED_IN":
        return t(lang, "status_checked_in")
    if status in ("CONFIRMED", "SCHEDULED"):
        return t(lang, "status_confirmed")
    return t(lang, "status_pending")


@router.message(F.text.in_(button_labels("appointments")))
async def show_my_appointments(message: Message):
    lang = user_lang.lang_of(message.from_user)
    appts = await api_client.get_patient_appointments(str(message.from_user.id))

    if appts is None:
        await message.answer(t(lang, "not_registered"), parse_mode="HTML")
        return
    if not appts:
        await message.answer(t(lang, "no_appointments"), parse_mode="HTML")
        return

    for appt in appts:
        ru = lang == "ru"
        doctor = (appt.get("doctorNameRu") if ru else None) or appt.get("doctorName", "")
        spec = (appt.get("specializationRu") if ru else None) or appt.get("specialization", "")
        notes = appt.get("notes")
        text = t(
            lang,
            "appointment_card",
            doctor=_e(doctor),
            spec=_e(spec),
            date=_e(appt.get("date")),
            time=_e(appt.get("time")),
            status=_status(lang, appt.get("status", "PENDING")),
            notes=t(lang, "notes_label", notes=_e(notes)) if notes else "",
        )
        await message.answer(
            text,
            reply_markup=get_appointment_actions_keyboard(appt["id"], lang),
            parse_mode="HTML",
        )


@router.message(F.text.in_(button_labels("plan")))
async def show_treatment_plan(message: Message):
    lang = user_lang.lang_of(message.from_user)
    records = await api_client.get_patient_treatment_plan(str(message.from_user.id))

    if records is None:
        await message.answer(t(lang, "not_registered"), parse_mode="HTML")
        return
    if not records:
        await message.answer(t(lang, "no_plan"), parse_mode="HTML")
        return

    lines = [t(lang, "plan_title")]
    total = 0
    for rec in records:
        price = rec.get("price") or 0
        total += price
        proc = (rec.get("procedureNameRu") if lang == "ru" else None) or rec.get("procedureName", "")
        lines.append(t(
            lang,
            "plan_item",
            tooth=_e(rec.get("toothNumber") or t(lang, "plan_general")),
            proc=_e(proc),
            price=money(lang, price),
        ))
    lines.append(t(lang, "plan_total", total=money(lang, total)))
    await message.answer("\n".join(lines), parse_mode="HTML")


@router.message(F.text.in_(button_labels("debt")))
async def show_debt_status(message: Message):
    lang = user_lang.lang_of(message.from_user)
    debt_info = await api_client.get_patient_debt(str(message.from_user.id))

    if not debt_info:
        await message.answer(t(lang, "not_registered"), parse_mode="HTML")
        return

    name = _e(debt_info.get("patientName"))
    total_debt = debt_info.get("totalDebt") or 0
    if total_debt > 0:
        info = await api_client.get_clinic_info()
        phone = (info or {}).get("phone")
        msg = t(
            lang,
            "debt_yes",
            name=name,
            amount=money(lang, total_debt),
            phone=t(lang, "phone_line", phone=_e(phone)) if phone else "",
        )
    else:
        msg = t(lang, "debt_no", name=name)
    await message.answer(msg, parse_mode="HTML")
