import { Controller, Get, Post, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.service';
import { StaffRole } from '@prisma/client';
import { CreateInventoryItemDto, RecordMovementDto, UpdateInventoryItemDto } from './dto/inventory.dto';

@Controller('admin/inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InventoryController {
  constructor(private readonly service: InventoryService) {}

  @Get()
  @Roles(StaffRole.OWNER, StaffRole.ADMIN, StaffRole.DOCTOR, StaffRole.RECEPTION)
  async listItems() {
    return this.service.listItems();
  }

  @Post()
  @Roles(StaffRole.OWNER, StaffRole.ADMIN)
  async createItem(
    @Body() dto: CreateInventoryItemDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.createItem(dto, user);
  }

  @Get(':id/movements')
  @Roles(StaffRole.OWNER, StaffRole.ADMIN, StaffRole.DOCTOR, StaffRole.RECEPTION)
  async movements(@Param('id') id: string) {
    return this.service.listMovements(id);
  }

  @Patch(':id')
  @Roles(StaffRole.OWNER, StaffRole.ADMIN)
  async updateItem(@Param('id') id: string, @Body() dto: UpdateInventoryItemDto, @CurrentUser() user: JwtPayload) {
    return this.service.updateItem(id, dto, user);
  }

  @Patch(':id/stock')
  @Roles(StaffRole.OWNER, StaffRole.ADMIN, StaffRole.DOCTOR)
  async recordMovement(
    @Param('id') id: string,
    @Body() dto: RecordMovementDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.recordStockMovement(id, dto, user);
  }
}

