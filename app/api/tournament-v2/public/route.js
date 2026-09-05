import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { computeStageStandings } from '@/lib/tournament/standingsService';
import { buildPublicSnapshot, normalizePublicSlug } from '@/lib/tournament/publicSnapshot';

const db = supabaseAdmin || supabaseServer;

const PUBLIC_TOURNAMENT_SELECT = [
    'id', 'public_slug', 'name', 'description', 'event_date',
    'status', 'location', 'entrant_type', 'visibility', 'share_settings',
].join(', ');
const PUBLIC_STAGE_SELECT = [
    'id', 'tournament_id', 'division_id', 'stage_order', 'name',
    'schedule_format', 'match_format', 'status', 'config',
].join(', ');
const PUBLIC_DIVISION_SELECT = [
    'id', 'name', 'entrant_type', 'play_type', 'scoring_scope',
    'competition_template', 'ruleset_version', 'competition_status',
].join(', ');
const PUBLIC_ENTRANT_SELECT = 'id, division_id, name_snapshot, seed, color_snapshot';
const PUBLIC_MATCH_SELECT = [
    'id', 'division_id', 'stage_id', 'round', 'bracket_slot', 'group_label',
    'court', 'match_order', 'entrant_a_id', 'entrant_b_id', 'status',
    'winner_entrant_id', 'entry_a_id', 'entry_b_id', 'winner_entry_id', 'parent_match_id',
].join(', ');
const PUBLIC_GAME_SELECT = [
    'match_id', 'game_no', 'kind', 'score_a', 'score_b',
    'winner_entrant_id',
].join(', ');

async function readRows(table, select, filters) {
    let query = db.from(table).select(select);
    for (const [method, field, value] of filters) query = query[method](field, value);
    const { data, error } = await query;
    if (error) throw Object.assign(new Error(error.message), { status: 500 });
    return data || [];
}

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const slug = normalizePublicSlug(searchParams.get('slug'));
        if (!slug) return NextResponse.json({ error: 'slug is required' }, { status: 400 });

        // Slug is a global public identity; never resolve it through the viewer cookie.
        const { data: tournament, error: tErr } = await db
            .from('tournaments')
            .select(PUBLIC_TOURNAMENT_SELECT)
            .eq('public_slug', slug)
            .in('visibility', ['unlisted', 'public'])
            .maybeSingle();
        if (tErr || !tournament) {
            return NextResponse.json({ error: 'Giải đấu không tồn tại' }, { status: 404 });
        }

        // Nội dung thi đấu công khai: cần cho tab nội dung, link chia sẻ theo
        // division và ảnh/text xuất ra nhóm Zalo.
        const divisions = await readRows('tournament_divisions', PUBLIC_DIVISION_SELECT, [
            ['eq', 'tournament_id', tournament.id],
        ]);
        const stages = await readRows('tournament_stages', PUBLIC_STAGE_SELECT, [
            ['eq', 'tournament_id', tournament.id],
        ]);
        stages.sort((a, b) => (a.stage_order || 0) - (b.stage_order || 0));
        const stageIds = stages.map((stage) => stage.id);
        const divisionIds = stages.map((stage) => stage.division_id).filter(Boolean);
        let entrants = divisionIds.length
            ? await readRows('tournament_entries', PUBLIC_ENTRANT_SELECT, [['in', 'division_id', divisionIds]])
            : [];
        if (!entrants.length) {
            entrants = await readRows('tournament_entrants', 'id, name, seed, color', [
                ['eq', 'tournament_id', tournament.id],
            ]);
        } else {
            entrants = entrants.map((entry) => ({
                id: entry.id,
                division_id: entry.division_id,
                name: entry.name_snapshot,
                seed: entry.seed,
                color: entry.color_snapshot,
            }));
            // PHR công khai lấy từ snapshot lúc duyệt entry, không lấy giá trị
            // hiện tại của VĐV. Chỉ truy vấn khi BTC đã bật công khai.
            if (tournament?.share_settings?.public_phr === true) {
                const entryIds = entrants.map((entry) => entry.id);
                const members = entryIds.length
                    ? await readRows('tournament_entry_members', 'entry_id, skill_snapshot', [
                        ['in', 'entry_id', entryIds],
                    ])
                    : [];
                const totals = new Map();
                for (const member of members) {
                    if (member.skill_snapshot == null) continue;
                    const key = String(member.entry_id);
                    totals.set(key, (totals.get(key) || 0) + Number(member.skill_snapshot));
                }
                entrants = entrants.map((entry) => (
                    totals.has(String(entry.id))
                        ? { ...entry, phr_total: totals.get(String(entry.id)) }
                        : entry
                ));
            }
        }
        const matches = stageIds.length
            ? await readRows('tournament_matches', PUBLIC_MATCH_SELECT, [
                ['in', 'stage_id', stageIds],
            ])
            : [];
        const matchIds = matches.map((match) => match.id);
        const games = matchIds.length
            ? await readRows('tournament_games', PUBLIC_GAME_SELECT, [
                ['in', 'match_id', matchIds],
            ])
            : [];
        const standingsEntries = await Promise.all(stages.map(async (stage) => [
            stage.id,
            await computeStageStandings(db, stage),
        ]));

        return NextResponse.json(buildPublicSnapshot({
            tournament,
            divisions,
            stages,
            entrants,
            matches,
            games,
            standingsByStage: Object.fromEntries(standingsEntries),
        }));
    } catch (err) {
        console.error('Public v2 GET error:', err);
        return NextResponse.json({ error: err.message }, { status: err.status || 500 });
    }
}
