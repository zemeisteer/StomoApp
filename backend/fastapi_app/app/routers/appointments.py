from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import Appointment, PatientProfile, DoctorProfile, User
from app.schemas import AppointmentCreate, AppointmentUpdate, AppointmentOut
from app.auth import get_current_user, require_role

router = APIRouter(prefix="/api/appointments", tags=["Appointments"])

@router.post("", response_model=AppointmentOut, status_code=status.HTTP_201_CREATED)
async def create_appointment(
    payload: AppointmentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Calculate end_time
    start = payload.start_time
    if payload.end_time:
        end = payload.end_time
    else:
        end = start + timedelta(minutes=payload.duration_minutes)

    if end <= start:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Qabul tugash vaqti boshlanish vaqtidan kechroq bo'lishi shart",
        )

    # 1. Server-side conflict detection
    conflict_stmt = select(Appointment).where(
        and_(
            Appointment.doctor_id == payload.doctor_id,
            Appointment.status != "cancelled",
            Appointment.start_time < end,
            Appointment.end_time > start,
        )
    )
    conflict_res = await db.execute(conflict_stmt)
    existing_conflict = conflict_res.scalar_one_or_none()
    if existing_conflict:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Shifokor ushbu vaqt oralig'ida band ({existing_conflict.start_time.strftime('%H:%M')} - {existing_conflict.end_time.strftime('%H:%M')}). Iltimos, boshqa vaqtni tanlang.",
        )

    # Resolve patient_id
    patient_id = payload.patient_id
    if not patient_id:
        if current_user.role == "patient":
            # fetch patient profile
            stmt = select(PatientProfile).where(PatientProfile.user_id == current_user.id)
            res = await db.execute(stmt)
            profile = res.scalar_one_or_none()
            if not profile:
                profile = PatientProfile(user_id=current_user.id)
                db.add(profile)
                await db.flush()
            patient_id = profile.id
        else:
            # Receptionist/Owner creating for patient with phone
            if payload.patient_phone:
                stmt = select(User).where(User.phone == payload.patient_phone)
                res = await db.execute(stmt)
                pat_user = res.scalar_one_or_none()
                if not pat_user:
                    pat_user = User(
                        full_name=payload.patient_name or "Yangi Bemor",
                        phone=payload.patient_phone,
                        password_hash="quick_reg_placeholder",
                        role="patient",
                    )
                    db.add(pat_user)
                    await db.flush()
                
                stmt2 = select(PatientProfile).where(PatientProfile.user_id == pat_user.id)
                res2 = await db.execute(stmt2)
                p_prof = res2.scalar_one_or_none()
                if not p_prof:
                    p_prof = PatientProfile(user_id=pat_user.id)
                    db.add(p_prof)
                    await db.flush()
                patient_id = p_prof.id
            else:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Bemor ID yoki telefon raqami ko'rsatilishi shart",
                )

    appointment = Appointment(
        patient_id=patient_id,
        doctor_id=payload.doctor_id,
        start_time=start,
        end_time=end,
        status="scheduled",
        notes=payload.notes,
    )
    db.add(appointment)
    await db.commit()
    await db.refresh(appointment)

    # Fetch with relations for clean response
    stmt = (
        select(Appointment)
        .options(
            selectinload(Appointment.patient).selectinload(PatientProfile.user),
            selectinload(Appointment.doctor).selectinload(DoctorProfile.user),
        )
        .where(Appointment.id == appointment.id)
    )
    r = await db.execute(stmt)
    full_appt = r.scalar_one()

    return AppointmentOut(
        id=full_appt.id,
        patient_id=full_appt.patient_id,
        doctor_id=full_appt.doctor_id,
        start_time=full_appt.start_time,
        end_time=full_appt.end_time,
        status=full_appt.status,
        notes=full_appt.notes,
        created_at=full_appt.created_at,
        patient_name=full_appt.patient.user.full_name if full_appt.patient and full_appt.patient.user else None,
        patient_phone=full_appt.patient.user.phone if full_appt.patient and full_appt.patient.user else None,
        doctor_name=full_appt.doctor.user.full_name if full_appt.doctor and full_appt.doctor.user else None,
    )

@router.get("", response_model=List[AppointmentOut])
async def list_appointments(
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    doctor_id: Optional[str] = None,
    patient_id: Optional[str] = None,
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = (
        select(Appointment)
        .options(
            selectinload(Appointment.patient).selectinload(PatientProfile.user),
            selectinload(Appointment.doctor).selectinload(DoctorProfile.user),
        )
        .order_by(Appointment.start_time.asc())
    )

    filters = []
    if date_from:
        filters.append(Appointment.start_time >= date_from)
    if date_to:
        filters.append(Appointment.start_time <= date_to)
    if doctor_id:
        filters.append(Appointment.doctor_id == doctor_id)
    if patient_id:
        filters.append(Appointment.patient_id == patient_id)
    if status:
        filters.append(Appointment.status == status)

    if current_user.role == "patient":
        # scoped to patient's own profile
        p_stmt = select(PatientProfile).where(PatientProfile.user_id == current_user.id)
        p_res = await db.execute(p_stmt)
        p_prof = p_res.scalar_one_or_none()
        if p_prof:
            filters.append(Appointment.patient_id == p_prof.id)
        else:
            return []
    elif current_user.role == "dentist":
        d_stmt = select(DoctorProfile).where(DoctorProfile.user_id == current_user.id)
        d_res = await db.execute(d_stmt)
        d_prof = d_res.scalar_one_or_none()
        if d_prof:
            filters.append(Appointment.doctor_id == d_prof.id)

    if filters:
        stmt = stmt.where(and_(*filters))

    res = await db.execute(stmt)
    appts = res.scalars().all()

    return [
        AppointmentOut(
            id=a.id,
            patient_id=a.patient_id,
            doctor_id=a.doctor_id,
            start_time=a.start_time,
            end_time=a.end_time,
            status=a.status,
            notes=a.notes,
            created_at=a.created_at,
            patient_name=a.patient.user.full_name if a.patient and a.patient.user else None,
            patient_phone=a.patient.user.phone if a.patient and a.patient.user else None,
            doctor_name=a.doctor.user.full_name if a.doctor and a.doctor.user else None,
        )
        for a in appts
    ]

@router.patch("/{appointment_id}", response_model=AppointmentOut)
async def update_appointment_status(
    appointment_id: str,
    payload: AppointmentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = (
        select(Appointment)
        .options(
            selectinload(Appointment.patient).selectinload(PatientProfile.user),
            selectinload(Appointment.doctor).selectinload(DoctorProfile.user),
        )
        .where(Appointment.id == appointment_id)
    )
    res = await db.execute(stmt)
    appt = res.scalar_one_or_none()

    if not appt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Qabul topilmadi")

    if payload.status:
        appt.status = payload.status
    if payload.notes is not None:
        appt.notes = payload.notes
    if payload.start_time:
        appt.start_time = payload.start_time
    if payload.end_time:
        appt.end_time = payload.end_time

    await db.commit()
    await db.refresh(appt)

    return AppointmentOut(
        id=appt.id,
        patient_id=appt.patient_id,
        doctor_id=appt.doctor_id,
        start_time=appt.start_time,
        end_time=appt.end_time,
        status=appt.status,
        notes=appt.notes,
        created_at=appt.created_at,
        patient_name=appt.patient.user.full_name if appt.patient and appt.patient.user else None,
        patient_phone=appt.patient.user.phone if appt.patient and appt.patient.user else None,
        doctor_name=appt.doctor.user.full_name if appt.doctor and appt.doctor.user else None,
    )
