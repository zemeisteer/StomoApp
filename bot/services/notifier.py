import logging
from aiogram import Bot
from bot.config import config

logger = logging.getLogger(__name__)

async def notify_staff_new_booking(
    bot: Bot,
    patient_name: str,
    patient_phone: str,
    doctor_name: str,
    date_str: str,
    time_str: str,
):
    text = (
        f"🔔 <b>YANGI QABUL YOZILDI!</b>\n\n"
        f"👤 <b>Bemor:</b> {patient_name}\n"
        f"📞 <b>Telefon:</b> {patient_phone}\n"
        f"👨‍⚕️ <b>Shifokor:</b> {doctor_name}\n"
        f"📅 <b>Sana:</b> {date_str}\n"
        f"⏰ <b>Vaqt:</b> {time_str}\n\n"
        f"<i>Qabulxona va CRM tizimida tasdiqlash kutilmoqda.</i>"
    )
    try:
        if config.STAFF_GROUP_CHAT_ID:
            await bot.send_message(
                chat_id=config.STAFF_GROUP_CHAT_ID,
                text=text,
                parse_mode="HTML",
            )
    except Exception as e:
        logger.warning(f"Could not dispatch staff alert: {e}")

async def notify_staff_cancellation(
    bot: Bot,
    patient_name: str,
    doctor_name: str,
    date_str: str,
    time_str: str,
):
    text = (
        f"❌ <b>QABUL BEKOR QILINDI!</b>\n\n"
        f"👤 <b>Bemor:</b> {patient_name}\n"
        f"👨‍⚕️ <b>Shifokor:</b> {doctor_name}\n"
        f"📅 <b>Sana:</b> {date_str}\n"
        f"⏰ <b>Vaqt:</b> {time_str}\n\n"
        f"<i>Ushbu vaqt oralig'i qayta bo'shatildi.</i>"
    )
    try:
        if config.STAFF_GROUP_CHAT_ID:
            await bot.send_message(
                chat_id=config.STAFF_GROUP_CHAT_ID,
                text=text,
                parse_mode="HTML",
            )
    except Exception as e:
        logger.warning(f"Could not dispatch staff cancellation alert: {e}")
