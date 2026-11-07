import html
import logging
from aiogram import Bot
from bot.config import config

logger = logging.getLogger(__name__)

# Staff group policy (same as the backend's staff_new_booking alert): messages to
# the shared staff Telegram group carry no patient name or phone. Staff look up
# details in the authenticated admin panel.
#
# New bookings are announced by the backend outbox (staff_new_booking), which
# runs for every booking channel including this bot, so the bot does not send
# its own new-booking alert.


async def notify_staff_cancellation(
    bot: Bot,
    doctor_name: str,
    date_str: str,
    time_str: str,
):
    text = (
        f"❌ <b>QABUL BEKOR QILINDI (Telegram bot)</b>\n\n"
        f"👨‍⚕️ <b>Shifokor:</b> {html.escape(doctor_name or 'Shifokor', quote=False)}\n"
        f"📅 <b>Sana:</b> {html.escape(date_str or '', quote=False)}\n"
        f"⏰ <b>Vaqt:</b> {html.escape(time_str or '', quote=False)}\n\n"
        f"<i>Ushbu vaqt oralig'i qayta bo'shatildi. Batafsil — admin paneldagi kalendarda.</i>"
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
