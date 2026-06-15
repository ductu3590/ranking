import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { getEffectiveGroupContext } from '@/lib/groupSession';

const db = supabaseAdmin || supabaseServer;

// Public read snapshot cho link chia sẻ/QR. KHÔNG chặn admin (ai cũng xem được).
// Lưu ý: chia sẻ link xuyên CLB nằm ngoài phạm vi v1 — slug được resolve trong
// group context của người xem (getEffectiveGroupContext có fallback DEFAULT_GROUP_ID),
// không phải group của người tạo link. Realtime do UI tự subscribe Supabase.
export async function GET(request) {
    try {
        const { group_id: groupId } = getEffectiveGroupContext();

        const { searchParams } = new URL(request.url);
        const slug = searchParams.get('slug');
        if (!slug) {
            return NextResponse.json({ error: 'slug is required' }, { status: 400 });
        }

        // 1. Load tournament theo slug, scope group
        const { data: tournament, error: tErr } = await db
            .from('tournaments')
            .select('*')
            .eq('group_id', groupId)
            .eq('public_slug', slug)
            .single();
        if (tErr || !tournament) {
            return NextResponse.json({ error: 'Giải đấu không tồn tại' }, { status: 404 });
        }

        // 2. Stages (scope group + tournament)
        const { data: stages, error: sErr } = await db
            .from('tournament_stages')
            .select('*')
            .eq('group_id', groupId)
            .eq('tournament_id', tournament.id)
            .order('stage_order', { ascending: true });
        if (sErr) {
            return NextResponse.json({ error: sErr.message }, { status: 500 });
        }

        // 3. Entrants (scope group + tournament)
        const { data: entrants, error: eErr } = await db
            .from('tournament_entrants')
            .select('*')
            .eq('group_id', groupId)
            .eq('tournament_id', tournament.id)
            .order('seed', { ascending: true });
        if (eErr) {
            return NextResponse.json({ error: eErr.message }, { status: 500 });
        }

        // 4. Matches cho các stage (skip nếu chưa có stage nào)
        let matches = [];
        const stageIds = (stages || []).map((st) => st.id);
        if (stageIds.length) {
            const { data: matchRows, error: mErr } = await db
                .from('tournament_matches')
                .select('*')
                .eq('group_id', groupId)
                .in('stage_id', stageIds);
            if (mErr) {
                return NextResponse.json({ error: mErr.message }, { status: 500 });
            }
            matches = matchRows || [];
        }

        return NextResponse.json({
            tournament,
            stages: stages || [],
            entrants: entrants || [],
            matches,
        });
    } catch (err) {
        console.error('Public v2 GET error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
