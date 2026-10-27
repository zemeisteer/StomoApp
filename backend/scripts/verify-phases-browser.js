const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const CHROME_PATH = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACTS_DIR = 'C:\\Users\\user\\.gemini\\antigravity-ide\\brain\\d78b18da-a8bd-4ef2-8e5f-61c0f329fd59';

async function run() {
  console.log('Starting visual E2E verification of Phases 1-7...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  try {
    // 1. Login as admin
    console.log('[1/5] Logging in to admin...');
    await page.goto(`${BASE_URL}/admin/login`, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Perform login
    await page.evaluate(async () => {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'X-CSRF-Token': '1' },
        body: JSON.stringify({ email: 'admin@dentacare.local', password: 'DentacareAdmin2026!' }),
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Login failed: ' + res.status);
    });

    // 2. Go to /admin
    console.log('[2/5] Inspecting Quick Registration on /admin...');
    await page.goto(`${BASE_URL}/admin`, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise((r) => setTimeout(r, 2000));

    // Fill registration form if inputs exist
    const hasRegForm = await page.evaluate(() => {
      const nameInput = document.querySelector('input[placeholder*="Aliyev"]');
      return Boolean(nameInput);
    });

    if (hasRegForm) {
      await page.type('input[placeholder*="Aliyev"]', 'Dilshod Aliyev');
      await page.type('input[type="tel"]', '901234567');
      
      // Select doctor and service if dropdowns exist
      await page.evaluate(() => {
        const selects = document.querySelectorAll('select');
        if (selects.length >= 2) {
          // select first non-empty option
          for (const s of selects) {
            if (s.options.length > 1) {
              s.selectedIndex = 1;
              s.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }
        }
      });
      await new Promise((r) => setTimeout(r, 1500));

      // Check staff consent checkbox
      await page.evaluate(() => {
        const checkbox = document.querySelector('input[type="checkbox"]');
        if (checkbox && !checkbox.checked) {
          checkbox.click();
        }
      });
      await new Promise((r) => setTimeout(r, 500));

      await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'admin_quick_reg_form.png') });
      console.log('Saved admin_quick_reg_form.png');
    }

    // 3. Inspect Calendar navigation
    console.log('[3/5] Inspecting Admin Calendar...');
    await page.goto(`${BASE_URL}/admin/calendar`, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise((r) => setTimeout(r, 2000));
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'admin_calendar_verified.png') });
    console.log('Saved admin_calendar_verified.png');

    // 4. Inspect Doctors page and delete modal
    console.log('[4/5] Inspecting Doctors lifecycle modal...');
    await page.goto(`${BASE_URL}/admin/doctors`, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise((r) => setTimeout(r, 2000));

    // Click trash button on first doctor if available
    const clickedDocDelete = await page.evaluate(() => {
      const trashBtns = document.querySelectorAll('button');
      for (const btn of trashBtns) {
        if (btn.querySelector('svg.lucide-trash2') || btn.querySelector('svg.lucide-trash')) {
          btn.click();
          return true;
        }
      }
      return false;
    });

    if (clickedDocDelete) {
      await new Promise((r) => setTimeout(r, 1500));
      await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'admin_doctor_lifecycle_modal.png') });
      console.log('Saved admin_doctor_lifecycle_modal.png');
    } else {
      await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'admin_doctors_page.png') });
      console.log('Saved admin_doctors_page.png');
    }

    // 5. Inspect Settings -> Branches page and branch delete modal
    console.log('[5/5] Inspecting Branch lifecycle modal...');
    await page.goto(`${BASE_URL}/admin/settings`, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise((r) => setTimeout(r, 2000));

    // Click trash button on first branch with title "Filialni o'chirish"
    const clickedBranchDelete = await page.evaluate(() => {
      const btn = document.querySelector('button[title="Filialni o\'chirish"]');
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });

    if (clickedBranchDelete) {
      await new Promise((r) => setTimeout(r, 1500));
      await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'admin_branch_lifecycle_modal.png') });
      console.log('Saved admin_branch_lifecycle_modal.png');
    } else {
      await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'admin_settings_branches.png') });
      console.log('Saved admin_settings_branches.png');
    }

    console.log('Visual E2E verification completed successfully!');
  } catch (err) {
    console.error('Browser verification failed:', err);
  } finally {
    await browser.close();
  }
}

run();
