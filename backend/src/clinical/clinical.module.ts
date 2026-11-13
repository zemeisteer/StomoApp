import { Module } from '@nestjs/common';
import { ClinicalController } from './clinical.controller';
import { ClinicalService } from './clinical.service';
import { TreatmentPlansService } from './treatment-plans.service';
import { PatientCardService } from './patient-card.service';
import { PublicTreatmentPlansController, TreatmentPlansController } from './treatment-plans.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [ClinicalController, TreatmentPlansController, PublicTreatmentPlansController],
  providers: [ClinicalService, TreatmentPlansService, PatientCardService],
  exports: [ClinicalService, TreatmentPlansService],
})
export class ClinicalModule {}

