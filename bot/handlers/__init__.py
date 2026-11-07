from aiogram import Router
from bot.handlers.start import router as start_router
from bot.handlers.patient import router as patient_router
from bot.handlers.booking import router as booking_router
from bot.handlers.common import router as common_router

bot_router = Router()
bot_router.include_router(start_router)
bot_router.include_router(patient_router)
bot_router.include_router(booking_router)
bot_router.include_router(common_router)
