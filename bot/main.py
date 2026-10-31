import asyncio
import logging
from aiogram import Bot, Dispatcher
from aiogram.enums import ParseMode
from aiogram.client.default import DefaultBotProperties

from bot.config import config
from bot.handlers import bot_router
from bot.services.scheduler import setup_scheduler

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

async def main():
    logger.info("Initializing StomoApp Telegram Bot (aiogram v3)...")
    
    bot = Bot(
        token=config.BOT_TOKEN,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )
    dp = Dispatcher()
    dp.include_router(bot_router)

    # Initialize APScheduler for automated reminders & daily schedules
    scheduler = setup_scheduler(bot)
    scheduler.start()
    logger.info("APScheduler started: 24h & 2h appointment reminders + 08:00 AM daily doctor schedules active.")

    try:
        logger.info("Starting Telegram Bot polling...")
        await dp.start_polling(bot)
    finally:
        scheduler.shutdown()
        await bot.session.close()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, SystemExit):
        logger.info("StomoApp Telegram Bot stopped.")
