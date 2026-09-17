// Kiem tra ket noi SePay bang chuc nang "Gui thu" cua SePay.
//
// Bai toan: /api/webhook dinh tuyen CLB BANG so tai khoan, nhung payload cua
// "Gui thu" la payload MAU (tai lieu SePay dung so mau 1017588888) nen khong
// khop tai khoan nao -> xua nay roi thang vao 422.
//
// Cach giai: trong cua so kiem tra ~10 phut, chap nhan BAT KY request nao co
// chu ky HMAC khop khoa bao mat cua mot CLB dang cho. Chu ky chi dung de tra
// loi dung mot cau: "CLB nao vua bam Gui thu?".
//
// An toan vi ta KHONG suy ra gi tu payload. So tai khoan da do admin xac nhan
// tu truoc va chiu rang buoc UNIQUE(account_number) san co — tin hieu thu
// khong co quyen ghi vao group_bank_accounts hay quy_pickleball.

const { signatureMatches } = require('./sepayWebhookAuth');

const VERIFY_WINDOW_MINUTES = 10;

// Chan vong lap HMAC thanh be mat DoS: qua nguong nay thi bo qua va canh bao.
const MAX_VERIFYING_GROUPS = 20;

const HINT_MESSAGES = {
    signature_mismatch:
        'Đã nhận được tín hiệu nhưng chữ ký không khớp. Nghĩa là địa chỉ đúng rồi, '
        + 'chỉ sai khoá bảo mật. Quay lại SePay, sửa webhook, dán lại Khoá bảo mật rồi bấm Gửi thử lần nữa.',
};

function verifyWindowEnd(now = new Date()) {
    return new Date(now.getTime() + VERIFY_WINDOW_MINUTES * 60 * 1000);
}

function secondsRemaining(verifyUntil, now = new Date()) {
    if (!verifyUntil) return 0;
    const diff = new Date(verifyUntil).getTime() - now.getTime();
    return diff > 0 ? Math.ceil(diff / 1000) : 0;
}

// Trang thai suy ra tu ba cot tren groups + ngu canh ket noi.
// idle      : chua bao gio mo cua so kiem tra, hoac da dong
// waiting   : cua so con han, chua nhan duoc tin hieu hop le nao
// connected : da nhan tin hieu hop le trong cua so nay
// expired   : cua so het han ma khong nhan duoc tin hieu nao
function deriveVerifyStatus(group, now = new Date()) {
    const until = group?.sepay_verify_until ? new Date(group.sepay_verify_until) : null;
    const lastSignal = group?.sepay_last_signal_at ? new Date(group.sepay_last_signal_at) : null;
    if (!until) return 'idle';

    const windowStart = new Date(until.getTime() - VERIFY_WINDOW_MINUTES * 60 * 1000);
    const signalInWindow = Boolean(lastSignal && lastSignal >= windowStart);
    if (signalInWindow) return 'connected';
    return until > now ? 'waiting' : 'expired';
}

function hintMessage(code) {
    if (!code) return null;
    return HINT_MESSAGES[code] || null;
}

// Che bot so tai khoan khi hien ra ngoai: giu 4 so dau va 2 so cuoi.
function maskAccountNumber(accountNumber) {
    const value = String(accountNumber || '').trim();
    if (value.length <= 6) return value;
    return `${value.slice(0, 4)}${'•'.repeat(Math.max(2, value.length - 6))}${value.slice(-2)}`;
}

function maskSecret(secret) {
    const value = String(secret || '');
    if (value.length <= 6) return value ? '••••••' : '';
    return `${value.slice(0, 4)}${'•'.repeat(8)}${value.slice(-2)}`;
}

function buildVerifyView(group, now = new Date()) {
    const status = deriveVerifyStatus(group, now);
    return {
        status,
        expiresAt: group?.sepay_verify_until || null,
        secondsRemaining: status === 'waiting' ? secondsRemaining(group?.sepay_verify_until, now) : 0,
        lastSignalAt: group?.sepay_last_signal_at || null,
        hint: status === 'waiting' ? hintMessage(group?.sepay_verify_hint) : null,
        error: status === 'expired'
            ? { code: 'expired', message: 'Chưa nhận được tín hiệu nào từ SePay. Khoá bảo mật vẫn giữ nguyên nên không cần khai báo lại bên SePay — chỉ cần bấm Gửi thử một lần nữa.' }
            : null,
    };
}

// Tim CLB dang cho tin hieu ma chu ky khop. Tra ve:
//   { matched: group }            -> dung CLB nay vua bam Gui thu
//   { matched: null, candidates } -> co CLB dang cho nhung khong chu ky nao khop
//   { matched: null, candidates: [] } -> khong ai dang cho, de webhook tra 422 nhu cu
function matchVerifyingGroup(candidates, headers, rawBody) {
    const list = Array.isArray(candidates) ? candidates : [];
    if (list.length === 0) return { matched: null, candidates: [] };
    if (list.length > MAX_VERIFYING_GROUPS) {
        console.warn(`[sepay-verify] ${list.length} CLB dang cho cung luc, bo qua de tranh DoS.`);
        return { matched: null, candidates: [] };
    }

    for (const group of list) {
        const secret = group?.sepay_webhook_secret;
        if (!secret) continue;
        if (signatureMatches(headers, rawBody, secret)) {
            return { matched: group, candidates: list };
        }
    }
    return { matched: null, candidates: list };
}

module.exports = {
    VERIFY_WINDOW_MINUTES,
    MAX_VERIFYING_GROUPS,
    HINT_MESSAGES,
    verifyWindowEnd,
    secondsRemaining,
    deriveVerifyStatus,
    hintMessage,
    maskAccountNumber,
    maskSecret,
    buildVerifyView,
    matchVerifyingGroup,
};
