import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { NotificationsService } from '../src/notifications/notifications.service';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * CLI Command: Legacy Reminder Repair & Upgrade
 *
 * Usage:
 *   npx ts-node scripts/repair-reminders.ts [options]
 *
 * Options:
 *   --dry-run, -d           Report mode: inspect and classify without mutating database
 *   --batch-size=<N>, -b <N> Number of records per batch (default: 100, max: 500)
 *   --max-jobs=<N>          Safety limit on total jobs to process (default: 10000)
 *   --database-url=<URL>    Explicit target database connection URL
 *
 * Worker Coordination Strategy:
 *   1. Active Lease Protection: In-flight jobs currently locked by workers (< 5m lease)
 *      are automatically detected, preserved, and skipped.
 *   2. Bounded Batches: Database updates are applied in discrete bounded chunks, preventing
 *      prolonged table lock contention.
 *   3. Idempotent Reruns: Safe to run repeatedly; migrated records (scheduleRevision IS NOT NULL)
 *      are skipped on subsequent executions.
 *   4. Timing: Recommended to run during off-peak hours or maintenance windows.
 */

function parseArgs() {
  const args = process.argv.slice(2);
  let dryRun = false;
  let batchSize = 100;
  let maxJobs = 10000;
  let databaseUrl: string | undefined = undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--dry-run' || arg === '-d') {
      dryRun = true;
    } else if (arg.startsWith('--batch-size=')) {
      batchSize = parseInt(arg.split('=')[1], 10) || 100;
    } else if (arg === '-b' && args[i + 1]) {
      batchSize = parseInt(args[++i], 10) || 100;
    } else if (arg.startsWith('--max-jobs=')) {
      maxJobs = parseInt(arg.split('=')[1], 10) || 10000;
    } else if (arg.startsWith('--database-url=')) {
      databaseUrl = arg.slice(arg.indexOf('=') + 1);
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Usage: npx ts-node scripts/repair-reminders.ts [options]

Options:
  --dry-run, -d             Dry-run mode (read-only, no database mutations)
  --batch-size=<N>, -b <N>  Batch size per iteration (default: 100)
  --max-jobs=<N>            Max jobs to process (default: 10000)
  --database-url=<URL>      Explicit database URL
  --help, -h                Show this help message
      `);
      process.exit(0);
    }
  }

  return { dryRun, batchSize, maxJobs, databaseUrl };
}

async function main() {
  const { dryRun, batchSize, maxJobs, databaseUrl } = parseArgs();

  if (databaseUrl) {
    process.env.DATABASE_URL = databaseUrl;
  }

  console.log('===============================================================');
  console.log('   DENTACARE: LEGACY REMINDER UPGRADE & REPAIR UTILITY');
  console.log('===============================================================');
  console.log(`Execution Mode : ${dryRun ? 'DRY-RUN (REPORT ONLY, NO MUTATIONS)' : 'LIVE UPGRADE (COMMITTING CHANGES)'}`);
  console.log(`Batch Size     : ${batchSize}`);
  console.log(`Max Job Cap    : ${maxJobs}`);

  // Bootstrap minimal NestJS context
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const prisma = app.get(PrismaService);
    const notificationsService = app.get(NotificationsService);

    const [dbInfo] = await prisma.$queryRaw<Array<{ current_database: string }>>`SELECT current_database();`;
    const targetDb = dbInfo?.current_database || 'unknown';
    console.log(`Connected DB   : "${targetDb}"`);
    console.log('---------------------------------------------------------------');
    console.log('Notification Worker Coordination:');
    console.log('  * In-flight worker leases (< 5m) will be preserved.');
    console.log('  * Idempotent reruns guaranteed.');
    console.log('---------------------------------------------------------------');

    const startTime = Date.now();
    const result = await notificationsService.upgradeLegacyReminderJobs({
      dryRun,
      batchSize,
      maxJobs,
    });
    const durationMs = Date.now() - startTime;

    console.log('\n===============================================================');
    console.log('                     EXECUTION SUMMARY');
    console.log('===============================================================');
    console.log(`Scanned Legacy Jobs     : ${result.scanned}`);
    console.log(`Upgraded to Revision    : ${result.upgraded}`);
    console.log(`Quarantined (Malformed) : ${result.quarantined}`);
    console.log(`Cancelled (Obsolete)    : ${result.cancelled}`);
    console.log(`Newly Created Reminders : ${result.newlyCreated}`);
    console.log(`Active Leases Skipped   : ${result.skippedActiveLease}`);
    console.log(`Processing Errors       : ${result.errors}`);
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
      process.exitCode = 1;
    } else {
      console.log(`\n[SUCCESS] Legacy reminder upgrade completed cleanly.`);
    }
  } catch (err: any) {
    console.error('\n[FATAL] Upgrade script failed:', err?.message || err);
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

main();
