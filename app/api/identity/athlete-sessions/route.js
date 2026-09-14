import { NextResponse } from 'next/server';

import { loginAthleteAccount, logoutAthleteAccount, resolveAthleteSession } from '@/lib/identityRuntime';
import {
    readSignedAthleteSession,
    setAthleteSessionCookie,
    clearAthleteSessionCookie,
} from '@/lib/athleteSession';
import { clearGroupSessionCookie } from '@/lib/groupSession';
import { toIdentityResponse, identityRouteError } from '@/lib/application/identity/routeAdapter';
import { consumeRateLimit, getClientIdentifier } from '@/lib/rateLimit';
import errors from '@/lib/application/identity/errors';

const { IdentityServiceError, isAthleteSessionError } = errors;

// Đăng nhập siết chặt hơn mutation thường (20/phút): đây là điểm dò mật khẩu.
// Khoá theo IP + login để một người thử sai không chặn được cả CLB.
function enforceLoginRateLimit(request, login) {
    const key = `athlete-login:${String(login || '').slice(0, 40)}:${getClientIdentifier(request)}`;
    const rate = consumeRateLimit(key, { limit: 8, windowMs: 5 * 60_000 });
    if (!rate.allowed) {
        throw new IdentityServiceError('RATE_LIMITED', undefined, {
            retryAfterSeconds: rate.retryAfterSeconds,
            rate,
        });
    }
}

// GET: phiên hiện tại, để client biết đang đăng nhập là ai.
export async function GET() {
    try {
        const token = readSignedAthleteSession();
        if (!token) return toIdentityResponse({ account: null });
        const { account } = await resolveAthleteSession(token);
        return toIdentityResponse({ account });
    } catch (error) {
        // Vé hỏng/hết hạn không phải lỗi cần báo đỏ ở đây: trả về "chưa đăng nhập"
        // và xoá cookie để lần sau không phải truy vấn DB nữa.
        if (error instanceof IdentityServiceError && isAthleteSessionError(error.code)) {
            const response = NextResponse.json({ account: null });
            clearAthleteSessionCookie(response);
            return response;
        }
        return identityRouteError(error);
    }
}

export async function POST(request) {
    try {
        const body = await request.json();
        enforceLoginRateLimit(request, body?.login);
        const { account, cookieValue, expiresAt } = await loginAthleteAccount({
            login: body?.login,
            password: body?.password,
        });
        const response = NextResponse.json({ account }, { status: 201 });
        setAthleteSessionCookie(response, cookieValue, expiresAt);
        // Tài khoản VĐV tự mang group_id và quyền đọc CLB của chính VĐV đó. Xoá vé
        // CLB dùng chung cũ để một trình duyệt không có hai danh tính song song.
        clearGroupSessionCookie(response);
        return response;
    } catch (error) {
        return identityRouteError(error);
    }
}

export async function DELETE() {
    try {
        // Luôn xoá cookie, kể cả khi vé đã hỏng — người dùng bấm đăng xuất thì phải xong.
        await logoutAthleteAccount(readSignedAthleteSession());
        const response = NextResponse.json({ ok: true });
        clearAthleteSessionCookie(response);
        return response;
    } catch (error) {
        return identityRouteError(error);
    }
}
