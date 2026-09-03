'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');

const port = 4182;
const baseUrl = `http://127.0.0.1:${port}`;
const executablePath = process.env.CHROME_EXECUTABLE || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const nextBin = require.resolve('next/dist/bin/next');

const roster = [
  { id: 51, clubId: 7, athleteId: 901, status: 'active', effectiveFrom: '2026-03-01', effectiveTo: null, alias: 'Minh Smash', version: 2, athlete: { id: 901, displayName: 'Trần Anh Minh', status: 'unclaimed' } },
  { id: 52, clubId: 7, athleteId: 902, status: 'ended', effectiveFrom: '2025-05-12', effectiveTo: '2026-07-30', alias: 'Hà Volley', version: 4, athlete: { id: 902, displayName: 'Nguyễn Thu Hà', status: 'unclaimed' } },
];
const assessments = [
  { id: 81, clubId: 7, membershipId: 51, athleteId: 901, assessedAt: '2026-09-02T08:00:00Z', effectiveFrom: '2026-09-02', skillLevel: 3.2, source: 'club_admin', notes: null, actorType: 'club_admin_session' },
  { id: 72, clubId: 7, membershipId: 51, athleteId: 901, assessedAt: '2026-06-12T08:00:00Z', effectiveFrom: '2026-06-12', skillLevel: 3.0, source: 'club_admin', notes: null, actorType: 'club_admin_session' },
];

function sessionView(role) {
  const admin = role === 'admin';
  return {
    session: { signed: true, group_id: 7, group_code: 'SKY482', group_name: 'Skyline Pickleball', role },
    permissions: { canViewClub: true, canManageFund: admin, canManageRoster: admin, canManagePhr: admin, canManageSettings: admin },
  };
}

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Next dev server did not start');
}

(async () => {
  const server = spawn(process.execPath, [nextBin, 'dev', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, GROUP_SESSION_SECRET: 'phase2-browser-contract-secret-123456' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverOutput = '';
  server.stdout.on('data', (chunk) => { serverOutput += chunk; });
  server.stderr.on('data', (chunk) => { serverOutput += chunk; });

  let browser;
  try {
    await waitForServer();
    browser = await chromium.launch({ executablePath, headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    let role = 'member';
    const browserErrors = [];
    page.on('pageerror', (error) => browserErrors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') browserErrors.push(message.text()); });
    await page.addInitScript(() => {
      localStorage.setItem('pickhub-club-contexts', JSON.stringify([
        { id: 7, code: 'SKY482', name: 'Skyline Pickleball' },
        { id: 8, code: 'RIV224', name: 'River Smash' },
      ]));
      localStorage.setItem('pickhub-default-club-id', '7');
    });
    await page.route('**/api/**', async (route) => {
      const url = new URL(route.request().url());
      let body = {};
      let status = 200;
      if (url.pathname === '/api/groups/session') body = sessionView(role);
      else if (url.pathname === '/api/identity/roster') body = { roster };
      else if (url.pathname === '/api/identity/assessments') body = { assessments };
      else if (url.pathname === '/api/club/branding') body = { name: 'Skyline Pickleball', logoUrl: null };
      else if (url.pathname === '/api/club/transactions') body = { transactions: [] };
      else if (url.pathname === '/api/club/events') body = { events: [] };
      else if (url.pathname === '/api/club/members') body = { members: [] };
      else { status = 404; body = { error: 'Unexpected browser-contract request' }; }
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    });

    await page.goto(`${baseUrl}/thong-tin`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Thông tin thành viên' }).waitFor();
    assert.equal(await page.locator('.mobile-bottom-nav-link').count(), 5, 'member has five mobile tabs');
    assert.match(await page.locator('.mobile-bottom-nav-link').nth(2).innerText(), /BXH/, 'BXH remains centered');
    assert.match(await page.locator('.mobile-bottom-nav-link').nth(4).innerText(), /Thông tin/, 'member fifth tab is Thông tin');
    assert.match(await page.locator('.member-phr-score').innerText(), /3,2/, 'member PHR snapshot is visible');
    assert.match(await page.locator('.member-identity-card').innerText(), /Minh Smash/, 'membership nickname is visible');
    const memberMetrics = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      navTargets: [...document.querySelectorAll('.mobile-bottom-nav-link')].map((item) => item.getBoundingClientRect().height),
      background: getComputedStyle(document.querySelector('.member-identity-card')).backgroundColor,
    }));
    assert.equal(memberMetrics.overflow, 0, 'member view has no horizontal overflow');
    assert(memberMetrics.navTargets.every((height) => height >= 44), 'member nav touch targets are at least 44px');
    assert.equal(memberMetrics.background, 'rgb(255, 255, 255)', 'member card stays on the approved light surface');

    await page.goto(`${baseUrl}/quy/members`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Thành viên CLB' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Cập nhật PHR' }).count(), 0, 'member cannot see PHR management controls');
    assert.match(await page.locator('.members-table').innerText(), /Athlete #901/, 'roster exposes athlete identity');

    role = 'admin';
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${baseUrl}/admin?section=roster`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Trung tâm quản trị CLB' }).waitFor();
    assert.equal(await page.getByRole('button', { name: '+ Thêm VĐV' }).count(), 1, 'leader sees roster create control');
    assert.equal(await page.getByRole('button', { name: 'Cập nhật PHR' }).count(), 2, 'leader sees scoped PHR controls');
    assert.match(await page.locator('.header-nav .nav-link').nth(4).innerText(), /Cấu hình/, 'leader fifth tab stays Cấu hình');
    assert.equal(browserErrors.length, 0, `browser errors: ${browserErrors.join(' | ')}`);

    console.log('PickHub Phase 2 UI browser contracts ok');
  } catch (error) {
    console.error(serverOutput);
    throw error;
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
