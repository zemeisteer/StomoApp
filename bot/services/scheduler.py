import html
import logging
from aiogram import Bot
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from bot.config import config
from bot.api_client import api_client
from bot.i18n import t, norm_lang

logger = logging.getLogger(__name__)


def _e(value) -> str:
    """Escape user/DB-provided text for Telegram HTML parse mode."""
    return html.escape(str(value or ""), quote=False)


def build_reminder_text(rem: dict) -> str:
    """Patient reminder in the patient's saved language, with the booked branch's details."""
    lang = norm_lang(rem.get("lang"))
    ru = lang == "ru"
    doctor = (rem.get("doctorNameRu") if ru else None) or rem.get("doctorName") or ""
    branch_name = (rem.get("branchNameRu") if ru else None) or rem.get("branchName")
    address = (rem.get("branchAddressRu") if ru else None) or rem.get("branchAddress")
    branch_lines = []
    if branch_name or address:
        branch_lines.append(t(lang, "branch_block", name=_e(branch_name), address=_e(address)))
    map_url = rem.get("branchMapUrl") or config.CLINIC_LOCATION_URL
    if map_url:
        branch_lines.append(t(lang, "map", url=html.escape(map_url)))
    phone = rem.get("branchPhone") or config.CLINIC_PHONE
    if phone:
        branch_lines.append(t(lang, "phone", phone=_e(phone)))
    return t(
        lang,
        "reminder_24h",
        patient=_e(rem.get("patientName")),
        date=_e(rem.get("dateStr")),
        time=_e(rem.get("timeStr")),
        doctor=_e(doctor),
        branch=("\n" + "\n".join(branch_lines)) if branch_lines else "",
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


def build_doctor_schedule_text(item: dict) -> str:
    appts = item.get("appointments", [])
    lines = [
        f"☀️ <b>XAYRLI TONG, {_e(item.get('doctorName') or 'Shifokor')}!</b>\n",
        f"📋 <b>Bugungi qabullaringiz ({_e(item.get('date'))}):</b>",
    ]
    for idx, a in enumerate(appts, 1):
        service = f" ({_e(a.get('serviceName'))})" if a.get("serviceName") else ""
        lines.append(f"{idx}. ⏰ <b>{_e(a.get('time'))}</b> — {_e(a.get('patientName') or 'Bemor')}{service}")
    lines.append(f"\nJami: <b>{len(appts)} ta qabul</b>. Ish kuni unumli o'tsin!")
    return "\n".join(lines)


def _chat_id(value):
    return int(value) if str(value).lstrip("-").isdigit() else value


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
                chat_id=_chat_id(chat_id),
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


async def dispatch_doctor_personal_schedules(bot: Bot):
    """Sends each doctor with a linked Telegram chat their own schedule for today."""
    items = await api_client.claim_doctor_daily_schedules()
    for item in items:
        try:
            await bot.send_message(
                chat_id=_chat_id(item.get("telegramUserId")),
                text=build_doctor_schedule_text(item),
                parse_mode="HTML",
            )
            logger.info(f"[Doctor schedule sent] date={item.get('date')} count={len(item.get('appointments', []))}")
        except Exception as e:
            logger.warning(f"[Doctor schedule failed] {e}")
            if item.get("jobId"):
                await api_client.report_job_failure(item["jobId"], str(e))


async def dispatch_daily_doctor_schedules(bot: Bot):
    """
    Every day at 08:00 (clinic timezone):
      1. each doctor whose staff account has a Telegram ID gets their own schedule
         (with patient names) in a private chat;
      2. the staff group gets an overview of all doctors (no patient names).
    Backend claims guarantee one message per recipient per day, even across restarts.
    """
    await dispatch_doctor_personal_schedules(bot)

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
