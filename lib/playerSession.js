import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { supabaseAdmin } from './supabaseAdmin';
import {
    PLAYER_SESSION_MAX_AGE_MS,
    derivePlayerSessionSecret,
    generatePlayerSessionKey,
    getPlayerSessionState,
    hashPlayerSessionKey,
    signPlayerSession,
    verifyPlayerSession,
} from './domain/identity/playerSession';

// Phiên VĐV công khai (Epic 4, D54). Tách hẳn athlete_session (gắn CLB), group_session và platform_session:
// khóa ký dẫn xuất bằng nhãn riêng và vé mang kind:'player'. Cookie chỉ là vé; player_sessions mới là nguồn sự thật.
export const PLAYER_SESSION_COOKIE = 'player_session';

const NO_STORE = { 'Cache-Control': 'no-store' };

// JSON luôn no-store: phản hồi chứa dữ liệu của chính người đăng nhập, không được cache chung.
export function playerJson(body, status = 200) {
    return NextResponse.json(body, { status, headers: NO_STORE });
}

export function playerSessionSecret() {
    if (process.env.PLAYER_SESSION_SECRET) return process.env.PLAYER_SESSION_SECRET;
    const base = process.env.GROUP_SESSION_SECRET;
    if (!base) throw new Error('Missing PLAYER_SESSION_SECRET or GROUP_SESSION_SECRET');
    return derivePlayerSessionSecret(base);
}

export function readSignedPlayerSession() {
    try {
        const value = cookies().get(PLAYER_SESSION_COOKIE)?.value;
        return verifyPlayerSession(value, playerSessionSecret());
    } catch {
        return null;
    }
}

function cookieOptions(maxAgeSeconds) {
    return {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: maxAgeSeconds,
    };
}

export function setPlayerSessionCookie(response, value, expiresAt) {
    const maxAgeMs = Number.isFinite(expiresAt) ? Math.max(0, expiresAt - Date.now()) : PLAYER_SESSION_MAX_AGE_MS;
    response.cookies.set(PLAYER_SESSION_COOKIE, value, cookieOptions(Math.floor(maxAgeMs / 1000)));
}

export function clearPlayerSessionCookie(response) {
    response.cookies.set(PLAYER_SESSION_COOKIE, '', cookieOptions(0));
}

// Tạo bản ghi phiên + vé ký cho một tài khoản đã xác thực. Ném lỗi nếu không ghi được bản ghi.
export async function issuePlayerSession(account) {
    const sessionKey = generatePlayerSessionKey();
    const now = Date.now();
    const expiresAt = now + PLAYER_SESSION_MAX_AGE_MS;
    const { error } = await supabaseAdmin.from('player_sessions').insert({
        account_id: account.id,
        session_key_hash: hashPlayerSessionKey(sessionKey),
        expires_at: new Date(expiresAt).toISOString(),
    });
    if (error) throw error;
    const cookieValue = signPlayerSession({
        accountId: account.id,
        sessionKey,
        accessVersion: account.access_version,
        now,
        expiresAt,
    }, playerSessionSecret());
    return { cookieValue, expiresAt };
}

// Đối chiếu vé với DB. Trả { account, token } khi phiên còn sống, ngược lại null.
export async function resolvePlayerSession(token = readSignedPlayerSession()) {
    if (!token || !supabaseAdmin) return null;
    const [sessionResult, accountResult] = await Promise.all([
        supabaseAdmin.from('player_sessions')
            .select('account_id, session_key_hash, revoked_at, expires_at')
            .eq('account_id', token.account_id)
            .eq('session_key_hash', hashPlayerSessionKey(token.session_key))
            .maybeSingle(),
        supabaseAdmin.from('player_accounts')
            .select('id, display_name, gender, dob, self_declared_phr, status, access_version')
            .eq('id', token.account_id)
            .maybeSingle(),
    ]);
    if (sessionResult.error || accountResult.error) return null;
    const state = getPlayerSessionState({
        token,
        sessionRecord: sessionResult.data,
        account: accountResult.data,
    });
    return state === 'active' ? { account: accountResult.data, token } : null;
}

export async function requirePlayerSession() {
    const resolved = await resolvePlayerSession();
    if (resolved) return { ok: true, ...resolved };
    const response = playerJson({ error: 'Cần đăng nhập tài khoản VĐV.', code: 'PLAYER_SESSION_REQUIRED' }, 401);
    return { ok: false, response };
}

// Thu hồi đúng phiên trong vé (đăng xuất). Không ném lỗi nếu vé hỏng: người dùng bấm đăng xuất thì phải xong.
export async function revokePlayerSession(token) {
    if (!token || !supabaseAdmin) return;
    await supabaseAdmin.from('player_sessions')
        .update({ revoked_at: new Date().toISOString() })
        .eq('account_id', token.account_id)
        .eq('session_key_hash', hashPlayerSessionKey(token.session_key))
        .is('revoked_at', null);
}
