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

    const EXPECTED_TEST_DB = process.env.TEST_DB_NAME || 'dentacare_test';
    if (dbName !== EXPECTED_TEST_DB) {
      throw new Error(`FAIL-CLOSED: Connected database "${dbName}" does not match exact configured test database "${EXPECTED_TEST_DB}". A database-name substring or suffix match is rejected.`);
    }
    if (['dentacare', 'postgres', 'production', 'master', 'main'].includes(dbName.toLowerCase()) || dbName.toLowerCase().includes('prod')) {
      throw new Error(`FAIL-CLOSED: Refusing to run tests against protected development/production database "${dbName}"!`);
    }

    // 2. Verify backend server identity and exact database target
    console.log(`Checking backend API server at ${API_URL}/api/health ...`);
    let health;
    try {
      health = await fetch(`${API_URL}/api/health`).then((r) => r.json());
    } catch (err) {
      throw new Error(
        `Backend server is not running at ${API_URL}. Please start the backend with DATABASE_URL=${TEST_DATABASE_URL} before running browser tests.\nError: ${err.message}`,
      );
    }

    if (health?.database?.name !== EXPECTED_TEST_DB) {
      throw new Error(
        `Database mismatch detected!\nBackend API is connected to: "${health?.database?.name}"\nExpected configured target: "${EXPECTED_TEST_DB}"\nBoth MUST connect to the same test database. Please restart backend with DATABASE_URL=${TEST_DATABASE_URL}`,
      );
    }
    console.log(`Verified: Backend and test runner share test database "${EXPECTED_TEST_DB}".`);

    // 3. Verify frontend is responsive and rewritten API route targets exact test database
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

    console.log(`Verifying frontend rewritten API route at ${BASE_URL}/api/health ...`);
    let frontHealth;
    try {
      frontHealth = await fetch(`${BASE_URL}/api/health`).then((r) => r.json());
    } catch (err) {
      throw new Error(
        `Frontend rewritten API route at ${BASE_URL}/api/health is unreachable.\nError: ${err.message}`,
      );
    }

    if (frontHealth?.database?.name !== EXPECTED_TEST_DB) {
      throw new Error(
        `Frontend API isolation failure!\nFrontend rewritten API route (${BASE_URL}/api/health) is connected to: "${frontHealth?.database?.name}"\nExpected test database: "${EXPECTED_TEST_DB}"\nThe frontend proxy is not routing to the isolated test database environment!`,
      );
    }
    console.log(`Verified: Frontend rewritten API route connects to exact test database "${EXPECTED_TEST_DB}".`);

    // 4. Complete isolation checks succeeded: now ensure base admin user exists in verified test database
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

    testProcess.on('close', (code, signal) => {
      console.log(`\nBrowser test runner exited with code ${code}, signal: ${signal}`);
      if (signal) {
        console.error(`[FATAL] Browser test runner process terminated by signal ${signal}.`);
        process.exit(1);
      }
      process.exit(code ?? 1);
    });
  } catch (err) {
    console.error('\n[FATAL] Test harness failed:', err.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

main();
