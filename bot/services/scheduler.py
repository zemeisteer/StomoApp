import logging
from aiogram import Bot
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from bot.config import config
from bot.api_client import api_client

logger = logging.getLogger(__name__)

async def send_appointment_reminders(bot: Bot):
    """
    Checks appointments in the next 24 hours and next 2 hours via NestJS API,
    sending localized reminder messages to patients.
    """
    reminders = await api_client.get_reminders()
    if not reminders:
        return

    for rem in reminders:
        patient_name = rem.get("patientName", "Bemor")
        doctor_name = rem.get("doctorName", "Shifokor")
        time_str = rem.get("timeStr", "")
        window = rem.get("window", "2h")

        if window == "2h":
            msg = (
                f"⏰ <b>ESLATMA: QABULINGIZGA 2 SOAT QOLDI!</b>\n\n"
                f"Hurmatli {patient_name},\n"
                f"Sizning bugun soat <b>{time_str}</b> da <b>{doctor_name}</b> qabuliga yozilishingiz rejalashtirilgan.\n\n"
                f"📍 <b>Klinika manzili:</b> <a href='{config.CLINIC_LOCATION_URL}'>Xaritada ko'rish (Google Maps)</a>\n"
                f"📞 <b>Telefon:</b> {config.CLINIC_PHONE}\n\n"
                f"<i>Kechikmasdan kelishingizni so'raymiz!</i>"
            )
            logger.info(f"[Reminder 2h sent] {rem.get('id')}: {msg}")
        else:
            logger.info(f"[Reminder 24h] Patient: {patient_name}, Doctor: {doctor_name}, Time: {time_str}")

async def dispatch_daily_doctor_schedules(bot: Bot):
    """
    Every day at 08:00 AM, query each doctor's appointments for today via NestJS API
    and dispatch their schedule.
    """
    schedules = await api_client.get_daily_doctor_schedules()
    if not schedules:
        return

    for doc in schedules:
        doc_id = doc.get("doctorId")
        doc_name = doc.get("doctorName", "Shifokor")
        appts = doc.get("appointments", [])

        if appts:
            schedule_lines = []
            for idx, a in enumerate(appts, 1):
                p_name = a.get("patientName", "Bemor")
                t_str = a.get("time", "")
                notes = a.get("notes") or "Ko'rik"
                schedule_lines.append(f"{idx}. ⏰ <b>{t_str}</b> — {p_name} ({notes})")

            text = (
                f"☀️ <b>XAYRLI TONG, {doc_name}!</b>\n\n"
                f"📋 <b>Bugungi qabullaringiz jadvali:</b>\n"
                + "\n".join(schedule_lines)
                + f"\n\nJami: <b>{len(appts)} ta qabul</b>. Ish kuni unumli o'tsin!"
            )
            logger.info(f"[Doctor Daily Schedule 08:00 AM] Doctor {doc_id}:\n{text}")

def setup_scheduler(bot: Bot) -> AsyncIOScheduler:
    scheduler = AsyncIOScheduler(timezone=config.TIMEZONE)

    # Check 24h & 2h appointment reminders every 10 minutes
    scheduler.add_job(
        send_appointment_reminders,
        trigger="interval",
        minutes=10,
        args=[bot],
        id="check_appointment_reminders",
        replace_existing=True,
    )

    # Daily Doctor Schedule Dispatch at 08:00 AM
    scheduler.add_job(
        dispatch_daily_doctor_schedules,
        trigger="cron",
        hour=8,
        minute=0,
        args=[bot],
        id="daily_doctor_schedule_dispatch",
        replace_existing=True,
    )

    return scheduler
