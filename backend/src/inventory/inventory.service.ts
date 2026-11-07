import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { JwtPayload } from '../auth/auth.service';
import { CreateInventoryItemDto, RecordMovementDto, UpdateInventoryItemDto } from './dto/inventory.dto';

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async listItems() {
    return await this.prisma.inventoryItem.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async listMovements(id: string) {
    const item = await this.prisma.inventoryItem.findUnique({ where: { id }, select: { id: true } });
    if (!item) throw new NotFoundException('Ombor mahsuloti topilmadi');
    const rows = await this.prisma.inventoryMovement.findMany({
      where: { inventoryItemId: id },
      include: { performedBy: { select: { fullName: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map((m) => ({
      id: m.id,
      changeType: m.changeType,
      quantityDelta: m.quantityDelta,
      reason: m.reason,
      createdAt: m.createdAt,
      performedBy: m.performedBy ? m.performedBy.fullName || m.performedBy.email : null,
    }));
  }

  async updateItem(id: string, dto: UpdateInventoryItemDto, user: JwtPayload) {
    const existing = await this.prisma.inventoryItem.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Ombor mahsuloti topilmadi');
    const item = await this.prisma.inventoryItem.update({
      where: { id },
      data: {
        name: dto.name?.trim() || undefined,
        category: dto.category?.trim() || undefined,
        unit: dto.unit?.trim() || undefined,
        minThreshold: dto.minThreshold,
        unitCost: dto.unitCost,
      },
    });
    await this.auditService.log({ userId: user.sub, action: 'inventory.item_updated', entity: 'InventoryItem', entityId: id, details: { ...dto } });
    return item;
  }

  async createItem(dto: CreateInventoryItemDto, user: JwtPayload) {
    return await this.prisma.$transaction(async (tx) => {
      const item = await tx.inventoryItem.create({
        data: {
          name: dto.name,
          category: dto.category,
          quantity: dto.quantity,
          unit: dto.unit,
          minThreshold: dto.minThreshold,
          unitCost: dto.unitCost,
        },
      });

      if (dto.quantity > 0) {
        await tx.inventoryMovement.create({
          data: {
            inventoryItemId: item.id,
            changeType: 'RESTOCK',
            quantityDelta: dto.quantity,
            reason: 'Boshlang\'ich qoldiq',
            performedById: user.sub,
          },
        });
      }

      await this.auditService.logTransactional({
        tx,
        userId: user.sub,
        action: 'inventory.item_created',
        entity: 'InventoryItem',
        entityId: item.id,
        details: { name: item.name, quantity: item.quantity, category: item.category },
      });

      return item;
    });
  }

  async recordStockMovement(id: string, dto: RecordMovementDto, user: JwtPayload) {
    return await this.prisma.$transaction(async (tx) => {
      // 1. Row-level pessimistic lock inside transaction to eliminate race conditions
      const rows = await tx.$queryRaw<Array<{ id: string; quantity: number }>>`
        SELECT id, quantity FROM "inventory_items" WHERE id = ${id} FOR UPDATE;
      `;
      if (!rows || rows.length === 0) {
        throw new NotFoundException('Ombor mahsuloti topilmadi');
      }

      const item = rows[0];
      const newQuantity = item.quantity + dto.quantityDelta;
      if (newQuantity < 0) {
        throw new BadRequestException('Ombordagi qoldiq manfiy bo\'lishi mumkin emas');
      }

      const updated = await tx.inventoryItem.update({
        where: { id },
        data: { quantity: newQuantity },
      });

      await tx.inventoryMovement.create({
        data: {
          inventoryItemId: id,
          changeType: dto.changeType,
          quantityDelta: dto.quantityDelta,
          reason: dto.reason || null,
          performedById: user.sub,
        },
      });

      await this.auditService.logTransactional({
        tx,
        userId: user.sub,
        action: 'inventory.movement_recorded',
        entity: 'InventoryItem',
        entityId: id,
        details: {
          changeType: dto.changeType,
          delta: dto.quantityDelta,
          prevQty: item.quantity,
          newQty: newQuantity,
          reason: dto.reason,
        },
      });

      return updated;
    });
  }
}

