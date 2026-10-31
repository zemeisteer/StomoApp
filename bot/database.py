import os
import sys
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker

# Add fastapi_app to sys.path to reuse existing SQLAlchemy models
current_dir = os.path.dirname(os.path.abspath(__file__))
fastapi_app_dir = os.path.abspath(os.path.join(current_dir, "..", "backend", "fastapi_app"))
if fastapi_app_dir not in sys.path:
    sys.path.insert(0, fastapi_app_dir)

from bot.config import config
from app.models import (
    User,
    PatientProfile,
    DoctorProfile,
    Appointment,
    OdontogramRecord,
    Invoice,
    Payment,
    InventoryItem,
)

engine = create_async_engine(
    config.DATABASE_URL,
    echo=False,
    future=True,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

async def get_bot_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
