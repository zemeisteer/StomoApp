from aiogram import Router, F
from aiogram.types import Message

from bot.api_client import api_client
from bot.keyboards.inline import get_appointment_actions_keyboard

router = Router()


@router.message(F.text == "📅 Qabullarim")
async def show_my_appointments(message: Message):
    telegram_user_id = str(message.from_user.id)
    appts = await api_client.get_patient_appointments(telegram_user_id)

    if appts is None:
        await message.answer(
            "Bemor hisobi topilmadi. Iltimos, /start buyrug'i orqali raqamingizni yuboring.",
            parse_mode="HTML",
        )
        return

    if not appts:
        await message.answer(
            "📅 <b>Sizda hozirda faol qabullar yo'q.</b>\n\n"
            "Yangi qabulga yozilish uchun <b>📝 Yangi qabulga yozilish</b> tugmasini bosing.",
            parse_mode="HTML",
        )
        return

    for appt in appts:
        doc_name = appt.get("doctorName", "Shifokor")
        spec = appt.get("specialization", "Stomatolog")
        date_str = appt.get("date", "")
        time_str = appt.get("time", "")
        status = appt.get("status", "PENDING")

        status_badge = "🟢 Rejalashtirilgan" if status in ["CONFIRMED", "SCHEDULED"] else "🟡 Kutilmoqda"
        if status == "CHECKED_IN":
            status_badge = "🔵 Klinikada"

        text = (
            f"📋 <b>QABUL MA'LUMOTI</b>\n\n"
            f"👨‍⚕️ <b>Shifokor:</b> {doc_name} ({spec})\n"
            f"📅 <b>Sana:</b> {date_str}\n"
            f"⏰ <b>Vaqt:</b> {time_str}\n"
            f"Holati: <b>{status_badge}</b>\n"
            f"Izoh: <i>{appt.get('notes') or 'Profilaktik tekshiruv'}</i>"
        )
        await message.answer(
            text,
            reply_markup=get_appointment_actions_keyboard(appt["id"]),
            parse_mode="HTML",
        )


@router.message(F.text == "🦷 Davolash rejasi")
async def show_treatment_plan(message: Message):
    telegram_user_id = str(message.from_user.id)
    records = await api_client.get_patient_treatment_plan(telegram_user_id)

    if records is None:
        await message.answer(
            "Bemor hisobi topilmadi. Iltimos, /start buyrug'i orqali raqamingizni yuboring.",
            parse_mode="HTML",
        )
        return

    if not records:
        await message.answer(
            "✨ <b>Sizda rejalashtirilgan davolash muolajalari yo'q!</b>\n"
            "Tishlaringiz holati yaxshi. Profilaktik ko'rik uchun har 6 oyda kelib turishingizni tavsiya qilamiz.",
            parse_mode="HTML",
        )
        return

    lines = ["🦷 <b>FAOL DAVOLASH REJANGIZ (ODONTOGRAMMA):</b>\n"]
    total_sum = 0
    for rec in records:
        price = rec.get("price", 0)
        total_sum += price
        tooth = rec.get("toothNumber", "Umumiy")
        proc = rec.get("procedureName", "Muolaja")
        lines.append(
            f"• <b>Tish #{tooth}</b>: "
            f"{proc} — <b>{int(price):,} so'm</b>"
        )

    lines.append(f"\n💰 <b>Jami rejalashtirilgan qiymat:</b> <b>{int(total_sum):,} so'm</b>")
    lines.append("\n<i>To'liq ko'rik va davolash uchun shifokor bilan maslahatlashing.</i>")

    await message.answer("\n".join(lines), parse_mode="HTML")


@router.message(F.text == "💳 Qarzdorlik holati")
async def show_debt_status(message: Message):
    telegram_user_id = str(message.from_user.id)
    debt_info = await api_client.get_patient_debt(telegram_user_id)

    if debt_info is None:
        await message.answer(
            "Bemor hisobi topilmadi. Iltimos, /start buyrug'i orqali raqamingizni yuboring.",
            parse_mode="HTML",
        )
        return

    total_debt = debt_info.get("totalDebt", 0) if debt_info else 0
    patient_name = debt_info.get("patientName", "Hurmatli bemor")

    if total_debt > 0:
        msg = (
            f"💳 <b>HISOB-KITOB VA QARZDORLIK HOLATI</b>\n\n"
            f"👤 <b>Bemor:</b> {patient_name}\n"
            f"⚠️ <b>Qarzdorlik miqdori:</b> <b>{int(total_debt):,} so'm</b>\n\n"
            f"<i>To'lovlarni klinika qabulxonasida (Naqd, Uzcard/Humo) yoki Payme/Click ilovalari orqali to'lashingiz mumkin.</i>\n\n"
            f"Kassa ma'lumotlari: +998 71 200 55 44"
        )
    else:
        msg = (
            f"💳 <b>HISOB-KITOB HOLATI</b>\n\n"
            f"👤 <b>Bemor:</b> {patient_name}\n"
            f"✅ <b>Qarzdorlik mavjud emas!</b>\n\n"
            f"Barcha muolajalar to'liq to'langan. Ishonchingiz uchun rahmat!"
        )

    await message.answer(msg, parse_mode="HTML")
