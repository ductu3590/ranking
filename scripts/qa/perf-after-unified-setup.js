'use strict';

// Post-wire measurement for the four-step internal doubles setup workspace.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const env = {
    baseUrl: (process.env.PICKHUB_QA_BASE_URL || '').replace(/\/$/, ''),
    adminSession: process.env.PICKHUB_QA_ADMIN_SESSION || '',
    groupId: process.env.PICKHUB_QA_GROUP_ID || '',
    chrome: process.env.CHROME_EXECUTABLE || '',
    runs: Math.max(1, Number(process.env.PICKHUB_PERF_RUNS || 5)),
};

function fail(message) {
    console.error(`\n=== R5 after-performance BLOCKED ===\n${message}`);
    process.exit(2);
}

function stats(samples) {
    const values = samples.filter(Number.isFinite).sort((a, b) => a - b);
    if (!values.length) return null;
    const at = (ratio) => values[Math.min(values.length - 1, Math.ceil(ratio * values.length) - 1)];
    const middle = Math.floor(values.length / 2);
    return {
        n: values.length,
        min: Math.round(values[0]),
        median: Math.round(values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2),
        p95: Math.round(at(0.95)),
        max: Math.round(values[values.length - 1]),
    };
}

function sum(values) { return values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0); }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function api(pathname, options = {}) {
    const response = await fetch(`${env.baseUrl}${pathname}`, {
        ...options,
        headers: { 'content-type': 'application/json', cookie: `group_session=${env.adminSession}`, ...(options.headers || {}) },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`${options.method || 'GET'} ${pathname}: ${response.status} ${body.error || ''}`);
    return body;
}

async function ensureFixtureRoster() {
    const roster = await api('/api/tournament-v2/athletes?mode=roster');
    const active = (roster.roster || []).filter((member) => member.is_active !== false && member.athlete_id);
    if (active.length > 14) throw new Error(`fixture must contain at most 14 active members; received ${active.length}`);
    for (let index = active.length; index < 14; index += 1) {
        await api('/api/club/members', { method: 'POST', body: JSON.stringify({ full_name: `QA PERF ${String(index + 1).padStart(2, '0')}` }) });
    }
    const refreshed = await api('/api/tournament-v2/athletes?mode=roster');
    const seeded = (refreshed.roster || []).filter((member) => member.is_active !== false && member.athlete_id);
    if (seeded.length !== 14) throw new Error(`fixture needs exactly 14 identity-mapped members; received ${seeded.length}`);
}

function recorder(page, { baseUrl = env.baseUrl, timeoutMs = 10000 } = {}) {
    let active = null;
    const phases = [];
    const owners = new Map();
    page.on('request', (request) => {
        if (!active || new URL(request.url()).origin !== new URL(baseUrl).origin) return;
        const entry = { url: request.url().slice(baseUrl.length), method: request.method(), status: null, bytes: null, bodyState: 'pending', startedAt: Date.now() };
        active.requests.push(entry);
        owners.set(request, { phase: active, entry });
    });
    page.on('requestfailed', (request) => {
        const owner = owners.get(request);
        if (!owner) return;
        owner.entry.bodyState = 'request-failed';
        owner.entry.error = request.failure()?.errorText || 'request failed';
        owners.delete(request);
    });
    page.on('response', async (response) => {
        const request = response.request();
        const owner = owners.get(request);
        if (!owner) return;
        const { phase, entry } = owner; // Ownership is fixed before any body await.
        entry.status = response.status();
        entry.responseHeadersMs = Date.now() - entry.startedAt;
        const headers = response.headers();
        entry.contentEncoding = headers['content-encoding'] || 'identity';
        entry.contentLength = headers['content-length'] == null ? null : Number(headers['content-length']);
        try {
            const body = await response.body();
            if (!phase.closed) { entry.bytes = body.length; entry.bodyState = 'complete'; }
        } catch (_) {
            if (!phase.closed) entry.bodyState = 'unavailable';
        } finally {
            if (!phase.closed) entry.responseBodyMs = Date.now() - entry.startedAt;
            owners.delete(request);
        }
    });
    return {
        start(name) {
            if (active) throw new Error('A measurement phase is already active');
            active = { name, startedAt: Date.now(), requests: [] };
        },
        async stop() {
            if (!active) throw new Error('No active measurement phase');
            const phase = active;
            active = null;
            phase.durationMs = Date.now() - phase.startedAt;
            const deadline = Date.now() + timeoutMs;
            while ([...owners.values()].some((owner) => owner.phase === phase) && Date.now() < deadline) await sleep(10);
            phase.drainTimedOut = false;
            for (const [request, owner] of owners) {
                if (owner.phase !== phase) continue;
                owner.entry.bodyState = 'timeout';
                phase.drainTimedOut = true;
                owners.delete(request);
            }
            phase.closed = true;
            phases.push(phase);
            return phase;
        },
        phases,
    };
}

async function settled(page, quietMs = 650, timeoutMs = 10000) {
    const startedAt = Date.now();
    let last = Date.now();
    const bump = () => { last = Date.now(); };
    page.on('request', bump); page.on('response', bump);
    try {
        while (Date.now() - last < quietMs) {
            if (Date.now() - startedAt >= timeoutMs) throw new Error(`Network did not settle within ${timeoutMs}ms`);
            await sleep(Math.min(50, timeoutMs));
        }
    } finally { page.off('request', bump); page.off('response', bump); }
}

async function runJourney(page, rec, runNumber) {
    await page.goto(`${env.baseUrl}/giai-dau/v2`, { waitUntil: 'domcontentloaded' });
    await settled(page);
    rec.start('open_draft'); const startOpen = Date.now();
    await page.getByRole('button', { name: /Tạo giải nội bộ/ }).click();
    await page.getByLabel('Tên giải').waitFor(); await settled(page);
    const open = { ms: Date.now() - startOpen, phase: await rec.stop() };

    await page.getByLabel('Tên giải').fill(`QA PERF ${runNumber} ${Date.now()}`);
    await page.getByRole('button', { name: /Chọn toàn bộ thành viên đang hoạt động/ }).click();
    await page.getByText(/Đã chọn 14\/14/).waitFor();

    const lastMember = page.locator('.participants-row input[type=checkbox]').last();
    const before = await page.getByText(/Đã chọn 14\/14/).count();
    const removeStart = Date.now(); await lastMember.uncheck(); await page.getByText(/Đã chọn 13\/14/).waitFor();
    const removeMs = Date.now() - removeStart;
    const addStart = Date.now(); await lastMember.check(); await page.getByText(/Đã chọn 14\/14/).waitFor();
    const addMs = Date.now() - addStart;
    if (!before) throw new Error('roster selection did not render');

    const saveWait = page.waitForResponse((response) => response.url().includes('/api/tournament-v2/setup') && response.request().method() === 'POST' && response.status() < 300);
    rec.start('save_draft'); const saveStart = Date.now();
    await page.getByLabel('Hành động thiết lập giải').getByRole('button', { name: 'Lưu nháp' }).click();
    await saveWait; await page.getByText('Đã lưu').first().waitFor(); await settled(page);
    const save = { ms: Date.now() - saveStart, phase: await rec.stop() };

    await page.getByRole('button', { name: /^Tiếp tục$/ }).click();
    await page.getByRole('button', { name: /^Tự động$/ }).click();
    await page.getByRole('button', { name: /Áp dụng gợi ý tự động/ }).click();
    await page.locator('article.pairing-pair').evaluateAll((pairs) => { if (pairs.length !== 7) throw new Error(`expected 7 pairs, got ${pairs.length}`); });
    await page.getByRole('button', { name: /^Tiếp tục$/ }).click();
    await page.getByRole('button', { name: /^Bốc thăm$/ }).click();
    await page.getByText(/Tổng: 12 trận/).waitFor();

    const previewWait = page.waitForResponse((response) => response.url().includes('/api/tournament-v2/preview-schedule') && response.status() < 300);
    rec.start('preview_schedule'); const previewStart = Date.now();
    await page.getByRole('button', { name: /Sinh trận & xếp sân\/giờ/ }).click();
    await previewWait; await page.getByText(/Đang sinh trận/).waitFor({ state: 'hidden' }); await settled(page);
    const preview = { ms: Date.now() - previewStart, phase: await rec.stop() };

    await page.getByRole('button', { name: /^Tiếp tục$/ }).click();
    const finalizeWait = page.waitForURL(/\/dieu-hanh-giai\/\d+/, { timeout: 60000 });
    rec.start('finalize'); const finalizeStart = Date.now();
    await page.getByLabel('Kiểm tra và chốt lịch').getByRole('button', { name: 'Chốt bốc thăm & tạo lịch' }).click();
    await finalizeWait; await settled(page);
    return { open, save, preview, finalize: { ms: Date.now() - finalizeStart, phase: await rec.stop() }, addMs, removeMs };
}

function duplicateSummary(phases, matcher) {
    const hits = phases.flatMap((phase) => phase.requests).filter((request) => { matcher.lastIndex = 0; return matcher.test(request.url); });
    const counts = new Map();
    for (const hit of hits) counts.set(`${hit.method} ${hit.url}`, (counts.get(`${hit.method} ${hit.url}`) || 0) + 1);
    return { total: hits.length, excessRequests: sum([...counts.values()].map((count) => count - 1)), duplicated: [...counts.entries()].filter(([, count]) => count > 1).map(([key, count]) => `${key} x${count}`), bytes: sum(hits.map((hit) => hit.bytes)), unknownBytes: hits.filter((hit) => !Number.isFinite(hit.bytes)).length };
}

function duplicateRuns(runs, matcher) {
    const perRun = runs.map((phases, index) => ({ run: index + 1, ...duplicateSummary(phases, matcher) }));
    return { perRun, total: sum(perRun.map((run) => run.total)), excessRequests: sum(perRun.map((run) => run.excessRequests)), duplicated: perRun.flatMap((run) => run.duplicated.map((item) => `run ${run.run}: ${item}`)) };
}

const caveats = [
    'Legacy baseline finalizes singles; current workflow finalizes doubles (14 people, 7 pairs). Not a controlled speedup comparison.',
    'Current flow timings include a 650ms network quiet delay; legacy quiet delay differs. These are UI journey timings, not API latency.',
    'Roster mutation timing ends at selection text render, not network settled; legacy mutation timing includes settling.',
    'New payload bytes are decoded response.body() lengths, not wire transfer sizes. Legacy bytes mix Content-Length (possibly encoded) and body lengths; missing bytes are unknown, not zero.',
    'Repeated method + URL within one run is a repetition, not proof of a redundant request; POST bodies may differ.',
];

function deriveReport(source) {
    const names = ['open_draft', 'save_draft', 'preview_schedule', 'finalize'];
    if (!Number.isInteger(source.meta?.runs) || source.meta.runs < 1 || source.phases?.length !== (source.meta.runs + 1) * 4 || source.phases.some((phase, index) => phase.name !== names[index % 4])) throw new Error('Cannot infer warmup/run boundaries from artifact');
    const runs = Array.from({ length: source.meta.runs }, (_, index) => source.phases.slice((index + 1) * 4, (index + 2) * 4));
    return {
        meta: { ...source.meta, derived: true, newMeasurement: false, warmupExcluded: 'First four phases, inferred from original recorder order', acceptance: 'INCOMPLETE: historical phase attribution and missing bodies cannot be repaired offline' },
        caveats: [...caveats, 'Original rows and mutation statistics are retained as reported, not remeasured. Per-run repetitions alone are recomputed; original response-phase race remains unresolvable.'],
        originalRows: source.rows, originalMutations: source.mutations,
        duplicates: { roster: duplicateRuns(runs.map((run) => [run[0]]), /athletes\?mode=roster|roster/i), courts: duplicateRuns(runs, /courts|venues/i), finalize: duplicateRuns(runs.map((run) => [run[3]]), /\/api\//i) },
    };
}

function row(label, samples) {
    const result = stats(samples.map((sample) => sample.ms));
    const requests = samples.map((sample) => sample.phase.requests.length);
    const bytes = samples.map((sample) => sum(sample.phase.requests.map((request) => request.bytes)));
    return { label, stats: result, requestCount: sum(requests) / requests.length, bytes: sum(bytes) / bytes.length, unknownBytes: samples.map((sample) => sample.phase.requests.filter((request) => !Number.isFinite(request.bytes)).length), apiResponseBodyMs: stats(samples.flatMap((sample) => sample.phase.requests.filter((request) => request.url.startsWith('/api/')).map((request) => request.responseBodyMs))) };
}

async function main() {
    if (process.argv[2] === '--derive') {
        const sourcePath = path.resolve(process.argv[3]);
        const result = deriveReport(JSON.parse(fs.readFileSync(sourcePath, 'utf8')));
        result.meta.source = path.relative(ROOT, sourcePath);
        const output = path.join(path.dirname(sourcePath), 'perf-after.derived.json');
        if (fs.existsSync(output)) throw new Error(`Refusing to overwrite ${output}`);
        fs.writeFileSync(output, JSON.stringify(result, null, 2), { flag: 'wx' });
        console.log(JSON.stringify(result, null, 2));
        return;
    }
    if (!env.baseUrl || !env.adminSession || !env.groupId) fail('PICKHUB_QA_BASE_URL, PICKHUB_QA_ADMIN_SESSION, and PICKHUB_QA_GROUP_ID are required.');
    await ensureFixtureRoster();
    const artifactDir = process.env.PICKHUB_PERF_ARTIFACT_DIR || path.join(ROOT, '_workspace', 'unified-setup-ux', 'perf-evidence', new Date().toISOString().replace(/[:.]/g, '-'));
    fs.mkdirSync(artifactDir, { recursive: true });
    const { chromium } = require('playwright');
    const browser = await chromium.launch({ headless: true, ...(env.chrome ? { executablePath: env.chrome } : {}) });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addCookies([{ name: 'group_session', value: env.adminSession, url: env.baseUrl }]);
    const page = await context.newPage(); const rec = recorder(page); const samples = [];
    try {
        await runJourney(page, rec, 'warmup');
        for (let index = 1; index <= env.runs; index += 1) { console.log(`R5 performance run ${index}/${env.runs}`); samples.push(await runJourney(page, rec, index)); }
    } catch (error) {
        await page.screenshot({ path: path.join(artifactDir, 'failure.png'), fullPage: true }).catch(() => null);
        throw error;
    } finally { await browser.close(); }
    const rows = [['Mở nháp', 'open'], ['Lưu nháp', 'save'], ['Preview lịch', 'preview'], ['Chốt tạo giải', 'finalize']].map(([label, key]) => row(label, samples.map((sample) => sample[key])));
    const result = { meta: { measuredAt: new Date().toISOString(), viewport: '1440x900', runs: env.runs, athletes: 14, groupId: env.groupId, workflow: 'four-step internal doubles group_knockout' }, rows, mutations: { add: stats(samples.map((sample) => sample.addMs)), remove: stats(samples.map((sample) => sample.removeMs)) }, duplicates: { roster: duplicateSummary(samples.map((sample) => sample.open.phase), /athletes\?mode=roster|roster/i), courts: duplicateSummary(rec.phases, /courts|venues/i), finalize: duplicateSummary(samples.map((sample) => sample.finalize.phase), /\/api\//i) }, phases: rec.phases };
    const measuredRuns = samples.map((sample) => ['open', 'save', 'preview', 'finalize'].map((key) => sample[key].phase));
    result.duplicates = { roster: duplicateRuns(measuredRuns.map((run) => [run[0]]), /athletes\?mode=roster|roster/i), courts: duplicateRuns(measuredRuns, /courts|venues/i), finalize: duplicateRuns(measuredRuns.map((run) => [run[3]]), /\/api\//i) };
    result.meta = { ...result.meta, node: process.version, platform: process.platform, browser: browser.version(), quietMs: 650, settleTimeoutMs: 10000, bodyDrainTimeoutMs: 10000, warmupRuns: 1, payloadEncoding: 'decoded response bodies; unknown bytes reported separately', timing: 'click to UI plus quiet delay; body drain excluded', serverMode: process.env.PICKHUB_PERF_SERVER_MODE || 'unrecorded', recorderVersion: 2 };
    result.samples = samples;
    result.caveats = caveats;
    result.meta.captureComplete = !measuredRuns.flat().some((phase) => phase.drainTimedOut || phase.requests.some((request) => request.bodyState !== 'complete'));
    const markdown = [
        '## After measurement - four-step workspace', '',
        `Measured: ${result.meta.measuredAt} | viewport: ${result.meta.viewport} | runs: ${env.runs} | roster: 14 active members | group_id: ${env.groupId}`,
        '', '| Flow | Requests | Time (ms) | Payload |', '|---|---:|---|---:|',
        ...rows.map((item) => `| ${item.label} | ${item.requestCount} | med ${item.stats.median} / p95 ${item.stats.p95} / min ${item.stats.min} / max ${item.stats.max} | ${item.bytes} B |`),
        '', '| Roster mutation | Click to selection text render (ms) |', '|---|---:|',
        `| Add one member | med ${result.mutations.add.median} / p95 ${result.mutations.add.p95} |`, `| Remove one member | med ${result.mutations.remove.median} / p95 ${result.mutations.remove.p95} |`,
        '', `Roster requests: ${result.duplicates.roster.total} (${result.duplicates.roster.excessRequests} repeated within runs); courts/venues: ${result.duplicates.courts.total} (${result.duplicates.courts.excessRequests} repeated); finalize API repetitions: ${result.duplicates.finalize.duplicated.join(', ') || 'none'}.`,
        '', `Capture complete: ${result.meta.captureComplete}. Payload totals include known bodies only; see JSON unknownBytes.`, '', ...caveats.map((item) => `- ${item}`),
    ].join('\n');
    fs.writeFileSync(path.join(artifactDir, 'perf-after.json'), JSON.stringify(result, null, 2));
    fs.writeFileSync(path.join(artifactDir, 'perf-after.md'), markdown);
    console.log(markdown); console.log(`Artifact: ${path.relative(ROOT, artifactDir)}`);
}

module.exports = { stats, recorder, settled, duplicateSummary, duplicateRuns, row, deriveReport };
if (require.main === module) main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
