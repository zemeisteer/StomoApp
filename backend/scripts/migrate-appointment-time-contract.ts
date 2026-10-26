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
  cursor?: string;
}

export function parseArgs(argv: string[]): MigrationOptions {
  let dryRun = true; // Safe by default
  let batchSize = 100;
  let limit = 10000;
  let cursor: string | undefined = undefined;

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
    } else if (arg.startsWith('--cursor=')) {
      const val = arg.split('=')[1]?.trim();
      if (val) cursor = val;
    }
  }

  return { dryRun, batchSize, limit, cursor };
}

export interface AmbiguousRecordReport {
  id: string;
  doctorId: string;
  startTime: string;
  endTime: string;
  diffMinutes: number;
  durationMinutes: number | null;
  bufferMinutes: number;
  reason: string;
}

export async function runTimeContractMigration(options: MigrationOptions, prismaClient?: PrismaClient) {
  const prisma = prismaClient || new PrismaClient();
  const startTime = Date.now();

  console.log('===============================================================');
  console.log('   DENTACARE: APPOINTMENT TIME CONTRACT BACKFILL & AUDIT');
  console.log('===============================================================');
  console.log(`Execution Mode : ${options.dryRun ? 'DRY-RUN (REPORT ONLY, NO WRITES)' : 'EXECUTE (MUTATION ACTIVE)'}`);
  console.log(`Batch Size     : ${options.batchSize}`);
  console.log(`Scan Limit     : ${options.limit}`);
  if (options.cursor) {
    console.log(`Start Cursor   : ${options.cursor}`);
  }

  const totalAppointments = await prisma.appointment.count();
  console.log(`Total Records in Database: ${totalAppointments}`);

  // Stable cursor pagination ordered uniquely by primary key ID
  const whereClause: any = {};
  if (options.cursor) {
    whereClause.id = { gt: options.cursor };
  }

  const appointments = await prisma.appointment.findMany({
    where: whereClause,
    take: options.limit,
    orderBy: { id: 'asc' },
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
  const ambiguousRecords: AmbiguousRecordReport[] = [];

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
          durationMinutes: result.durationMinutes ?? appt.durationMinutes,
          bufferMinutes: result.bufferMinutes,
        });
        break;
      }
      case 'AMBIGUOUS': {
        ambiguousRecords.push({
          id: appt.id,
          doctorId: appt.doctorId,
          startTime: appt.startTime.toISOString(),
          endTime: appt.endTime.toISOString(),
          diffMinutes: result.diffMinutes,
          durationMinutes: result.durationMinutes,
          bufferMinutes: result.bufferMinutes,
          reason: result.reason || 'Noaniq vaqt formati',
        });
        break;
      }
    }
  }

  console.log('\n--- SCAN FINDINGS ---');
  console.log(`Scanned in this Run               : ${appointments.length}`);
  console.log(`Already Compliant (Treatment-End) : ${compliantRecords.length}`);
  console.log(`Zero-Buffer Appointments          : ${zeroBufferRecords.length}`);
  console.log(`Legacy Occupied-End to Backfill   : ${legacyToMigrate.length}`);
  console.log(`Ambiguous Records (Preserved)     : ${ambiguousRecords.length}`);

  if (ambiguousRecords.length > 0) {
    console.log('\n[NOTICE] Ambiguous records detected. These are NOT modified and preserved for deliberate staff review:');
    // Display report without patient PII
    console.table(ambiguousRecords.slice(0, 10));
    if (ambiguousRecords.length > 10) {
      console.log(`... and ${ambiguousRecords.length - 10} more ambiguous records.`);
    }
  }

  let migratedCount = 0;
  let skippedModifiedCount = 0;

  if (!options.dryRun && legacyToMigrate.length > 0) {
    console.log(`\nExecuting backfill in batches of ${options.batchSize}...`);

    for (let i = 0; i < legacyToMigrate.length; i += options.batchSize) {
      const batch = legacyToMigrate.slice(i, i + options.batchSize);
      let batchSuccessCount = 0;
      let batchSkippedCount = 0;

      await prisma.$transaction(async (tx) => {
        for (const item of batch) {
          // Revalidate under row-level lock FOR UPDATE
          const [current] = await tx.$queryRaw<Array<{
            id: string;
            startTime: Date;
            endTime: Date;
            durationMinutes: number;
            bufferMinutes: number;
          }>>`
            SELECT id, "start_time" as "startTime", "end_time" as "endTime",
                   "duration_minutes" as "durationMinutes", "buffer_minutes" as "bufferMinutes"
            FROM "appointments"
            WHERE id = ${item.id}
            FOR UPDATE;
          `;

          if (!current) {
            batchSkippedCount++;
            continue;
          }

          // Check if appointment was modified since inspection (e.g. rescheduled)
          const isModified =
            new Date(current.endTime).getTime() !== new Date(item.currentEndTime).getTime() ||
            new Date(current.startTime).getTime() !== new Date(item.startTime).getTime() ||
            current.durationMinutes !== item.durationMinutes;

          if (isModified) {
            console.log(`[RACE GUARD] Appointment ${item.id} was concurrently modified since initial inspection. Skipping.`);
            batchSkippedCount++;
            continue;
          }

          // Re-classify under lock to ensure eligibility holds
          const recheck = classifyAppointmentRecord({
            id: current.id,
            startTime: current.startTime,
            endTime: current.endTime,
            durationMinutes: current.durationMinutes,
            bufferMinutes: current.bufferMinutes,
          });

          if (recheck.classification !== 'LEGACY_OCCUPIED_END') {
            console.log(`[RACE GUARD] Appointment ${item.id} is no longer in LEGACY_OCCUPIED_END state (${recheck.classification}). Skipping.`);
            batchSkippedCount++;
            continue;
          }

          await tx.appointment.update({
            where: { id: item.id },
            data: {
              endTime: item.proposedEndTime,
            },
          });
          batchSuccessCount++;
        }

        // Record audit log entry for this batch if any records updated
        if (batchSuccessCount > 0) {
          await tx.auditLog.create({
            data: {
              action: 'appointment.time_contract_backfilled',
              entity: 'Appointment',
              details: {
                batchSize: batchSuccessCount,
                sampleIds: batch.slice(0, 5).map((b) => b.id),
                contract: 'TREATMENT_END',
              },
            },
          });
        }
      });

      // Increment counts ONLY after transaction successfully commits!
      migratedCount += batchSuccessCount;
      skippedModifiedCount += batchSkippedCount;

      console.log(`Migrated ${migratedCount} records (Skipped modified: ${skippedModifiedCount})...`);
    }

    console.log(`\n[SUCCESS] Backfill completed. Successfully updated ${migratedCount} records.`);
    if (skippedModifiedCount > 0) {
      console.log(`[NOTICE] Skipped ${skippedModifiedCount} records modified concurrently.`);
    }
  } else if (options.dryRun && legacyToMigrate.length > 0) {
    console.log(`\n[DRY-RUN] ${legacyToMigrate.length} legacy records identified for migration. Re-run with --execute to apply.`);
  } else {
    console.log('\n[INFO] All scanned records are already compliant or zero-buffer. Zero mutations needed.');
  }

  // Continuation checkpoint calculation
  const lastProcessedId = appointments.length > 0 ? appointments[appointments.length - 1].id : null;
  let remainingWork = 0;
  if (lastProcessedId) {
    remainingWork = await prisma.appointment.count({
      where: { id: { gt: lastProcessedId } },
    });
  }

  const nextCursor = remainingWork > 0 && lastProcessedId ? lastProcessedId : null;
  if (nextCursor) {
    console.log(`\n[CHECKPOINT] More records remain. Next continuation cursor: --cursor=${nextCursor} (${remainingWork} records remaining)`);
  } else {
    console.log('\n[CHECKPOINT] Scan completed through entire database. No remaining records.');
  }

  const durationMs = Date.now() - startTime;
  console.log(`Execution finished in ${durationMs}ms.\n`);

  return {
    scanned: appointments.length,
    compliant: compliantRecords.length,
    zeroBuffer: zeroBufferRecords.length,
    legacyEligible: legacyToMigrate.length,
    migrated: migratedCount,
    skippedModified: skippedModifiedCount,
    ambiguousCount: ambiguousRecords.length,
    ambiguous: ambiguousRecords,
    isDryRun: options.dryRun,
    nextCursor,
    remainingWork,
    hasMore: remainingWork > 0,
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
