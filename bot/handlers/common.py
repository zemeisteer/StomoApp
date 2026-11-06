import html

from aiogram import Router, F
from aiogram.filters import Command
from aiogram.types import Message
from bot.config import config

router = Router()


def _e(value) -> str:
    return html.escape(str(value or ""), quote=False)


@router.message(Command("myid"))
async def show_my_telegram_id(message: Message):
    """Lets staff (e.g. doctors) find the ID the clinic owner links to their account."""
    await message.answer(
        f"🆔 Sizning Telegram ID raqamingiz: <code>{message.from_user.id}</code>\n\n"
        "Shifokor bo'lsangiz, shu raqamni klinika egasiga yuboring: u admin paneldagi "
        "\"Xodimlar\" bo'limida akkauntingizga biriktiradi va har kuni ertalab "
        "o'z qabullaringiz jadvalini shu yerda olasiz.",
        parse_mode="HTML",
    )


@router.message(F.text == "📍 Klinika manzili")
async def show_location(message: Message):
    lines = [f"📍 <b>{_e(config.CLINIC_NAME)}</b>\n"]
    if config.CLINIC_ADDRESS:
        lines.append(f"🏥 <b>Manzil:</b> {_e(config.CLINIC_ADDRESS)}")
    if config.CLINIC_LANDMARK:
        lines.append(f"🚇 <b>Mo'ljal:</b> {_e(config.CLINIC_LANDMARK)}")
    if config.CLINIC_WORKING_HOURS:
        lines.append(f"⏰ <b>Ish vaqti:</b> {_e(config.CLINIC_WORKING_HOURS)}")
    lines.append("")
    if config.CLINIC_LOCATION_URL:
        lines.append(f"🗺 <a href=\"{html.escape(config.CLINIC_LOCATION_URL)}\">Xaritada ko'rish</a>")
    if config.CLINIC_PHONE:
        lines.append(f"📞 <b>Aloqa uchun:</b> {_e(config.CLINIC_PHONE)}")
    await message.answer("\n".join(lines), parse_mode="HTML", disable_web_page_preview=False)


@router.message(F.text == "📞 Bog'lanish")
async def show_contacts(message: Message):
    lines = [
        "📞 <b>QABULXONA VA MA'LUMOT MARKAZI</b>\n",
        "Qabulga yozilish, xizmat narxlari yoki shoshilinch savollar bo'yicha biz bilan bog'laning:\n",
    ]
    if config.CLINIC_PHONE:
        lines.append(f"☎️ <b>Telefon:</b> {_e(config.CLINIC_PHONE)}")
    if config.CLINIC_TELEGRAM_SUPPORT:
        lines.append(f"💬 <b>Telegram:</b> {_e(config.CLINIC_TELEGRAM_SUPPORT)}")
    if config.CLINIC_WEBSITE:
        site = html.escape(config.CLINIC_WEBSITE)
        lines.append(f"🌐 <b>Veb-sayt:</b> <a href=\"{site}\">{site}</a>")
    lines.append("\n<i>Sog'lom tabassum — bizning oliy maqsadimiz!</i>")
    await message.answer("\n".join(lines), parse_mode="HTML")
