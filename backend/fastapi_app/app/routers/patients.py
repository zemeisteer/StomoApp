from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, and_
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import PatientProfile, User, OdontogramRecord, Invoice, Appointment
from app.schemas import PatientProfileOut, OdontogramOut, InvoiceOut, AppointmentOut
from app.auth import get_current_user, require_role

router = APIRouter(prefix="/api/patients", tags=["Patients"])

@router.get("", response_model=List[PatientProfileOut])
async def search_patients(
    search: Optional[str] = Query(None, description="Search by patient name or phone"),
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Search patients by name or phone, returning profiles with current debt.
    """
    stmt = (
        select(PatientProfile)
        .join(User, PatientProfile.user_id == User.id)
        .options(selectinload(PatientProfile.user))
        .order_by(User.full_name)
        .limit(limit)
    )

    if search:
        search_term = f"%{search}%"
        stmt = stmt.where(
            or_(
                User.full_name.ilike(search_term),
                User.phone.ilike(search_term),
            )
        )

    res = await db.execute(stmt)
    profiles = res.scalars().all()

    return [
        PatientProfileOut(
            id=p.id,
            user_id=p.user_id,
            birth_date=p.birth_date,
            gender=p.gender,
            allergies=p.allergies,
            chronic_conditions=p.chronic_conditions,
            medical_notes=p.medical_notes,
            total_debt=p.total_debt,
            full_name=p.user.full_name if p.user else None,
            phone=p.user.phone if p.user else None,
        )
        for p in profiles
    ]

@router.get("/{patient_id}/history")
async def get_patient_medical_history(
    patient_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get detailed medical history, appointments, and treatment timeline for a patient.
    """
    stmt = (
        select(PatientProfile)
        .options(
            selectinload(PatientProfile.user),
            selectinload(PatientProfile.appointments).selectinload(Appointment.doctor),
            selectinload(PatientProfile.odontogram_records),
            selectinload(PatientProfile.invoices),
        )
        .where(PatientProfile.id == patient_id)
    )
    res = await db.execute(stmt)
    patient = res.scalar_one_or_none()

    if not patient:
        raise HTTPException(status_code=404, detail="Bemor topilmadi / Patient not found")

    return {
        "id": patient.id,
        "full_name": patient.user.full_name if patient.user else None,
        "phone": patient.user.phone if patient.user else None,
        "birth_date": patient.birth_date,
        "gender": patient.gender,
        "allergies": patient.allergies,
        "chronic_conditions": patient.chronic_conditions,
        "medical_notes": patient.medical_notes,
        "total_debt": patient.total_debt,
        "appointments_count": len(patient.appointments),
        "procedures_count": len(patient.odontogram_records),
        "invoices_count": len(patient.invoices),
    }

@router.get("/{patient_id}/odontogram", response_model=List[OdontogramOut])
async def get_patient_odontogram_snapshot(
    patient_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get all odontogram tooth surface records for a patient.
    """
    stmt = (
        select(OdontogramRecord)
        .where(OdontogramRecord.patient_id == patient_id)
        .order_by(OdontogramRecord.tooth_fdi)
    )
    res = await db.execute(stmt)
    records = res.scalars().all()

    return [
        OdontogramOut(
            id=r.id,
            patient_id=r.patient_id,
            doctor_id=r.doctor_id,
            appointment_id=r.appointment_id,
            tooth_fdi=r.tooth_fdi,
            tooth_number_fdi=r.tooth_fdi,
            surface=r.surface,
            diagnosis=r.diagnosis,
            condition=r.diagnosis,
            procedure_name=r.procedure_name,
            price=r.price,
            status=r.status,
            created_at=r.created_at,
            updated_at=r.updated_at,
        )
        for r in records
    ]

@router.get("/{patient_id}/debt")
async def get_patient_debt_ledger(
    patient_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get patient's debt ledger and unpaid invoices.
    """
    stmt = (
        select(PatientProfile)
        .options(
            selectinload(PatientProfile.user),
            selectinload(PatientProfile.invoices).selectinload(Invoice.payments),
        )
        .where(PatientProfile.id == patient_id)
    )
    res = await db.execute(stmt)
    patient = res.scalar_one_or_none()

    if not patient:
        raise HTTPException(status_code=404, detail="Bemor topilmadi / Patient not found")

    unpaid_invoices = [inv for inv in patient.invoices if inv.debt_amount > 0]

    return {
        "patient_id": patient.id,
        "patient_name": patient.user.full_name if patient.user else None,
        "phone": patient.user.phone if patient.user else None,
        "total_debt": patient.total_debt,
        "unpaid_invoices": [
            {
                "id": inv.id,
                "total_amount": inv.total_amount,
                "paid_amount": inv.paid_amount,
                "debt_amount": inv.debt_amount,
                "created_at": inv.created_at,
            }
            for inv in unpaid_invoices
        ],
    }
