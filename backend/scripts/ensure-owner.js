#!/usr/bin/env node
/**
 * Idempotent first-start helper for hosts without a shell (e.g. a free Render instance).
 * Creates the OWNER account from OWNER_EMAIL / OWNER_NAME / OWNER_PASSWORD, but ONLY when
 * the database has no OWNER yet. It never resets or changes an existing account, so it is
 * safe to run on every start. Without OWNER_EMAIL / OWNER_PASSWORD it does nothing.
 *
 * (To reset an owner's password use scripts/create-owner.js --reset.)
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

async function main() {
  const email = (process.env.OWNER_EMAIL || '').trim().toLowerCase();
  const password = process.env.OWNER_PASSWORD || '';
  const fullName = (process.env.OWNER_NAME || '').trim() || 'Clinic Owner';

  if (!email && !password) {
    console.log('[ensure-owner] OWNER_EMAIL / OWNER_PASSWORD not set, skipping');
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('OWNER_EMAIL is missing or invalid');
  if (password.length < 12) throw new Error('OWNER_PASSWORD must be at least 12 characters');

  const prisma = new PrismaClient();
  try {
    const owners = await prisma.staffUser.count({ where: { role: 'OWNER' } });
    if (owners > 0) {
      console.log('[ensure-owner] an OWNER account already exists, nothing to do');
      return;
    }
    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.staffUser.create({ data: { email, passwordHash, fullName, role: 'OWNER', isActive: true } });
    console.log(`[ensure-owner] OWNER account created: ${email}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(`[ensure-owner] ERROR: ${err.message}`);
  process.exit(1);
});
