from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models import InventoryItem, User
from app.schemas import InventoryItemCreate, InventoryItemUpdate, InventoryItemOut
from app.auth import get_current_user, require_role

router = APIRouter(prefix="/api/inventory", tags=["Inventory"])

@router.get("", response_model=List[InventoryItemOut])
async def list_inventory(
    low_stock_only: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["receptionist", "dentist", "owner"])),
):
    stmt = select(InventoryItem).order_by(InventoryItem.name.asc())
    if low_stock_only:
        stmt = stmt.where(InventoryItem.quantity <= InventoryItem.min_threshold)
    res = await db.execute(stmt)
    items = res.scalars().all()

    return [
        InventoryItemOut(
            id=i.id,
            name=i.name,
            category=i.category,
            quantity=i.quantity,
            unit=i.unit,
            min_threshold=i.min_threshold,
            cost_per_unit=i.cost_per_unit,
            is_low_stock=(i.quantity <= i.min_threshold),
            updated_at=i.updated_at,
        )
        for i in items
    ]

@router.post("", response_model=InventoryItemOut, status_code=status.HTTP_201_CREATED)
async def create_inventory_item(
    payload: InventoryItemCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
):
    item = InventoryItem(
        name=payload.name,
        category=payload.category,
        quantity=payload.quantity,
        unit=payload.unit,
        min_threshold=payload.min_threshold,
        cost_per_unit=payload.cost_per_unit,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)

    return InventoryItemOut(
        id=item.id,
        name=item.name,
        category=item.category,
        quantity=item.quantity,
        unit=item.unit,
        min_threshold=item.min_threshold,
        cost_per_unit=item.cost_per_unit,
        is_low_stock=(item.quantity <= item.min_threshold),
        updated_at=item.updated_at,
    )

@router.patch("/{item_id}", response_model=InventoryItemOut)
async def update_inventory_stock(
    item_id: str,
    payload: InventoryItemUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["receptionist", "owner"])),
):
    stmt = select(InventoryItem).where(InventoryItem.id == item_id)
    res = await db.execute(stmt)
    item = res.scalar_one_or_none()

    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mahsulot topilmadi")

    if payload.quantity_delta is not None:
        item.quantity = max(0, item.quantity + payload.quantity_delta)
    elif payload.quantity is not None:
        item.quantity = max(0, payload.quantity)

    if payload.min_threshold is not None:
        item.min_threshold = payload.min_threshold
    if payload.cost_per_unit is not None:
        item.cost_per_unit = payload.cost_per_unit

    item.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(item)

    return InventoryItemOut(
        id=item.id,
        name=item.name,
        category=item.category,
        quantity=item.quantity,
        unit=item.unit,
        min_threshold=item.min_threshold,
        cost_per_unit=item.cost_per_unit,
        is_low_stock=(item.quantity <= item.min_threshold),
        updated_at=item.updated_at,
    )
