const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const baseUrl = process.env.PICKHUB_PREVIEW_URL || 'http://127.0.0.1:4173/index.html';
const outputDir = path.join(__dirname, '..', 'output', 'playwright');
const executablePath = process.env.CHROME_EXECUTABLE || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
fs.mkdirSync(outputDir, { recursive: true });

(async () => {
  const browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  for (const view of ['member', 'leader', 'public']) {
    await page.goto(`${baseUrl}?view=${view}`, { waitUntil: 'networkidle' });
    await page.screenshot({ path: path.join(outputDir, `pickhub-ui-${view}-1440.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const view of ['member', 'public']) {
    await page.goto(`${baseUrl}?view=${view}`, { waitUntil: 'networkidle' });
    await page.screenshot({ path: path.join(outputDir, `pickhub-ui-${view}-390.png`), fullPage: true });
  }
  await browser.close();
  console.log(`SCREENSHOTS WRITTEN: ${outputDir}`);
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
