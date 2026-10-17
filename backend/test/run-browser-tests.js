const { spawn, execSync } = require('child_process');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const path = require('path');

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  'postgresql://dentacare:dentacare_dev_password@localhost:5432/dentacare_test?schema=public';
const API_URL = process.env.API_URL || 'http://localhost:4000';
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function main() {
  console.log('================================================================');
  console.log('   DENTACARE: TEST ENVIRONMENT HARNESS & BROWSER RUNNER');
  console.log('================================================================');
  console.log(`Test Database URL : ${TEST_DATABASE_URL.replace(/:[^:@]+@/, ':****@')}`);

  // 1. Strict test database validation
  const prisma = new PrismaClient({
    datasources: { db: { url: TEST_DATABASE_URL } },
  });

  try {
    const dbInfo = await prisma.$queryRawUnsafe('SELECT current_database();');
    const dbName = dbInfo[0]?.current_database || '';
    console.log(`Connected Test DB : "${dbName}"`);

    if (!dbName.toLowerCase().includes('test')) {
      throw new Error(`Refusing to run tests against "${dbName}". Database name must contain "test"!`);
    }
    if (dbName === 'dentacare' || dbName === 'postgres') {
      throw new Error(`Refusing to run tests against development or production database "${dbName}"!`);
    }

    // 2. Ensure base admin user exists in test database
    const existingAdmin = await prisma.staffUser.findUnique({
      where: { email: 'admin@dentacare.local' },
    });
    if (!existingAdmin) {
      console.log('Seeding admin user into test database...');
      const hashedPassword = await bcrypt.hash('DentacareAdmin2026!', 10);
      await prisma.staffUser.create({
        data: {
          email: 'admin@dentacare.local',
          passwordHash: hashedPassword,
          fullName: 'Test System Administrator',
          role: 'OWNER',
          isActive: true,
        },
      });
      console.log('Admin user seeded in test database.');
    } else {
      console.log('Admin user verified in test database.');
    }

    // 3. Verify backend server identity
    console.log(`Checking backend API server at ${API_URL}/api/health ...`);
    let health;
    try {
      health = await fetch(`${API_URL}/api/health`).then((r) => r.json());
    } catch (err) {
      throw new Error(
        `Backend server is not running at ${API_URL}. Please start the backend with DATABASE_URL=${TEST_DATABASE_URL} before running browser tests.\nError: ${err.message}`,
      );
    }

    if (health?.database?.name !== dbName) {
      throw new Error(
        `Database mismatch detected!\nBackend API is connected to: "${health?.database?.name}"\nTest runner is targeting:      "${dbName}"\nBoth MUST connect to the same test database. Please restart backend with DATABASE_URL=${TEST_DATABASE_URL}`,
      );
    }
    console.log(`Verified: Backend and test runner share test database "${dbName}".`);

    // 4. Verify frontend is responsive
    console.log(`Checking frontend application at ${BASE_URL} ...`);
    try {
      const frontRes = await fetch(BASE_URL);
      if (!frontRes.ok) {
        console.warn(`[Warning] Frontend responded with HTTP ${frontRes.status}`);
      } else {
        console.log('Frontend server is responsive.');
      }
    } catch (err) {
      throw new Error(`Frontend server is not running at ${BASE_URL}.\nError: ${err.message}`);
    }

    // 5. Execute browser test workflow
    console.log('\nExecuting browser workflow test suite...');
    const testProcess = spawn('node', [path.join(__dirname, 'browser-workflow.js')], {
      stdio: 'inherit',
      env: {
        ...process.env,
        TEST_DATABASE_URL,
        API_URL,
        BASE_URL,
      },
    });

    testProcess.on('close', (code) => {
      console.log(`\nBrowser test runner exited with code ${code}`);
      process.exit(code || 0);
    });
  } catch (err) {
    console.error('\n[FATAL] Test harness failed:', err.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

main();
