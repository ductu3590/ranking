import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { requireValidatedGroupAdmin, getClubScope } from '@/lib/groupSession';
import { generatePairSchedule } from '@/lib/tournament/match/mlpPairs';

const db = supabaseAdmin || supabaseServer;

// GET /api/tournament-v2/pairs?stageId=<id> (public)
// Đọc pairSchedule hiện có của 1 stage. null nếu chưa sinh.
export async function GET(request) {
    try {
        const scope = getClubScope();
        if (!scope.ok) return scope.response;
        const groupId = scope.groupId;
        const { searchParams } = new URL(request.url);
        const stageId = searchParams.get('stageId');
        if (!stageId) {
            return NextResponse.json({ error: 'stageId is required' }, { status: 400 });
        }

        const { data: stage, error } = await db
            .from('tournament_stages')
            .select('config')
            .eq('group_id', groupId)
            .eq('id', stageId)
            .maybeSingle();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }
        if (!stage) {
            return NextResponse.json({ error: 'Stage không tồn tại' }, { status: 404 });
        }

        const pairSchedule = stage.config?.pairSchedule || null;
        return NextResponse.json({ pairSchedule });
    } catch (err) {
        console.error('Pairs v2 GET error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

// POST /api/tournament-v2/pairs (admin)
// Sinh (hoặc regenerate) pairSchedule cho stage MLP. Ghi đè vào stage.config.
export async function POST(request) {
    try {
        const adminCheck = await requireValidatedGroupAdmin();
        if (!adminCheck.ok) return adminCheck.response;
        const groupId = adminCheck.groupId;

        const body = await request.json();
        const stageId = body?.stageId;
        const seed = Number(body?.seed) || 1;
        if (!stageId) {
            return NextResponse.json({ error: 'stageId is required' }, { status: 400 });
        }

        // 2. Load stage (scope group).
        const { data: stage, error: stageErr } = await db
            .from('tournament_stages')
            .select('id, tournament_id, match_format, config')
            .eq('group_id', groupId)
            .eq('id', stageId)
            .maybeSingle();

        if (stageErr) {
            return NextResponse.json({ error: stageErr.message }, { status: 500 });
        }
        if (!stage) {
            return NextResponse.json({ error: 'Stage không tồn tại' }, { status: 404 });
        }

        // 3. Chỉ áp dụng cho MLP.
        if (stage.match_format !== 'mlp') {
            return NextResponse.json(
                { error: 'Pair schedule chỉ áp dụng cho stage MLP' },
                { status: 400 }
            );
        }

        // 4. Load entrants + members của tournament (entrants theo seed asc, members theo id asc).
        const { data: entrants, error: entrantsErr } = await db
            .from('tournament_entrants')
            .select('id, name')
            .eq('group_id', groupId)
            .eq('tournament_id', stage.tournament_id)
            .order('seed', { ascending: true });

        if (entrantsErr) {
            return NextResponse.json({ error: entrantsErr.message }, { status: 500 });
        }
        if (!entrants || entrants.length === 0) {
            return NextResponse.json({ error: 'Giải chưa có đội nào' }, { status: 400 });
        }

        const entrantIds = entrants.map((e) => e.id);
        const { data: members, error: membersErr } = await db
            .from('tournament_entrant_members')
            .select('entrant_id, display_name, id')
            .eq('group_id', groupId)
            .in('entrant_id', entrantIds)
            .order('id', { ascending: true });

        if (membersErr) {
            return NextResponse.json({ error: membersErr.message }, { status: 500 });
        }

        // Gom members theo entrant, giữ thứ tự id asc để index `mi` ổn định.
        const membersByEntrant = {};
        for (const m of members || []) {
            if (!membersByEntrant[m.entrant_id]) membersByEntrant[m.entrant_id] = [];
            membersByEntrant[m.entrant_id].push({ name: m.display_name || '' });
        }

        // 5. Dựng teams + chặn đội < 2 VĐV.
        const teams = [];
        for (const e of entrants) {
            const teamMembers = membersByEntrant[e.id] || [];
            if (teamMembers.length < 2) {
                return NextResponse.json(
                    { error: `Đội "${e.name || e.id}" cần ít nhất 2 VĐV` },
                    { status: 400 }
                );
            }
            teams.push({ entrantId: String(e.id), members: teamMembers });
        }

        // 6. Gọi engine. rounds = config.gamesPerMatchup.
        const rounds = Number(stage.config?.gamesPerMatchup) || 4;
        let pairSchedule;
        try {
            pairSchedule = generatePairSchedule(teams, rounds, seed);
        } catch (engineErr) {
            return NextResponse.json({ error: engineErr.message }, { status: 400 });
        }
        pairSchedule.generatedAt = new Date().toISOString();

        // 7. Merge vào config, giữ nguyên các key khác (gamesPerMatchup, dreamBreaker...).
        const newConfig = { ...(stage.config || {}), pairSchedule };

        const { error: updateErr } = await db
            .from('tournament_stages')
            .update({ config: newConfig })
            .eq('id', stageId)
            .eq('group_id', groupId);

        if (updateErr) {
            return NextResponse.json({ error: updateErr.message }, { status: 500 });
        }

        // 8. Trả pairSchedule.
        return NextResponse.json({ success: true, pairSchedule });
    } catch (err) {
        console.error('Pairs v2 POST error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

// PATCH /api/tournament-v2/pairs (admin)
// Ghi đè toàn bộ pairSchedule (dùng khi admin sửa thủ công lịch ghép đôi).
export async function PATCH(request) {
    try {
        const adminCheck = await requireValidatedGroupAdmin();
        if (!adminCheck.ok) return adminCheck.response;
        const groupId = adminCheck.groupId;

        const body = await request.json();
        const stageId = body?.stageId;
        const pairSchedule = body?.pairSchedule;
        if (!stageId) {
            return NextResponse.json({ error: 'stageId is required' }, { status: 400 });
        }
        if (!pairSchedule || typeof pairSchedule !== 'object') {
            return NextResponse.json({ error: 'pairSchedule is required' }, { status: 400 });
        }

        const { data: stage, error: stageErr } = await db
            .from('tournament_stages')
            .select('id, match_format, config')
            .eq('group_id', groupId)
            .eq('id', stageId)
            .maybeSingle();

        if (stageErr) return NextResponse.json({ error: stageErr.message }, { status: 500 });
        if (!stage) return NextResponse.json({ error: 'Stage không tồn tại' }, { status: 404 });
        if (stage.match_format !== 'mlp') {
            return NextResponse.json({ error: 'Pair schedule chỉ áp dụng cho stage MLP' }, { status: 400 });
        }

        const newConfig = { ...(stage.config || {}), pairSchedule: { ...pairSchedule, updatedAt: new Date().toISOString() } };
        const { error: updateErr } = await db
            .from('tournament_stages')
            .update({ config: newConfig })
            .eq('id', stageId)
            .eq('group_id', groupId);

        if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
        return NextResponse.json({ success: true, pairSchedule: newConfig.pairSchedule });
    } catch (err) {
        console.error('Pairs v2 PATCH error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
