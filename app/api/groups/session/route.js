import { NextResponse } from 'next/server';
import {
    clearGroupSessionCookie,
    getValidatedGroupSessionFromCookies,
    getGroupSessionFromCookies,
} from '@/lib/groupSession';
import { identityRepository } from '@/lib/identityRuntime';
import { getClubReadContext } from '@/lib/clubReadContext';
import sessionViewModule from '@/lib/clubSessionView';

const { buildClubSessionView } = sessionViewModule;

export async function GET() {
    // Luôn validate group_session để access_version/thu hồi vẫn được kiểm tra. Khi có
    // athlete_session, getClubReadContext vẫn ưu tiên danh tính VĐV đã xác thực.
    const validatedClubSession = await getValidatedGroupSessionFromCookies();
    const context = await getClubReadContext();
    return NextResponse.json(buildClubSessionView(context.role === 'athlete' ? context : validatedClubSession || context));
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
