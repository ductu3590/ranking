import { NextResponse } from 'next/server';
import { requireValidatedGroupAdmin } from '@/lib/groupSession';
import { buildSchedulePreview } from '@/lib/tournament/schedulePreview';

export async function POST(request) {
    const admin = await requireValidatedGroupAdmin();
    if (!admin.ok) return admin.response;
    try {
        const body = await request.json();
        const preview = buildSchedulePreview({
            competition: body?.competition || {},
            entrantCount: Number(body?.entrant_count || 0),
            seed: Number(body?.seed || 1),
        });
        return NextResponse.json(preview);
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 400 });
    }
}
