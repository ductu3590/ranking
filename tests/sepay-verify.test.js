// Test kiem tra ket noi SePay ("Gui thu").
//
// Phan 1: chay THAT thuat toan chu ky va logic trang thai (khong mock, khong DB).
// Phan 2: contract test cho migration / route / UI.
//
// Bat bien quan trong nhat: nhanh kiem tra ket noi BAT BUOC co chu ky hop le,
// va no KHONG duoc ghi gi vao group_bank_accounts hay quy_pickleball.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(root, f));
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };

const auth = require('../lib/sepayWebhookAuth');
const verify = require('../lib/sepayVerify');

// Gia lap Headers cua Request.
function headersOf(map) {
    return { get: (key) => map[key] ?? map[key.toLowerCase()] ?? null };
}

function signedHeaders(secret, rawBody, { skewSeconds = 0 } = {}) {
    const timestamp = String(Math.floor(Date.now() / 1000) + skewSeconds);
    return headersOf({
        'X-SePay-Timestamp': timestamp,
        'X-SePay-Signature': auth.computeSignature(secret, timestamp, rawBody),
    });
}

const SECRET = crypto.randomBytes(32).toString('hex');
const BODY = JSON.stringify({ gateway: 'BIDV', accountNumber: '1017588888', transferAmount: 0 });

// ---------------------------------------------------------- chu ky (runtime) ---

// Chu ky dung -> qua.
assert(auth.checkSignature(signedHeaders(SECRET, BODY), BODY, SECRET) === null, 'chu ky dung phai qua');
assert(auth.signatureMatches(signedHeaders(SECRET, BODY), BODY, SECRET) === true, 'signatureMatches phai true khi chu ky dung');

// Sai secret -> truot.
assert(auth.checkSignature(signedHeaders(SECRET, BODY), BODY, 'secret-khac') === 'invalid_signature', 'sai secret phai truot');

// Body bi sua sau khi ky -> truot.
assert(auth.checkSignature(signedHeaders(SECRET, BODY), BODY + ' ', SECRET) === 'invalid_signature', 'body bi sua phai truot');

// Thieu header -> truot.
assert(auth.checkSignature(headersOf({}), BODY, SECRET) === 'missing_headers', 'thieu header phai truot');

// Timestamp qua han (replay) -> truot.
assert(auth.checkSignature(signedHeaders(SECRET, BODY, { skewSeconds: -400 }), BODY, SECRET) === 'expired', 'timestamp cu 400s phai bi tu choi');
assert(auth.checkSignature(signedHeaders(SECRET, BODY, { skewSeconds: 400 }), BODY, SECRET) === 'expired', 'timestamp tuong lai 400s phai bi tu choi');
assert(auth.checkSignature(signedHeaders(SECRET, BODY, { skewSeconds: -299 }), BODY, SECRET) === null, 'lech 299s van trong dung sai');

// BAT BUOC co secret o nhanh kiem tra ket noi — day la khac biet co chu y.
assert(auth.checkSignature(signedHeaders(SECRET, BODY), BODY, null) === 'no_secret', 'khong co secret thi khong the xac thuc');
assert(auth.signatureMatches(signedHeaders(SECRET, BODY), BODY, null) === false, 'signatureMatches phai false khi khong co secret');
assert(auth.signatureMatches(headersOf({}), BODY, null) === false, 'khong header + khong secret van phai false');

// Nhanh webhook THUONG giu nguyen hanh vi cu: secret NULL -> bo qua xac thuc.
assert(auth.checkWebhookAuth(headersOf({}), BODY, null) === null, 'nhanh thuong: secret NULL van cho qua (tuong thich nguoc)');
assert(auth.checkWebhookAuth(signedHeaders(SECRET, BODY), BODY, SECRET) === null, 'nhanh thuong: chu ky dung phai qua');
{
    const fail = auth.checkWebhookAuth(headersOf({}), BODY, SECRET);
    assert(fail && fail.status === 401, 'nhanh thuong: co secret ma thieu header phai 401');
}

// ------------------------------------------------------- trang thai (runtime) ---

const NOW = new Date('2026-09-14T10:00:00.000Z');
const inWindow = (mins) => new Date(NOW.getTime() + mins * 60 * 1000).toISOString();

// Chua bao gio mo cua so.
assert(verify.deriveVerifyStatus({}, NOW) === 'idle', 'chua mo cua so -> idle');
assert(verify.deriveVerifyStatus({ sepay_verify_until: null }, NOW) === 'idle', 'until NULL -> idle');

// Cua so con han, chua nhan tin hieu.
assert(verify.deriveVerifyStatus({ sepay_verify_until: inWindow(5) }, NOW) === 'waiting', 'con han, chua tin hieu -> waiting');

// Nhan tin hieu trong cua so -> connected.
assert(
    verify.deriveVerifyStatus({ sepay_verify_until: inWindow(5), sepay_last_signal_at: inWindow(-2) }, NOW) === 'connected',
    'tin hieu trong cua so -> connected',
);

// Tin hieu CU hon cua so hien tai khong duoc tinh la da ket noi.
assert(
    verify.deriveVerifyStatus({ sepay_verify_until: inWindow(5), sepay_last_signal_at: inWindow(-60) }, NOW) === 'waiting',
    'tin hieu cu hon cua so -> van waiting',
);

// Het han ma khong co tin hieu.
assert(verify.deriveVerifyStatus({ sepay_verify_until: inWindow(-1) }, NOW) === 'expired', 'het han, khong tin hieu -> expired');

// Cua so 10 phut.
{
    const end = verify.verifyWindowEnd(NOW);
    assert(Math.round((end - NOW) / 60000) === 10, 'cua so phai la 10 phut');
}

// secondsRemaining khong bao gio am.
assert(verify.secondsRemaining(inWindow(-5), NOW) === 0, 'het han thi con 0 giay');
assert(verify.secondsRemaining(inWindow(1), NOW) === 60, 'con 1 phut -> 60 giay');
assert(verify.secondsRemaining(null, NOW) === 0, 'khong co han -> 0');

// View: goi y chi hien khi dang cho; loi chi hien khi het han.
{
    const waiting = verify.buildVerifyView({ sepay_verify_until: inWindow(5), sepay_verify_hint: 'signature_mismatch' }, NOW);
    assert(waiting.status === 'waiting', 'phai la waiting');
    assert(typeof waiting.hint === 'string' && waiting.hint.includes('khoá bảo mật'), 'goi y phai giai thich sai khoa bao mat');
    assert(waiting.error === null, 'dang cho thi chua phai loi');

    const expired = verify.buildVerifyView({ sepay_verify_until: inWindow(-1) }, NOW);
    assert(expired.error && expired.error.code === 'expired', 'het han phai co loi expired');
    assert(expired.error.message.includes('không cần khai báo lại'), 'loi het han phai tran an rang khong phai khai bao lai');
    assert(expired.hint === null, 'het han thi khong hien goi y nua');
}

// ------------------------------------------------------ ghep noi CLB (runtime) ---

const SECRET_A = crypto.randomBytes(32).toString('hex');
const SECRET_B = crypto.randomBytes(32).toString('hex');
const GROUP_A = { id: 1, sepay_webhook_secret: SECRET_A };
const GROUP_B = { id: 2, sepay_webhook_secret: SECRET_B };

// Khong ai dang cho -> webhook phai tra 422 nhu cu.
{
    const r = verify.matchVerifyingGroup([], signedHeaders(SECRET_A, BODY), BODY);
    assert(r.matched === null && r.candidates.length === 0, 'khong ai dang cho -> khong xu ly');
}

// Chu ky cua A -> chon dung A, khong phai B.
{
    const r = verify.matchVerifyingGroup([GROUP_B, GROUP_A], signedHeaders(SECRET_A, BODY), BODY);
    assert(r.matched && r.matched.id === 1, 'phai chon dung CLB co chu ky khop');
}

// Chu ky la -> khong CLB nao duoc chon.
{
    const r = verify.matchVerifyingGroup([GROUP_A, GROUP_B], signedHeaders('secret-cua-ke-la', BODY), BODY);
    assert(r.matched === null, 'chu ky la khong duoc khop CLB nao');
    assert(r.candidates.length === 2, 'van bao co CLB dang cho de ghi goi y');
}

// CLB dang cho nhung khong co secret -> bo qua, khong bao gio khop.
{
    const r = verify.matchVerifyingGroup([{ id: 9, sepay_webhook_secret: null }], signedHeaders(SECRET_A, BODY), BODY);
    assert(r.matched === null, 'CLB khong co secret khong duoc khop');
}

// Qua nguong -> bo qua het de vong lap HMAC khong thanh be mat DoS.
{
    const many = Array.from({ length: verify.MAX_VERIFYING_GROUPS + 1 }, (_, i) => ({ id: i, sepay_webhook_secret: SECRET_A }));
    const r = verify.matchVerifyingGroup(many, signedHeaders(SECRET_A, BODY), BODY);
    assert(r.matched === null && r.candidates.length === 0, 'qua nguong phai bo qua');
}

// Che so tai khoan va khoa bao mat.
{
    assert(verify.maskAccountNumber('19071234567890').startsWith('1907'), 'giu 4 so dau');
    assert(verify.maskAccountNumber('19071234567890').endsWith('90'), 'giu 2 so cuoi');
    assert(!verify.maskAccountNumber('19071234567890').includes('123456'), 'phai che phan giua');
    assert(!verify.maskSecret(SECRET_A).includes(SECRET_A.slice(8, 24)), 'khoa bao mat phai bi che');
}

// ---------------------------------------------------------------- contract ---

// Migration 054 additive, khong pha du lieu, khong tao lai kien truc cu.
{
    const f = 'database/migrations/054_sepay_connection_state.sql';
    assert(exists(f), `thieu ${f}`);
    const sql = read(f);
    const statements = sql.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');
    for (const col of ['sepay_verify_until', 'sepay_last_signal_at', 'sepay_verify_hint']) {
        assert(statements.includes(`ADD COLUMN IF NOT EXISTS ${col}`), `054 phai them ${col}`);
    }
    assert(!/\bDROP\b/i.test(statements), '054 khong duoc chua DROP');
    assert(!/\bTRUNCATE\b/i.test(statements), '054 khong duoc chua TRUNCATE');
    assert(!/\bDELETE\s+FROM\b/i.test(statements), '054 khong duoc chua DELETE FROM');
    assert(!statements.includes('sepay_pairing_sessions'), '054 khong duoc tao lai bang phien ghep noi');
    assert(!statements.includes('is_pairing_probe'), '054 khong duoc them cot giao dich thu');
}

// Webhook: duong di hien tai khong doi, nhanh moi chi chen dung cho dang 422.
{
    const f = 'app/api/webhook/route.js';
    const src = read(f);
    assert(src.includes('tryMatchVerifySignal'), 'webhook phai co nhanh kiem tra ket noi');
    assert(src.indexOf('tryMatchVerifySignal') < src.indexOf("'Unknown bank account'"), 'nhanh moi phai chay TRUOC khi tra 422');
    assert(src.includes('checkWebhookAuth'), 'phai dung nguon thuat toan chung, khong viet ban sao');
    assert(!src.includes("createHmac"), 'khong duoc con ban sao thuat toan HMAC trong route');

    // Nhanh kiem tra ket noi KHONG duoc dung toi tien.
    // Khoanh dung than ham: cat den het file se lan sang
    // resolveGroupFromBankAccount (von duoc phep doc group_bank_accounts).
    const branchStart = src.indexOf('async function tryMatchVerifySignal');
    const branchEnd = src.indexOf('async function resolveGroupFromBankAccount');
    assert(branchStart !== -1 && branchEnd > branchStart, 'khong khoanh duoc than ham tryMatchVerifySignal');
    const branch = src.slice(branchStart, branchEnd);
    assert(!branch.includes('quy_pickleball'), 'nhanh kiem tra ket noi khong duoc ghi vao so quy');
    assert(!branch.includes('group_bank_accounts'), 'nhanh kiem tra ket noi khong duoc ghi tai khoan ngan hang');
    assert(!branch.includes('parseTransaction'), 'nhanh kiem tra ket noi khong duoc parse giao dich');
    assert(!branch.includes('club_notifications'), 'nhanh kiem tra ket noi khong duoc tao thong bao');
    assert(branch.includes('sepay_last_signal_at'), 'nhanh kiem tra ket noi chi ghi moc tin hieu');

    // Chu ky sai khong duoc dong cua so kiem tra.
    assert(!/sepay_verify_until:\s*null/.test(branch), 'chu ky sai khong duoc dong cua so kiem tra');
}

// Route verify: guard admin ca ba method, khong cache, khong tu xoay khoa.
{
    const f = 'app/api/club/sepay/verify/route.js';
    assert(exists(f), `thieu ${f}`);
    const src = read(f);
    assert((src.match(/requireValidatedGroupAdmin\(\)/g) || []).length === 3, 'ca POST, GET, DELETE deu phai guard admin');
    assert(src.includes("'Cache-Control': 'no-store'"), 'response phai no-store vi co the chua khoa bao mat');
    assert(src.includes('body?.rotateSecret === true'), 'chi xoay khoa khi admin chu dong yeu cau');
    assert(src.includes('adminCheck.groupId'), 'moi truy van phai scope theo groupId');
    assert(!src.includes('DEFAULT_GROUP_ID'), 'khong duoc fallback ve DEFAULT_GROUP_ID');
    assert(src.includes('randomBytes(32)'), 'khoa bao mat phai 256 bit');
}

// Buoc "lien ket tai khoan ngan hang vao SePay" la mat xich bat buoc: chua lam
// thi SePay khong thay tien vao va o Tai khoan khi tao webhook se trong.
{
    const ui = read('components/pickhub/SepayConnect.js');
    assert(ui.includes('Liên kết tài khoản ngân hàng vào SePay'),
        'man gioi thieu phai co buoc lien ket ngan hang vao SePay');
    // "Lien ket ngan hang" la mot BUOC rieng trong tien trinh, khong chi la mot
    // khoi nhac lap lo giua man khai bao.
    assert(ui.includes("'Liên kết ngân hàng'"), 'stepper phai co buoc Lien ket ngan hang');
    assert(ui.indexOf("'Liên kết ngân hàng'") < ui.indexOf("'Khai báo với SePay'"),
        'buoc lien ket ngan hang phai dung TRUOC buoc khai bao');
    assert(ui.includes("screen === 'linkbank'"), 'phai co man rieng cho buoc lien ket ngan hang');

    // Cua so kiem tra 10 phut chi duoc mo khi admin da khai bao xong — mo tu
    // buoc dau thi het gio truoc khi ho lam xong viec ben SePay.
    assert(ui.includes('startVerify: false'), 'buoc khai bao chi sinh khoa, chua mo cua so');
    assert(ui.includes('startVerify: true'), 'chi mo cua so khi admin bam da khai bao xong');
    const api = read('app/api/club/sepay/verify/route.js');
    assert(api.includes('body?.startVerify !== false'), 'API phai ho tro sinh khoa ma chua mo cua so');
    // KHONG duoc noi goi dich vu gioi han ngan hang: goi FREE mac dinh lien ket
    // duoc moi ngan hang SePay ho tro. Gioi han chi xuat hien o mot so goi
    // khuyen mai rieng — khong phai quy tac chung.
    assert(!ui.includes('gói quyết định được liên kết ngân hàng nào'),
        'khong duoc suy quy tac chung tu mot goi khuyen mai cu the');
    assert(ui.includes('liên kết được mọi ngân hàng SePay hỗ trợ'),
        'phai noi ro goi mien phi lien ket duoc moi ngan hang SePay ho tro');
}

console.log('sepay-verify: ok');
