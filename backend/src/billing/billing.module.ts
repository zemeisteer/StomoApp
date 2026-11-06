import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { CashierService } from './cashier.service';
import { CashierController } from './cashier.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [BillingController, CashierController],
  providers: [BillingService, CashierService],
  exports: [BillingService],
})
export class BillingModule {}

