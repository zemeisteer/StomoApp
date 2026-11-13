const puppeteer = require('puppeteer-core');

const CHROME_PATH = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function verify() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--window-size=1440,900',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  try {
    await page.evaluateOnNewDocument(() => {
      window.__rAFCalls = 0;
      const orig = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = function(cb) {
        window.__rAFCalls = (window.__rAFCalls || 0) + 1;
        return orig(cb);
      };
    });

    await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));

    const result = await page.evaluate(async () => {
      // 1. Measure normal 1-second active frame activity
      const startActive = window.__toothFrameCount || 0;
      await new Promise(r => setTimeout(r, 1000));
      const endActive = window.__toothFrameCount || 0;
      const activeFPS = endActive - startActive;

      // 2. Pause the tooth
      const pauseBtn = document.querySelector('button[title*="to\'xtatish"], button[title*="Остановить"], button:has(svg.lucide-pause)');
      if (pauseBtn) {
        pauseBtn.click();
      }
      await new Promise(r => setTimeout(r, 200));

      // Measure paused frame activity for 1 second
      const startPaused = window.__toothFrameCount || 0;
      await new Promise(r => setTimeout(r, 1000));
      const endPaused = window.__toothFrameCount || 0;
      const pausedFPS = endPaused - startPaused;

      // 3. Resume the tooth
      const resumeBtn = document.querySelector('button[title*="davom"], button[title*="Возобновить"], button:has(svg.lucide-play)');
      if (resumeBtn) {
        resumeBtn.click();
      }
      await new Promise(r => setTimeout(r, 200));

      // Measure resumed frame activity
      const startResumed = window.__toothFrameCount || 0;
      await new Promise(r => setTimeout(r, 1000));
      const endResumed = window.__toothFrameCount || 0;
      const resumedFPS = endResumed - startResumed;

      return { activeFPS, pausedFPS, resumedFPS };
    });

    console.log('--- TOOTH 3D LIFECYCLE MEASUREMENT ---');
    console.log(`Active loop activity  : ${result.activeFPS} frames/sec`);
    console.log(`Paused loop activity  : ${result.pausedFPS} frames/sec (Target: 0)`);
    console.log(`Resumed loop activity : ${result.resumedFPS} frames/sec`);

    if (result.pausedFPS === 0 && result.activeFPS > 30) {
      console.log('SUCCESS: Continuous animation loop stops completely when paused!');
    } else {
      console.error('FAILURE: Unexpected frame count during pause:', result);
      process.exit(1);
    }
  } finally {
    await browser.close();
  }
}

verify().catch(e => {
  console.error(e);
  process.exit(1);
});
