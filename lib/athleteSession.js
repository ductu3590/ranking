import crypto from 'crypto';
import { cookies } from 'next/headers';

import {
    ATHLETE_SESSION_MAX_AGE_MS,
    signAthleteSession,
    verifyAthleteSession,
} from './domain/identity/athleteSession';

export const ATHLETE_SESSION_COOKIE = 'athlete_session';

// Khoá ký riêng cho vé VĐV. Nếu chưa đặt ATHLETE_SESSION_SECRET thì dẫn xuất từ
// GROUP_SESSION_SECRET (đã có sẵn trên mọi môi trường) qua HMAC với nhãn cố định,
// nên hai hệ vé không dùng chung khoá dù chỉ cấu hình một biến môi trường.
const DERIVATION_LABEL = 'pickhub:athlete-session:v1';

export function athleteSessionSecret() {
    if (process.env.ATHLETE_SESSION_SECRET) return process.env.ATHLETE_SESSION_SECRET;
    const base = process.env.GROUP_SESSION_SECRET;
    if (!base) throw new Error('Missing ATHLETE_SESSION_SECRET or GROUP_SESSION_SECRET');
    return crypto.createHmac('sha256', base).update(DERIVATION_LABEL).digest('base64url');
}

export function signAthleteSessionCookie(input) {
    return signAthleteSession(input, athleteSessionSecret());
}

// Chỉ kiểm tra chữ ký + thời hạn trong vé. Việc đối chiếu bản ghi phiên và trạng thái
// tài khoản trong DB do createResolveAthleteSession lo — cookie không phải nguồn sự thật.
export function readSignedAthleteSession() {
    try {
        const value = cookies().get(ATHLETE_SESSION_COOKIE)?.value;
        return verifyAthleteSession(value, athleteSessionSecret());
    } catch {
        return null;
    }
}

export function setAthleteSessionCookie(response, value, expiresAt) {
    const maxAgeMs = Number.isFinite(expiresAt)
        ? Math.max(0, expiresAt - Date.now())
        : ATHLETE_SESSION_MAX_AGE_MS;
    response.cookies.set(ATHLETE_SESSION_COOKIE, value, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: Math.floor(maxAgeMs / 1000),
    });
}

export function clearAthleteSessionCookie(response) {
    response.cookies.set(ATHLETE_SESSION_COOKIE, '', {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 0,
    });
}
