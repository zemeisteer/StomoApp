from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app.config import settings
from app.database import engine, Base, AsyncSessionLocal
from app.models import User, DoctorProfile, PatientProfile, InventoryItem
from app.auth import get_password_hash
from app.routers import auth, appointments, odontogram, billing, inventory, analytics

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize DB schema
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Seed baseline fixtures if empty
    async with AsyncSessionLocal() as db:
        stmt = select(User).limit(1)
        res = await db.execute(stmt)
        first_user = res.scalar_one_or_none()

        if not first_user:
            # 1. Owner
            owner = User(
                full_name="Dr. Alisher Vohidov (Klinika Egasi)",
                phone="+998901234567",
                password_hash=get_password_hash("owner1234"),
                role="owner",
            )
            # 2. Receptionist
            receptionist = User(
                full_name="Malika Karimova (Administrator)",
                phone="+998902345678",
                password_hash=get_password_hash("reception1234"),
                role="receptionist",
            )
            # 3. Dentist
            dentist_user = User(
                full_name="Dr. Jasur Mansurov",
                phone="+998903456789",
                password_hash=get_password_hash("dentist1234"),
                role="dentist",
            )
            db.add_all([owner, receptionist, dentist_user])
            await db.flush()

            # Doctor Profile
            doc_prof = DoctorProfile(
                user_id=dentist_user.id,
                specialization="Stomatolog-terapevt / Implantolog",
                commission_rate=45.0,
            )
            # Patient Profile
            patient_user = User(
                full_name="Aziz Rahimov",
                phone="+998909876543",
                password_hash=get_password_hash("patient1234"),
                role="patient",
            )
            db.add_all([doc_prof, patient_user])
            await db.flush()

            pat_prof = PatientProfile(
                user_id=patient_user.id,
                total_debt=1850000.0,
            )
            db.add(pat_prof)

            # Consumables Inventory Items
            inv_items = [
                InventoryItem(name="Ubistesin Forte 4% (Karpula)", category="anesthetic", quantity=8, unit="karpula", min_threshold=15, cost_per_unit=12000),
                InventoryItem(name="Septanest 1:100 000", category="anesthetic", quantity=25, unit="karpula", min_threshold=10, cost_per_unit=14000),
                InventoryItem(name="Filtek Z250 Fotopolimer A2 (Shprits)", category="composite", quantity=4, unit="shprits", min_threshold=8, cost_per_unit=320000),
                InventoryItem(name="Osstem TS III Titan Implantat", category="implant", quantity=3, unit="dona", min_threshold=5, cost_per_unit=1250000),
                InventoryItem(name="ProTaper Gold Endo Fayllar F1-F3", category="endo", quantity=12, unit="komplekt", min_threshold=6, cost_per_unit=180000),
                InventoryItem(name="Tibbiy steril nitril qo'lqoplar M", category="consumable", quantity=45, unit="juft", min_threshold=100, cost_per_unit=2500),
            ]
            db.add_all(inv_items)
            await db.commit()

    yield

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="FastAPI 0.141+ Backend with PostgreSQL / Async SQLAlchemy 2.0 and RBAC for StomoApp Dental Clinic",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth.router)
app.include_router(appointments.router)
app.include_router(odontogram.router)
app.include_router(billing.router)
app.include_router(inventory.router)
app.include_router(analytics.router)

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "stomo_fastapi_backend",
        "version": settings.APP_VERSION,
        "database": "connected",
    }

@app.get("/")
async def root():
    return {
        "message": "Welcome to StomoApp Dental Clinic Management API",
        "docs": "/docs",
        "health": "/health",
    }
