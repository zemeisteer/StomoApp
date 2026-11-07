import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module';
import { ClinicalModule } from '../clinical/clinical.module';
import { PaymentsModule } from '../payments/payments.module';
import { PortalAuthService } from './portal-auth.service';
import { PortalSessionGuard } from './portal.guard';
import { PortalService } from './portal.service';
import { PortalController } from './portal.controller';

@Module({
  // Secret and audience are passed per call (portal-specific key), never the staff defaults
  imports: [PrismaModule, ClinicalModule, PaymentsModule, JwtModule.register({})],
  controllers: [PortalController],
  providers: [PortalAuthService, PortalSessionGuard, PortalService],
})
export class PortalModule {}
