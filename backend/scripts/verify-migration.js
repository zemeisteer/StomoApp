const { PrismaClient } = require('@prisma/client');
const { execSync } = require('child_process');

async function main() {
  console.log('--- Step 1: Upgrading existing DB with prisma migrate deploy ---');
  execSync('npx prisma migrate deploy', { stdio: 'inherit', cwd: __dirname + '/..' });

  console.log('\n--- Step 2: Testing Fresh Database from Migrations ---');
  const adminPrisma = new PrismaClient({
    datasources: { db: { url: 'postgresql://dentacare:dentacare_dev_password@localhost:5432/dentacare?schema=public' } }
  });
  
  try {
    await adminPrisma.$executeRawUnsafe('DROP DATABASE IF EXISTS dentacare_fresh_test');
    await adminPrisma.$executeRawUnsafe('CREATE DATABASE dentacare_fresh_test');
    console.log('Created database dentacare_fresh_test');
  } finally {
    await adminPrisma.$disconnect();
  }

  const freshUrl = 'postgresql://dentacare:dentacare_dev_password@localhost:5432/dentacare_fresh_test?schema=public';
  console.log('Deploying all migrations to fresh database...');
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    cwd: __dirname + '/..',
    env: { ...process.env, DATABASE_URL: freshUrl }
  });
  console.log('All migrations applied to fresh database with exit code 0!');

  // Verify fresh database schema contains all new fields
  const freshPrisma = new PrismaClient({
    datasources: { db: { url: freshUrl } }
  });

  try {
    const cols = await freshPrisma.$queryRaw`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'appointments'
        AND column_name IN ('arrived_at', 'actual_start_time', 'actual_end_time', 'overrun_minutes', 'overrun_active', 'overrun_estimated_end_time')
      ORDER BY column_name;
    `;
    console.log('Fresh DB appointments columns verified:', cols);

    const clinicCols = await freshPrisma.$queryRaw`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'clinic_settings'
        AND column_name = 'phones';
    `;
    console.log('Fresh DB clinic_settings columns verified:', clinicCols);

    if (cols.length < 6 || clinicCols.length < 1) {
      throw new Error('Fresh database missing required columns!');
    }
  } finally {
    await freshPrisma.$disconnect();
    // Drop test database
    const cleanupPrisma = new PrismaClient({
      datasources: { db: { url: 'postgresql://dentacare:dentacare_dev_password@localhost:5432/dentacare?schema=public' } }
    });
    try {
      await cleanupPrisma.$executeRawUnsafe('DROP DATABASE IF EXISTS dentacare_fresh_test');
      console.log('Cleaned up dentacare_fresh_test');
    } finally {
      await cleanupPrisma.$disconnect();
    }
  }

  console.log('\nMigration verification passed 100%!');
}

main().catch(err => {
  console.error('Migration verification failed:', err);
  process.exit(1);
});
