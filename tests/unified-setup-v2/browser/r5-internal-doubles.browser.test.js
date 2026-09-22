'use strict';

// Narrow release journey for the only R3 finalizer currently supported in production.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { requiredEnvironment, missingEnvironment, skipReason } = require('./fixtures');

const env = requiredEnvironment();
const missing = missingEnvironment(env);
if (missing.length) {
    console.log(skipReason(missing));
    process.exit(0);
}

async function api(path, options = {}) {
    const response = await fetch(`${env.baseUrl}${path}`, {
        ...options,
        headers: {
            'content-type': 'application/json',
            cookie: `group_session=${env.adminSession}`,
            ...(options.headers || {}),
        },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`${options.method || 'GET'} ${path}: ${response.status} ${body.error || ''}`);
    return body;
}

async function ensureRoster() {
    assert.ok(!['1', '46'].includes(String(env.groupId)), 'never mutate protected operating/historical groups');
    const roster = await api('/api/tournament-v2/athletes?mode=roster');
    const active = (roster.roster || []).filter((member) => member.is_active !== false && member.athlete_id);
    if (active.length > 14) {
        throw new Error(`fixture must be a fresh scoped group with at most 14 active members; received ${active.length}`);
    }
    for (let index = active.length; index < 14; index += 1) {
        await api('/api/club/members', {
            method: 'POST',
            body: JSON.stringify({ full_name: `QA R5 ${String(index + 1).padStart(2, '0')}` }),
        });
    }
    const refreshed = await api('/api/tournament-v2/athletes?mode=roster');
    const seeded = (refreshed.roster || []).filter((member) => member.is_active !== false && member.athlete_id);
    assert.equal(seeded.length, 14, 'fixture must expose exactly 14 active members with athlete identities');
}

async function chooseAllAndCreate(page, label) {
    await page.goto(`${env.baseUrl}/giai-dau/v2`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /Tạo giải nội bộ/ }).click();
    await page.getByLabel('Tên giải').fill(`QA R5 ${label} ${Date.now()}`);
    await page.getByRole('button', { name: /Chọn toàn bộ thành viên đang hoạt động/ }).click();
    await page.getByText(/Đã chọn 14\/14/).waitFor();
    await page.getByRole('button', { name: /^Tiếp tục$/ }).click();

    await page.getByRole('button', { name: /^Tự động$/ }).click();
    await page.getByRole('button', { name: /Áp dụng gợi ý tự động/ }).click();
    await page.locator('article.pairing-pair').evaluateAll((pairs) => {
        if (pairs.length !== 7) throw new Error(`expected 7 pairs, received ${pairs.length}`);
    });
    await page.getByRole('button', { name: /^Tiếp tục$/ }).click();

    await page.getByRole('button', { name: /^Bốc thăm$/ }).click();
    await page.getByText(/Bảng A · 4 cặp/).waitFor();
    await page.getByText(/Bảng B · 3 cặp/).waitFor();
    await page.getByText(/Tổng: 12 trận/).waitFor();
    await page.getByRole('button', { name: /Sinh trận & xếp sân\/giờ/ }).click();
    await page.getByText(/Đang sinh trận/).waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: /^Tiếp tục$/ }).click();

    await page.getByLabel('Bước 4: kiểm tra và chốt').getByRole('button', { name: 'Chốt bốc thăm & tạo lịch' }).click();
    await page.waitForURL(/\/dieu-hanh-giai\/\d+/, { timeout: 60000 });
    return Number(/\/dieu-hanh-giai\/(\d+)/.exec(page.url())[1]);
}

(async () => {
    const artifactDir = path.join(__dirname, '../../../_workspace/unified-setup-ux/r5-evidence', new Date().toISOString().replace(/[:.]/g, '-'));
    fs.mkdirSync(artifactDir, { recursive: true });
    const evidence = { groupId: env.groupId, results: [], status: 'RUNNING' };
    await ensureRoster();
    const browser = await chromium.launch({ executablePath: env.chrome || undefined, headless: true });
    try {
        for (const viewport of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
            const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
            await context.addCookies([{ name: 'group_session', value: env.adminSession, url: env.baseUrl }]);
            const page = await context.newPage();
            const tournamentId = await chooseAllAndCreate(page, viewport.name);
            const stages = await api(`/api/tournament-v2/stages?tournamentId=${tournamentId}`);
            assert.equal((stages.stages || []).length, 2, `${viewport.name}: two stages persist`);
            assert.deepEqual((stages.stages || []).map((stage) => stage.name), ['Vòng bảng', 'Chung kết'], `${viewport.name}: expected persisted stage names`);
            const [groupStage, knockoutStage] = stages.stages;
            assert.equal(groupStage.division_id, knockoutStage.division_id, 'both stages belong to the same division');
            const groupMatches = (await api(`/api/tournament-v2/matches?stageId=${groupStage.id}`)).matches;
            const knockoutMatches = (await api(`/api/tournament-v2/matches?stageId=${knockoutStage.id}`)).matches;
            assert.equal(groupMatches.length, 9, 'persisted group fixtures');
            assert.equal(knockoutMatches.length, 3, 'persisted playoff placeholders');
            assert.equal(new Set([...groupMatches, ...knockoutMatches].map((match) => match.id)).size, 12, 'unique persisted matches');
            assert.deepEqual(knockoutMatches.map((match) => match.match_key).sort(), ['F', 'SF1', 'SF2']);
            assert.ok(knockoutMatches.every((match) => match.entry_a_id == null && match.entry_b_id == null
                && match.entrant_a_id == null && match.entrant_b_id == null), 'no fake playoff entrants');
            assert.equal(groupStage.config.draw.status, 'locked', 'persisted group draw is locked');
            await page.screenshot({ path: path.join(artifactDir, `${viewport.name}.png`), fullPage: true });
            evidence.results.push({ viewport, tournamentId, stages: stages.stages, groupMatches, knockoutMatches });
            await context.close();
            console.log(`PASS R5 ${viewport.name}: tournament=${tournamentId}, stages=${groupStage.id},${knockoutStage.id}; 14 members -> 7 pairs -> 2 persisted stages -> 12 persisted fixtures`);
        }
        evidence.status = 'PASS';
    } finally {
        fs.writeFileSync(path.join(artifactDir, 'persisted-fixtures.json'), JSON.stringify(evidence, null, 2));
        console.log(`R5 evidence: ${artifactDir}`);
        await browser.close();
    }
})().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
});
