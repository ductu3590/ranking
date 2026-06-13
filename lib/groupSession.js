import crypto from 'crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { DEFAULT_GROUP_CODE, DEFAULT_GROUP_ID } from './groupAuth';

export const GROUP_SESSION_COOKIE = 'group_session';

function getSessionSecret() {
    const secret = process.env.GROUP_SESSION_SECRET;
    if (!secret) {
        throw new Error('Missing GROUP_SESSION_SECRET');
    }
    return secret;
}

function encodePayload(payload) {
    return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function decodePayload(encoded) {
    return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
}

function signValue(value) {
    return crypto.createHmac('sha256', getSessionSecret()).update(value).digest('base64url');
}

export function signGroupSession({ groupId, groupCode, groupName, role }) {
    const payload = {
        group_id: groupId,
        group_code: groupCode,
        group_name: groupName,
        role,
        issued_at: Date.now(),
    };
    const encoded = encodePayload(payload);
    return `${encoded}.${signValue(encoded)}`;
}

export function verifyGroupSession(cookieValue) {
    if (!cookieValue || !cookieValue.includes('.')) return null;
    const [encoded, signature] = cookieValue.split('.');
    const expectedSignature = signValue(encoded);
    const given = Buffer.from(signature || '');
    const expected = Buffer.from(expectedSignature);
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;

    const payload = decodePayload(encoded);
    if (!payload?.group_id || !payload?.group_code || !['admin', 'member'].includes(payload.role)) {
        return null;
    }
    return payload;
}

export function setGroupSessionCookie(response, sessionValue) {
    response.cookies.set(GROUP_SESSION_COOKIE, sessionValue, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 60 * 60 * 24 * 30,
    });
}

export function getGroupSessionFromCookies() {
    try {
        const value = cookies().get(GROUP_SESSION_COOKIE)?.value;
        return verifyGroupSession(value);
    } catch {
        return null;
    }
}

export function getEffectiveGroupContext() {
    const session = getGroupSessionFromCookies();
    if (session) return session;
    return {
        group_id: DEFAULT_GROUP_ID,
        group_code: DEFAULT_GROUP_CODE,
        group_name: 'Pickleball 246 Club',
        role: 'member',
        is_default: true,
    };
}

export function getGroupIdForDatabase() {
    return getEffectiveGroupContext().group_id || DEFAULT_GROUP_ID;
}

export function requireGroupAdmin() {
    const session = getGroupSessionFromCookies();
    if (session?.role === 'admin') {
        return { ok: true, session, groupId: session.group_id };
    }

    if (!session) {
        return {
            ok: true,
            session: getEffectiveGroupContext(),
            groupId: DEFAULT_GROUP_ID,
            legacyFallback: true,
        };
    }

    return {
        ok: false,
        response: NextResponse.json({ error: 'Unauthorized' }, { status: 403 }),
    };
}

export function isMissingGroupColumnError(error) {
    return error?.code === '42703' || String(error?.message || '').includes('group_id');
}
