import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { hashPassword, verifyPassword } from '@/lib/domain/identity/password';
import { parseProfilePatch, projectPlayerAccount } from '@/lib/domain/identity/playerAccount';
import { consumePublicRateLimit } from '@/lib/publicRateLimit';
import {
    issuePlayerSession,
    playerJson,
    requirePlayerSession,
    setPlayerSessionCookie,
} from '@/lib/playerSession';
import { messageFor, rateLimitedMessage } from '@/lib/tournament/communityMessages';

export const dynamic = 'force-dynamic';

function rateLimited(rate) {
    const response = playerJson({
        error: rateLimitedMessage(rate.retryAfterSeconds),
        code: 'RATE_LIMITED',
        retryAfterSeconds: rate.retryAfterSeconds,
    }, 429);
    response.headers.set('Retry-After', String(Math.max(1, rate.retryAfterSeconds)));
    return response;
}

// GET: hồ sơ của chính tài khoản đang đăng nhập.
export async function GET() {
    const auth = await requirePlayerSession();
    if (!auth.ok) return auth.response;
    return playerJson({ account: projectPlayerAccount(auth.account) });
}

// PATCH: sửa tên/giới tính/ngày sinh/PHR; hoặc đổi mật khẩu (cần mật khẩu cũ đúng). Đổi mật khẩu tăng access_version
// và thu hồi mọi phiên khác; phiên hiện tại được cấp lại vé mới.
export async function PATCH(request) {
    try {
        const auth = await requirePlayerSession();
        if (!auth.ok) return auth.response;

        const rate = await consumePublicRateLimit('profile', { accountId: auth.account.id });
        if (!rate.allowed) return rateLimited(rate);

        const body = await request.json().catch(() => ({}));
        const parsed = parseProfilePatch(body);
        if (!parsed.ok) return playerJson({ error: messageFor(parsed.code), code: parsed.code }, 400);
        const { currentPassword, newPassword, displayName, gender, dob, selfDeclaredPhr } = parsed.value;

        const update = { updated_at: new Date().toISOString() };
        if (displayName !== undefined) update.display_name = displayName;
        if (gender !== undefined) update.gender = gender;
        if (dob !== undefined) update.dob = dob;
        if (selfDeclaredPhr !== undefined) update.self_declared_phr = selfDeclaredPhr;

        const changingPassword = newPassword !== undefined;
        if (changingPassword) {
            const { data: row, error: readError } = await supabaseAdmin.from('player_accounts')
                .select('password_hash, access_version').eq('id', auth.account.id).maybeSingle();
            if (readError) throw readError;
            if (!row || !verifyPassword(currentPassword, row.password_hash)) {
                return playerJson({ error: messageFor('PLAYER_LOGIN_FAILED'), code: 'PLAYER_LOGIN_FAILED' }, 401);
            }
            update.password_hash = hashPassword(newPassword);
            update.access_version = Number(row.access_version) + 1;
        }

        const { data: account, error } = await supabaseAdmin.from('player_accounts')
            .update(update).eq('id', auth.account.id)
            .select('id, display_name, gender, dob, self_declared_phr, access_version').single();
        if (error) throw error;

        const response = playerJson({ account: projectPlayerAccount(account) });
        if (changingPassword) {
            // Thu hồi mọi phiên cũ (kể cả phiên hiện tại), rồi cấp phiên mới với access_version mới.
            const { error: revokeError } = await supabaseAdmin.from('player_sessions')
                .update({ revoked_at: new Date().toISOString() })
                .eq('account_id', account.id).is('revoked_at', null);
            if (revokeError) throw revokeError;
            const { cookieValue, expiresAt } = await issuePlayerSession(account);
            setPlayerSessionCookie(response, cookieValue, expiresAt);
        }
        return response;
    } catch (error) {
        console.error('player profile PATCH error:', error);
        return playerJson({ error: messageFor('GENERIC'), code: 'INTERNAL' }, 500);
    }
}
