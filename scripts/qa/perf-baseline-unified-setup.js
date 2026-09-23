'use strict';

// ============================================================================
// T0.3-live — BASELINE HIỆU NĂNG luồng tạo giải nội bộ (UI CŨ, wizard 3 bước).
//
// Mục đích: lấy số "before" cho GAP-PERF trước khi T2.D wire workspace 4 bước
// vào app. Sau T2.D, UI cũ biến mất và không còn gì để đo "before".
//
// TRUNG THỰC — ba luật không thương lượng:
//   1. KHÔNG bịa số. Luồng nào không đo được thì ghi BLOCKED kèm lý do kỹ thuật.
//   2. KHÔNG PASS một phần trong im lặng. Mọi ô BLOCKED đều xuất hiện trong báo cáo.
//   3. KHÔNG ghi cookie / service key vào artifact. scrub() lọc trước khi ghi.
//
// CHẠY:
//   node scripts/qa/perf-baseline-unified-setup.js
//
// BIẾN MÔI TRƯỜNG BẮT BUỘC (provision bằng scripts/qa/provision-browser-harness.js):
//   PICKHUB_QA_BASE_URL       vd http://127.0.0.1:3100
//   PICKHUB_QA_ADMIN_SESSION  cookie group_session của ADMIN CLB kiểm thử
//   PICKHUB_QA_GROUP_ID       group_id của CLB kiểm thử
// TUỲ CHỌN:
//   CHROME_EXECUTABLE         đường dẫn Chrome/Chromium; bỏ trống thì dùng chromium của playwright
//   PICKHUB_PERF_RUNS         số lần đo mỗi luồng sau warm-up (mặc định 5)
//   PICKHUB_PERF_ARTIFACT_DIR mặc định _workspace/unified-setup-ux/perf-evidence/<timestamp>
//   PICKHUB_PERF_HEADED       '1' để xem trình duyệt chạy (gỡ lỗi selector)
//   PICKHUB_PERF_ATHLETES     số VĐV seed mỗi lần đo (mặc định 14 — ca nghiệm thu)
//
// EXIT CODE: 0 = đo đủ; 2 = BLOCKED (thiếu tiền đề hoặc selector không khớp).
// ============================================================================

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');

// ---------------------------------------------------------------------------
// Tiền đề
// ---------------------------------------------------------------------------

const ENV = {
    baseUrl: (process.env.PICKHUB_QA_BASE_URL || '').replace(/\/$/, ''),
    adminSession: process.env.PICKHUB_QA_ADMIN_SESSION || '',
    groupId: process.env.PICKHUB_QA_GROUP_ID || '',
    chrome: process.env.CHROME_EXECUTABLE || '',
    runs: Math.max(1, Number(process.env.PICKHUB_PERF_RUNS || 5)),
    athletes: Math.max(2, Number(process.env.PICKHUB_PERF_ATHLETES || 14)),
    headed: process.env.PICKHUB_PERF_HEADED === '1',
};

const PREREQ = {
    baseUrl: 'PICKHUB_QA_BASE_URL chưa đặt: không có server nào đang chạy checkout này',
    adminSession: 'PICKHUB_QA_ADMIN_SESSION chưa đặt: không có cookie group_session admin (không được bịa)',
    groupId: 'PICKHUB_QA_GROUP_ID chưa đặt: không ghi/đối chiếu được phạm vi tenant',
    playwright: 'không require được gói playwright trong node_modules',
    server: 'base URL không trả lời 200',
    session: 'cookie được cung cấp không mở được dashboard giải đấu với tư cách admin',
    uiWired: 'TournamentSetupWorkspace đã được wire vào TournamentWizard.js — UI cũ không còn, mất điểm baseline',
};

const blockers = [];
function blocked(key, extra) {
    blockers.push(extra ? `${PREREQ[key]} (${extra})` : PREREQ[key]);
}

function fail(reason) {
    console.error('\n=== T0.3-live BLOCKED ===');
    console.error(reason);
    process.exit(2);
}

// ---------------------------------------------------------------------------
// Tiện ích
// ---------------------------------------------------------------------------

const SECRET_PATTERNS = [
    ENV.adminSession,
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    process.env.PICKHUB_QA_ADMIN_SESSION_B || '',
    process.env.PICKHUB_QA_MEMBER_SESSION || '',
    process.env.PICKHUB_QA_TENANT_B_SESSION || '',
].filter((value) => value && value.length > 8);

function scrub(value) {
    let text = typeof value === 'string' ? value : JSON.stringify(value);
    if (text == null) return text;
    for (const secret of SECRET_PATTERNS) text = text.split(secret).join('<redacted>');
    return text;
}

function stats(samples) {
    const values = samples.filter((value) => Number.isFinite(value)).slice().sort((a, b) => a - b);
    if (!values.length) return null;
    // Nearest-rank: ceil(p * n) - 1. Với n nhỏ (5 lần đo) cách này giữ được đuôi
    // chậm; dùng floor(p * (n-1)) sẽ nuốt mất outlier — đúng cái cần thấy ở perf.
    const at = (ratio) => values[Math.min(values.length - 1, Math.max(0, Math.ceil(ratio * values.length) - 1))];
    const mid = Math.floor(values.length / 2);
    return {
        n: values.length,
        min: Math.round(values[0]),
        median: Math.round(values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2),
        p95: Math.round(at(0.95)),
        max: Math.round(values[values.length - 1]),
    };
}

function sum(list) {
    return list.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Thu network theo từng pha
// ---------------------------------------------------------------------------

function createRecorder(page) {
    const state = { active: null, phases: [] };

    page.on('response', async (response) => {
        if (!state.active) return;
        const request = response.request();
        const url = request.url();
        if (!url.startsWith(ENV.baseUrl)) return;

        let encodedBytes = Number(response.headers()['content-length']);
        let decodedBytes = null;
        if (!Number.isFinite(encodedBytes)) encodedBytes = null;
        try {
            const body = await response.body();
            decodedBytes = body.length;
            if (encodedBytes == null) encodedBytes = body.length;
        } catch (_) {
            // Response đã bị huỷ hoặc là redirect — vẫn ghi lại request.
        }

        state.active.requests.push({
            url: url.slice(ENV.baseUrl.length) || '/',
            method: request.method(),
            status: response.status(),
            resourceType: request.resourceType(),
            encodedBytes,
            decodedBytes,
            contentEncoding: response.headers()['content-encoding'] || null,
        });
    });

    return {
        start(name) {
            state.active = { name, requests: [], startedAt: Date.now() };
        },
        stop() {
            if (!state.active) return null;
            const phase = { ...state.active, durationMs: Date.now() - state.active.startedAt };
            state.phases.push(phase);
            state.active = null;
            return phase;
        },
        phases: () => state.phases,
    };
}

// Đợi mạng lặng trong `quietMs` liên tiếp, tối đa `timeoutMs`.
// Dùng thay networkidle vì Next.js dev giữ kết nối HMR.
async function waitSettled(page, { quietMs = 700, timeoutMs = 20000 } = {}) {
    const deadline = Date.now() + timeoutMs;
    let lastActivity = Date.now();
    const bump = () => { lastActivity = Date.now(); };
    page.on('request', bump);
    page.on('response', bump);
    try {
        while (Date.now() < deadline) {
            if (Date.now() - lastActivity >= quietMs) return true;
            await sleep(80);
        }
        return false;
    } finally {
        page.off('request', bump);
        page.off('response', bump);
    }
}

// ---------------------------------------------------------------------------
// Selector của wizard CŨ (đọc trực tiếp từ TournamentWizard.js / StepRegister.js)
// ---------------------------------------------------------------------------

const SEL = {
    createTournament: '.v2-create-tournament',
    wizardRoot: '.w3-create',
    stepper: '.w3-stepper',
    footerCta: '.w3-foot .w3-cta',
    nameInput: '.w3-formwrap input[type="text"]',
    athleteInput: 'input[placeholder="Nhập tên rồi Enter"]',
    rosterPill: '.w3-roster .w3-pill',
    playerChip: '.w3-chip',
    checkpointPanel: '.w3-cp',
};

async function clickCta(page, label) {
    const button = page.locator(SEL.footerCta, { hasText: label });
    if (!(await button.count())) throw new Error(`không tìm thấy nút "${label}" ở ${SEL.footerCta}`);
    await button.first().click();
}

async function gotoStep(page, stepNumber) {
    const button = page.locator(`${SEL.stepper} button`).nth(stepNumber - 1);
    if (!(await button.count())) throw new Error(`stepper không có bước ${stepNumber}`);
    await button.click();
}

// ---------------------------------------------------------------------------
// Các luồng đo
// ---------------------------------------------------------------------------

// Luồng 1 — "Mở nháp": từ dashboard tới wizard render xong bước 1.
async function measureOpenDraft(page, rec) {
    await page.goto(`${ENV.baseUrl}/giai-dau/v2`, { waitUntil: 'domcontentloaded' });
    await waitSettled(page);
    await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
    });

    const trigger = page.locator(SEL.createTournament);
    if (!(await trigger.count())) throw new Error(`không tìm thấy nút tạo giải (${SEL.createTournament})`);

    rec.start('open_draft');
    const startedAt = Date.now();
    await trigger.first().click();
    await page.waitForSelector(SEL.wizardRoot, { timeout: 15000 });
    await waitSettled(page);
    const elapsed = Date.now() - startedAt;
    const phase = rec.stop();
    return { elapsed, phase };
}

// Luồng 2 — "Preview lịch": wizard cũ gọi previewSchedule phản ứng theo config
// (TournamentWizard.js useEffect). Không có nút bấm riêng, nên ta kích hoạt
// bằng cách đổi cấu hình ở bước 1 rồi đo tới khi response về.
async function measurePreview(page, rec) {
    await gotoStep(page, 1);
    await page.waitForSelector(SEL.wizardRoot, { timeout: 10000 });

    const personalUnit = page.locator('.w3-selcard', { hasText: /^Cá nhân/ }).first();
    const currentBestOfThree = page.locator('.w3-seg button[aria-pressed="true"]', { hasText: /3 ván/ });
    const targetButton = (await personalUnit.count()) && await personalUnit.getAttribute('aria-pressed') !== 'true'
        ? personalUnit
        : ((await currentBestOfThree.count())
            ? page.getByRole('button', { name: /1 ván/ }).first()
            : page.getByRole('button', { name: /3 ván/ }).first());

    rec.start('preview_schedule');
    const startedAt = Date.now();

    const waitPreview = page.waitForResponse(
        (response) => response.url().includes('/api/tournament-v2/preview-schedule'),
        { timeout: 15000 },
    ).catch(() => null);

    if (!(await targetButton.count())) {
        const phase = rec.stop();
        return { elapsed: null, phase, blocked: 'không tìm thấy nút cấu hình số ván để kích hoạt previewSchedule' };
    }
    await targetButton.click();

    const response = await waitPreview;
    await waitSettled(page);

    const elapsed = Date.now() - startedAt;
    const phase = rec.stop();
    if (!response) return { elapsed: null, phase, blocked: 'previewSchedule không phát request trong 15s' };
    return { elapsed, phase };
}

// Seed N vận động viên qua ô "Nhập tên rồi Enter".
async function seedAthletes(page, count) {
    await gotoStep(page, 1);
    const personalUnit = page.locator('.w3-selcard', { hasText: /Đánh đơn/ }).first();
    if (await personalUnit.count()) await personalUnit.click();
    await gotoStep(page, 3);
    await page.waitForSelector(SEL.athleteInput, { timeout: 10000 });
    const input = page.locator(SEL.athleteInput).first();
    const stamp = Date.now().toString().slice(-6);
    for (let index = 0; index < count; index += 1) {
        await input.fill(`QAPerf ${stamp}-${String(index + 1).padStart(2, '0')}`);
        await input.press('Enter');
    }
    await waitSettled(page, { quietMs: 500 });
    return page.locator(SEL.playerChip).count();
}

// Luồng 3 — "Chốt tạo giải": bấm "Tạo giải" và chờ chuỗi checkpoint chạy xong.
async function measureFinalize(page, rec) {
    rec.start('finalize');
    const startedAt = Date.now();
    await clickCta(page, 'Tạo giải');
    // Chuỗi checkpoint hiện panel .w3-cp; coi là xong khi mạng lặng và không còn
    // nút "Thử lại" (tức là không có checkpoint nào fail).
    await page.waitForSelector(SEL.checkpointPanel, { timeout: 15000 }).catch(() => null);
    const settled = await waitSettled(page, { quietMs: 1200, timeoutMs: 60000 });
    const elapsed = Date.now() - startedAt;
    const phase = rec.stop();
    const failed = await page.locator('.w3-cp-fail').count();
    return { elapsed, phase, settled, failed: failed > 0 };
}

// Luồng phụ — đếm tải trùng trong một pha đã ghi.
function countDuplicates(phase, matcher) {
    const hits = phase.requests.filter((request) => matcher.test(request.url));
    const byKey = new Map();
    for (const hit of hits) {
        const key = `${hit.method} ${hit.url}`;
        byKey.set(key, (byKey.get(key) || 0) + 1);
    }
    return {
        total: hits.length,
        duplicated: [...byKey.entries()].filter(([, n]) => n > 1).map(([key, n]) => ({ key, n })),
        bytes: sum(hits.map((hit) => hit.decodedBytes)),
    };
}

// Luồng phụ — UI response sau khi thêm / bỏ một người.
async function measureRosterMutation(page, rec) {
    await gotoStep(page, 3);
    await page.waitForSelector(SEL.athleteInput, { timeout: 10000 });
    const input = page.locator(SEL.athleteInput).first();

    rec.start('add_member');
    const addStart = Date.now();
    await input.fill(`QAPerf add ${Date.now().toString().slice(-5)}`);
    await input.press('Enter');
    await page.locator(SEL.playerChip).last().waitFor({ timeout: 10000 });
    await waitSettled(page, { quietMs: 500 });
    const addMs = Date.now() - addStart;
    const addPhase = rec.stop();

    const before = await page.locator(SEL.playerChip).count();
    const removeButton = page.locator(`${SEL.playerChip} button`).last();
    let removeMs = null;
    let removePhase = null;
    if (await removeButton.count()) {
        rec.start('remove_member');
        const removeStart = Date.now();
        await removeButton.click();
        await page.waitForFunction(
            ({ selector, previous }) => document.querySelectorAll(selector).length < previous,
            { selector: SEL.playerChip, previous: before },
            { timeout: 10000 },
        ).catch(() => null);
        await waitSettled(page, { quietMs: 500 });
        removeMs = Date.now() - removeStart;
        removePhase = rec.stop();
    }

    return { addMs, addPhase, removeMs, removePhase };
}

// ---------------------------------------------------------------------------
// Báo cáo
// ---------------------------------------------------------------------------

function renderCell(value, note) {
    if (value == null) return `\`BLOCKED\`${note ? ` — ${note}` : ''}`;
    return String(value);
}

function renderStatsRow(label, route, statistic, bytes, note) {
    if (!statistic) return `| ${label} | \`BLOCKED\` | \`BLOCKED\` | ${route} | \`BLOCKED\` | ${note || 'không đo được'} |`;
    return `| ${label} | ${statistic.requestCount} | med ${statistic.median} / p95 ${statistic.p95} / min ${statistic.min} / max ${statistic.max} | ${route} | ${bytes == null ? '`BLOCKED`' : `${bytes} B`} | n=${statistic.n} |`;
}

function buildReport(result) {
    const lines = [];
    lines.push('## Bảng baseline — đo thật');
    lines.push('');
    lines.push(`Commit đo: \`${result.meta.commit}\` · Thời điểm: ${result.meta.measuredAt} · Chromium ${result.meta.browserVersion}`);
    lines.push(`Viewport ${result.meta.viewport} · ${result.meta.runs} lần đo sau 1 warm-up · ${result.meta.athletes} VĐV · group_id \`${result.meta.groupId}\``);
    lines.push('');
    lines.push('| Luồng | Request count | Thời gian (ms) | Route chính | Payload | Ghi chú |');
    lines.push('|---|---:|---|---|---|---|');
    for (const row of result.rows) {
        lines.push(renderStatsRow(row.label, row.route, row.stats, row.bytes, row.note));
    }
    lines.push('');
    lines.push('## Tải trùng');
    lines.push('');
    lines.push('| Hạng mục | Tổng request | Bị lặp | Bytes |');
    lines.push('|---|---:|---|---:|');
    for (const row of result.duplicates) {
        lines.push(`| ${row.label} | ${renderCell(row.total)} | ${row.duplicated?.length ? row.duplicated.map((d) => `${d.key} ×${d.n}`).join('<br>') : 'không'} | ${renderCell(row.bytes)} |`);
    }
    lines.push('');
    lines.push('## Phản hồi giao diện sau thêm/bỏ người');
    lines.push('');
    lines.push('| Thao tác | Request count | Click → UI settled (ms) |');
    lines.push('|---|---:|---:|');
    for (const row of result.mutations) {
        lines.push(`| ${row.label} | ${renderCell(row.requestCount)} | ${renderCell(row.ms)} |`);
    }
    if (result.blocked.length) {
        lines.push('');
        lines.push('## Ô BLOCKED còn lại và lý do');
        lines.push('');
        for (const item of result.blocked) lines.push(`- **${item.label}**: ${item.reason}`);
    }
    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
    if (!ENV.baseUrl) blocked('baseUrl');
    if (!ENV.adminSession) blocked('adminSession');
    if (!ENV.groupId) blocked('groupId');

    let playwright;
    try {
        playwright = require('playwright');
    } catch (_) {
        blocked('playwright');
    }
    if (blockers.length) fail(blockers.map((line) => `- ${line}`).join('\n'));

    // Chốt điểm baseline: UI cũ phải còn live.
    const wizardSource = fs.readFileSync(path.join(ROOT, 'app/giai-dau/v2/TournamentWizard.js'), 'utf8');
    if (wizardSource.includes('TournamentSetupWorkspace')) {
        fail(`- ${PREREQ.uiWired}`);
    }

    let commit = 'unknown';
    try {
        commit = require('node:child_process')
            .execSync('git rev-parse HEAD', { cwd: ROOT })
            .toString()
            .trim();
    } catch (_) { /* không chặn vì thiếu git */ }

    const probe = await fetch(`${ENV.baseUrl}/`, { redirect: 'manual' }).catch(() => null);
    if (!probe || probe.status >= 500) fail(`- ${PREREQ.server} (${probe ? probe.status : 'không kết nối được'})`);

    const artifactDir = process.env.PICKHUB_PERF_ARTIFACT_DIR
        || path.join(ROOT, '_workspace', 'unified-setup-ux', 'perf-evidence', new Date().toISOString().replace(/[:.]/g, '-'));
    fs.mkdirSync(artifactDir, { recursive: true });

    const browser = await playwright.chromium.launch({
        headless: !ENV.headed,
        ...(ENV.chrome ? { executablePath: ENV.chrome } : {}),
    });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const host = new URL(ENV.baseUrl).hostname;
    await context.addCookies([{ name: 'group_session', value: ENV.adminSession, domain: host, path: '/' }]);

    const page = await context.newPage();
    const rec = createRecorder(page);

    const samples = { openDraft: [], preview: [], finalize: [] };
    const phaseStore = { openDraft: [], preview: [], finalize: [], listing: null, addMember: null, removeMember: null };
    const softBlocked = [];

    try {
        // Xác thực phiên: dashboard phải render được nút tạo giải.
        await page.goto(`${ENV.baseUrl}/giai-dau/v2`, { waitUntil: 'domcontentloaded' });
        await waitSettled(page);
        if (!(await page.locator(SEL.createTournament).count())) {
            fail(`- ${PREREQ.session} (không thấy ${SEL.createTournament} trên /giai-dau/v2)`);
        }

        // Đếm request danh sách giải khi mở dashboard.
        rec.start('tournament_listing');
        await page.reload({ waitUntil: 'domcontentloaded' });
        await waitSettled(page);
        phaseStore.listing = rec.stop();

        const totalRuns = ENV.runs + 1; // lần đầu là warm-up
        for (let run = 0; run < totalRuns; run += 1) {
            const isWarmup = run === 0;
            const tag = isWarmup ? 'warm-up' : `run ${run}/${ENV.runs}`;
            console.log(`\n--- ${tag} ---`);

            const open = await measureOpenDraft(page, rec);
            if (!isWarmup) { samples.openDraft.push(open.elapsed); phaseStore.openDraft.push(open.phase); }
            console.log(`mở nháp: ${open.elapsed} ms, ${open.phase.requests.length} request`);

            const preview = await measurePreview(page, rec);
            if (preview.blocked) {
                if (!softBlocked.some((item) => item.label === 'Preview lịch')) {
                    softBlocked.push({ label: 'Preview lịch', reason: preview.blocked });
                }
            } else if (!isWarmup) {
                samples.preview.push(preview.elapsed);
                phaseStore.preview.push(preview.phase);
            }
            console.log(`preview: ${preview.elapsed == null ? 'BLOCKED' : `${preview.elapsed} ms`}`);

            if (isWarmup) {
                const mutation = await measureRosterMutation(page, rec);
                phaseStore.addMember = { ms: mutation.addMs, phase: mutation.addPhase };
                phaseStore.removeMember = mutation.removeMs == null
                    ? null
                    : { ms: mutation.removeMs, phase: mutation.removePhase };
                console.log(`thêm người: ${mutation.addMs} ms · bỏ người: ${mutation.removeMs ?? 'BLOCKED'} ms`);
            }

            const seeded = await seedAthletes(page, ENV.athletes);
            console.log(`seed: ${seeded} VĐV trên UI`);

            const finalize = await measureFinalize(page, rec);
            if (finalize.failed) {
                softBlocked.push({ label: `Chốt tạo giải (${tag})`, reason: 'chuỗi checkpoint báo lỗi (.w3-cp-fail hiện)' });
            } else if (!isWarmup) {
                samples.finalize.push(finalize.elapsed);
                phaseStore.finalize.push(finalize.phase);
            }
            console.log(`chốt: ${finalize.elapsed} ms, settled=${finalize.settled}, failed=${finalize.failed}`);
        }
    } catch (error) {
        const shot = path.join(artifactDir, 'failure.png');
        await page.screenshot({ path: shot, fullPage: true }).catch(() => null);
        fs.writeFileSync(path.join(artifactDir, 'failure.html'), scrub(await page.content().catch(() => '')), 'utf8');
        await browser.close();
        fail(`- selector hoặc luồng không khớp UI cũ: ${error.message}\n  Ảnh màn hình: ${shot}`);
    }

    const browserVersion = browser.version();
    await browser.close();

    // -----------------------------------------------------------------------
    // Tổng hợp
    // -----------------------------------------------------------------------

    const avgRequests = (phases) => (phases.length
        ? Math.round(phases.reduce((total, phase) => total + phase.requests.length, 0) / phases.length)
        : null);
    const avgBytes = (phases) => (phases.length
        ? Math.round(phases.reduce((total, phase) => total + sum(phase.requests.map((r) => r.decodedBytes)), 0) / phases.length)
        : null);
    const withCount = (statistic, phases) => (statistic ? { ...statistic, requestCount: avgRequests(phases) } : null);

    const result = {
        meta: {
            commit,
            measuredAt: new Date().toISOString(),
            browserVersion,
            viewport: '1440x900',
            runs: ENV.runs,
            athletes: ENV.athletes,
            groupId: ENV.groupId,
            baseUrl: ENV.baseUrl,
            note: 'UI CŨ (wizard 3 bước) — điểm baseline "before" cho GAP-PERF.',
        },
        rows: [
            {
                label: 'Mở nháp',
                route: 'GET /giai-dau/v2 → wizard render',
                stats: withCount(stats(samples.openDraft), phaseStore.openDraft),
                bytes: avgBytes(phaseStore.openDraft),
            },
            {
                label: 'Lưu nháp',
                route: '—',
                stats: null,
                bytes: null,
                note: 'wizard cũ KHÔNG có hành động lưu nháp riêng; bản nháp ghi vào browserStorage đồng bộ, không phát request',
            },
            {
                label: 'Preview lịch',
                route: 'POST /api/tournament-v2/preview-schedule',
                stats: withCount(stats(samples.preview), phaseStore.preview),
                bytes: avgBytes(phaseStore.preview),
            },
            {
                label: 'Chốt tạo giải',
                route: 'chuỗi checkpoint qua /api/tournament-v2/*',
                stats: withCount(stats(samples.finalize), phaseStore.finalize),
                bytes: avgBytes(phaseStore.finalize),
            },
        ],
        duplicates: [
            {
                label: 'Roster (1 lần mở wizard)',
                ...(phaseStore.openDraft[0]
                    ? countDuplicates(phaseStore.openDraft[0], /athlete|roster|member/i)
                    : { total: null, duplicated: [], bytes: null }),
            },
            {
                label: 'Sân (1 lần mở wizard)',
                ...(phaseStore.openDraft[0]
                    ? countDuplicates(phaseStore.openDraft[0], /court|venue|san/i)
                    : { total: null, duplicated: [], bytes: null }),
            },
            {
                label: 'Danh sách giải (1 lần mở dashboard)',
                ...(phaseStore.listing
                    ? countDuplicates(phaseStore.listing, /tournaments/i)
                    : { total: null, duplicated: [], bytes: null }),
            },
            {
                label: 'Toàn bộ API khi chốt',
                ...(phaseStore.finalize[0]
                    ? countDuplicates(phaseStore.finalize[0], /\/api\//i)
                    : { total: null, duplicated: [], bytes: null }),
            },
        ],
        mutations: [
            {
                label: 'Thêm một người',
                ms: phaseStore.addMember?.ms ?? null,
                requestCount: phaseStore.addMember?.phase?.requests.length ?? null,
            },
            {
                label: 'Bỏ một người',
                ms: phaseStore.removeMember?.ms ?? null,
                requestCount: phaseStore.removeMember?.phase?.requests.length ?? null,
            },
        ],
        blocked: softBlocked,
    };

    fs.writeFileSync(
        path.join(artifactDir, 'perf-baseline.json'),
        scrub(JSON.stringify({ result, phases: rec.phases() }, null, 2)),
        'utf8',
    );
    const markdown = buildReport(result);
    fs.writeFileSync(path.join(artifactDir, 'perf-baseline.md'), markdown, 'utf8');

    console.log('\n' + markdown);
    console.log(`\nArtifact: ${path.relative(ROOT, artifactDir)}`);

    const measuredRows = result.rows.filter((row) => row.stats).length;
    if (measuredRows === 0) {
        fail('- không đo được luồng nào; xem artifact để biết selector nào trượt');
    }
    console.log(`\n=== T0.3-live: đo được ${measuredRows}/4 luồng chính ===`);
    if (softBlocked.length) {
        console.log('Còn BLOCKED:');
        for (const item of softBlocked) console.log(`  - ${item.label}: ${item.reason}`);
    }
}

main().catch((error) => {
    console.error(error);
    fail(`- lỗi không lường trước: ${error.message}`);
});
