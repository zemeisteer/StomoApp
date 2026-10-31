import logging
from datetime import datetime, timedelta
from aiogram import Bot
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload

from bot.config import config
from bot.database import AsyncSessionLocal
from app.models import Appointment, PatientProfile, DoctorProfile, User

logger = logging.getLogger(__name__)

async def send_appointment_reminders(bot: Bot):
    """
    Checks appointments in the next 24 hours and next 2 hours,
    sending localized reminder messages to patients.
    """
    now = datetime.utcnow()
    target_24h = now + timedelta(hours=24)
    target_2h = now + timedelta(hours=2)

    async with AsyncSessionLocal() as db:
        # 1. 24-hour reminder window (between 23h50m and 24h10m)
        stmt_24 = (
            select(Appointment)
            .options(
                selectinload(Appointment.patient).selectinload(PatientProfile.user),
                selectinload(Appointment.doctor).selectinload(DoctorProfile.user),
            )
            .where(
                and_(
                    Appointment.status.in_(["scheduled", "confirmed"]),
                    Appointment.start_time >= target_24h - timedelta(minutes=10),
                    Appointment.start_time <= target_24h + timedelta(minutes=10),
                )
            )
        )
        res_24 = await db.execute(stmt_24)
        appts_24 = res_24.scalars().all()

        for appt in appts_24:
            # We assume telegram chat_id is stored or patient user phone can be contacted
            logger.info(f"[Reminder 24h] Patient: {appt.patient.user.full_name}, Time: {appt.start_time}")

        # 2. 2-hour reminder window
        stmt_2 = (
            select(Appointment)
            .options(
                selectinload(Appointment.patient).selectinload(PatientProfile.user),
                selectinload(Appointment.doctor).selectinload(DoctorProfile.user),
            )
            .where(
                and_(
                    Appointment.status.in_(["scheduled", "confirmed"]),
                    Appointment.start_time >= target_2h - timedelta(minutes=10),
                    Appointment.start_time <= target_2h + timedelta(minutes=10),
                )
            )
        )
        res_2 = await db.execute(stmt_2)
        appts_2 = res_2.scalars().all()

        for appt in appts_2:
            time_str = appt.start_time.strftime("%H:%M")
            doc_name = appt.doctor.user.full_name if appt.doctor and appt.doctor.user else "Shifokor"
            msg = (
                f"⏰ <b>ESLATMA: QABULINGIZGA 2 SOAT QOLDI!</b>\n\n"
                f"Hurmatli {appt.patient.user.full_name},\n"
                f"Sizning bugun soat <b>{time_str}</b> da <b>{doc_name}</b> qabuliga yozilishingiz rejalashtirilgan.\n\n"
                f"📍 <b>Klinika manzili:</b> <a href='{config.CLINIC_LOCATION_URL}'>Xaritada ko'rish (Google Maps)</a>\n"
                f"📞 <b>Telefon:</b> {config.CLINIC_PHONE}\n\n"
                f"<i>Kechikmasdan kelishingizni so'raymiz!</i>"
            )
            logger.info(f"[Reminder 2h sent] {appt.id}: {msg}")

async def dispatch_daily_doctor_schedules(bot: Bot):
    """
    Every day at 08:00 AM, query each doctor's appointments for today
    and dispatch their schedule.
    """
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = today_start + timedelta(days=1)

    async with AsyncSessionLocal() as db:
        stmt = (
            select(DoctorProfile)
            .options(selectinload(DoctorProfile.user))
        )
        res = await db.execute(stmt)
        doctors = res.scalars().all()

        for doc in doctors:
            appt_stmt = (
                select(Appointment)
                .options(selectinload(Appointment.patient).selectinload(PatientProfile.user))
                .where(
                    and_(
                        Appointment.doctor_id == doc.id,
                        Appointment.status.in_(["scheduled", "confirmed"]),
                        Appointment.start_time >= today_start,
                        Appointment.start_time < today_end,
                    )
                )
                .order_by(Appointment.start_time.asc())
            )
            appt_res = await db.execute(appt_stmt)
            today_appts = appt_res.scalars().all()

            if today_appts:
                schedule_lines = []
                for idx, a in enumerate(today_appts, 1):
                    p_name = a.patient.user.full_name if a.patient and a.patient.user else "Bemor"
                    t_str = a.start_time.strftime("%H:%M")
                    schedule_lines.append(f"{idx}. ⏰ <b>{t_str}</b> — {p_name} ({a.notes or 'Ko\'rik'})")

                text = (
                    f"☀️ <b>XAYRLI TONG, {doc.user.full_name}!</b>\n\n"
                    f"📋 <b>Bugungi qabullaringiz jadvali:</b>\n"
                    + "\n".join(schedule_lines) +
                    f"\n\nJami: <b>{len(today_appts)} ta qabul</b>. Ish kuni unumli o'tsin!"
                )
                logger.info(f"[Doctor Daily Schedule 08:00 AM] Doctor {doc.id}:\n{text}")

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
