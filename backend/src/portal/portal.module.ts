import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ClinicalModule } from '../clinical/clinical.module';
import { PaymentsModule } from '../payments/payments.module';
import { PortalAuthService } from './portal-auth.service';
import { PortalSessionGuard } from './portal.guard';
import { PortalService } from './portal.service';
import { PortalController } from './portal.controller';

@Module({
  imports: [PrismaModule, ClinicalModule, PaymentsModule],
  controllers: [PortalController],
  providers: [PortalAuthService, PortalSessionGuard, PortalService],
})
export class PortalModule {}
