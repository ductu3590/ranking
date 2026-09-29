import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { hashPassword } from '@/lib/domain/identity/password';
import { parseRegisterInput, projectPlayerAccount } from '@/lib/domain/identity/playerAccount';
import { clientIp, consumePublicRateLimit } from '@/lib/publicRateLimit';
import { issuePlayerSession, playerJson, setPlayerSessionCookie } from '@/lib/playerSession';
import { messageFor, rateLimitedMessage } from '@/lib/tournament/communityMessages';

export const dynamic = 'force-dynamic';

const INVALID_STATUS = {
    PLAYER_PHONE_INVALID: 400,
    PLAYER_PASSWORD_WEAK: 400,
    PLAYER_NAME_INVALID: 400,
    PLAYER_PROFILE_INVALID: 400,
    PLAYER_HONEYPOT: 400,
};

function rateLimited(rate) {
    const response = playerJson({
        error: rateLimitedMessage(rate.retryAfterSeconds),
        code: 'RATE_LIMITED',
        retryAfterSeconds: rate.retryAfterSeconds,
    }, 429);
    response.headers.set('Retry-After', String(Math.max(1, rate.retryAfterSeconds)));
    return response;
}

// Tạo tài khoản VĐV công khai (Epic 4 C1, D54) và đăng nhập luôn.
// Thứ tự cố ý: giới hạn theo IP → kiểm đầu vào → giới hạn theo SĐT → băm mật khẩu (tốn CPU) → ghi.
export async function POST(request) {
    try {
        if (!supabaseAdmin) return playerJson({ error: messageFor('UNAVAILABLE'), code: 'UNAVAILABLE' }, 503);

        const ipRate = await consumePublicRateLimit('register_ip', { ip: clientIp(request) });
        if (!ipRate.allowed) return rateLimited(ipRate);

        const body = await request.json().catch(() => ({}));
        const parsed = parseRegisterInput(body);
        if (!parsed.ok) {
            return playerJson({ error: messageFor(parsed.code), code: parsed.code }, INVALID_STATUS[parsed.code] || 400);
        }
        const { phoneNorm, password, displayName, gender, dob, selfDeclaredPhr } = parsed.value;

        const phoneRate = await consumePublicRateLimit('register_phone', { phoneNorm });
        if (!phoneRate.allowed) return rateLimited(phoneRate);

        const { data: account, error } = await supabaseAdmin.from('player_accounts').insert({
            phone_norm: phoneNorm,
            password_hash: hashPassword(password),
            display_name: displayName,
            gender,
            dob,
            self_declared_phr: selfDeclaredPhr,
        }).select('id, display_name, gender, dob, self_declared_phr, access_version').single();

        if (error) {
            // 23505 = unique_violation trên phone_norm: SĐT này đã có tài khoản.
            if (error.code === '23505') {
                return playerJson({ error: messageFor('PLAYER_PHONE_TAKEN'), code: 'PLAYER_PHONE_TAKEN' }, 409);
            }
            throw error;
        }

        const { cookieValue, expiresAt } = await issuePlayerSession(account);
        const response = playerJson({ account: projectPlayerAccount(account) }, 201);
        setPlayerSessionCookie(response, cookieValue, expiresAt);
        return response;
    } catch (error) {
        console.error('player accounts POST error:', error);
        return playerJson({ error: messageFor('GENERIC'), code: 'INTERNAL' }, 500);
    }
}
