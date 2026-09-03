import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { DEFAULT_GROUP_CODE, DEFAULT_GROUP_ID } from './groupAuth';
import {
    signSession,
    verifySession,
    getActorFromSession,
    authorizeActor,
    getClubScopeFromSession,
} from './groupSessionCore';

export const GROUP_SESSION_COOKIE = 'group_session';
const AUTH_ERROR = 'Unauthorized';

function getSessionSecret() {
    const secret = process.env.GROUP_SESSION_SECRET;
    if (!secret) {
        throw new Error('Missing GROUP_SESSION_SECRET');
    }
    return secret;
}

export function signGroupSession({ groupId, groupCode, groupName, role }) {
    return signSession({ groupId, groupCode, groupName, role }, getSessionSecret());
}

export function verifyGroupSession(cookieValue) {
    return verifySession(cookieValue, getSessionSecret());
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

export function clearGroupSessionCookie(response) {
    response.cookies.set(GROUP_SESSION_COOKIE, '', {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 0,
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
    const actor = getActorFromSession(session);
    const result = authorizeActor(actor, ['admin']);
    if (result.ok) return { ok: true, session, groupId: actor.groupId, actor };
    return { ok: false, response: NextResponse.json({ error: result.error || AUTH_ERROR }, { status: result.status }) };
}

export function getActor() {
    return getActorFromSession(getGroupSessionFromCookies());
}

export function authorize(actor, allowedRoles) {
    const result = authorizeActor(actor || getActor(), allowedRoles);
    if (result.ok) return result;
    return { ...result, response: NextResponse.json({ error: result.error || AUTH_ERROR }, { status: result.status }) };
}

export function getClubScope() {
    const result = getClubScopeFromSession(getGroupSessionFromCookies());
    if (result.ok) return result;
    return { ...result, response: NextResponse.json({ error: result.error || AUTH_ERROR }, { status: result.status }) };
}

export function isMissingGroupColumnError(error) {
    return error?.code === '42703' || String(error?.message || '').includes('group_id');
}
