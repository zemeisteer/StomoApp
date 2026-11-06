#!/usr/bin/env node
/**
 * Creates (or resets) a clinic OWNER account. Intended for the first
 * production deploy, where the demo seed should not be used.
 *
 *   docker compose --env-file .env.production -f docker-compose.prod.yml run --rm \
 *     -e OWNER_EMAIL=owner@clinic.uz -e OWNER_NAME="Ism Familiya" -e OWNER_PASSWORD='...' \
 *     backend node scripts/create-owner.js
 *
 * - OWNER_PASSWORD must be at least 12 characters.
 * - If the email already exists, its password is reset, role set to OWNER,
 *   the account re-activated and all sessions invalidated (only with --reset).
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

async function main() {
  const email = (process.env.OWNER_EMAIL || '').trim().toLowerCase();
  const fullName = (process.env.OWNER_NAME || '').trim() || 'Clinic Owner';
  const password = process.env.OWNER_PASSWORD || '';
  const reset = process.argv.includes('--reset');

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('OWNER_EMAIL is missing or invalid');
  }
  if (password.length < 12) {
    throw new Error('OWNER_PASSWORD must be at least 12 characters');
  }

  const prisma = new PrismaClient();
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const existing = await prisma.staffUser.findUnique({ where: { email } });

    if (existing && !reset) {
      throw new Error(`${email} already exists. Re-run with --reset to reset its password and make it OWNER.`);
    }

    if (existing) {
      await prisma.staffUser.update({
        where: { email },
        data: {
          passwordHash,
          fullName,
          role: 'OWNER',
          isActive: true,
          tokenVersion: { increment: 1 },
          refreshTokenHash: null,
        },
      });
      console.log(`OWNER account reset: ${email}`);
    } else {
      await prisma.staffUser.create({
        data: { email, passwordHash, fullName, role: 'OWNER', isActive: true },
      });
      console.log(`OWNER account created: ${email}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(`ERROR: ${err.message}`);
  process.exit(1);
});
