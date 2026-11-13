const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const ARTIFACT_DIR = process.env.ARTIFACT_DIR || 'C:\\Users\\user\\.gemini\\antigravity-ide\\brain\\7f9f12fc-4c76-43cf-b704-011dbbebe816';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

if (!fs.existsSync(ARTIFACT_DIR)) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

async function capture() {
  console.log('Capturing full resolution role workspaces to:', ARTIFACT_DIR);

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--window-size=1440,900'],
  });

  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(60000);

  // 1. RECEPTIONIST / ADMIN WORKSPACE (Desktop & Mobile)
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${FRONTEND_URL}/admin/login`, { waitUntil: 'networkidle2' });
  await page.evaluate(async () => {
    await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'X-CSRF-Token': '1' },
      body: JSON.stringify({ email: 'admin@dentacare.local', password: 'DentacareAdmin2026!' }),
      credentials: 'include',
    });
  });

  await page.goto(`${FRONTEND_URL}/admin`, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'receptionist_workspace_desktop.png') });
  console.log('Saved receptionist_workspace_desktop.png');

  await page.setViewport({ width: 390, height: 844 });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'receptionist_workspace_mobile.png') });
  console.log('Saved receptionist_workspace_mobile.png');

  // 2. OWNER ANALYTICS (Desktop & Mobile)
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${FRONTEND_URL}/admin/analytics`, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'owner_analytics_desktop.png') });
  console.log('Saved owner_analytics_desktop.png');

  await page.setViewport({ width: 390, height: 844 });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'owner_analytics_mobile.png') });
  console.log('Saved owner_analytics_mobile.png');

  // 3. DOCTOR WORKSPACE (Desktop & Mobile)
  await page.evaluate(async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'X-CSRF-Token': '1' },
      body: JSON.stringify({ email: 'dr.rahimov@dentacare.local', password: 'Doctor2026!' }),
      credentials: 'include',
    });
  });

  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${FRONTEND_URL}/admin`, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'doctor_workspace_desktop.png') });
  console.log('Saved doctor_workspace_desktop.png');

  await page.setViewport({ width: 390, height: 844 });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'doctor_workspace_mobile.png') });
  console.log('Saved doctor_workspace_mobile.png');

  // 4. PATIENT PORTAL (Desktop & Mobile)
  const prisma = new PrismaClient();
  let apt = await prisma.appointment.findFirst({
    where: { publicToken: { not: '' } },
    include: { doctor: true, branch: true },
  });

  if (apt && apt.publicToken) {
    await prisma.appointment.update({
      where: { id: apt.id },
      data: {
        tokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        tokenRevokedAt: null,
        status: 'CONFIRMED',
      },
    });

    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(`${FRONTEND_URL}/booking/status/${apt.publicToken}`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'patient_portal_desktop.png') });
    console.log('Saved patient_portal_desktop.png');

    await page.setViewport({ width: 390, height: 844 });
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'patient_portal_mobile.png') });
    console.log('Saved patient_portal_mobile.png');
  }
  await prisma.$disconnect();

  // 5. PUBLIC LANDING PAGE (Desktop)
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${FRONTEND_URL}`, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2500));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'public_landing_desktop.png') });
  console.log('Saved public_landing_desktop.png');

  await browser.close();
  console.log('All screenshots captured successfully!');
}

capture().catch(err => {
  console.error('Capture failed:', err);
  process.exit(1);
});
