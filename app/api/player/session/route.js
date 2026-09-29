import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { hashPassword, verifyPassword } from '@/lib/domain/identity/password';
import { parseLoginInput, projectPlayerAccount } from '@/lib/domain/identity/playerAccount';
import { clientIp, consumePublicRateLimit } from '@/lib/publicRateLimit';
import {
    clearPlayerSessionCookie,
    issuePlayerSession,
    playerJson,
    readSignedPlayerSession,
    resolvePlayerSession,
    revokePlayerSession,
    setPlayerSessionCookie,
} from '@/lib/playerSession';
import { messageFor, rateLimitedMessage } from '@/lib/tournament/communityMessages';

export const dynamic = 'force-dynamic';

// Băm giả để đăng nhập với SĐT không tồn tại tốn thời gian như SĐT có thật (không lộ tài khoản nào tồn tại).
const DUMMY_HASH = hashPassword('pickhub-player-timing-equalizer');

function rateLimited(rate) {
    const response = playerJson({
        error: rateLimitedMessage(rate.retryAfterSeconds),
        code: 'RATE_LIMITED',
        retryAfterSeconds: rate.retryAfterSeconds,
    }, 429);
    response.headers.set('Retry-After', String(Math.max(1, rate.retryAfterSeconds)));
    return response;
}

function loginFailed() {
    return playerJson({ error: messageFor('PLAYER_LOGIN_FAILED'), code: 'PLAYER_LOGIN_FAILED' }, 401);
}

// GET: phiên hiện tại, để client biết đang đăng nhập là ai. Vé hỏng/hết hạn → "chưa đăng nhập" và xoá cookie.
export async function GET(request) {
    try {
        const rate = await consumePublicRateLimit('session_read_ip', { ip: clientIp(request) }, { failOpen: true });
        if (!rate.allowed) return rateLimited(rate);

        const token = readSignedPlayerSession();
        if (!token) return playerJson({ account: null });
        const resolved = await resolvePlayerSession(token);
        if (!resolved) {
            const response = playerJson({ account: null });
            clearPlayerSessionCookie(response);
            return response;
        }
        return playerJson({ account: projectPlayerAccount(resolved.account) });
    } catch (error) {
        console.error('player session GET error:', error);
        return playerJson({ account: null });
    }
}

// POST: đăng nhập. Sai SĐT, sai mật khẩu, tài khoản khoá, đầu vào hỏng → cùng MỘT thông điệp.
export async function POST(request) {
    try {
        if (!supabaseAdmin) return playerJson({ error: messageFor('UNAVAILABLE'), code: 'UNAVAILABLE' }, 503);

        const body = await request.json().catch(() => ({}));
        const parsed = parseLoginInput(body);
        // Đầu vào hỏng vẫn tính vào bucket (theo IP) để không thành đường dò miễn phí.
        const phoneNorm = parsed.ok ? parsed.value.phoneNorm : 'invalid';
        const rate = await consumePublicRateLimit('login', { phoneNorm, ip: clientIp(request) });
        if (!rate.allowed) return rateLimited(rate);
        if (!parsed.ok) return loginFailed();

        const { data: account, error } = await supabaseAdmin.from('player_accounts')
            .select('id, password_hash, display_name, gender, dob, self_declared_phr, status, access_version')
            .eq('phone_norm', phoneNorm)
            .maybeSingle();
        if (error) throw error;

        const passwordOk = verifyPassword(parsed.value.password, account?.password_hash || DUMMY_HASH);
        if (!account || !passwordOk || account.status !== 'active') return loginFailed();

        const { cookieValue, expiresAt } = await issuePlayerSession(account);
        const response = playerJson({ account: projectPlayerAccount(account) }, 201);
        setPlayerSessionCookie(response, cookieValue, expiresAt);
        return response;
    } catch (error) {
        console.error('player session POST error:', error);
        return playerJson({ error: messageFor('GENERIC'), code: 'INTERNAL' }, 500);
    }
}

// DELETE: đăng xuất. Luôn xoá cookie, kể cả khi vé đã hỏng.
export async function DELETE() {
    try {
        await revokePlayerSession(readSignedPlayerSession());
    } catch (error) {
        console.error('player session DELETE error:', error);
    }
    const response = playerJson({ ok: true });
    clearPlayerSessionCookie(response);
    return response;
}
