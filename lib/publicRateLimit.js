import { supabaseAdmin } from './supabaseAdmin';
import { getClientIdentifier } from './rateLimit';
import { bucketFor, policyFor } from './domain/identity/playerRateLimits';

// Giới hạn tần suất cho route công khai (Epic 4, D60). Bộ đếm nằm ở DB (RPC consume_rate_limit, migration 112) vì
// bộ nhớ tiến trình không bền trên serverless. Mặc định FAIL-CLOSED: không đếm được thì từ chối, không cho qua —
// một điểm chặn spam không được mở ra khi DB trục trặc. Chỉ các thao tác đọc nhẹ mới truyền failOpen.
const UNAVAILABLE_RETRY_SECONDS = 30;

export function clientIp(request) {
    return getClientIdentifier(request);
}

// parts: { phoneNorm, ip, login, accountId } tùy chính sách (xem bucketFor). Trả { allowed, retryAfterSeconds }.
export async function consumePublicRateLimit(policyKey, parts = {}, { failOpen = false } = {}) {
    const policy = policyFor(policyKey);
    const bucket = bucketFor(policyKey, parts);
    const unavailable = failOpen
        ? { allowed: true, retryAfterSeconds: 0, unavailable: true }
        : { allowed: false, retryAfterSeconds: UNAVAILABLE_RETRY_SECONDS, unavailable: true };
    if (!supabaseAdmin) return unavailable;
    try {
        const { data, error } = await supabaseAdmin.rpc('consume_rate_limit', {
            p_bucket: bucket,
            p_limit: policy.limit,
            p_window_seconds: policy.windowSeconds,
        });
        if (error) throw error;
        const row = Array.isArray(data) ? data[0] : data;
        if (!row) return unavailable;
        return { allowed: row.allowed === true, retryAfterSeconds: Number(row.retry_after) || 0 };
    } catch (error) {
        console.error('consume_rate_limit failed:', error?.message || error);
        return unavailable;
    }
}
