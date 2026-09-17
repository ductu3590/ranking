// Xac thuc chu ky webhook SePay — NGUON DUY NHAT cua thuat toan.
//
// Truoc day ham nay nam trong app/api/webhook/route.js. Tach ra vi Phan B can
// dung cung thuat toan o nhanh "Gui thu"; neu viet ban sao thi hai nhanh se
// lech nhau khi mot ben duoc sua.
//
// SePay ho tro 4 kieu xac thuc: HMAC-SHA256, API Key, OAuth 2.0 va khong xac
// thuc. PickHub dung HMAC-SHA256.
//
// Header: X-SePay-Signature = "sha256=" + HMAC-SHA256(`${timestamp}.${rawBody}`, secret)
//         X-SePay-Timestamp = giay epoch, lech toi da 300s.

const crypto = require('crypto');

const TIMESTAMP_TOLERANCE_SECONDS = 300;

function computeSignature(secret, timestamp, rawBody) {
    return 'sha256=' + crypto
        .createHmac('sha256', secret)
        .update(`${timestamp}.${rawBody}`)
        .digest('hex');
}

function timingSafeMatch(received, expected) {
    const a = Buffer.from(String(received));
    const b = Buffer.from(String(expected));
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

// Kiem chu ky, tra ve mot trong cac ly do that bai hoac null neu hop le.
// BAT BUOC co secret: khong co secret thi khong the xac thuc -> 'no_secret'.
// Day la khac biet co chu y so voi nhanh webhook thuong (xem checkWebhookAuth).
function checkSignature(headers, rawBody, secret) {
    if (!secret) return 'no_secret';

    const signature = headers.get('X-SePay-Signature') || '';
    const timestamp = headers.get('X-SePay-Timestamp') || '';
    if (!signature || !timestamp) return 'missing_headers';

    const timestampSeconds = Number(timestamp);
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (!Number.isFinite(timestampSeconds) || Math.abs(nowSeconds - timestampSeconds) > TIMESTAMP_TOLERANCE_SECONDS) {
        return 'expired';
    }

    if (!timingSafeMatch(signature, computeSignature(secret, timestamp, rawBody))) {
        return 'invalid_signature';
    }

    return null;
}

// Phien ban cho nhanh webhook THUONG. Giu nguyen hanh vi cu 100%:
// secret NULL -> bo qua xac thuc (tuong thich nguoc voi cac CLB chua bat khoa).
// Tra ve { status, message } de route dung tao NextResponse, hoac null neu qua.
function checkWebhookAuth(headers, rawBody, secret) {
    if (!secret) return null;

    const reason = checkSignature(headers, rawBody, secret);
    if (reason === null) return null;
    if (reason === 'expired') return { status: 401, message: 'Request expired' };
    if (reason === 'invalid_signature') return { status: 401, message: 'Invalid signature' };
    return { status: 401, message: 'Unauthorized' };
}

// Phien ban cho nhanh KIEM TRA KET NOI: chi tra true khi chu ky hop le that su.
// Khong co lối thoat nao khi thieu secret.
function signatureMatches(headers, rawBody, secret) {
    return checkSignature(headers, rawBody, secret) === null;
}

module.exports = {
    TIMESTAMP_TOLERANCE_SECONDS,
    computeSignature,
    checkSignature,
    checkWebhookAuth,
    signatureMatches,
};
