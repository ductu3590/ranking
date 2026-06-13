import { NextResponse } from 'next/server';
import { clearGroupSessionCookie, getEffectiveGroupContext } from '@/lib/groupSession';

export async function GET() {
    return NextResponse.json({
        session: getEffectiveGroupContext(),
    });
}

export async function DELETE() {
    const response = NextResponse.json({ ok: true });
    clearGroupSessionCookie(response);
    return response;
}
