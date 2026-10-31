from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import Invoice, Payment, PatientProfile, User
from app.schemas import InvoiceOut, PaymentCreate, PaymentOut, DebtRepayRequest, PatientProfileOut
from app.auth import get_current_user, require_role

router = APIRouter(prefix="/api/billing", tags=["Billing & Debts"])

@router.get("/invoices", response_model=List[InvoiceOut])
async def list_invoices(
    patient_id: Optional[str] = None,
    payment_status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = (
        select(Invoice)
        .options(
            selectinload(Invoice.patient).selectinload(PatientProfile.user),
            selectinload(Invoice.payments),
        )
        .order_by(Invoice.created_at.desc())
    )
    filters = []
    if patient_id:
        filters.append(Invoice.patient_id == patient_id)
    if payment_status:
        filters.append(Invoice.payment_status == payment_status)

    if current_user.role == "patient":
        p_stmt = select(PatientProfile).where(PatientProfile.user_id == current_user.id)
        p_res = await db.execute(p_stmt)
        p_prof = p_res.scalar_one_or_none()
        if p_prof:
            filters.append(Invoice.patient_id == p_prof.id)
        else:
            return []

    if filters:
        stmt = stmt.where(and_(*filters))

    res = await db.execute(stmt)
    invoices = res.scalars().all()

    return [
        InvoiceOut(
            id=inv.id,
            appointment_id=inv.appointment_id,
            patient_id=inv.patient_id,
            total_amount=inv.total_amount,
            paid_amount=inv.paid_amount,
            debt_amount=inv.debt_amount,
            payment_status=inv.payment_status,
            created_at=inv.created_at,
            patient_name=inv.patient.user.full_name if inv.patient and inv.patient.user else None,
            payments=[
                PaymentOut(
                    id=p.id,
                    invoice_id=p.invoice_id,
                    patient_id=p.patient_id,
                    amount=p.amount,
                    payment_method=p.payment_method,
                    notes=p.notes,
                    created_at=p.created_at,
                )
                for p in inv.payments
            ],
        )
        for inv in invoices
    ]

@router.post("/payments", response_model=PaymentOut)
async def record_payment(
    payload: PaymentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["receptionist", "owner"])),
):
    # Verify invoice if provided
    invoice = None
    if payload.invoice_id:
        stmt = select(Invoice).where(Invoice.id == payload.invoice_id)
        res = await db.execute(stmt)
        invoice = res.scalar_one_or_none()

    if invoice:
        invoice.paid_amount += payload.amount
        invoice.debt_amount = max(0.0, invoice.total_amount - invoice.paid_amount)
        if invoice.debt_amount == 0.0:
            invoice.payment_status = "paid"
        else:
            invoice.payment_status = "partially_paid"

    # Update patient debt balance
    p_stmt = select(PatientProfile).where(PatientProfile.id == payload.patient_id)
    p_res = await db.execute(p_stmt)
    patient = p_res.scalar_one_or_none()
    if patient:
        patient.total_debt = max(0.0, patient.total_debt - payload.amount)

    payment = Payment(
        invoice_id=payload.invoice_id,
        patient_id=payload.patient_id,
        amount=payload.amount,
        payment_method=payload.payment_method,
        notes=payload.notes,
    )
    db.add(payment)
    await db.commit()
    await db.refresh(payment)

    return PaymentOut(
        id=payment.id,
        invoice_id=payment.invoice_id,
        patient_id=payment.patient_id,
        amount=payment.amount,
        payment_method=payment.payment_method,
        notes=payment.notes,
        created_at=payment.created_at,
    )

@router.get("/debts", response_model=List[PatientProfileOut])
async def list_debtors(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["receptionist", "owner"])),
):
    stmt = (
        select(PatientProfile)
        .options(selectinload(PatientProfile.user))
        .where(PatientProfile.total_debt > 0)
        .order_by(PatientProfile.total_debt.desc())
    )
    res = await db.execute(stmt)
    debtors = res.scalars().all()

    return [
        PatientProfileOut(
            id=p.id,
            user_id=p.user_id,
            birth_date=p.birth_date,
            allergies=p.allergies,
            medical_notes=p.medical_notes,
            total_debt=p.total_debt,
            full_name=p.user.full_name if p.user else None,
            phone=p.user.phone if p.user else None,
        )
        for p in debtors
    ]

@router.post("/repay-debt", response_model=PaymentOut)
async def repay_patient_debt(
    payload: DebtRepayRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["receptionist", "owner"])),
):
    p_stmt = select(PatientProfile).where(PatientProfile.id == payload.patient_id)
    p_res = await db.execute(p_stmt)
    patient = p_res.scalar_one_or_none()

    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bemor topilmadi")

    # Find unpaid invoices
    inv_stmt = (
        select(Invoice)
        .where(
            and_(
                Invoice.patient_id == payload.patient_id,
                Invoice.debt_amount > 0,
            )
        )
        .order_by(Invoice.created_at.asc())
    )
    inv_res = await db.execute(inv_stmt)
    invoices = inv_res.scalars().all()

    remaining_amount = payload.amount
    primary_invoice_id = None

    for inv in invoices:
        if remaining_amount <= 0:
            break
        primary_invoice_id = inv.id
        deduct = min(inv.debt_amount, remaining_amount)
        inv.paid_amount += deduct
        inv.debt_amount -= deduct
        if inv.debt_amount == 0:
            inv.payment_status = "paid"
        else:
            inv.payment_status = "partially_paid"
        remaining_amount -= deduct

    patient.total_debt = max(0.0, patient.total_debt - payload.amount)

    payment = Payment(
        invoice_id=primary_invoice_id,
        patient_id=patient.id,
        amount=payload.amount,
        payment_method=payload.payment_method,
        notes=payload.notes or "Qarz to'lovi (Debt Repayment)",
    )
    db.add(payment)
    await db.commit()
    await db.refresh(payment)

    return PaymentOut(
        id=payment.id,
        invoice_id=payment.invoice_id,
        patient_id=payment.patient_id,
        amount=payment.amount,
        payment_method=payment.payment_method,
        notes=payment.notes,
        created_at=payment.created_at,
    )
