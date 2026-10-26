import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { PrismaModule } from '../src/prisma/prisma.module';
import { AuditModule } from '../src/audit/audit.module';
import { NotificationsService } from '../src/notifications/notifications.service';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Dedicated Maintenance Module:
 * Does NOT import ScheduleModule.forRoot(), BullModule, or AppointmentsModule.
 * Guarantees zero cron job registration, zero queue consumers, and zero background worker intervals.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../.env'],
    }),
    PrismaModule,
    AuditModule,
  ],
  providers: [NotificationsService],
})
export class MaintenanceModule {}

export interface CliOptions {
  dryRun: boolean;
  batchSize: number;
  maxJobs: number;
  legacyCursor?: string | null;
  maxUpcomingAudit?: number;
  upcomingCursor?: string | null;
  databaseUrl?: string;
}

export function sanitizeDatabaseUrl(url?: string): string {
  if (!url) return 'undefined';
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      parsed.password = '****';
    }
    return parsed.toString();
  } catch {
    return url.replace(/:[^:@]+@/, ':****@');
  }
}

export function parseArgs(argv: string[]): CliOptions {
  let dryRun = false;
  let batchSize = 100;
  let maxJobs = 10000;
  let legacyCursor: string | null = null;
  let maxUpcomingAudit: number | undefined = undefined;
  let upcomingCursor: string | null = null;
  let databaseUrl: string | undefined = undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run' || arg === '-d') {
      dryRun = true;
    } else if (arg.startsWith('--batch-size=')) {
      const valStr = arg.slice('--batch-size='.length);
      const val = parseInt(valStr, 10);
      if (isNaN(val) || val < 1 || val > 500) {
        throw new Error(`Invalid --batch-size: must be an integer between 1 and 500 (received: "${valStr}")`);
      }
      batchSize = val;
    } else if (arg === '-b') {
      const next = argv[++i];
      if (!next) {
        throw new Error('Option -b requires an integer argument between 1 and 500');
      }
      const val = parseInt(next, 10);
      if (isNaN(val) || val < 1 || val > 500) {
        throw new Error(`Invalid -b value: must be an integer between 1 and 500 (received: "${next}")`);
      }
      batchSize = val;
    } else if (arg.startsWith('--max-jobs=')) {
      const valStr = arg.slice('--max-jobs='.length);
      const val = parseInt(valStr, 10);
      if (isNaN(val) || val < 1) {
        throw new Error(`Invalid --max-jobs: must be an integer >= 1 (received: "${valStr}")`);
      }
      maxJobs = val;
    } else if (arg.startsWith('--legacy-cursor=')) {
      const val = arg.slice('--legacy-cursor='.length).trim();
      legacyCursor = val || null;
    } else if (arg.startsWith('--max-upcoming=')) {
      const valStr = arg.slice('--max-upcoming='.length);
      const val = parseInt(valStr, 10);
      if (isNaN(val) || val < 1) {
        throw new Error(`Invalid --max-upcoming: must be an integer >= 1 (received: "${valStr}")`);
      }
      maxUpcomingAudit = val;
    } else if (arg.startsWith('--upcoming-cursor=')) {
      const val = arg.slice('--upcoming-cursor='.length).trim();
      upcomingCursor = val || null;
    } else if (arg.startsWith('--database-url=')) {
      const val = arg.slice('--database-url='.length);
      if (!val.trim()) {
        throw new Error('Option --database-url cannot be empty');
      }
      databaseUrl = val.trim();
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Usage: npx ts-node scripts/repair-reminders.ts [options]

Options:
  --dry-run, -d               Dry-run mode (read-only report, no database mutations)
  --batch-size=<N>, -b <N>    Batch size per iteration (1-500, default: 100)
  --max-jobs=<N>              Max legacy jobs to process (>= 1, default: 10000)
  --legacy-cursor=<ID>        Continuation cursor for legacy jobs phase
  --max-upcoming=<N>          Max upcoming appointments to audit (>= 1)
  --upcoming-cursor=<ID>      Continuation cursor for upcoming appointments audit phase
  --database-url=<URL>        Explicit database URL (credentials sanitized in logs)
  --help, -h                  Show this help message
      `);
      process.exit(0);
    } else {
      throw new Error(`Unknown option or argument: "${arg}". Use --help for usage details.`);
    }
  }

  return { dryRun, batchSize, maxJobs, legacyCursor, maxUpcomingAudit, upcomingCursor, databaseUrl };
}

export async function runMaintenanceCli(argv = process.argv.slice(2)): Promise<number> {
  let options: CliOptions;
  try {
    options = parseArgs(argv);
  } catch (err: any) {
    console.error(`[ARGUMENT ERROR] ${err.message}`);
    return 1;
  }

  const { dryRun, batchSize, maxJobs, legacyCursor, maxUpcomingAudit, upcomingCursor, databaseUrl } = options;

  if (databaseUrl) {
    process.env.DATABASE_URL = databaseUrl;
  }

  console.log('===============================================================');
  console.log('   DENTACARE: LEGACY REMINDER UPGRADE & REPAIR UTILITY');
  console.log('===============================================================');
  console.log(`Execution Mode : ${dryRun ? 'DRY-RUN (REPORT ONLY, NO MUTATIONS)' : 'LIVE UPGRADE (COMMITTING CHANGES)'}`);
  console.log(`Batch Size     : ${batchSize}`);
  console.log(`Max Job Cap    : ${maxJobs}`);
  if (legacyCursor) console.log(`Legacy Cursor  : ${legacyCursor}`);
  if (maxUpcomingAudit) console.log(`Max Upcoming   : ${maxUpcomingAudit}`);
  if (upcomingCursor) console.log(`Upcoming Cursor: ${upcomingCursor}`);
  if (databaseUrl) {
    console.log(`Database Target: ${sanitizeDatabaseUrl(databaseUrl)}`);
  }

  // Bootstrap dedicated MaintenanceModule without ScheduleModule or background workers
  const app = await NestFactory.createApplicationContext(MaintenanceModule, {
    logger: ['error', 'warn'],
  });

  try {
    const prisma = app.get(PrismaService);
    const notificationsService = app.get(NotificationsService);

    const [dbInfo] = await prisma.$queryRaw<Array<{ current_database: string }>>`SELECT current_database();`;
    const targetDb = dbInfo?.current_database || 'unknown';
    console.log(`Connected DB   : "${targetDb}"`);
    console.log('---------------------------------------------------------------');
    console.log('Maintenance Context Safeguards:');
    console.log('  * Zero scheduler timers or cron jobs registered.');
    console.log('  * Zero queue consumers or background workers running.');
    console.log('  * In-flight worker leases (< 5m) preserved.');
    console.log('  * Idempotent reruns guaranteed.');
    console.log('---------------------------------------------------------------');

    const startTime = Date.now();
    const result = await notificationsService.upgradeLegacyReminderJobs({
      dryRun,
      batchSize,
      maxJobs,
      legacyCursor,
      maxUpcomingAudit,
      upcomingCursor,
    });
    const durationMs = Date.now() - startTime;

    console.log('\n===============================================================');
    console.log('                     EXECUTION SUMMARY');
    console.log('===============================================================');
    console.log(`Scanned Total Records   : ${result.scanned}`);
    console.log(`Legacy Jobs Scanned     : ${result.legacyScanned}`);
    console.log(`Legacy Next Cursor      : ${result.legacyCursor || 'none'}`);
    console.log(`More Legacy Jobs Remain : ${result.hasMoreLegacy}`);
    console.log(`Upcoming Appts Scanned  : ${result.upcomingScanned}`);
    console.log(`Upcoming Next Cursor    : ${result.upcomingCursor || 'none'}`);
    console.log(`More Upcoming Remain    : ${result.hasMoreUpcoming}`);
    console.log(`Upgraded to Revision    : ${result.upgraded}`);
    console.log(`Quarantined (Malformed) : ${result.quarantined}`);
    console.log(`Cancelled (Obsolete)    : ${result.cancelled}`);
    console.log(`Newly Created Reminders : ${result.newlyCreated}`);
    console.log(`Active Leases Skipped   : ${result.skippedActiveLease}`);
    console.log(`Processing Errors       : ${result.errors}`);
    console.log(`Transaction Committed   : ${result.isCommitted}`);
    console.log(`Elapsed Time            : ${durationMs}ms`);
    console.log('===============================================================');

    if (result.details && result.details.length > 0 && result.details.length <= 50) {
      console.log('\nSample Item Breakdown:');
      console.table(result.details.slice(0, 50));
    } else if (result.details && result.details.length > 50) {
      console.log(`\nSample Item Breakdown (first 50 of ${result.details.length}):`);
      console.table(result.details.slice(0, 50));
    }

    if (result.errors > 0) {
      console.warn(`\n[WARNING] Process completed with ${result.errors} error(s). Review logs above.`);
      return 1;
    } else {
      console.log(`\n[SUCCESS] Legacy reminder upgrade completed cleanly.`);
      return 0;
    }
  } catch (err: any) {
    console.error('\n[FATAL] Upgrade script failed:', err?.message || err);
    return 1;
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  runMaintenanceCli().then((code) => {
    process.exit(code);
  });
}
