#!/usr/bin/env node
/**
 * The demo seed (prisma/seed.ts) creates doctor and reception logins whose passwords are
 * written in the repository. On a public demo they must not work: deactivate them.
 * Idempotent; the OWNER account is not touched.
 */
const { PrismaClient } = require('@prisma/client');

const DEMO_LOGINS = ['dr.rahimov@dentacare.local', 'reception@dentacare.local'];

async function main() {
  const prisma = new PrismaClient();
  try {
    const { count } = await prisma.staffUser.updateMany({
      where: { email: { in: DEMO_LOGINS }, isActive: true },
      data: { isActive: false },
    });
    console.log(`[disable-demo-staff] deactivated ${count} demo login(s)`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(`[disable-demo-staff] ERROR: ${err.message}`);
  process.exit(1);
});
