const puppeteer = require('puppeteer-core');

const CHROME_PATH = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--window-size=1440,900'],
  });

  const page = await browser.newPage();
  page.on('console', msg => console.log('[BROWSER]', msg.text()));
  page.on('pageerror', err => console.log('[PAGE ERROR]', err.message));

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));

  const info = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const buttons = Array.from(document.querySelectorAll('button')).map(b => ({
      text: b.innerText,
      title: b.getAttribute('title'),
      aria: b.getAttribute('aria-label')
    }));
    return {
      hasCanvas: !!canvas,
      canvasOpacity: canvas ? window.getComputedStyle(canvas).opacity : null,
      buttons
    };
  });

  console.log('Page info:', JSON.stringify(info, null, 2));
  await browser.close();
}

main();
