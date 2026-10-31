from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models import User, PatientProfile, DoctorProfile
from app.schemas import UserRegister, UserLogin, Token, UserOut
from app.auth import get_password_hash, verify_password, create_access_token, get_current_user

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
async def register(payload: UserRegister, db: AsyncSession = Depends(get_db)):
    # Check phone uniqueness
    stmt = select(User).where(User.phone == payload.phone)
    res = await db.execute(stmt)
    existing = res.scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ushbu telefon raqamiga ega foydalanuvchi allaqachon mavjud",
        )

    hashed_pw = get_password_hash(payload.password)
    user = User(
        full_name=payload.full_name,
        phone=payload.phone,
        password_hash=hashed_pw,
        role=payload.role,
        is_active=True,
    )
    db.add(user)
    await db.flush()

    if payload.role == "patient":
        profile = PatientProfile(user_id=user.id)
        db.add(profile)
    elif payload.role == "dentist":
        profile = DoctorProfile(user_id=user.id, specialization="Stomatolog-terapevt", commission_rate=40.0)
        db.add(profile)

    await db.commit()
    await db.refresh(user)

    token = create_access_token({"sub": user.id, "role": user.role})
    return Token(
        access_token=token,
        token_type="bearer",
        role=user.role,
        user_id=user.id,
        full_name=user.full_name,
    )

@router.post("/login", response_model=Token)
async def login(payload: UserLogin, db: AsyncSession = Depends(get_db)):
    stmt = select(User).where(User.phone == payload.phone)
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()

    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Telefon raqami yoki parol noto'g'ri",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Foydalanuvchi hisobi bloklangan",
        )

    token = create_access_token({"sub": user.id, "role": user.role})
    return Token(
        access_token=token,
        token_type="bearer",
        role=user.role,
        user_id=user.id,
        full_name=user.full_name,
    )

@router.get("/me", response_model=UserOut)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user
