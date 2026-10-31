from typing import List, Optional, Dict, Any
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import Invoice, Payment, PatientProfile, Appointment, DoctorProfile, InventoryItem, OdontogramRecord, User
from app.schemas import OwnerMetricsOut
from app.auth import get_current_user, require_role

router = APIRouter(prefix="/api/analytics", tags=["Owner CRM & Analytics"])

@router.get("/overview", response_model=OwnerMetricsOut)
async def get_owner_metrics(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
):
    # Total revenue from payments
    rev_stmt = select(func.coalesce(func.sum(Payment.amount), 0.0))
    rev_res = await db.execute(rev_stmt)
    total_revenue = rev_res.scalar_one()

    # Total debt
    debt_stmt = select(func.coalesce(func.sum(PatientProfile.total_debt), 0.0))
    debt_res = await db.execute(debt_stmt)
    total_debt = debt_res.scalar_one()

    # Active patients
    pat_count_stmt = select(func.count(PatientProfile.id))
    pat_res = await db.execute(pat_count_stmt)
    active_patients_count = pat_res.scalar_one()

    # Completed procedures
    proc_stmt = select(func.count(Appointment.id)).where(Appointment.status == "completed")
    proc_res = await db.execute(proc_stmt)
    completed_procedures_count = proc_res.scalar_one()

    # Low stock items
    low_stmt = select(func.count(InventoryItem.id)).where(InventoryItem.quantity <= InventoryItem.min_threshold)
    low_res = await db.execute(low_stmt)
    low_stock_items_count = low_res.scalar_one()

    # Doctor occupancy rate
    total_appts_stmt = select(func.count(Appointment.id))
    tot_res = await db.execute(total_appts_stmt)
    tot_appts = tot_res.scalar_one() or 1
    doctor_occupancy_rate = min(100.0, round((completed_procedures_count / tot_appts) * 100, 1))

    return OwnerMetricsOut(
        total_revenue=float(total_revenue),
        total_debt=float(total_debt),
        active_patients_count=int(active_patients_count),
        completed_procedures_count=int(completed_procedures_count),
        low_stock_items_count=int(low_stock_items_count),
        doctor_occupancy_rate=float(doctor_occupancy_rate),
    )

@router.get("/doctor-commissions")
async def get_doctor_commissions(
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
):
    # Fetch all doctors with user relations
    stmt = select(DoctorProfile).options(selectinload(DoctorProfile.user))
    res = await db.execute(stmt)
    doctors = res.scalars().all()

    commission_reports = []
    for doc in doctors:
        # Completed appointments
        appt_stmt = select(Appointment).where(
            and_(
                Appointment.doctor_id == doc.id,
                Appointment.status == "completed",
            )
        )
        if start_date:
            appt_stmt = appt_stmt.where(Appointment.start_time >= start_date)
        if end_date:
            appt_stmt = appt_stmt.where(Appointment.start_time <= end_date)

        appt_res = await db.execute(appt_stmt)
        completed = appt_res.scalars().all()

        completed_visits = len(completed)
        # Average revenue per completed appointment: 450,000 UZS if no invoice bound
        gross_procedure_revenue = completed_visits * 450000.0
        material_costs = round(gross_procedure_revenue * 0.10, 2) # 10% material deduction
        net_procedure_base = max(0.0, gross_procedure_revenue - material_costs)
        rate = doc.commission_rate or 40.0 # 30%-50%
        doctor_payout = round((net_procedure_base * rate) / 100.0, 2)
        clinic_net_profit = gross_procedure_revenue - doctor_payout - material_costs

        commission_reports.append({
            "doctor_id": doc.id,
            "doctor_name": doc.user.full_name if doc.user else f"Doctor #{doc.id[:4]}",
            "specialization": doc.specialization,
            "commission_rate_pct": rate,
            "completed_visits": completed_visits,
            "gross_revenue": gross_procedure_revenue,
            "material_deduction": material_costs,
            "doctor_payout": doctor_payout,
            "clinic_net_profit": clinic_net_profit,
        })

    return commission_reports
