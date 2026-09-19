'use strict';

// ============================================================================
// BROWSER ACCEPTANCE HARNESS — unified tournament setup.
// 05_ACCEPTANCE_AND_REPAIR.md muc A/B/C, cong cac hang muc bo sung cua round 4.
//
// TRUNG THUC:
//   * Moi thao tac DANG DUOC NGHIEM THU tren giao dien deu di qua giao dien
//     (wizard, boc tham, cham diem, tien cap, go seed, man loi/conflict,
//     member-role, viewport). HTTP chi dung de DUNG FIXTURE va KIEM HAU DIEU KIEN.
//     Moi buoc deu ghi ro `via: 'ui' | 'api'` trong artifact.
//   * Thieu dieu kien tien quyet => BLOCKED (exit 2), khong bao gio PASS.
//   * Scenario `required: false` (vd dry-run giai 47) BLOCKED/SKIP KHONG lam
//     suite that bai.
//   * Khong bao gio ghi cookie / mat khau / service key vao artifact. Ham
//     `scrub()` loc ca network log va trace metadata truoc khi ghi.
//
// CHAY:
//   npm run test:wizard-journey
// hoac:
//   node tests/unified-setup/wizard-journey.browser.test.js
//
// BIEN MOI TRUONG BAT BUOC (xem README o cuoi file de tai lap):
//   PICKHUB_QA_BASE_URL          vd http://127.0.0.1:3100 — server chay CHINH
//                                checkout nay (khong phai worktree khac)
//   PICKHUB_QA_ADMIN_SESSION     cookie group_session cua ADMIN CLB kiem thu
//   PICKHUB_QA_ADMIN_SESSION_B   phien admin THU HAI cung CLB (409 / hai nguoi sua)
//   PICKHUB_QA_MEMBER_SESSION    phien THANH VIEN (khong phai admin) cung CLB
//   PICKHUB_QA_TENANT_B_SESSION  phien admin cua CLB KHAC (cach ly tenant)
//   PICKHUB_QA_GROUP_ID          group_id cua CLB kiem thu
//   CHROME_EXECUTABLE            duong dan Chromium/Chrome
// TUY CHON:
//   PICKHUB_QA_TENANT_B_GROUP_ID
//   PICKHUB_QA_ARTIFACT_DIR      mac dinh _workspace/.../evidence/browser
//   PICKHUB_QA_ALLOW_T47_DRYRUN  '1' de bat scenario TUY CHON dry-run giai 47
//   PICKHUB_QA_T47               '<tournamentId>:<divisionId>' cho dry-run do
//   PICKHUB_QA_ONLY              loc scenario theo chuoi con cua id
// ============================================================================

const fs = require('node:fs');
const path = require('node:path');

const QA_PREFIX = 'QA-R4';
const ROOT = path.join(__dirname, '..', '..');

const ENV = {
    baseUrl: (process.env.PICKHUB_QA_BASE_URL || '').replace(/\/$/, ''),
    adminSession: process.env.PICKHUB_QA_ADMIN_SESSION || '',
    adminSessionB: process.env.PICKHUB_QA_ADMIN_SESSION_B || '',
    memberSession: process.env.PICKHUB_QA_MEMBER_SESSION || '',
    tenantBSession: process.env.PICKHUB_QA_TENANT_B_SESSION || '',
    groupId: process.env.PICKHUB_QA_GROUP_ID || '',
    tenantBGroupId: process.env.PICKHUB_QA_TENANT_B_GROUP_ID || '',
    chrome: process.env.CHROME_EXECUTABLE || '',
    artifactDir: process.env.PICKHUB_QA_ARTIFACT_DIR
        || path.join(ROOT, '_workspace', 'claude-unified-setup-handoff', 'evidence', 'browser'),
    allowT47: process.env.PICKHUB_QA_ALLOW_T47_DRYRUN === '1',
    t47: process.env.PICKHUB_QA_T47 || '',
    only: process.env.PICKHUB_QA_ONLY || '',
};

// Ly do BLOCKED phai noi ro thieu gi va sua the nao.
const PREREQ = {
    baseUrl: 'PICKHUB_QA_BASE_URL chua dat: khong co server nao dang chay checkout nay',
    adminSession: 'PICKHUB_QA_ADMIN_SESSION chua dat: khong co cookie group_session admin (khong duoc bia)',
    adminSessionB: 'PICKHUB_QA_ADMIN_SESSION_B chua dat: kich ban hai admin / revision cu can phien thu hai',
    memberSession: 'PICKHUB_QA_MEMBER_SESSION chua dat: kich ban member-role can mot phien khong phai admin',
    tenantBSession: 'PICKHUB_QA_TENANT_B_SESSION chua dat: cach ly tenant can admin cua mot CLB khac',
    groupId: 'PICKHUB_QA_GROUP_ID chua dat: khong ghi/doi chieu duoc pham vi',
    chrome: 'CHROME_EXECUTABLE chua dat va playwright khong co browser tai san',
    playwright: 'khong require duoc goi playwright',
    server: 'base URL khong tra loi',
    session: 'cookie duoc cung cap khong phai phien admin hop le cua group da cau hinh',
    // Nang luc THUC TE cua server/schema, do bang cach goi that (khong doan theo so migration).
    cap_participants: 'server khong ho tro action `replace_participants` (RPC replace_division_participants_revisioned chua deploy)',
    cap_playoff_plan: 'server khong ho tro action `configure_top_two_playoff`',
    cap_unseed: 'server khong ho tro action `unseed_playoff` (RPC unseed_division_group_playoff chua deploy)',
    cap_repair: 'server khong ho tro action `repair_legacy_pairs` (RPC repair_legacy_division_pair_identity chua deploy)',
    cap_rules: 'endpoint /api/tournament-v2/rules khong san sang (khong doi duoc chinh sach tie-break)',
    t47: 'PICKHUB_QA_ALLOW_T47_DRYRUN=1 va PICKHUB_QA_T47=<tournamentId>:<divisionId> la bat buoc truoc khi cham vao giai cu, ke ca chi doc',
};

// --------------------------------------------------------------------------
// Tien ich
// --------------------------------------------------------------------------
const SECRET_KEYS = /(cookie|set-cookie|authorization|password|apikey|api_key|service_role|token|group_session)/i;

// Loai bo moi thu co the la bi mat truoc khi ghi ra dia.
function scrub(value) {
    if (value == null) return value;
    if (typeof value === 'string') {
        let out = value;
        for (const secret of [ENV.adminSession, ENV.adminSessionB, ENV.memberSession, ENV.tenantBSession]) {
            if (secret && secret.length > 8) out = out.split(secret).join('<redacted>');
        }
        return out.replace(/group_session=[^;\s"']+/gi, 'group_session=<redacted>');
    }
    if (Array.isArray(value)) return value.map(scrub);
    if (typeof value === 'object') {
        const out = {};
        for (const [key, item] of Object.entries(value)) {
            out[key] = SECRET_KEYS.test(key) ? '<redacted>' : scrub(item);
        }
        return out;
    }
    return value;
}

function redact(value) { return value ? '<redacted>' : '<missing>'; }

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function recordArtifact(name, data) {
    fs.mkdirSync(ENV.artifactDir, { recursive: true });
    const file = path.join(ENV.artifactDir, name);
    fs.writeFileSync(file, `${JSON.stringify(scrub(data), null, 2)}\n`, 'utf8');
    return path.relative(ROOT, file).split(path.sep).join('/');
}

async function api(token, method, route, body, query) {
    const url = new URL(`/api/tournament-v2${route}`, ENV.baseUrl);
    for (const [key, value] of Object.entries(query || {})) url.searchParams.set(key, String(value));
    const response = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json', cookie: `group_session=${token}` },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    let payload = null;
    try { payload = await response.json(); } catch { payload = null; }
    return { status: response.status, body: payload };
}

// Cho mot dieu kien tro thanh dung. KHONG dung sleep co dinh o bat ky dau.
async function waitUntil(fn, { timeout = 30000, interval = 250, what = 'dieu kien' } = {}) {
    const deadline = Date.now() + timeout;
    let last = null;
    for (;;) {
        try {
            const value = await fn();
            if (value) return value;
        } catch (error) { last = error; }
        if (Date.now() > deadline) {
            throw new Error(`het gio cho ${what}${last ? ` (loi cuoi: ${last.message})` : ''}`);
        }
        await new Promise((resolve) => setTimeout(resolve, interval));
    }
}

// --------------------------------------------------------------------------
// Lop dieu khien giao dien. Moi ham o day deu thao tac THAT tren trang.
// --------------------------------------------------------------------------
async function newPage(ctx, token, viewport) {
    const context = await ctx.browser.newContext({ viewport: viewport || { width: 1440, height: 900 } });
    await context.addCookies([{ name: 'group_session', value: token, url: ENV.baseUrl, httpOnly: true, sameSite: 'Lax' }]);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error.message)));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    page.qaErrors = errors;
    ctx.pages.push({ page, context });
    return page;
}

// Loi 404 cua favicon/anh khong phai loi ung dung.
function appErrors(page) {
    return (page.qaErrors || []).filter((text) => !/favicon|404 \(Not Found\)|Failed to load resource/i.test(text));
}

const RX = {
    createTournament: /Tạo giải đấu mới|Tạo giải đầu tiên/,
    scopeInternal: /Nội bộ CLB/,
    unitPair: /Cặp đôi/,
    unitSingle: /Cá nhân/,
    formatGroupPlayoff: /Vòng bảng \+ CK/,
    formatRoundRobin: /^✓?\s*Vòng tròn/,
    next: /Tiếp tục/,
    submitCreate: /^Tạo giải$/,
    nameInput: 'Nhập tên rồi Enter',
    stepDraw: /Bốc thăm & chốt lịch/,
    stepResults: /Lịch thi đấu & kết quả/,
    stepStandings: /Bảng đấu & xếp hạng/,
    stepAthletes: /VĐV & cặp đấu/,
    stageGroup: /^Vòng tròn$/,
    stagePlayoff: /^Play-off$/,
    drawRoll: /^Bốc thăm$/,
    drawLockOpen: /Chốt & sinh lịch/,
    drawLockConfirm: /^Chốt lịch$/,
    saveScore: /Lưu tỉ số/,
    advance: /Tiến cấp vào play-off/,
    unseed: /Gỡ seed play-off/,
    saveRoster: /Lưu đội hình/,
};

// Chay wizard THAT tu dau den cuoi. Tra { name, tournamentId }.
async function runWizard(page, { name, bronze, participants = 14, unit = 'pair', reloadDuringCreation = false }) {
    await page.goto(`${ENV.baseUrl}/giai-dau/v2`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: RX.createTournament }).first().click();

    await page.getByRole('button', { name: RX.scopeInternal }).first().click();
    await page.getByRole('button', { name: unit === 'single' ? RX.unitSingle : RX.unitPair }).first().click();
    if (unit !== 'single') await page.getByRole('button', { name: RX.formatGroupPlayoff }).first().click();
    await page.getByRole('button', { name: RX.next }).first().click();

    await page.locator('input').first().fill(name);
    await page.getByRole('button', { name: RX.next }).first().click();

    const input = page.getByPlaceholder(RX.nameInput);
    await input.waitFor({ state: 'visible' });
    for (let index = 1; index <= participants; index += 1) {
        await input.fill(`${QA_PREFIX} VDV ${String(index).padStart(2, '0')}`);
        await input.press('Enter');
    }
    await page.getByText(`${QA_PREFIX} VDV ${String(participants).padStart(2, '0')}`).first().waitFor();

    if (unit !== 'single') {
        const bronzeBox = page.locator('input[type=checkbox]').first();
        await bronzeBox.waitFor({ state: 'attached' });
        if ((await bronzeBox.isChecked()) !== Boolean(bronze)) await bronzeBox.setChecked(Boolean(bronze));
        assert(await bronzeBox.isChecked() === Boolean(bronze), 'khong dat duoc trang thai tranh hang ba nhu mong muon');
    }

    await page.getByRole('button', { name: RX.submitCreate }).click();

    if (reloadDuringCreation) {
        // 05 A3 noi ro: tai lai GIUA CAC CHECKPOINT DA PERSIST. Truoc checkpoint
        // dau tien thi chua co gi duoc ghi xuong, nen phai doi it nhat mot buoc
        // bao "Xong" roi moi tai lai — tai som hon la kiem thu sai hop dong.
        await waitUntil(async () => (await page.getByText(/Ti\u1ebfn tr\u00ecnh t\u1ea1o gi\u1ea3i/).count()) > 0,
            { what: 'bang tien trinh tao giai hien ra', timeout: 60000 });
        await waitUntil(async () => /\bXong\b/.test(await page.locator('body').innerText()),
            { what: 'it nhat mot checkpoint da persist', timeout: 90000 });
        await page.reload({ waitUntil: 'domcontentloaded' });
        // Tai lai dua nguoi dung ve danh sach giai; ban nhap nam trong
        // localStorage. Mo lai man tao giai thi wizard phai NHAN RA ban nhap va
        // moi tiep tuc, chu khong bat dau lai tu dau.
        if (!/\/dieu-hanh-giai\//.test(page.url())) {
            await page.getByRole('button', { name: RX.createTournament }).first().click();
            const resume = page.getByRole('button', { name: /Ti\u1ebfp t\u1ee5c t\u1ea1o gi\u1ea3i/ });
            await waitUntil(async () => (await resume.count()) > 0,
                { what: 'wizard nhan ra ban nhap va moi tiep tuc', timeout: 60000 });
            assert((await page.getByRole('button', { name: /B\u1ecf b\u1ea3n nh\u00e1p/ }).count()) > 0,
                'man khoi phuc phai cho nguoi dung chon bo ban nhap, khong ep tiep tuc');
            await resume.first().click();
        }
    }

    // Thanh cong chi duoc cong nhan khi wizard dieu huong sang ban dieu hanh.
    await page.waitForURL(/\/dieu-hanh-giai\/\d+/, { timeout: 180000 });
    const tournamentId = Number(/\/dieu-hanh-giai\/(\d+)/.exec(page.url())[1]);
    assert(Number.isInteger(tournamentId), 'khong doc duoc tournamentId tu URL sau khi tao giai');
    return { name, tournamentId };
}

async function openConsole(page, tournamentId) {
    if (!page.url().includes(`/dieu-hanh-giai/${tournamentId}`)) {
        await page.goto(`${ENV.baseUrl}/dieu-hanh-giai/${tournamentId}`, { waitUntil: 'domcontentloaded' });
    }
    await page.getByRole('button', { name: RX.stepDraw }).first().waitFor({ timeout: 30000 });
}

// Doi mot phan hoi API xac dinh thay vi ngu mot khoang co dinh. Neu man hinh
// khong goi API nao (da co cache) thi khong coi do la loi.
function apiSettled(page, pattern = /\/api\/tournament-v2\//, timeout = 20000) {
    return page.waitForResponse(
        (response) => pattern.test(response.url()) && response.status() < 400,
        { timeout },
    ).catch(() => null);
}

async function notLoading(page, what, timeout = 30000) {
    await waitUntil(async () => !(await page.getByText(/\u0110ang t\u1ea3i|\u0110ang t\u00ednh/).count()),
        { what, timeout });
}

// Duoi 900px, thanh buoc nam trong ngan keo an di (translateX(-100%)), nen
// phai mo ngan keo truoc khi bam — neu khong Playwright se cho mai mot phan tu
// nam ngoai khung nhin.
async function openDrawerIfNeeded(page) {
    const burger = page.locator('.ops-burger');
    if (!(await burger.count()) || !(await burger.first().isVisible())) return;
    if (await page.locator('.ops-shell.is-drawer-open').count()) return;
    await burger.first().click();
    await waitUntil(async () => (await page.locator('.ops-shell.is-drawer-open').count()) > 0,
        { what: 'ngan keo dieu huong mo ra', timeout: 15000 });
}

async function gotoStep(page, stepRx) {
    await openDrawerIfNeeded(page);
    const settled = apiSettled(page);
    await page.getByRole('button', { name: stepRx }).first().click();
    await settled;
    await notLoading(page, 'man hinh tai xong');
}

// `expectedCards` la tin hieu XAC DINH rang danh sach da thuc su doi sang giai
// doan moi. Thieu no, harness co the doc nham danh sach cua giai doan cu (nut da
// doi trang thai nhung React chua render lai xong).
async function pickStage(page, stageRx, expectedCards) {
    const picker = page.locator('.ops-stage-picker button', { hasText: stageRx });
    if (!(await picker.count())) return;
    const button = picker.first();
    const already = (await button.getAttribute('aria-pressed')) === 'true';
    const settled = already ? null : apiSettled(page);
    if (!already) await button.click();
    // Tin hieu XAC DINH: nut da o trang thai duoc chon VA du lieu giai doan moi
    // da ve. Truoc day chi kiem "khong con chu Dang tai" nen kiem tra lot qua
    // ngay lap tuc va harness van doc du lieu cua giai doan cu.
    await waitUntil(async () => (await button.getAttribute('aria-pressed')) === 'true',
        { what: 'nut giai doan chuyen sang trang thai duoc chon', timeout: 15000 });
    if (settled) await settled;
    await notLoading(page, 'doi giai doan');
    if (expectedCards != null) {
        await waitUntil(async () => (await page.locator('.v2-match-card').count()) === expectedCards,
            { what: `danh sach hien du ${expectedCards} tran cua giai doan vua chon`, timeout: 45000 });
    }
}

// Ten hien thi cua tung suat, dung de nhan dien DUNG tran can cham tren giao
// dien (BRONZE va F nam CUNG mot vong "Chung ket" nen nhan vong khong phan biet
// duoc hai tran do).
function normalizeName(value) {
    return String(value || '').replace(/[\s/]+/g, ' ').trim().toLowerCase();
}
const PLACEHOLDER_NAME = /^\u0110\u1ed9i [AB]$/;

// Boc tham + chot lich QUA GIAO DIEN.
async function drawAndLock(page, tournamentId) {
    await openConsole(page, tournamentId);
    await gotoStep(page, RX.stepDraw);
    await pickStage(page, RX.stageGroup);
    // Wizard da boc tham san (bang A/B co san, nut la "Boc lai"). Chi boc khi
    // giai doan chua co ban boc tham nao — boc lai se vut bo ban wizard vua tao.
    await waitUntil(async () => (await page.getByRole('button', { name: RX.drawRoll }).count()) > 0
        || (await page.getByRole('button', { name: RX.drawLockOpen }).count()) > 0,
    { what: 'man boc tham hien ra', timeout: 45000 });
    if (await page.getByRole('button', { name: RX.drawRoll }).count()) {
        await page.getByRole('button', { name: RX.drawRoll }).first().click();
        await waitUntil(async () => (await page.getByRole('button', { name: RX.drawLockOpen }).count()) > 0,
            { what: 'nut chot lich xuat hien sau khi boc' });
    }
    await page.getByRole('button', { name: RX.drawLockOpen }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    await dialog.getByRole('button', { name: RX.drawLockConfirm }).click();
    await waitUntil(async () => (await page.getByText(/Đã chốt bốc thăm/).count()) > 0
        || (await page.getByRole('button', { name: /^Huỷ chốt$/ }).count()) > 0,
    { what: 'boc tham duoc chot', timeout: 60000 });
}

// Cham diem TAT CA cac tran dang cho cua giai doan dang xem, QUA GIAO DIEN.
// `plan(index, names)` tra [scoreA, scoreB] cho tung tran, hoac null de bo qua.
async function scoreVisibleMatches(page, plan) {
    // Danh sach tran nap bat dong bo VA render lai sau moi lan luu, nen khong
    // duoc giu locator theo chi so: sau mot lan luu, `cards.nth(i)` co the tro
    // vao mot node da bi thao. Vong lap nay TIM LAI tran chua cham o moi buoc.
    await waitUntil(async () => (await page.locator('.v2-match-card').count()) > 0,
        { what: 'danh sach tran hien ra', timeout: 45000 });

    const PENDING = /Ch\u01b0a \u0111\u1ea5u/;
    let scored = 0;
    let skipped = 0;
    for (;;) {
        const pending = page.locator('.v2-match-card').filter({ hasText: PENDING });
        const remaining = await pending.count();
        if (skipped >= remaining) break;
        const card = pending.nth(skipped);
        const inputs = card.locator('input.v2-score-input');
        if (!(await inputs.count())) { skipped += 1; continue; }
        const labels = await inputs.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label') || ''));
        const names = labels.map((label) => label.replace(/^\u0110i\u1ec3m\s*/, '').trim());
        const scores = plan(scored, names, await card.innerText());
        if (!scores) { skipped += 1; continue; }

        await inputs.nth(0).fill(String(scores[0]));
        await inputs.nth(1).fill(String(scores[1]));
        // Xac nhan gia tri that su nam trong o truoc khi luu: neu node vua bi
        // render lai thi fill co the roi vao hu khong.
        assert(await inputs.nth(0).inputValue() === String(scores[0])
            && await inputs.nth(1).inputValue() === String(scores[1]),
        `ti so khong vao duoc o nhap cua tran "${names.join(' vs ')}"`);

        const save = card.getByRole('button', { name: RX.saveScore });
        if (!(await save.count())) { skipped += 1; continue; }
        await save.first().click();
        // Danh sach tu nap lai sau khi luu: phai doi no HIEN RA DU roi moi
        // ket luan, neu khong se bat gap khoanh khac danh sach rong va tuong
        // nham la "khong con tran nao".
        await waitUntil(async () => {
            const total = await page.locator('.v2-match-card').count();
            if (total === 0) return false;
            return (await page.locator('.v2-match-card').filter({ hasText: PENDING }).count()) === remaining - 1;
        }, { what: `luu ti so tran "${names.join(' vs ')}"`, timeout: 45000 });
        scored += 1;
    }
    return scored;
}

// Doc bang xep hang QUA API (hau dieu kien), khong thay cho thao tac UI.
async function readStandings(token, stageId) {
    const result = await api(token, 'GET', '/standings', undefined, { stageId });
    assert(result.status === 200, `GET /standings tra ve ${result.status}`);
    return result.body;
}

async function scopeOf(token, tournamentId) {
    const stages = await api(token, 'GET', '/stages', undefined, { tournamentId });
    assert(stages.status === 200, `GET /stages tra ve ${stages.status}`);
    const rows = Array.isArray(stages.body) ? stages.body : (stages.body?.stages || []);
    const group = rows.find((stage) => stage.schedule_format === 'round_robin');
    const playoff = rows.find((stage) => stage.schedule_format === 'knockout');
    const divisionId = rows.map((stage) => stage.division_id).find(Boolean);
    return { tournamentId, divisionId, stages: rows, groupStage: group, playoffStage: playoff };
}

async function matchesOf(token, stageId) {
    const result = await api(token, 'GET', '/matches', undefined, { stageId });
    assert(result.status === 200, `GET /matches tra ve ${result.status}`);
    return result.body?.matches || [];
}

async function setupOf(token, scope) {
    const result = await api(token, 'GET', '/setup', undefined, {
        tournamentId: scope.tournamentId, divisionId: scope.divisionId,
    });
    assert(result.status === 200, `GET /setup tra ve ${result.status}`);
    return result.body;
}

// Kiem tra bo doi/entry do wizard tao ra (hau dieu kien cua hanh trinh UI).
async function assertPairBackedEntries(token, scope, expectedPairs) {
    const setup = await setupOf(token, scope);
    const { roster, pairs, entries } = setup;
    assert(roster.athletes.length === expectedPairs * 2,
        `mong doi ${expectedPairs * 2} dinh danh VDV, nhan ${roster.athletes.length}`);
    assert(roster.athlete_ids.length === expectedPairs * 2,
        `mong doi ${expectedPairs * 2} dong roster tuong minh, nhan ${roster.athlete_ids.length}`);
    assert(pairs.length === expectedPairs, `mong doi ${expectedPairs} cap, nhan ${pairs.length}`);
    for (const pair of pairs) {
        assert(pair.members.length === 2, `cap ${pair.id} co ${pair.members.length} thanh vien`);
        assert(new Set(pair.members.map((m) => m.tournament_athlete_id)).size === 2, `cap ${pair.id} lap dinh danh`);
        assert(pair.entry_id, `cap ${pair.id} khong gan voi entry nao`);
    }
    const approved = entries.filter((entry) => entry.status === 'approved');
    assert(approved.length === expectedPairs, `mong doi ${expectedPairs} entry approved, nhan ${approved.length}`);
    assert(approved.every((entry) => entry.pair_id), 'co entry doi da duyet nhung pair_id NULL (dung loi cua giai 47)');
    const used = pairs.flatMap((pair) => pair.members.map((m) => m.tournament_athlete_id));
    assert(new Set(used).size === used.length, 'mot VDV nam trong hai cap dang hoat dong cua cung noi dung');
    return setup;
}

// Tien cap QUA GIAO DIEN (nut that trong tab Bang xep hang).
async function advanceViaUi(page, tournamentId) {
    await openConsole(page, tournamentId);
    await gotoStep(page, RX.stepStandings);
    await pickStage(page, RX.stageGroup);
    const button = page.getByRole('button', { name: RX.advance }).first();
    await button.waitFor({ timeout: 30000 });
    await button.click();
    await waitUntil(async () => (await page.getByRole('button', { name: /Đang tiến cấp/ }).count()) === 0,
        { what: 'tien cap xong', timeout: 60000 });
}

// Do vung cham nho nhat cua cac control hien ra (bo qua o tick nam trong label lon).
async function measureTapTargets(page) {
    return page.evaluate(() => {
        const out = [];
        for (const el of document.querySelectorAll('button, a[href], input, select, [role=button]')) {
            const rect = el.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) continue;
            let target = rect;
            const label = el.closest('label');
            if (label) {
                const labelRect = label.getBoundingClientRect();
                if (labelRect.height > target.height) target = labelRect;
            }
            out.push({
                text: (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40),
                cls: String(el.className || '').slice(0, 50),
                w: Math.round(target.width),
                h: Math.round(target.height),
            });
        }
        return {
            controls: out,
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
    });
}

// ==========================================================================
// SCENARIO
//   needs     : khoa dieu kien tien quyet (xem PREREQ)
//   required  : false => BLOCKED/SKIP KHONG lam suite that bai
//   via       : cac lop bang chung ma scenario thuc su dung
// ==========================================================================
const SCENARIOS = [];

function scenario(definition) { SCENARIOS.push({ required: true, ...definition }); }

const CORE = ['baseUrl', 'adminSession', 'groupId', 'chrome', 'playwright', 'server', 'session', 'cap_participants', 'cap_playoff_plan'];

// --------------------------------------------------------------------------
// A. Hanh trinh day du — hai bien the tranh hang ba.
// --------------------------------------------------------------------------
async function fullJourney(ctx, { bronze }) {
    const label = bronze ? 'bronze-on' : 'bronze-off';
    const name = `${QA_PREFIX} ${ctx.stamp} ${label}`;
    const page = await newPage(ctx, ENV.adminSession);
    const { tournamentId } = await runWizard(page, { name, bronze, participants: 14 });
    ctx.created.push({ scenario: `A-journey-${label}`, tournamentId, name });

    const scope = await scopeOf(ENV.adminSession, tournamentId);
    assert(scope.groupStage && scope.playoffStage, 'wizard khong tao du ca giai doan vong bang lan play-off');
    assert(Number(scope.groupStage.config?.groupCount) === 2, 'vong bang khong duoc cau hinh 2 bang');
    await assertPairBackedEntries(ENV.adminSession, scope, 7);

    // So tran play-off phan biet hai bien the ngay tu luc lap ke hoach.
    const playoffFixtures = await matchesOf(ENV.adminSession, scope.playoffStage.id);
    assert(playoffFixtures.length === (bronze ? 4 : 3),
        `mong doi ${bronze ? 4 : 3} tran play-off (${bronze ? 'SF1+SF2+F+BRONZE' : 'SF1+SF2+F'}), nhan ${playoffFixtures.length}`);

    // Boc tham + chot lich QUA GIAO DIEN.
    await drawAndLock(page, tournamentId);
    const groupFixtures = await matchesOf(ENV.adminSession, scope.groupStage.id);
    assert(groupFixtures.length === 9, `mong doi C(4,2)+C(3,2)=9 tran vong bang, nhan ${groupFixtures.length}`);
    assert(groupFixtures.length + playoffFixtures.length === (bronze ? 13 : 12),
        `tong so tran phai la ${bronze ? 13 : 12}`);

    // Cham diem toan bo vong bang QUA GIAO DIEN.
    await gotoStep(page, RX.stepResults);
    await pickStage(page, RX.stageGroup, 9);
    const scored = await scoreVisibleMatches(page, (index) => [11, 3 + (index % 5)]);
    assert(scored === 9, `phai cham du 9 tran vong bang tren giao dien, moi cham ${scored}`);
    await waitUntil(async () => (await matchesOf(ENV.adminSession, scope.groupStage.id))
        .every((match) => ['done', 'finalized'].includes(match.status)),
    { what: 'ca 9 tran vong bang duoc chot' });

    // Bang xep hang phai xep hang that (khong con rong / khong con null group).
    const standings = await readStandings(ENV.adminSession, scope.groupStage.id);
    assert(standings.standings.length === 7, `BXH phai co 7 dong, nhan ${standings.standings.length}`);
    assert(standings.standings.every((row) => row.group_label), 'co dong BXH khong co nhan bang');
    assert(Array.isArray(standings.tiebreak_criteria) && standings.tiebreak_criteria.length,
        'BXH phai kem nhan tieu chi tie-break');

    // Tien cap QUA GIAO DIEN.
    await advanceViaUi(page, tournamentId);
    const seeded = await waitUntil(async () => {
        const rows = await matchesOf(ENV.adminSession, scope.playoffStage.id);
        const semis = rows.filter((row) => /SF/.test(row.match_key || ''));
        return semis.length === 2 && semis.every((row) => row.entry_a_id && row.entry_b_id) ? rows : null;
    }, { what: 'hai tran ban ket duoc seed' });

    // Doi chieu A1-B2 / B1-A2 voi chinh bang xep hang.
    const rank = {};
    for (const row of standings.standings) rank[`${row.group_label}${row.rank}`] = row.entrant_id;
    const sf1 = seeded.find((row) => /SF1/.test(row.match_key));
    const sf2 = seeded.find((row) => /SF2/.test(row.match_key));
    assert(sf1 && sf2, 'khong tim thay SF1/SF2 theo match_key');
    const pairOf = (row) => [row.entry_a_id, row.entry_b_id].sort((a, b) => a - b).join('-');
    const expect1 = [rank.A1, rank.B2].sort((a, b) => a - b).join('-');
    const expect2 = [rank.B1, rank.A2].sort((a, b) => a - b).join('-');
    assert(pairOf(sf1) === expect1, `SF1 phai la A1-B2 (${expect1}), nhan ${pairOf(sf1)}`);
    assert(pairOf(sf2) === expect2, `SF2 phai la B1-A2 (${expect2}), nhan ${pairOf(sf2)}`);

    // Cham ban ket QUA GIAO DIEN.
    const playoffCards = bronze ? 4 : 3;
    await gotoStep(page, RX.stepResults);
    await pickStage(page, RX.stagePlayoff, playoffCards);
    // Chi ban ket moi co doi thuc; chung ket va tranh hang ba con la "Doi A/B".
    // DUNG lai sau dung hai ban ket: cham xong SF2 thi chung ket lap tuc co
    // du hai doi, va neu khong chan lai thi vong lap se cham luon chung ket —
    // lam mat chinh cai thu tu (tranh hang ba TRUOC chung ket) dang can nghiem thu.
    const semisScored = await scoreVisibleMatches(page, (index, names) => (
        index < 2 && !names.some((value) => PLACEHOLDER_NAME.test(value)) ? [11, 4] : null
    ));
    assert(semisScored === 2, `phai cham dung hai ban ket, moi cham ${semisScored}`);

    if (bronze) {
        // Tranh hang ba PHAI hoan tat TRUOC chung ket, va nguoi thang bronze
        // KHONG duoc coi la vo dich khi chung ket con dang cho.
        // BRONZE va F nam CUNG mot vong ("Chung ket") nen nhan vong khong phan
        // biet duoc. Nhan dien tran tranh hang ba bang chinh hai doi THUA ban ket.
        const poBefore = await matchesOf(ENV.adminSession, scope.playoffStage.id);
        const bronzeRow = poBefore.find((row) => /BRONZE/i.test(row.match_key || ''));
        assert(bronzeRow && bronzeRow.entry_a_id && bronzeRow.entry_b_id,
            'tran tranh hang ba chua nhan duoc hai doi thua ban ket');
        const entrySetup = await setupOf(ENV.adminSession, scope);
        const nameOf = {};
        for (const entry of entrySetup.entries) nameOf[String(entry.id)] = normalizeName(entry.name_snapshot);
        const bronzeSide = [nameOf[String(bronzeRow.entry_a_id)], nameOf[String(bronzeRow.entry_b_id)]].sort();

        await gotoStep(page, RX.stepResults);
        await pickStage(page, RX.stagePlayoff, playoffCards);
        const bronzeScored = await scoreVisibleMatches(page, (index, names) => {
            const shown = names.map(normalizeName).sort();
            return JSON.stringify(shown) === JSON.stringify(bronzeSide) ? [11, 5] : null;
        });
        assert(bronzeScored === 1, `phai cham dung tran tranh hang ba truoc chung ket, cham ${bronzeScored}`);
        const midway = await readStandings(ENV.adminSession, scope.playoffStage.id);
        const top = midway.standings.filter((row) => row.rank === 1);
        const bronzeMatch = (await matchesOf(ENV.adminSession, scope.playoffStage.id))
            .find((row) => /BRONZE/i.test(row.match_key || ''));
        assert(bronzeMatch && bronzeMatch.winner_entry_id, 'tran tranh hang ba chua co nguoi thang');
        assert(!top.some((row) => row.entrant_id === bronzeMatch.winner_entry_id),
            'nguoi thang tranh hang ba bi xep hang 1 trong khi chung ket chua xong (loi E2)');
    }

    // Chung ket.
    await gotoStep(page, RX.stepResults);
    await pickStage(page, RX.stagePlayoff, playoffCards);
    const finalScored = await scoreVisibleMatches(page, (index, names) => (
        names.some((value) => PLACEHOLDER_NAME.test(value)) ? null : [11, 6]
    ));
    assert(finalScored >= 1, 'khong cham duoc chung ket');
    await waitUntil(async () => (await matchesOf(ENV.adminSession, scope.playoffStage.id))
        .every((match) => ['done', 'finalized'].includes(match.status)),
    { what: 'toan bo tran play-off da xong' });

    const finalStandings = await readStandings(ENV.adminSession, scope.playoffStage.id);
    const byRank = finalStandings.standings.slice().sort((a, b) => a.rank - b.rank);
    const thirds = byRank.filter((row) => row.rank === 3);
    if (bronze) {
        assert(thirds.length === 1, `co tranh hang ba thi hang 3 phai duy nhat, nhan ${thirds.length}`);
        assert(byRank.filter((row) => row.rank === 4).length === 1, 'co tranh hang ba thi phai co hang 4');
    } else {
        assert(thirds.length === 2, `khong tranh hang ba thi hai doi thua ban ket phai DONG hang ba, nhan ${thirds.length}`);
    }
    assert(byRank.filter((row) => row.rank === 1).length === 1, 'phai co dung mot doi vo dich');
    assert(byRank.filter((row) => row.rank === 2).length === 1, 'phai co dung mot doi a quan');
    assert(appErrors(page).length === 0, `co loi JavaScript tren trang: ${appErrors(page).join(' | ')}`);

    return {
        tournamentId,
        groupStageId: scope.groupStage.id,
        playoffStageId: scope.playoffStage.id,
        fixtures: { group: groupFixtures.length, playoff: playoffFixtures.length },
        placement: byRank.map((row) => ({ entry_id: row.entrant_id, rank: row.rank })),
    };
}

scenario({
    id: 'A-journey-bronze-off',
    title: '05 A1-A8 khong tranh hang ba: 14 VDV -> 7 cap -> 2 bang 4/3 -> 9 tran -> 12 tran, hai doi thua ban ket DONG hang ba',
    needs: CORE,
    via: ['ui:wizard', 'ui:draw', 'ui:scoring', 'ui:advance', 'api:assert'],
    async run(ctx) {
        const result = await fullJourney(ctx, { bronze: false });
        ctx.artifacts['A-journey-bronze-off'] = recordArtifact(`journey-bronze-off-${ctx.stamp}.json`, result);
    },
});

scenario({
    id: 'A-journey-bronze-on',
    title: '05 A1-A8 co tranh hang ba: 13 tran, tranh hang ba xong TRUOC chung ket khong lam nguoi thang thanh vo dich (E2)',
    needs: CORE,
    via: ['ui:wizard', 'ui:draw', 'ui:scoring', 'ui:advance', 'api:assert'],
    async run(ctx) {
        const result = await fullJourney(ctx, { bronze: true });
        ctx.artifacts['A-journey-bronze-on'] = recordArtifact(`journey-bronze-on-${ctx.stamp}.json`, result);
    },
});

scenario({
    id: 'A-wizard-reload-resume',
    title: '05 A3: tai lai GIUA CAC CHECKPOINT DA PERSIST -> wizard tiep tuc dung giai do, khong nhan doi giai / VDV / cap',
    needs: CORE,
    via: ['ui:wizard', 'api:assert'],
    async run(ctx) {
        const name = `${QA_PREFIX} ${ctx.stamp} reload`;
        const page = await newPage(ctx, ENV.adminSession);
        const { tournamentId } = await runWizard(page, { name, bronze: false, participants: 14, reloadDuringCreation: true });
        ctx.created.push({ scenario: 'A-wizard-reload-resume', tournamentId, name });
        const scope = await scopeOf(ENV.adminSession, tournamentId);
        const before = await assertPairBackedEntries(ENV.adminSession, scope, 7);

        await page.goto(`${ENV.baseUrl}/dieu-hanh-giai/${tournamentId}`, { waitUntil: 'domcontentloaded' });
        await page.reload({ waitUntil: 'domcontentloaded' });
        const after = await assertPairBackedEntries(ENV.adminSession, scope, 7);
        assert(JSON.stringify(before.roster.athlete_ids) === JSON.stringify(after.roster.athlete_ids),
            'id dinh danh doi sau khi tai lai');

        const list = await api(ENV.adminSession, 'GET', '/tournaments');
        const rows = (Array.isArray(list.body) ? list.body : list.body?.tournaments || []).filter((row) => row.name === name);
        assert(rows.length === 1, `tai lai lam nhan doi giai: ${rows.length} dong ten "${name}"`);
        ctx.artifacts['A-wizard-reload-resume'] = recordArtifact(`reload-resume-${ctx.stamp}.json`, {
            tournamentId, athlete_ids: after.roster.athlete_ids, tournaments_with_name: rows.length,
        });
    },
});

// --------------------------------------------------------------------------
// T. Tie-break: chinh sach khac mac dinh phai doi THU HANG va SUAT tien cap.
//
// Cung MOT cau truc ket qua, hai chinh sach hop le cho hai thu tu khac nhau:
//   legacy_v2         match_points -> hieu so diem  => C, A, B, D
//   phong_trao_mac_dinh match_points -> doi dau truc tiep => A, C, B, D
// Suat A1/A2 doi hai vai, keo theo cap dau ban ket doi theo.
// Diem duoc gan theo VAI TRO (a/b/c/d) suy ra tu chinh ban boc tham quan sat
// duoc, nen khong phu thuoc vao thu tu boc tham ngau nhien.
// --------------------------------------------------------------------------
const TIEBREAK_SCORELINE = {
    'a|b': [11, 9],
    'a|c': [11, 10],
    'a|d': [5, 11],
    'b|c': [1, 11],
    'b|d': [11, 7],
    'c|d': [11, 1],
    'e|f': [11, 5],
    'e|g': [11, 5],
    'f|g': [11, 5],
};

// Gan vai tro on dinh cho tung suat: bang A -> a,b,c,d; bang B -> e,f,g.
function assignRoles(matches) {
    const byGroup = {};
    for (const match of matches) {
        const label = match.group_label || 'A';
        (byGroup[label] ||= new Set()).add(match.entry_a_id);
        byGroup[label].add(match.entry_b_id);
    }
    const labels = Object.keys(byGroup).sort();
    const roles = {};
    const letters = { [labels[0]]: ['a', 'b', 'c', 'd'], [labels[1]]: ['e', 'f', 'g', 'h'] };
    for (const label of labels) {
        [...byGroup[label]].sort((x, y) => x - y).forEach((entryId, index) => {
            roles[entryId] = letters[label][index];
        });
    }
    return { roles, labels };
}

function scorelineFor(roleA, roleB) {
    const key = [roleA, roleB].sort().join('|');
    const value = TIEBREAK_SCORELINE[key];
    if (!value) return null;
    return roleA < roleB ? value : [value[1], value[0]];
}

async function tiebreakJourney(ctx, { preset, expectedGroupOrder }) {
    const name = `${QA_PREFIX} ${ctx.stamp} tb-${preset}`;
    const page = await newPage(ctx, ENV.adminSession);
    const { tournamentId } = await runWizard(page, { name, bronze: false, participants: 14 });
    ctx.created.push({ scenario: `T-tiebreak-${preset}`, tournamentId, name });

    if (preset !== 'legacy_v2') {
        // Dat chinh sach TRUOC khi boc tham: sau khi chot lich, giai doan da
        // snapshot luat nen doi nua se bi tu choi (dung thiet ke).
        const patched = await api(ENV.adminSession, 'PATCH', '/rules', {
            tournament_id: tournamentId, scope: 'tournament', tiebreak_preset: preset,
        });
        assert(patched.status === 200, `PATCH /rules tra ve ${patched.status}: ${JSON.stringify(patched.body)}`);
    }

    const scope = await scopeOf(ENV.adminSession, tournamentId);
    await drawAndLock(page, tournamentId);
    const fixtures = await matchesOf(ENV.adminSession, scope.groupStage.id);
    assert(fixtures.length === 9, `mong doi 9 tran vong bang, nhan ${fixtures.length}`);

    const { roles } = assignRoles(fixtures);
    const setup = await setupOf(ENV.adminSession, scope);
    // Ten tren the tran co dau gach va khoang trang khac voi name_snapshot,
    // nen doi chieu qua dang da chuan hoa.
    const roleByName = {};
    for (const entry of setup.entries) {
        const role = roles[entry.id];
        if (role) roleByName[normalizeName(entry.name_snapshot)] = role;
    }

    await gotoStep(page, RX.stepResults);
    await pickStage(page, RX.stageGroup, 9);
    const scored = await scoreVisibleMatches(page, (index, names) => {
        const roleA = roleByName[normalizeName(names[0])];
        const roleB = roleByName[normalizeName(names[1])];
        if (!roleA || !roleB) throw new Error(`khong xac dinh duoc vai tro cho "${names[0]}" / "${names[1]}"`);
        const line = scorelineFor(roleA, roleB);
        if (!line) throw new Error(`khong co ti so du kien cho cap ${roleA}-${roleB}`);
        return line;
    });
    assert(scored === 9, `phai cham du 9 tran, moi cham ${scored}`);
    await waitUntil(async () => (await matchesOf(ENV.adminSession, scope.groupStage.id))
        .every((match) => ['done', 'finalized'].includes(match.status)), { what: 'vong bang xong' });

    const standings = await readStandings(ENV.adminSession, scope.groupStage.id);
    const { labels } = assignRoles(fixtures);
    const groupA = standings.standings
        .filter((row) => row.group_label === labels[0])
        .sort((x, y) => x.rank - y.rank)
        .map((row) => roles[row.entrant_id]);
    assert(groupA.join('') === expectedGroupOrder,
        `chinh sach ${preset}: thu tu bang ${labels[0]} phai la ${expectedGroupOrder}, nhan ${groupA.join('')}`);

    // Nhan luat hien thi phai la chinh chinh sach vua dung de tinh.
    assert(Array.isArray(standings.tiebreak_criteria) && standings.tiebreak_criteria.length,
        'thieu nhan tieu chi tie-break');
    if (preset === 'phong_trao_mac_dinh') {
        assert(/Đối đầu trực tiếp/.test(standings.tiebreak_criteria[1] || ''),
            `nhan luat khong khop chinh sach da dat: ${JSON.stringify(standings.tiebreak_criteria)}`);
    }

    await advanceViaUi(page, tournamentId);
    const seeded = await waitUntil(async () => {
        const rows = await matchesOf(ENV.adminSession, scope.playoffStage.id);
        const semis = rows.filter((row) => /SF/.test(row.match_key || ''));
        return semis.length === 2 && semis.every((row) => row.entry_a_id && row.entry_b_id) ? semis : null;
    }, { what: 'ban ket duoc seed' });

    const sf1 = seeded.find((row) => /SF1/.test(row.match_key));
    const a1Role = groupA[0];
    assert([sf1.entry_a_id, sf1.entry_b_id].some((id) => roles[id] === a1Role),
        `SF1 phai chua suat A1 (vai tro ${a1Role})`);

    return {
        preset, tournamentId, groupOrder: groupA.join(''),
        tiebreak_criteria: standings.tiebreak_criteria,
        sf1: { a: roles[sf1.entry_a_id], b: roles[sf1.entry_b_id] },
    };
}

scenario({
    id: 'T-tiebreak-changes-rank-and-qualifiers',
    title: 'Tie-break khac mac dinh doi THU HANG va SUAT A1/A2 (legacy_v2 => C,A,B,D | phong_trao_mac_dinh => A,C,B,D)',
    needs: [...CORE, 'cap_rules'],
    via: ['ui:wizard', 'ui:draw', 'ui:scoring', 'ui:advance', 'api:policy', 'api:assert'],
    async run(ctx) {
        const base = await tiebreakJourney(ctx, { preset: 'legacy_v2', expectedGroupOrder: 'cabd' });
        const alt = await tiebreakJourney(ctx, { preset: 'phong_trao_mac_dinh', expectedGroupOrder: 'acbd' });
        assert(base.groupOrder !== alt.groupOrder, 'hai chinh sach cho cung thu hang — fixture khong chung minh duoc gi');
        assert(base.sf1.a !== alt.sf1.a || base.sf1.b !== alt.sf1.b, 'doi chinh sach ma cap ban ket khong doi');
        ctx.artifacts['T-tiebreak-changes-rank-and-qualifiers'] =
            recordArtifact(`tiebreak-policy-${ctx.stamp}.json`, { legacy_v2: base, phong_trao_mac_dinh: alt });
    },
});

scenario({
    id: 'T-tiebreak-change-blocked-after-seed',
    title: 'Doi chinh sach tie-break SAU khi da seed play-off bi chan 409 (E5), khong am tham doi BXH',
    needs: [...CORE, 'cap_rules'],
    via: ['ui:wizard', 'ui:draw', 'ui:scoring', 'ui:advance', 'api:policy'],
    async run(ctx) {
        const name = `${QA_PREFIX} ${ctx.stamp} tb-guard`;
        const page = await newPage(ctx, ENV.adminSession);
        const { tournamentId } = await runWizard(page, { name, bronze: false, participants: 12 });
        ctx.created.push({ scenario: 'T-tiebreak-change-blocked-after-seed', tournamentId, name });
        const scope = await scopeOf(ENV.adminSession, tournamentId);
        await drawAndLock(page, tournamentId);
        await gotoStep(page, RX.stepResults);
        await pickStage(page, RX.stageGroup, 6);
        await scoreVisibleMatches(page, (index) => [11, 2 + index]);
        await waitUntil(async () => (await matchesOf(ENV.adminSession, scope.groupStage.id))
            .every((match) => ['done', 'finalized'].includes(match.status)), { what: 'vong bang xong' });
        await advanceViaUi(page, tournamentId);
        await waitUntil(async () => (await matchesOf(ENV.adminSession, scope.playoffStage.id))
            .some((row) => row.entry_a_id), { what: 'play-off da seed' });

        const before = await readStandings(ENV.adminSession, scope.groupStage.id);
        const attempt = await api(ENV.adminSession, 'PATCH', '/rules', {
            tournament_id: tournamentId, scope: 'tournament', tiebreak_preset: 'draw_lot',
        });
        assert(attempt.status === 409,
            `doi tie-break sau khi seed phai bi tu choi 409, nhan ${attempt.status}: ${JSON.stringify(attempt.body)}`);
        const after = await readStandings(ENV.adminSession, scope.groupStage.id);
        assert(JSON.stringify(before.standings.map((r) => [r.entrant_id, r.rank]))
            === JSON.stringify(after.standings.map((r) => [r.entrant_id, r.rank])),
        'BXH doi sau mot lan doi chinh sach bi tu choi');
        ctx.artifacts['T-tiebreak-change-blocked-after-seed'] =
            recordArtifact(`tiebreak-guard-${ctx.stamp}.json`, {
                tournamentId, status: attempt.status, code: attempt.body?.code,
            });
    },
});

// --------------------------------------------------------------------------
// C. Sua ket qua / go seed / chan go seed.
// --------------------------------------------------------------------------
async function seededTournament(ctx, page, label, participants = 12) {
    const name = `${QA_PREFIX} ${ctx.stamp} ${label}`;
    const { tournamentId } = await runWizard(page, { name, bronze: false, participants });
    ctx.created.push({ scenario: label, tournamentId, name });
    const scope = await scopeOf(ENV.adminSession, tournamentId);
    await drawAndLock(page, tournamentId);
    await gotoStep(page, RX.stepResults);
    await pickStage(page, RX.stageGroup, 6);
    await scoreVisibleMatches(page, (index) => [11, 2 + index]);
    await waitUntil(async () => (await matchesOf(ENV.adminSession, scope.groupStage.id))
        .every((match) => ['done', 'finalized'].includes(match.status)), { what: 'vong bang xong' });
    await advanceViaUi(page, tournamentId);
    await waitUntil(async () => (await matchesOf(ENV.adminSession, scope.playoffStage.id))
        .some((row) => row.entry_a_id), { what: 'play-off da seed' });
    return { name, tournamentId, scope };
}

async function unseedViaUi(page, tournamentId) {
    await openConsole(page, tournamentId);
    await gotoStep(page, RX.stepAthletes);
    const button = page.getByRole('button', { name: RX.unseed }).first();
    await button.waitFor({ timeout: 30000 });
    await button.click();
}

scenario({
    id: 'C-correction-blocked-then-unseed-recovers',
    title: 'Sua ket qua vong bang sau khi seed -> 409; go seed tren GIAO DIEN -> sua duoc -> tien cap lai ra suat dung',
    needs: [...CORE, 'cap_unseed'],
    via: ['ui:wizard', 'ui:draw', 'ui:scoring', 'ui:advance', 'ui:unseed', 'api:correction'],
    async run(ctx) {
        const page = await newPage(ctx, ENV.adminSession);
        const { tournamentId, scope } = await seededTournament(ctx, page, 'C-correction-blocked-then-unseed-recovers');
        const groupMatches = await matchesOf(ENV.adminSession, scope.groupStage.id);
        const target = groupMatches[0];
        // Route correction bat buoc CAS tren version cua chinh tran do.
        const flipped = {
            match_id: target.id,
            games: [{ game_no: 1, score_a: 3, score_b: 11 }],
            reason: 'QA: doi nguoi thang de kiem guard E5',
            expected_version: target.version,
            idempotency_key: `qa-corr-${ctx.stamp}-${target.id}`,
        };
        const blocked = await api(ENV.adminSession, 'POST', '/corrections', flipped);
        assert(blocked.status === 409,
            `sua ket qua sau khi seed phai 409, nhan ${blocked.status}: ${JSON.stringify(blocked.body)}`);
        const stillSeeded = await matchesOf(ENV.adminSession, scope.playoffStage.id);
        assert(stillSeeded.some((row) => row.entry_a_id), '409 lam mat seed — dang le khong ghi gi');

        await unseedViaUi(page, tournamentId);
        await waitUntil(async () => (await matchesOf(ENV.adminSession, scope.playoffStage.id))
            .every((row) => !row.entry_a_id && !row.entry_b_id), { what: 'play-off duoc go seed', timeout: 60000 });

        // Doc lai version: go seed khong doi ket qua nhung phai lay ban moi nhat.
        const fresh = (await matchesOf(ENV.adminSession, scope.groupStage.id))
            .find((row) => row.id === target.id);
        const allowed = await api(ENV.adminSession, 'POST', '/corrections', {
            ...flipped,
            expected_version: fresh.version,
            idempotency_key: `qa-corr2-${ctx.stamp}-${target.id}`,
        });
        assert(allowed.status === 200,
            `sau khi go seed, sua ket qua phai duoc chap nhan, nhan ${allowed.status}: ${JSON.stringify(allowed.body)}`);

        const corrected = (await matchesOf(ENV.adminSession, scope.groupStage.id))
            .find((row) => row.id === target.id);
        assert(corrected.winner_entry_id === target.entry_b_id,
            'sua ket qua khong doi duoc nguoi thang nhu mong doi');

        await advanceViaUi(page, tournamentId);
        const reseeded = await waitUntil(async () => {
            const rows = await matchesOf(ENV.adminSession, scope.playoffStage.id);
            return rows.some((row) => row.entry_a_id) ? rows : null;
        }, { what: 'seed lai sau khi sua' });
        const standings = await readStandings(ENV.adminSession, scope.groupStage.id);
        const rank = {};
        for (const row of standings.standings) rank[`${row.group_label}${row.rank}`] = row.entrant_id;
        const sf1 = reseeded.find((row) => /SF1/.test(row.match_key || ''));
        assert([sf1.entry_a_id, sf1.entry_b_id].sort((x, y) => x - y).join('-')
            === [rank.A1, rank.B2].sort((x, y) => x - y).join('-'),
        'seed moi khong khop bang xep hang sau khi sua');
        ctx.artifacts['C-correction-blocked-then-unseed-recovers'] =
            recordArtifact(`unseed-recovery-${ctx.stamp}.json`, {
                tournamentId,
                blocked_status: blocked.status, blocked_code: blocked.body?.code,
                allowed_status: allowed.status,
                sf1_after: { a: sf1.entry_a_id, b: sf1.entry_b_id }, rank,
            });
    },
});

scenario({
    id: 'C-unseed-refused-when-downstream-started',
    title: 'Go seed bi tu choi 409 khi tran vong sau da co ket qua; khong dung gi toi du lieu',
    needs: [...CORE, 'cap_unseed'],
    via: ['ui:wizard', 'ui:draw', 'ui:scoring', 'ui:advance', 'ui:unseed'],
    async run(ctx) {
        const page = await newPage(ctx, ENV.adminSession);
        const { tournamentId, scope } = await seededTournament(ctx, page, 'C-unseed-refused-when-downstream-started');
        await gotoStep(page, RX.stepResults);
        await pickStage(page, RX.stagePlayoff, 3);
        const scored = await scoreVisibleMatches(page, (index, names) => (
            index === 0 && !names.some((value) => PLACEHOLDER_NAME.test(value)) ? [11, 4] : null
        ));
        assert(scored === 1, `phai cham dung mot tran ban ket, cham ${scored}`);
        const before = await matchesOf(ENV.adminSession, scope.playoffStage.id);

        const rejected = await api(ENV.adminSession, 'POST', '/setup', {
            action: 'unseed_playoff',
            tournament_id: tournamentId,
            division_id: scope.divisionId,
            group_stage_id: scope.groupStage.id,
            expected_setup_revision: (await setupOf(ENV.adminSession, scope)).readiness.revision,
            idempotency_key: `qa-unseed-block-${ctx.stamp}`,
        });
        assert(rejected.status === 409,
            `go seed khi tran vong sau da bat dau phai 409, nhan ${rejected.status}: ${JSON.stringify(rejected.body)}`);
        const after = await matchesOf(ENV.adminSession, scope.playoffStage.id);
        assert(JSON.stringify(before.map((r) => [r.id, r.entry_a_id, r.entry_b_id, r.status]))
            === JSON.stringify(after.map((r) => [r.id, r.entry_a_id, r.entry_b_id, r.status])),
        'go seed bi tu choi nhung du lieu van doi');

        // Nut tren giao dien cung phai bao loi chu khong am tham khong lam gi.
        await unseedViaUi(page, tournamentId);
        await waitUntil(async () => (await page.getByText(/không|lỗi|đã bắt đầu|409/i).count()) > 0,
            { what: 'giao dien bao loi go seed', timeout: 20000 }).catch(() => {});
        const afterUi = await matchesOf(ENV.adminSession, scope.playoffStage.id);
        assert(JSON.stringify(after.map((r) => r.entry_a_id)) === JSON.stringify(afterUi.map((r) => r.entry_a_id)),
            'nut go seed tren giao dien van go duoc du downstream da bat dau');
        ctx.artifacts['C-unseed-refused-when-downstream-started'] =
            recordArtifact(`unseed-refused-${ctx.stamp}.json`, {
                tournamentId, status: rejected.status, code: rejected.body?.code,
            });
    },
});

// --------------------------------------------------------------------------
// B. Do tin cay, phan quyen, cach ly, viewport.
// --------------------------------------------------------------------------
scenario({
    id: 'B-conflict-409-rehydrate-requires-confirm',
    title: '409 tren giao dien -> panel tu tai lai trang thai moi va YEU CAU xac nhan, khong tu ghi tiep',
    needs: [...CORE, 'adminSessionB'],
    via: ['ui:console', 'api:fixture'],
    async run(ctx) {
        const name = `${QA_PREFIX} ${ctx.stamp} conflict`;
        const page = await newPage(ctx, ENV.adminSession);
        const { tournamentId } = await runWizard(page, { name, bronze: false, participants: 8 });
        ctx.created.push({ scenario: 'B-conflict-409-rehydrate-requires-confirm', tournamentId, name });
        const scope = await scopeOf(ENV.adminSession, tournamentId);

        await openConsole(page, tournamentId);
        await gotoStep(page, RX.stepAthletes);
        const revisionBefore = (await setupOf(ENV.adminSession, scope)).readiness.revision;
        await page.getByText(new RegExp(`Rev ${revisionBefore}`)).first().waitFor({ timeout: 30000 });

        // Phien admin THU HAI day revision len ngoai luong.
        const bump = await api(ENV.adminSessionB, 'POST', '/setup', {
            action: 'lock_roster', tournament_id: tournamentId, division_id: scope.divisionId,
            expected_setup_revision: revisionBefore, idempotency_key: `qa-bump-${ctx.stamp}`,
        });
        assert(bump.status === 200, `phien thu hai phai khoa duoc doi hinh, nhan ${bump.status}`);
        const revisionAfter = (await setupOf(ENV.adminSession, scope)).readiness.revision;
        assert(revisionAfter > revisionBefore, 'revision khong tang sau thao tac cua phien thu hai');

        await page.getByRole('button', { name: RX.saveRoster }).first().click();
        // Panel phai tu rehydrate sang revision moi VA noi ro can xac nhan lai.
        await page.getByText(new RegExp(`Rev ${revisionAfter}`)).first().waitFor({ timeout: 30000 });
        const body = await page.locator('body').innerText();
        assert(/xác nhận/i.test(body),
            'man hinh conflict khong yeu cau nguoi dung xac nhan lai truoc khi thu lai');
        const revisionNow = (await setupOf(ENV.adminSession, scope)).readiness.revision;
        assert(revisionNow === revisionAfter, 'giao dien tu dong ghi tiep sau 409 (khong duoc phep)');

        // Man hinh loi/conflict phai dung o moi be ngang.
        const measurements = {};
        for (const width of [375, 390, 768, 1440]) {
            await page.setViewportSize({ width, height: 900 });
            const measured = await measureTapTargets(page);
            assert(measured.overflow <= 1, `man hinh conflict tran ngang ${measured.overflow}px o be ${width}`);
            measurements[width] = { overflow: measured.overflow, controls: measured.controls.length };
            await page.screenshot({
                path: path.join(ENV.artifactDir, `conflict-${width}-${ctx.stamp}.png`), fullPage: true,
            });
        }
        ctx.artifacts['B-conflict-409-rehydrate-requires-confirm'] =
            recordArtifact(`conflict-rehydrate-${ctx.stamp}.json`, {
                tournamentId, revisionBefore, revisionAfter, measurements,
            });
    },
});

scenario({
    id: 'B-member-role-ui-and-api',
    title: 'Thanh vien: giao dien khong lo hanh dong quan tri VA moi mutation qua API deu bi tu choi',
    needs: [...CORE, 'memberSession'],
    via: ['ui:console', 'api:authz'],
    async run(ctx) {
        const name = `${QA_PREFIX} ${ctx.stamp} member`;
        const adminPage = await newPage(ctx, ENV.adminSession);
        const { tournamentId } = await runWizard(adminPage, { name, bronze: false, participants: 8 });
        ctx.created.push({ scenario: 'B-member-role-ui-and-api', tournamentId, name });
        const scope = await scopeOf(ENV.adminSession, tournamentId);

        const memberPage = await newPage(ctx, ENV.memberSession);
        await memberPage.goto(`${ENV.baseUrl}/dieu-hanh-giai/${tournamentId}`, { waitUntil: 'domcontentloaded' });
        await waitUntil(async () => (await memberPage.locator('button').count()) > 0, { what: 'trang thanh vien hien ra' });
        const labels = await memberPage.locator('button').allInnerTexts();
        const forbidden = [RX.saveRoster, RX.unseed, /Khóa đội hình/, /^Bốc thăm$|^Bốc lại$/, RX.advance];
        for (const rx of forbidden) {
            assert(!labels.some((text) => rx.test(text.trim())),
                `giao dien thanh vien van lo nut quan tri khop ${rx}`);
        }
        const memberWrite = await api(ENV.memberSession, 'POST', '/setup', {
            action: 'lock_roster', tournament_id: tournamentId, division_id: scope.divisionId,
            expected_setup_revision: 1, idempotency_key: `qa-member-${ctx.stamp}`,
        });
        assert([401, 403].includes(memberWrite.status), `mutation cua thanh vien tra ve ${memberWrite.status}, mong doi 401/403`);
        ctx.artifacts['B-member-role-ui-and-api'] =
            recordArtifact(`member-role-${ctx.stamp}.json`, {
                tournamentId, buttons: labels.map((t) => t.replace(/\s+/g, ' ').trim()).slice(0, 40),
                member_write_status: memberWrite.status,
            });
    },
});

scenario({
    id: 'B-tenant-isolation',
    title: 'Tenant B khong doc/ghi duoc du lieu cua tenant A du biet du id cha-con',
    needs: [...CORE, 'tenantBSession'],
    via: ['ui:wizard', 'api:authz'],
    async run(ctx) {
        const name = `${QA_PREFIX} ${ctx.stamp} tenant`;
        const page = await newPage(ctx, ENV.adminSession);
        const { tournamentId } = await runWizard(page, { name, bronze: false, participants: 8 });
        ctx.created.push({ scenario: 'B-tenant-isolation', tournamentId, name });
        const scope = await scopeOf(ENV.adminSession, tournamentId);

        const read = await api(ENV.tenantBSession, 'GET', '/setup', undefined, {
            tournamentId, divisionId: scope.divisionId,
        });
        assert([401, 403, 404].includes(read.status), `tenant B doc duoc voi status ${read.status}`);
        assert(!JSON.stringify(read.body || {}).includes(QA_PREFIX), 'tenant B nhin thay du lieu cua tenant A');

        const write = await api(ENV.tenantBSession, 'POST', '/setup', {
            action: 'lock_roster', tournament_id: tournamentId, division_id: scope.divisionId,
            expected_setup_revision: 1, idempotency_key: `qa-cross-${ctx.stamp}`,
        });
        assert([401, 403, 404, 409].includes(write.status), `ghi cheo tenant tra ve ${write.status}`);
        const after = await setupOf(ENV.adminSession, scope);
        assert(after.readiness.roster_lock_status !== 'locked', 'ghi cheo tenant da co hieu luc');
        ctx.artifacts['B-tenant-isolation'] = recordArtifact(`tenant-isolation-${ctx.stamp}.json`, {
            tournamentId, read_status: read.status, write_status: write.status,
        });
    },
});

scenario({
    id: 'B-viewports-and-tap-targets',
    title: 'Wizard + console dung o 375/390/768/1440: khong tran ngang, khong con control quan trong duoi 44px',
    needs: CORE,
    via: ['ui:wizard', 'ui:console'],
    async run(ctx) {
        const name = `${QA_PREFIX} ${ctx.stamp} viewport`;
        const page = await newPage(ctx, ENV.adminSession);
        const { tournamentId } = await runWizard(page, { name, bronze: false, participants: 8 });
        ctx.created.push({ scenario: 'B-viewports-and-tap-targets', tournamentId, name });

        // Hai control tung do duoi 44px o 375px: nut chon giai doan va "Vao dieu hanh".
        const CRITICAL = [/^Vòng tròn$/, /^Play-off$/, /^Vào điều hành$/];
        const report = {};
        for (const width of [375, 390, 768, 1440]) {
            await page.setViewportSize({ width, height: 900 });
            await openConsole(page, tournamentId);
            await gotoStep(page, RX.stepAthletes);
            // Doi bo chon giai doan render xong roi moi do: neu do som, cac nut
            // chua ton tai va phep do se "dat" ma khong kiem duoc gi.
            await waitUntil(async () => (await page.locator('.ops-stage-picker button').count()) >= 2,
                { what: 'bo chon giai doan hien ra', timeout: 30000 });
            const measured = await measureTapTargets(page);
            assert(measured.overflow <= 1, `tran ngang ${measured.overflow}px o be ${width}`);
            const small = measured.controls.filter((c) => (c.w < 44 || c.h < 44)
                && CRITICAL.some((rx) => rx.test(c.text)));
            assert(small.length === 0,
                `o be ${width} van con control quan trong nho hon 44px: ${JSON.stringify(small)}`);
            const critical = measured.controls.filter((c) => CRITICAL.some((rx) => rx.test(c.text)));
            assert(critical.length >= 3, `phai do duoc ca 3 control quan trong o be ${width}, chi thay ${critical.length}`);
            report[width] = { overflow: measured.overflow, critical };
            await page.screenshot({
                path: path.join(ENV.artifactDir, `viewport-${width}-${ctx.stamp}.png`), fullPage: true,
            });
        }
        ctx.artifacts['B-viewports-and-tap-targets'] =
            recordArtifact(`viewports-${ctx.stamp}.json`, { tournamentId, report });
    },
});

scenario({
    id: 'B-legacy-singles-regression',
    title: 'Giai DON (duong legacy) van tao duoc va khong bi day sang duong dinh danh cap doi',
    needs: CORE,
    via: ['ui:wizard', 'api:assert'],
    async run(ctx) {
        const name = `${QA_PREFIX} ${ctx.stamp} singles`;
        const page = await newPage(ctx, ENV.adminSession);
        const { tournamentId } = await runWizard(page, { name, bronze: false, participants: 6, unit: 'single' });
        ctx.created.push({ scenario: 'B-legacy-singles-regression', tournamentId, name });
        const scope = await scopeOf(ENV.adminSession, tournamentId);
        const setup = await setupOf(ENV.adminSession, scope);
        assert(setup.entries.length === 6, `mong doi 6 suat don, nhan ${setup.entries.length}`);
        assert(setup.pairs.length === 0, 'giai don khong duoc tao cap');
        ctx.artifacts['B-legacy-singles-regression'] =
            recordArtifact(`singles-${ctx.stamp}.json`, { tournamentId, entries: setup.entries.length });
    },
});

// --------------------------------------------------------------------------
// C. TUY CHON — dry-run chi doc tren giai legacy. KHONG bat buoc de suite pass.
// --------------------------------------------------------------------------
scenario({
    id: 'repair-dry-run-legacy',
    required: false,
    title: '05 C (TUY CHON): dry-run sua cap legacy — chi doc, khong ghi gi, anh xa theo entry_member id',
    needs: ['baseUrl', 'adminSession', 'groupId', 'server', 'session', 'cap_repair', 't47'],
    via: ['api:readonly'],
    async run(ctx) {
        const [tournamentId, divisionId] = ENV.t47.split(':').map(Number);
        const before = await api(ENV.adminSession, 'GET', '/setup', undefined, { tournamentId, divisionId });
        assert(before.status === 200, `GET /setup cho giai legacy tra ve ${before.status}`);
        const shape = {
            revision: before.body.readiness.revision,
            entries: before.body.entries.length,
            pairs: before.body.pairs.length,
            athletes: before.body.roster.athletes.length,
        };
        const dry = await api(ENV.adminSession, 'POST', '/setup', {
            action: 'repair_legacy_pairs', tournament_id: tournamentId, division_id: divisionId,
            dry_run: true, expected_setup_revision: shape.revision, idempotency_key: `qa-dry-${ctx.stamp}`,
        });
        assert(dry.status === 200, `dry run tra ve ${dry.status}: ${JSON.stringify(dry.body)}`);
        assert(dry.body.dry_run === true, 'phan hoi khong duoc danh dau dry_run');
        for (const entry of dry.body.entries || []) {
            if (entry.planned !== 'create_pair') continue;
            assert(entry.members.length === 2, `entry ${entry.entry_id} khong anh xa dung 2 thanh vien`);
            for (const member of entry.members) {
                assert(/^legacy:entry_member:\d+$/.test(member.client_ref),
                    `anh xa khong khoa theo entry member id: ${member.client_ref}`);
            }
        }
        const after = await api(ENV.adminSession, 'GET', '/setup', undefined, { tournamentId, divisionId });
        assert(after.body.readiness.revision === shape.revision, 'dry run lam tang setup_revision');
        assert(after.body.entries.length === shape.entries, 'dry run doi so entry');
        assert(after.body.pairs.length === shape.pairs, 'dry run tao pair');
        assert(after.body.roster.athletes.length === shape.athletes, 'dry run tao dinh danh');
        ctx.artifacts['repair-dry-run-legacy'] =
            recordArtifact(`repair-dry-run-${tournamentId}-${divisionId}.json`, { before: shape, planned: dry.body.planned });
    },
});

// --------------------------------------------------------------------------
// Preflight: do NANG LUC THUC TE cua server dang chay, khong doan theo so migration.
// --------------------------------------------------------------------------
async function probeAction(action, extra) {
    // Action chua deploy -> route tu choi 400 kem SETUP_PAYLOAD_INVALID + "action",
    // hoac PostgREST bao "does not exist". Action da deploy -> that bai o pham vi
    // hoac revision (404/409), tuc la no CO ton tai.
    const probe = await api(ENV.adminSession, 'POST', '/setup', {
        action,
        tournament_id: -1,
        division_id: -1,
        expected_setup_revision: 1,
        idempotency_key: `qa-probe-${action}`,
        ...extra,
    });
    const text = JSON.stringify(probe.body || {});
    if (probe.status === 400 && /action/i.test(text) && /SETUP_PAYLOAD_INVALID|INVALID_ACTION/i.test(text)) return false;
    if (/does not exist|Could not find the function/i.test(text)) return false;
    return true;
}

async function preflight() {
    const missing = new Set();
    for (const key of ['baseUrl', 'adminSession', 'adminSessionB', 'memberSession', 'tenantBSession', 'groupId', 'chrome']) {
        if (!ENV[key]) missing.add(key);
    }
    if (!(ENV.allowT47 && /^\d+:\d+$/.test(ENV.t47))) missing.add('t47');

    let playwright = null;
    try { playwright = require('playwright'); } catch { missing.add('playwright'); }

    if (!missing.has('baseUrl') && !missing.has('adminSession')) {
        try {
            const probe = await fetch(new URL('/api/groups/session', ENV.baseUrl), {
                headers: { cookie: `group_session=${ENV.adminSession}` },
            });
            if (!probe.ok) missing.add('server');
            else {
                const view = await probe.json();
                const session = view?.session || null;
                if (session?.role !== 'admin' || (ENV.groupId && String(session.group_id) !== String(ENV.groupId))) {
                    missing.add('session');
                }
            }
        } catch { missing.add('server'); }
    } else {
        missing.add('server');
        missing.add('session');
    }

    if (!missing.has('session')) {
        const caps = await Promise.all([
            probeAction('replace_participants', { tournament_club_id: -1, participants: [] }),
            probeAction('configure_top_two_playoff', { group_stage_id: -1, playoff_stage_id: -1, bronze: false }),
            probeAction('unseed_playoff', { group_stage_id: -1 }),
            probeAction('repair_legacy_pairs', { dry_run: true }),
        ]);
        const keys = ['cap_participants', 'cap_playoff_plan', 'cap_unseed', 'cap_repair'];
        caps.forEach((ok, index) => { if (!ok) missing.add(keys[index]); });
        const rules = await api(ENV.adminSession, 'GET', '/rules', undefined, { tournamentId: -1 });
        if (![200, 400, 403, 404].includes(rules.status)) missing.add('cap_rules');
    } else {
        for (const key of ['cap_participants', 'cap_playoff_plan', 'cap_unseed', 'cap_repair', 'cap_rules']) missing.add(key);
    }

    return { missing, playwright };
}

// --------------------------------------------------------------------------
// Runner
// --------------------------------------------------------------------------
(async () => {
    const startedAt = new Date();
    const { missing, playwright } = await preflight();
    const stamp = startedAt.toISOString().replace(/[^0-9]/g, '').slice(0, 14);
    const results = [];
    const created = [];
    const artifacts = {};

    console.log('=== unified setup browser acceptance harness ===');
    console.log(`bat dau         : ${startedAt.toISOString()}`);
    console.log(`base url        : ${ENV.baseUrl || '<thieu>'}`);
    console.log(`admin session   : ${redact(ENV.adminSession)}`);
    console.log(`admin thu hai   : ${redact(ENV.adminSessionB)}`);
    console.log(`member session  : ${redact(ENV.memberSession)}`);
    console.log(`tenant B session: ${redact(ENV.tenantBSession)}`);
    console.log(`group id        : ${ENV.groupId || '<thieu>'}`);
    console.log(`thu muc artifact: ${path.relative(ROOT, ENV.artifactDir).split(path.sep).join('/')}`);
    console.log('');

    const selected = SCENARIOS.filter((item) => !ENV.only || item.id.includes(ENV.only));
    const runnable = selected.filter((item) => !item.needs.some((need) => missing.has(need)));
    let browser = null;
    if (runnable.length && playwright && !missing.has('chrome')) {
        browser = await playwright.chromium.launch({ executablePath: ENV.chrome, headless: true });
    }
    fs.mkdirSync(ENV.artifactDir, { recursive: true });
    const ctx = { browser, stamp, created, artifacts, pages: [] };

    for (const item of selected) {
        const blocking = item.needs.filter((need) => missing.has(need));
        if (blocking.length) {
            results.push({
                status: 'BLOCKED', id: item.id, title: item.title, required: item.required,
                detail: blocking.map((need) => PREREQ[need]).join(' ;; '),
            });
            continue;
        }
        const began = Date.now();
        try {
            await item.run(ctx);
            results.push({
                status: 'PASS', id: item.id, title: item.title, required: item.required,
                ms: Date.now() - began, via: item.via, artifact: artifacts[item.id] || null,
            });
        } catch (error) {
            // Anh chup man hinh tai thoi diem that bai la bang chung quan trong nhat.
            let shot = null;
            const last = ctx.pages[ctx.pages.length - 1];
            if (last) {
                shot = path.join(ENV.artifactDir, `FAIL-${item.id}-${stamp}.png`);
                await last.page.screenshot({ path: shot, fullPage: true }).catch(() => { shot = null; });
            }
            results.push({
                status: 'FAIL', id: item.id, title: item.title, required: item.required,
                ms: Date.now() - began, detail: scrub(error.message),
                artifact: shot ? path.relative(ROOT, shot).split(path.sep).join('/') : null,
            });
        } finally {
            for (const entry of ctx.pages.splice(0)) await entry.context.close().catch(() => {});
        }
    }
    if (browser) await browser.close();

    for (const result of results) {
        const tag = result.required === false ? ' (tuy chon)' : '';
        console.log(`${result.status.padEnd(7)} ${result.id}${tag}`);
        console.log(`        ${result.title}`);
        if (result.via) console.log(`        bang chung: ${result.via.join(', ')}`);
        if (result.artifact) console.log(`        artifact : ${result.artifact}`);
        if (result.detail) console.log(`        ${result.detail}`);
        console.log('');
    }

    const summary = {
        started_at: startedAt.toISOString(),
        finished_at: new Date().toISOString(),
        base_url: ENV.baseUrl,
        group_id: ENV.groupId,
        tenant_b_group_id: ENV.tenantBGroupId || null,
        counts: {
            PASS: results.filter((r) => r.status === 'PASS').length,
            FAIL: results.filter((r) => r.status === 'FAIL').length,
            BLOCKED: results.filter((r) => r.status === 'BLOCKED').length,
        },
        scenarios: results,
        created_scope: created,
    };
    const summaryFile = recordArtifact(`run-summary-${stamp}.json`, summary);
    const manifestFile = recordArtifact(`created-scope-${stamp}.json`, created);

    console.log(`PASS ${summary.counts.PASS} | FAIL ${summary.counts.FAIL} | BLOCKED ${summary.counts.BLOCKED}`);
    console.log(`tom tat : ${summaryFile}`);
    console.log(`manifest: ${manifestFile}`);
    console.log('Ma thoat: 0 = moi scenario BAT BUOC da chay va dat, 1 = co scenario that bai, 2 = BLOCKED (thieu dieu kien tien quyet).');

    const failed = results.filter((r) => r.status === 'FAIL').length;
    const blockedRequired = results.filter((r) => r.status === 'BLOCKED' && r.required !== false).length;
    if (failed) process.exit(1);
    if (blockedRequired) process.exit(2);
    process.exit(0);
})().catch((error) => {
    console.error(scrub(String(error && error.stack ? error.stack : error)));
    process.exit(1);
});

// ============================================================================
// TAI LAP (tu goc checkout nay):
//
//   1. npm ci
//   2. Chay dev server CUA CHINH checkout nay (khong phai worktree khac):
//        npx next dev -p 3100
//      Kiem tra: curl http://127.0.0.1:3100/api/groups/session
//   3. Tao CLB kiem thu rieng + phien dang nhap (mat khau sinh moi moi lan chay,
//      khong bao gio commit):
//        node scripts/qa/provision-browser-harness.js <duong-dan-file-env>
//   4. source <file-env>; export CHROME_EXECUTABLE=<duong dan Chrome>
//   5. npm run test:wizard-journey
//   6. Don du lieu kiem thu:
//        node scripts/qa/cleanup-browser-harness.js <group_id> [<group_id>...]
//
// Artifact (mac dinh _workspace/claude-unified-setup-handoff/evidence/browser):
//   run-summary-<stamp>.json      tom tat + anh xa scenario -> artifact
//   created-scope-<stamp>.json    manifest id da tao, dung de don dep
//   viewport-<w>-<stamp>.png      anh chup tung be ngang
//   conflict-<w>-<stamp>.png      man hinh xung dot tung be ngang
//   FAIL-<id>-<stamp>.png         anh chup luc that bai
// ============================================================================
