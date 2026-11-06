import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { PaymentsConfig } from './payments.config';
import { PaymeService } from './payme.service';
import { ClickService } from './click.service';
import { PaymentLinksController, PaymentProvidersController } from './payments.controller';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [PaymentProvidersController, PaymentLinksController],
  providers: [PaymentsConfig, PaymeService, ClickService],
  exports: [PaymentsConfig],
})
export class PaymentsModule {}
