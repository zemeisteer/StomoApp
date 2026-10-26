import { PrismaClient } from '@prisma/client';
import {
  classifyAppointmentRecord,
  getAppointmentTreatmentEnd,
  AppointmentTimeLike,
} from '../src/appointments/appointment-time.helper';

export interface MigrationOptions {
  dryRun: boolean;
  batchSize: number;
  limit: number;
}

export function parseArgs(argv: string[]): MigrationOptions {
  let dryRun = true; // Safe by default
  let batchSize = 100;
  let limit = 10000;

  for (const arg of argv) {
    if (arg === '--execute' || arg === '-e') {
      dryRun = false;
    } else if (arg === '--dry-run' || arg === '-d') {
      dryRun = true;
    } else if (arg.startsWith('--batch-size=')) {
      const val = parseInt(arg.split('=')[1], 10);
      if (!isNaN(val) && val > 0) batchSize = val;
    } else if (arg.startsWith('--limit=')) {
      const val = parseInt(arg.split('=')[1], 10);
      if (!isNaN(val) && val > 0) limit = val;
    }
  }

  return { dryRun, batchSize, limit };
}

export async function runTimeContractMigration(options: MigrationOptions, prismaClient?: PrismaClient) {
  const prisma = prismaClient || new PrismaClient();
  const startTime = Date.now();

  console.log('===============================================================');
  console.log('   DENTACARE: APPOINTMENT TIME CONTRACT BACKFILL & AUDIT');
  console.log('===============================================================');
  console.log(`Execution Mode : ${options.dryRun ? 'DRY-RUN (REPORT ONLY, NO WRITES)' : 'EXECUTE (MUTATION ACTIVE)'}`);
  console.log(`Batch Size     : ${options.batchSize}`);
  console.log(`Record Limit   : ${options.limit}`);

  const totalAppointments = await prisma.appointment.count();
  console.log(`Total Records in Database: ${totalAppointments}`);

  const appointments = await prisma.appointment.findMany({
    take: options.limit,
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      startTime: true,
      endTime: true,
      durationMinutes: true,
      bufferMinutes: true,
      status: true,
      overrunActive: true,
      overrunEstimatedEndTime: true,
      expiresAt: true,
      serviceName: true,
      patientId: true,
      doctorId: true,
      patient: { select: { fullName: true, phone: true } },
    },
  });

  const compliantRecords: string[] = [];
  const zeroBufferRecords: string[] = [];
  const legacyToMigrate: Array<{
    id: string;
    startTime: Date;
    currentEndTime: Date;
    proposedEndTime: Date;
    durationMinutes: number;
    bufferMinutes: number;
  }> = [];
  const ambiguousRecords: Array<{
    id: string;
    patientName: string;
    patientPhone: string;
    startTime: string;
    endTime: string;
    diffMinutes: number;
    durationMinutes: number;
    bufferMinutes: number;
    reason: string;
  }> = [];

  for (const appt of appointments) {
    const timeLike: AppointmentTimeLike = {
      id: appt.id,
      startTime: appt.startTime,
      endTime: appt.endTime,
      durationMinutes: appt.durationMinutes,
      bufferMinutes: appt.bufferMinutes,
      overrunActive: appt.overrunActive,
      overrunEstimatedEndTime: appt.overrunEstimatedEndTime,
      status: appt.status,
      expiresAt: appt.expiresAt,
    };

    const result = classifyAppointmentRecord(timeLike);

    switch (result.classification) {
      case 'TREATMENT_END':
        compliantRecords.push(appt.id);
        break;
      case 'ZERO_BUFFER':
        zeroBufferRecords.push(appt.id);
        break;
      case 'LEGACY_OCCUPIED_END': {
        const proposedEnd = getAppointmentTreatmentEnd(timeLike);
        legacyToMigrate.push({
          id: appt.id,
          startTime: appt.startTime,
          currentEndTime: appt.endTime,
          proposedEndTime: proposedEnd,
          durationMinutes: result.durationMinutes,
          bufferMinutes: result.bufferMinutes,
        });
        break;
      }
      case 'AMBIGUOUS': {
        ambiguousRecords.push({
          id: appt.id,
          patientName: appt.patient?.fullName || 'N/A',
          patientPhone: appt.patient?.phone || 'N/A',
          startTime: appt.startTime.toISOString(),
          endTime: appt.endTime.toISOString(),
          diffMinutes: result.diffMinutes,
          durationMinutes: result.durationMinutes,
          bufferMinutes: result.bufferMinutes,
          reason: `Timestamp difference (${result.diffMinutes}m) matches neither duration (${result.durationMinutes}m) nor duration+buffer (${result.durationMinutes + result.bufferMinutes}m)`,
        });
        break;
      }
    }
  }

  console.log('\n--- SCAN FINDINGS ---');
  console.log(`Already Compliant (Treatment-End) : ${compliantRecords.length}`);
  console.log(`Zero-Buffer Appointments          : ${zeroBufferRecords.length}`);
  console.log(`Legacy Occupied-End to Backfill   : ${legacyToMigrate.length}`);
  console.log(`Ambiguous Records (Preserved)     : ${ambiguousRecords.length}`);

  if (ambiguousRecords.length > 0) {
    console.log('\n[NOTICE] Ambiguous records detected. These are NOT modified and preserved for deliberate staff review:');
    console.table(ambiguousRecords.slice(0, 10));
    if (ambiguousRecords.length > 10) {
      console.log(`... and ${ambiguousRecords.length - 10} more ambiguous records.`);
    }
  }

  let migratedCount = 0;

  if (!options.dryRun && legacyToMigrate.length > 0) {
    console.log(`\nExecuting backfill in batches of ${options.batchSize}...`);

    for (let i = 0; i < legacyToMigrate.length; i += options.batchSize) {
      const batch = legacyToMigrate.slice(i, i + options.batchSize);

      await prisma.$transaction(async (tx) => {
        for (const item of batch) {
          await tx.appointment.update({
            where: { id: item.id },
            data: {
              endTime: item.proposedEndTime,
            },
          });
          migratedCount++;
        }

        // Record audit log entry for this batch
        await tx.auditLog.create({
          data: {
            action: 'appointment.time_contract_backfilled',
            entity: 'Appointment',
            details: {
              batchSize: batch.length,
              sampleIds: batch.slice(0, 5).map((b) => b.id),
              contract: 'TREATMENT_END',
            },
          },
        });
      });

      console.log(`Migrated ${migratedCount} / ${legacyToMigrate.length} legacy records...`);
    }

    console.log(`\n[SUCCESS] Backfill completed. Successfully updated ${migratedCount} records.`);
  } else if (options.dryRun && legacyToMigrate.length > 0) {
    console.log(`\n[DRY-RUN] ${legacyToMigrate.length} legacy records identified for migration. Re-run with --execute to apply.`);
  } else {
    console.log('\n[INFO] All records are already compliant or zero-buffer. Zero mutations needed.');
  }

  const durationMs = Date.now() - startTime;
  console.log(`\nExecution finished in ${durationMs}ms.\n`);

  return {
    scanned: appointments.length,
    compliant: compliantRecords.length,
    zeroBuffer: zeroBufferRecords.length,
    legacyEligible: legacyToMigrate.length,
    migrated: migratedCount,
    ambiguousCount: ambiguousRecords.length,
    ambiguous: ambiguousRecords,
    isDryRun: options.dryRun,
  };
}

// Direct execution CLI entrypoint
if (require.main === module) {
  const options = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();
  runTimeContractMigration(options, prisma)
    .catch((err) => {
      console.error('Fatal error during migration:', err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
