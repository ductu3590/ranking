import { NextResponse } from 'next/server';

/**
 * Guard for /api/debug/* routes.
 *
 * These endpoints query real tournament data and log it. They exist only for
 * local diagnosis and must never be reachable in production. Each debug route
 * should call this at the start of its handler and return the response when one
 * is provided. Routes must also export `const dynamic = 'force-dynamic'` so the
 * production build never prerenders (and logs) their data.
 *
 * @returns {NextResponse|null} a 404 response when blocked, otherwise null.
 */
export function debugGuard() {
    if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return null;
}
