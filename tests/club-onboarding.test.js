// Test onboarding CLB.
//
// Phan 1: chay THAT logic thuan cua lib/clubOnboarding.js (khong mock, khong DB).
// Phan 2: contract test cho migration / API route / component.

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(root, f));
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };

const { buildOnboardingState, isValidOnboardingAction, ONBOARDING_ACTIONS } = require('../lib/clubOnboarding');

// ---------------------------------------------------------------- runtime ---

const EMPTY_CLUB = {
    logoUrl: null,
    fundQrUrl: null,
    memberCount: 0,
    tournamentCount: 0,
    hasActiveBankAccount: false,
    hasWebhookSecret: false,
    seenAt: null,
    dismissedAt: null,
    clubCode: 'P246CLUB',
    joinUrl: 'https://pickhub.vn/join?group=P246CLUB',
};

const FULL_CLUB = {
    ...EMPTY_CLUB,
    logoUrl: 'data:image/webp;base64,xxx',
    fundQrUrl: 'data:image/png;base64,xxx',
    memberCount: 12,
    tournamentCount: 2,
    hasActiveBankAccount: true,
    hasWebhookSecret: true,
    seenAt: '2026-09-14T00:00:00.000Z',
};

// CLB moi tinh: 0/5, hien checklist, chua xem wizard.
{
    const s = buildOnboardingState(EMPTY_CLUB);
    assert(s.totalCount === 5, `CLB moi phai co 5 buoc, nhan ${s.totalCount}`);
    assert(s.completedCount === 0, `CLB moi phai 0 buoc xong, nhan ${s.completedCount}`);
    assert(s.isComplete === false, 'CLB moi khong the isComplete');
    assert(s.visible === true, 'CLB moi phai hien checklist');
    assert(s.hasSeenWelcome === false, 'CLB moi phai chua xem wizard');
    assert(s.steps.every((x) => x.done === false), 'CLB moi khong buoc nao done');
    assert(s.steps.every((x) => x.state === 'todo'), 'CLB moi moi buoc deu todo');
}

// Buoc "chia se ma CLB" KHONG duoc dem vao tien do.
{
    const s = buildOnboardingState(EMPTY_CLUB);
    assert(!s.steps.some((x) => x.key === 'share'), 'Chia se ma CLB khong duoc la mot buoc');
    assert(s.shareAction.clubCode === 'P246CLUB', 'shareAction phai mang ma CLB');
    assert(s.shareAction.joinUrl.includes('P246CLUB'), 'shareAction phai mang joinUrl');
}

// shareAction KHONG duoc keo theo anh QR data-URL (chi phi cua /api/club/settings).
{
    const s = buildOnboardingState(EMPTY_CLUB);
    assert(!('qrCodeDataUrl' in s.shareAction), 'shareAction khong duoc chua qrCodeDataUrl');
}

// CLB day du: 5/5, isComplete, checklist tu an.
{
    const s = buildOnboardingState(FULL_CLUB);
    assert(s.completedCount === 5, `CLB day du phai 5/5, nhan ${s.completedCount}`);
    assert(s.isComplete === true, 'CLB day du phai isComplete');
    assert(s.visible === false, 'CLB day du khong hien checklist nua');
    assert(s.hasSeenWelcome === true, 'seenAt co gia tri -> hasSeenWelcome true');
}

// Trang thai warning: co tai khoan ngan hang nhung chua bat khoa bao mat.
{
    const s = buildOnboardingState({ ...EMPTY_CLUB, hasActiveBankAccount: true, hasWebhookSecret: false });
    const sepay = s.steps.find((x) => x.key === 'sepay');
    assert(sepay.state === 'warning', `phai la warning, nhan ${sepay.state}`);
    assert(sepay.done === false, 'warning thi chua done');
    assert(typeof sepay.warning === 'string' && sepay.warning.length > 0, 'warning phai co loi giai thich');
    assert(s.completedCount === 0, 'buoc warning khong duoc dem la xong');
}

// Co khoa bao mat nhung chua co tai khoan ngan hang -> van todo, khong warning.
{
    const s = buildOnboardingState({ ...EMPTY_CLUB, hasActiveBankAccount: false, hasWebhookSecret: true });
    const sepay = s.steps.find((x) => x.key === 'sepay');
    assert(sepay.state === 'todo', `phai la todo, nhan ${sepay.state}`);
    assert(sepay.warning === null, 'chua co tai khoan thi khong canh bao bao mat');
}

// done === true luon dong nghia state === 'done'.
{
    const s = buildOnboardingState(FULL_CLUB);
    assert(s.steps.every((x) => x.done === (x.state === 'done')), 'done va state phai nhat quan');
}

// Admin bam an -> visible false du chua xong.
{
    const s = buildOnboardingState({ ...EMPTY_CLUB, dismissedAt: '2026-09-14T00:00:00.000Z' });
    assert(s.visible === false, 'da dismiss thi khong hien');
    assert(s.isComplete === false, 'dismiss khong dong nghia hoan thanh');
}

// memberCount rac (null/am/chuoi) khong duoc lam buoc roster thanh done.
{
    for (const bad of [null, undefined, -3, 'abc', NaN]) {
        const s = buildOnboardingState({ ...EMPTY_CLUB, memberCount: bad });
        const roster = s.steps.find((x) => x.key === 'roster');
        assert(roster.done === false, `memberCount=${String(bad)} khong duoc tinh la co thanh vien`);
        assert(roster.meta.memberCount === 0, `memberCount=${String(bad)} phai chuan hoa ve 0`);
    }
}

// Chuoi rong / khoang trang khong duoc tinh la da co logo.
{
    for (const bad of ['', '   ', null]) {
        const s = buildOnboardingState({ ...EMPTY_CLUB, logoUrl: bad });
        assert(s.steps.find((x) => x.key === 'identity').done === false, `logoUrl=${JSON.stringify(bad)} khong duoc tinh la co logo`);
    }
}

// Moi buoc phai co du truong de UI render.
{
    const s = buildOnboardingState(EMPTY_CLUB);
    for (const step of s.steps) {
        assert(typeof step.key === 'string' && step.key, 'step phai co key');
        assert(typeof step.title === 'string' && step.title, `step ${step.key} phai co title`);
        assert(typeof step.description === 'string' && step.description, `step ${step.key} phai co description`);
        assert(typeof step.href === 'string' && step.href.startsWith('/'), `step ${step.key} phai co href noi bo`);
        assert(typeof step.cta === 'string' && step.cta, `step ${step.key} phai co cta`);
        assert(['todo', 'done', 'warning'].includes(step.state), `step ${step.key} co state la ${step.state}`);
    }
}

// Allowlist hanh dong.
{
    assert(ONBOARDING_ACTIONS.length === 3, 'chi duoc 3 hanh dong');
    for (const ok of ['mark_welcome_seen', 'dismiss', 'restore']) {
        assert(isValidOnboardingAction(ok), `${ok} phai hop le`);
    }
    for (const bad of ['complete', 'reset', '', null, undefined, 'DISMISS', { action: 'dismiss' }]) {
        assert(!isValidOnboardingAction(bad), `${JSON.stringify(bad)} khong duoc hop le`);
    }
}

// ---------------------------------------------------------------- contract ---

// Migration 053 phai additive + idempotent, khong pha du lieu.
{
    const f = 'database/migrations/053_group_onboarding_state.sql';
    assert(exists(f), `thieu ${f}`);
    const sql = read(f);
    assert(sql.includes('ADD COLUMN IF NOT EXISTS onboarding_seen_at'), '053 phai them onboarding_seen_at');
    assert(sql.includes('ADD COLUMN IF NOT EXISTS onboarding_dismissed_at'), '053 phai them onboarding_dismissed_at');
    // Bo dong comment truoc khi do lenh pha huy: comment co quyen NHAC den
    // DROP/TRUNCATE de giai thich vi sao khong dung chung.
    const statements = sql.split('\n').filter((line) => !line.trimStart().startsWith('--')).join('\n');
    assert(!/\bDROP\b/i.test(statements), '053 khong duoc chua DROP');
    assert(!/\bTRUNCATE\b/i.test(statements), '053 khong duoc chua TRUNCATE');
    assert(!/\bDELETE\s+FROM\b/i.test(statements), '053 khong duoc chua DELETE FROM');
    assert(!statements.includes('onboarding_completed_at'), '053 khong duoc them onboarding_completed_at (suy ra duoc)');
}

// API route: guard admin ca GET lan PATCH, allowlist hanh dong.
{
    const f = 'app/api/club/onboarding/route.js';
    assert(exists(f), `thieu ${f}`);
    const src = read(f);
    assert(src.includes('requireValidatedGroupAdmin'), 'route phai dung requireValidatedGroupAdmin');
    assert((src.match(/requireValidatedGroupAdmin\(\)/g) || []).length >= 2, 'ca GET lan PATCH deu phai guard');
    assert(src.includes('isValidOnboardingAction'), 'PATCH phai kiem allowlist hanh dong');
    assert(src.includes("adminCheck.groupId"), 'moi truy van phai scope theo groupId');
    assert(!src.includes('DEFAULT_GROUP_ID'), 'khong duoc fallback ve DEFAULT_GROUP_ID');
    // Do IMPORT chu khong do chu: comment duoc phep nhac QRCode de giai thich
    // vi sao route nay khong sinh anh QR.
    assert(!/from\s+'qrcode'/.test(src), 'route onboarding khong duoc import qrcode (chi phi cua /api/club/settings)');
}

// Component ton tai va la client component.
{
    for (const f of ['components/pickhub/SetupChecklist.js', 'components/pickhub/OnboardingWelcome.js']) {
        assert(exists(f), `thieu ${f}`);
        assert(read(f).trimStart().startsWith("'use client'"), `${f} phai la client component`);
    }
    assert(exists('components/pickhub/SetupChecklist.css'), 'thieu SetupChecklist.css');
    assert(exists('components/pickhub/OnboardingWelcome.css'), 'thieu OnboardingWelcome.css');
}

// Bay bo cuc: .setup__cta width:100% BAT BUOC di kem flex-wrap:wrap tren hang cha.
// Thieu rule nay thi .setup__body bi bop ve 0px va nut tran ra ngoai the.
{
    const css = read('components/pickhub/SetupChecklist.css');
    const mobile = css.slice(css.indexOf('@media (max-width: 640px)'));
    assert(mobile.includes('flex-wrap: wrap'), 'media mobile phai co flex-wrap:wrap cho .setup__item');
    assert(mobile.includes('.setup__cta'), 'media mobile phai giai .setup__cta');
    assert(css.includes('.setup__body') && css.includes('min-width: 0'), '.setup__body phai co min-width:0');
}

// Thanh gon phai DINH, va panel phai DE LEN noi dung chu khong day noi dung
// xuong — ban the day du truoc day cao 697px va day section dau tien xuong
// 1058px, dung van de ma thiet ke nay sinh ra de giai.
{
    const css = read('components/pickhub/SetupChecklist.css');
    const bar = css.slice(css.indexOf('.setupbar {'), css.indexOf('.setupbar__row'));
    assert(/position:\s*sticky/.test(bar), '.setupbar phai sticky de luon trong tam tay khi cuon');
    assert(/top:\s*0/.test(bar), '.setupbar phai dinh o top:0');
    const panel = css.slice(css.indexOf('.setupbar__panel {'), css.indexOf('.setupbar__panelhint'));
    assert(/position:\s*absolute/.test(panel), '.setupbar__panel phai absolute (de len noi dung)');
    assert(/overflow-y:\s*auto/.test(panel), '.setupbar__panel phai cuon rieng khi danh sach dai');
}

// Bam mot buoc o trang dang mo: cuon tai cho + vien sang, khong dieu huong.
{
    const src = read('components/pickhub/SetupChecklist.js');
    assert(src.includes('usePathname'), 'phai biet dang o trang nao de quyet dinh cuon hay dieu huong');
    assert(src.includes('scrollIntoView'), 'buoc trong trang phai cuon toi noi');
    assert(src.includes('is-onboarding-target'), 'phai vien sang section duoc chi toi');
    assert(read('components/pickhub/SetupChecklist.css').includes('.is-onboarding-target'), 'CSS phai dinh nghia vien sang');
}

// Buoc sepay phai neo trong trang Cau hinh de cuon tai cho duoc.
{
    const { buildOnboardingState: build } = require('../lib/clubOnboarding');
    const sepay = build(EMPTY_CLUB).steps.find((x) => x.key === 'sepay');
    assert(sepay.href === '/admin#set-sepay', `buoc sepay phai neo #set-sepay, nhan ${sepay.href}`);
}

// Stepper dung chung phai nam trong primitives, khong khoa trong namespace giai dau.
{
    const css = read('app/styles/primitives.css');
    for (const cls of ['.ph-stepper', '.ph-stepchip', '.ph-stepline']) {
        assert(css.includes(cls), `primitives.css phai co ${cls}`);
    }
    assert(css.includes('.ph-stepline { display: none; }'), 'man hinh hep phai bo duong noi de stepper khong tran');
}

// Diem cam UI.
{
    const admin = read('app/admin/page.js');
    assert(admin.includes('OnboardingWelcome'), '/admin phai gan wizard chao mung');
    assert(admin.includes('SetupChecklist'), '/admin phai gan checklist');
    const quy = read('app/quy/page.js');
    assert(quy.includes('SetupChecklist'), '/quy phai gan checklist');
    assert(quy.includes('isAdmin && <SetupChecklist'), '/quy chi hien checklist cho admin');
}

// Ngon ngu giao dien: khong duoc lo thuat ngu ky thuat trong chuoi hien thi.
{
    const uiFiles = ['components/pickhub/SetupChecklist.js', 'components/pickhub/OnboardingWelcome.js', 'lib/clubOnboarding.js'];
    for (const f of uiFiles) {
        const src = read(f);
        assert(!/roster/i.test(src.replace(/key: 'roster'|'roster'|key === 'roster'/g, '')), `${f} khong duoc dung tu "roster" trong chuoi hien thi`);
        assert(!/HMAC bật/.test(src), `${f} khong duoc dung "HMAC bật"`);
        assert(!/bảo mật webhook/i.test(src), `${f} khong duoc dung "bảo mật webhook"`);
    }
}

// Luu mot thay doi xong thi giao dien phai tu cap nhat, khong bat admin F5;
// va ket qua thao tac phai hien bang toast noi (truoc day la banner o DAU trang,
// bam Luu o cuoi trang thi khong ai thay).
{
    assert(exists('lib/clubSettingsEvents.js'), 'thieu lib/clubSettingsEvents.js');
    const ev = read('lib/clubSettingsEvents.js');
    assert(ev.includes('notifyClubSettingsChanged') && ev.includes('onClubSettingsChanged'),
        'lib su kien phai co ca ben phat va ben dang ky');

    const settings = read('app/admin/ClubSettings.js');
    assert(settings.includes('notifyClubSettingsChanged'), 'ClubSettings phai bao khi luu xong');
    assert(!settings.includes('club-settings-msg'), 'banner thong bao o dau trang phai bo');
    assert(settings.includes('PhToast') && settings.includes('showToast'), 'ClubSettings phai dung toast');
    assert(!/setNotice\(/.test(settings) && !/setError\(/.test(settings), 'khong con state notice/error cu');

    const checklist = read('components/pickhub/SetupChecklist.js');
    assert(checklist.includes('onClubSettingsChanged(load)'),
        'checklist phai tu tai lai khi cai dat doi — neu khong, tien do van hien so cu cho toi khi F5');

    const sepay = read('components/pickhub/SepayConnect.js');
    assert(sepay.includes('notifyClubSettingsChanged'), 'SepayConnect phai bao khi trang thai ket noi doi');

    assert(exists('components/pickhub/PhToast.js'), 'thieu PhToast.js');
    assert(exists('components/pickhub/PhToast.css'), 'thieu PhToast.css');
    const toastCss = read('components/pickhub/PhToast.css');
    assert(/position:\s*fixed/.test(toastCss), 'toast phai co dinh de luon nhin thay du dang o cuoi trang');
    assert(toastCss.includes('--ph-bottom-nav-height'), 'toast phai ngoi tren thanh dieu huong duoi cung o mobile');
}

console.log('club-onboarding: ok');
