import { NextResponse } from 'next/server';
import {
    clearGroupSessionCookie,
    getDefaultGroupContext,
    getValidatedGroupSessionFromCookies,
    getGroupSessionFromCookies,
} from '@/lib/groupSession';
import { identityRepository } from '@/lib/identityRuntime';
import sessionViewModule from '@/lib/clubSessionView';

const { buildClubSessionView } = sessionViewModule;

export async function GET() {
    const session = await getValidatedGroupSessionFromCookies();
    return NextResponse.json(buildClubSessionView(session || getDefaultGroupContext()));
}

export async function DELETE() {
    const session = getGroupSessionFromCookies();
    if (session?.session_key) {
        await identityRepository.revokeSession(session.session_key, 'logout', Date.now());
    }
    const response = NextResponse.json({ ok: true });
    clearGroupSessionCookie(response);
    return response;
}
