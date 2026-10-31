from aiogram import Router, F
from aiogram.types import Message
from bot.config import config

router = Router()

@router.message(F.text == "📍 Klinika manzili")
async def show_location(message: Message):
    text = (
        f"📍 <b>{config.CLINIC_NAME}</b>\n\n"
        f"🏥 <b>Manzil:</b> Toshkent sh., Chilonzor tumani, Bunyodkor shox ko'chasi, 42-uy\n"
        f"🚇 <b>Mo'ljal:</b> Mirzo Ulug'bek metrosi\n"
        f"⏰ <b>Ish vaqti:</b> Dushanba - Shanba, 08:30 — 20:00\n\n"
        f"🗺 <a href='{config.CLINIC_LOCATION_URL}'>Google Xaritada ko'rish (Lokatsiya)</a>\n"
        f"📞 <b>Aloqa uchun:</b> {config.CLINIC_PHONE}"
    )
    await message.answer(text, parse_mode="HTML", disable_web_page_preview=False)

@router.message(F.text == "📞 Bog'lanish")
async def show_contacts(message: Message):
    text = (
        f"📞 <b>QABULXONA VA MA'LUMOT MARKAZI</b>\n\n"
        f"Qabulga yozilish, xizmat narxlari yoki shoshilinch savollar bo'yicha biz bilan bog'laning:\n\n"
        f"☎️ <b>Telefon:</b> {config.CLINIC_PHONE}\n"
        f"💬 <b>Telegram:</b> @dentacare_support\n"
        f"🌐 <b>Veb-sayt:</b> <a href='http://localhost:3000'>stomoapp.uz</a>\n\n"
        f"<i>Sog'lom tabassum — bizning oliy maqsadimiz!</i>"
    )
    await message.answer(text, parse_mode="HTML")
