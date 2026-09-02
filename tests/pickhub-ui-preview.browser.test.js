const { chromium } = require('playwright');

const baseUrl = process.env.PICKHUB_PREVIEW_URL || 'http://127.0.0.1:4173/index.html';
const executablePath = process.env.CHROME_EXECUTABLE || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

(async () => {
  const browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  const missing = [];
  page.on('console', (message) => { if (message.type() === 'error' && !message.text().includes('Failed to load resource')) errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => { if (response.status() >= 400) missing.push(`${response.status()} ${response.url()}`); });

  await page.goto(`${baseUrl}?view=member`, { waitUntil: 'networkidle' });
  assert(await page.locator('h1').textContent() === 'Bảng xếp hạng đóng góp', 'member ranking heading missing');
  assert(await page.locator('.mobile-nav__item').count() === 5, 'member mobile nav must have five items');
  assert((await page.locator('.mobile-nav__item').nth(2).textContent()).includes('BXH'), 'BXH must be the center mobile tab');

  await page.setViewportSize({ width: 390, height: 844 });
  const memberLayout = await page.evaluate(() => {
    const nav = document.querySelector('.mobile-nav').getBoundingClientRect();
    const items = [...document.querySelectorAll('.mobile-nav__item')].map((item) => item.getBoundingClientRect());
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      allInside: items.every((rect) => rect.left >= -1 && rect.right <= window.innerWidth + 1 && rect.top >= nav.top - 1 && rect.bottom <= nav.bottom + 1),
    };
  });
  assert(memberLayout.overflow === 0, `member horizontal overflow is ${memberLayout.overflow}px`);
  assert(memberLayout.allInside, 'member mobile nav item is outside the nav bounds');

  await page.locator('[data-view="public"]').click();
  await page.waitForSelector('.public-shell');
  await page.locator('[data-tab="Bảng đấu"]').click();
  assert(await page.locator('[data-tab="Bảng đấu"]').getAttribute('aria-selected') === 'true', 'public tab selection is not reflected in aria-selected');
  const publicOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert(publicOverflow === 0, `public horizontal overflow is ${publicOverflow}px`);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseUrl}?view=leader`, { waitUntil: 'networkidle' });
  assert((await page.locator('h1').textContent()).includes('Chào anh Minh'), 'leader heading missing');
  await page.goto(`${baseUrl}?view=public`, { waitUntil: 'networkidle' });
  assert((await page.locator('h1').textContent()).includes('PickHub'), 'public event heading missing');

  assert(errors.length === 0, `browser console errors: ${errors.join(' | ')}`);
  const unexpectedMissing = missing.filter((entry) => !entry.endsWith('/favicon.ico'));
  assert(unexpectedMissing.length === 0, `unexpected missing resources: ${unexpectedMissing.join(' | ')}`);
  await browser.close();
  console.log('UI BROWSER TEST PASS: five-tab member nav, centered BXH, mobile layout, public tabs, desktop contexts');
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
