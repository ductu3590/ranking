// lib/publicTournamentRead.js
// Đọc dữ liệu công khai của một giải theo public_slug cho các endpoint chia sẻ
// (ảnh Open Graph, ảnh xuất). Slug là danh tính toàn hệ thống nên KHÔNG lọc theo
// group_id/cookie; visibility là thứ duy nhất quyết định được xem hay không.
//
// Dữ liệu trả ra luôn đi qua buildPublicSnapshot (allowlist) — riêng `host` chỉ
// dùng để vẽ logo/tên CLB chủ giải lên ảnh, không bao giờ ra JSON công khai.
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { computeStageStandings } from '@/lib/tournament/standingsService';
import { buildPublicSnapshot, normalizePublicSlug } from '@/lib/tournament/publicSnapshot';

const db = supabaseAdmin || supabaseServer;

const TOURNAMENT_SELECT = [
    'id', 'group_id', 'organizer_club_id', 'public_slug', 'name', 'description',
    'event_date', 'status', 'location', 'entrant_type', 'visibility', 'share_settings',
].join(', ');
const DIVISION_SELECT = [
    'id', 'name', 'entrant_type', 'play_type', 'scoring_scope',
    'competition_template', 'ruleset_version', 'competition_status',
].join(', ');
const STAGE_SELECT = [
    'id', 'tournament_id', 'division_id', 'stage_order', 'name',
    'schedule_format', 'match_format', 'status', 'config',
].join(', ');
const ENTRY_SELECT = 'id, division_id, name_snapshot, seed, color_snapshot';
const MATCH_SELECT = [
    'id', 'division_id', 'stage_id', 'round', 'bracket_slot', 'group_label',
    'court', 'match_order', 'entrant_a_id', 'entrant_b_id', 'status',
    'winner_entrant_id', 'entry_a_id', 'entry_b_id', 'winner_entry_id', 'parent_match_id',
].join(', ');
const GAME_SELECT = 'match_id, game_no, kind, score_a, score_b, winner_entrant_id';

async function readRows(table, select, filters) {
    let query = db.from(table).select(select);
    for (const [method, field, value] of filters) query = query[method](field, value);
    const { data, error } = await query;
    if (error) throw Object.assign(new Error(error.message), { status: 500 });
    return data || [];
}

async function readHost(tournament) {
    const clubId = tournament.organizer_club_id || tournament.group_id;
    if (!clubId) return null;
    const { data, error } = await db
        .from('groups')
        .select('name, logo_url')
        .eq('id', clubId)
        .maybeSingle();
    if (error) {
        console.error('publicTournamentRead host error:', error);
        return null;
    }
    return data ? { name: data.name || '', logo_url: data.logo_url || '' } : null;
}

/**
 * @returns {Promise<{snapshot: object, host: object|null}|null>} null nếu slug
 * không tồn tại hoặc giải chưa công khai.
 */
export async function loadPublicShareData(rawSlug, { withCompetition = true } = {}) {
    const slug = normalizePublicSlug(rawSlug);
    if (!slug) return null;

    const { data: tournament, error } = await db
        .from('tournaments')
        .select(TOURNAMENT_SELECT)
        .eq('public_slug', slug)
        .in('visibility', ['unlisted', 'public'])
        .maybeSingle();
    if (error) throw Object.assign(new Error(error.message), { status: 500 });
    if (!tournament) return null;

    const divisions = await readRows('tournament_divisions', DIVISION_SELECT, [
        ['eq', 'tournament_id', tournament.id],
    ]);
    const host = await readHost(tournament);

    if (!withCompetition) {
        return {
            host,
            snapshot: buildPublicSnapshot({
                tournament, divisions, stages: [], entrants: [], matches: [], games: [], standingsByStage: {},
            }),
        };
    }

    const stages = await readRows('tournament_stages', STAGE_SELECT, [
        ['eq', 'tournament_id', tournament.id],
    ]);
    stages.sort((a, b) => (a.stage_order || 0) - (b.stage_order || 0));
    const stageIds = stages.map((stage) => stage.id);
    const divisionIds = divisions.map((division) => division.id);

    let entrants = divisionIds.length
        ? (await readRows('tournament_entries', ENTRY_SELECT, [['in', 'division_id', divisionIds]]))
            .map((entry) => ({
                id: entry.id,
                division_id: entry.division_id,
                name: entry.name_snapshot,
                seed: entry.seed,
                color: entry.color_snapshot,
            }))
        : [];
    if (!entrants.length) {
        entrants = await readRows('tournament_entrants', 'id, name, seed, color', [
            ['eq', 'tournament_id', tournament.id],
        ]);
    }

    const matches = stageIds.length
        ? await readRows('tournament_matches', MATCH_SELECT, [['in', 'stage_id', stageIds]])
        : [];
    const matchIds = matches.map((match) => match.id);
    const games = matchIds.length
        ? await readRows('tournament_games', GAME_SELECT, [['in', 'match_id', matchIds]])
        : [];
    const standingsEntries = await Promise.all(stages.map(async (stage) => [
        stage.id,
        await computeStageStandings(db, stage),
    ]));

    return {
        host,
        snapshot: buildPublicSnapshot({
            tournament,
            divisions,
            stages,
            entrants,
            matches,
            games,
            standingsByStage: Object.fromEntries(standingsEntries),
        }),
    };
}
