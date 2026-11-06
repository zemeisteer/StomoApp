import html
import logging
from aiogram import Bot
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from bot.config import config
from bot.api_client import api_client

logger = logging.getLogger(__name__)


def _e(value) -> str:
    """Escape user/DB-provided text for Telegram HTML parse mode."""
    return html.escape(str(value or ""), quote=False)


def build_reminder_text(rem: dict) -> str:
    return (
        f"⏰ <b>ESLATMA: ERTAGA QABULINGIZ BOR</b>\n\n"
        f"Hurmatli {_e(rem.get('patientName') or 'Bemor')},\n"
        f"Siz <b>{_e(rem.get('dateStr'))}</b> kuni soat <b>{_e(rem.get('timeStr'))}</b> da "
        f"<b>{_e(rem.get('doctorName') or 'Shifokor')}</b> qabuliga yozilgansiz.\n\n"
        f"📍 <b>Klinika manzili:</b> <a href=\"{html.escape(config.CLINIC_LOCATION_URL)}\">Xaritada ko'rish</a>\n"
        f"📞 <b>Telefon:</b> {_e(config.CLINIC_PHONE)}\n\n"
        f"<i>Kela olmasangiz, \"📅 Qabullarim\" bo'limidan qabulni bekor qilishingiz mumkin.</i>"
    )


def build_daily_digest_text(date_str: str, doctors: list) -> str:
    lines = [f"☀️ <b>BUGUNGI QABULLAR JADVALI — {_e(date_str)}</b>\n"]
    total = 0
    for doc in doctors:
        appts = doc.get("appointments", [])
        if not appts:
            continue
        total += len(appts)
        lines.append(f"👨‍⚕️ <b>{_e(doc.get('doctorName') or 'Shifokor')}</b> — {len(appts)} ta qabul")
        for a in appts:
            service = f" — {_e(a.get('serviceName'))}" if a.get("serviceName") else ""
            lines.append(f"   ⏰ {_e(a.get('time'))}{service}")
        lines.append("")
    lines.append(f"Jami: <b>{total} ta qabul</b>. Batafsil ma'lumot admin paneldagi kalendarda.")
    return "\n".join(lines)


async def send_appointment_reminders(bot: Bot):
    """
    Sends 24h Telegram reminders to patients linked to the bot.
    The 2h reminder is sent by the backend outbox over SMS/email, so it is not
    duplicated here. The backend claim endpoint returns each reminder only once.
    """
    reminders = await api_client.claim_reminders()
    for rem in reminders:
        chat_id = rem.get("telegramUserId")
        job_id = rem.get("jobId")
        if not chat_id:
            continue
        try:
            await bot.send_message(
                chat_id=int(chat_id) if str(chat_id).lstrip("-").isdigit() else chat_id,
                text=build_reminder_text(rem),
                parse_mode="HTML",
                disable_web_page_preview=True,
            )
            logger.info(f"[Reminder 24h sent] appointment={rem.get('id')}")
        except Exception as e:
            # Typical causes: patient blocked the bot, or chat no longer exists.
            logger.warning(f"[Reminder 24h failed] appointment={rem.get('id')}: {e}")
            if job_id:
                await api_client.report_job_failure(job_id, str(e))


async def dispatch_daily_doctor_schedules(bot: Bot):
    """
    Every day at 08:00 (clinic timezone) posts today's schedule per doctor to the
    staff group. Doctors have no Telegram link in the system, so the staff group
    is the delivery target. The backend claim guarantees one digest per day even
    across bot restarts.
    """
    if not config.STAFF_GROUP_CHAT_ID:
        logger.info("STAFF_GROUP_CHAT_ID not set; skipping daily schedule digest")
        return

    claim = await api_client.claim_daily_schedule_digest(str(config.STAFF_GROUP_CHAT_ID))
    if not claim or not claim.get("claimed"):
        return

    doctors = claim.get("doctors") or []
    if not doctors:
        logger.info(f"[Daily schedule] No appointments for {claim.get('date')}")
        return

    try:
        await bot.send_message(
            chat_id=config.STAFF_GROUP_CHAT_ID,
            text=build_daily_digest_text(claim.get("date", ""), doctors),
            parse_mode="HTML",
        )
        logger.info(f"[Daily schedule sent] date={claim.get('date')} doctors={len(doctors)}")
    except Exception as e:
        logger.warning(f"[Daily schedule failed] {e}")
        if claim.get("jobId"):
            await api_client.report_job_failure(claim["jobId"], str(e))


def setup_scheduler(bot: Bot) -> AsyncIOScheduler:
    scheduler = AsyncIOScheduler(timezone=config.TIMEZONE)

    # Claim and send due 24h reminders every 10 minutes
    scheduler.add_job(
        send_appointment_reminders,
        trigger="interval",
        minutes=10,
        args=[bot],
        id="check_appointment_reminders",
        replace_existing=True,
    )

    # Daily staff schedule digest at 08:00 clinic time
    scheduler.add_job(
        dispatch_daily_doctor_schedules,
        trigger="cron",
        hour=8,
        minute=0,
        args=[bot],
        id="daily_doctor_schedule_dispatch",
        replace_existing=True,
        misfire_grace_time=3600,
    )

    return scheduler
