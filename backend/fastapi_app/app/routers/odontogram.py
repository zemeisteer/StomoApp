from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from app.database import get_db
from app.models import OdontogramRecord, PatientProfile, Invoice, User
from app.schemas import OdontogramBulkUpsert, OdontogramOut
from app.auth import get_current_user, require_role

router = APIRouter(prefix="/api/odontogram", tags=["Odontogram"])

@router.get("/{patient_id}", response_model=List[OdontogramOut])
async def get_patient_odontogram(
    patient_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = (
        select(OdontogramRecord)
        .where(OdontogramRecord.patient_id == patient_id)
        .order_by(OdontogramRecord.tooth_number_fdi.asc())
    )
    res = await db.execute(stmt)
    records = res.scalars().all()
    return records

@router.post("/bulk", response_model=List[OdontogramOut])
async def bulk_save_odontogram(
    payload: OdontogramBulkUpsert,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["dentist", "receptionist", "owner"])),
):
    # Verify patient profile
    p_stmt = select(PatientProfile).where(PatientProfile.id == payload.patient_id)
    p_res = await db.execute(p_stmt)
    patient = p_res.scalar_one_or_none()
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Bemor profili topilmadi",
        )

    # Fetch existing records
    existing_stmt = select(OdontogramRecord).where(OdontogramRecord.patient_id == payload.patient_id)
    existing_res = await db.execute(existing_stmt)
    existing_map = {rec.tooth_number_fdi: rec for rec in existing_res.scalars().all()}

    total_active_cost = 0.0
    saved_records = []

    for item in payload.records:
        rec = existing_map.get(item.tooth_number_fdi)
        if rec:
            rec.surface = item.surface
            rec.condition = item.condition
            rec.procedure_name = item.procedure_name
            rec.price = item.price
            rec.status = item.status
            rec.doctor_id = payload.doctor_id or rec.doctor_id
            rec.updated_at = datetime.utcnow()
        else:
            rec = OdontogramRecord(
                patient_id=payload.patient_id,
                doctor_id=payload.doctor_id,
                tooth_number_fdi=item.tooth_number_fdi,
                surface=item.surface,
                condition=item.condition,
                procedure_name=item.procedure_name,
                price=item.price,
                status=item.status,
            )
            db.add(rec)

        if item.condition != "HEALTHY":
            total_active_cost += item.price
        saved_records.append(rec)

    # Synchronize invoice & debt for this patient
    inv_stmt = select(Invoice).where(
        and_(
            Invoice.patient_id == payload.patient_id,
            Invoice.payment_status != "paid",
        )
    ).order_by(Invoice.created_at.desc())
    inv_res = await db.execute(inv_stmt)
    active_inv = inv_res.scalar_one_or_none()

    if not active_inv:
        if total_active_cost > 0:
            active_inv = Invoice(
                patient_id=payload.patient_id,
                total_amount=total_active_cost,
                paid_amount=0.0,
                debt_amount=total_active_cost,
                payment_status="pending",
            )
            db.add(active_inv)
    else:
        active_inv.total_amount = total_active_cost
        active_inv.debt_amount = max(0.0, total_active_cost - active_inv.paid_amount)
        if active_inv.debt_amount == 0.0:
            active_inv.payment_status = "paid"
        elif active_inv.paid_amount > 0:
            active_inv.payment_status = "partially_paid"
        else:
            active_inv.payment_status = "pending"

    # Update patient total debt
    patient.total_debt = active_inv.debt_amount if active_inv else 0.0

    await db.commit()
    for r in saved_records:
        await db.refresh(r)

    return saved_records
