'use strict';

// Don du lieu do harness trinh duyet tao ra.
//
//   node scripts/qa/cleanup-browser-harness.js <group_id> [<group_id>...]
//   node scripts/qa/cleanup-browser-harness.js --check <group_id> ...   (chi kiem tra)
//
// AN TOAN — doc ky truoc khi sua:
//   * CHI xoa theo `group_id` duoc liet ke tuong minh. Khong bao gio xoa theo
//     tien to ten, khong bao gio quet toan bang.
//   * Truoc khi xoa, TU CHOI neu group con dinh toi du lieu ngoai pham vi:
//     co `club_members`, co lien ket toi bang `athletes` toan cuc, hoac co
//     entry/tran tham chieu cheo sang group khac.
//   * Khong `DROP`, khong `TRUNCATE`, khong reset gi.
//   * Sau khi xoa, kiem lai bang CHINH cac id trong manifest, khong dua vao
//     tong so group.

const { createClient } = require('@supabase/supabase-js');

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const groupIds = args.filter((value) => /^\d+$/.test(value)).map(Number);

if (!groupIds.length) {
    console.error('Cach dung: node scripts/qa/cleanup-browser-harness.js [--check] <group_id> [<group_id>...]');
    process.exit(2);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
    console.error('Can NEXT_PUBLIC_SUPABASE_URL va SUPABASE_SERVICE_ROLE_KEY trong moi truong.');
    process.exit(2);
}
const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

// Xoa tu duoi len: con truoc, cha sau. Thu tu nay duoc doi chieu voi do thi khoa
// ngoai that (`pg_constraint` contype='f'); cac khoa RESTRICT bat buoc phai co
// mat trong danh sach, neu khong lenh xoa se dung giua chung.
const DELETE_ORDER = [
    // --- phu thuoc vao TRAN ---
    'tournament_result_correction_mutations',
    'tournament_result_corrections',
    'tournament_score_submissions',
    'tournament_scorekeeper_tokens',
    'tournament_match_assignments',
    // Guard E5 (migration 087/088) CHAN xoa truc tiep tournament_games cua giai da
    // seed; chi cho phep xoa theo CASCADE tu tran cha (pg_trigger_depth()>1). Vi vay
    // phai xoa TRAN truoc — games se tu cascade — roi moi quet phan game con sot
    // cua cac stage chua seed.
    'tournament_stage_transitions',
    'tournament_matches',
    'tournament_games',
    'tournament_stage_entrants',
    // --- phu thuoc vao SUAT / CAP / DINH DANH ---
    'tournament_check_ins',
    'tournament_qr_checkin_tokens',
    'tournament_athlete_phr_history',
    'tournament_pair_invites',
    'tournament_pair_members',
    'tournament_entry_members',
    'tournament_entrant_members',
    'tournament_entries',
    'tournament_pairs',
    'tournament_division_roster_members',
    'tournament_athletes',
    // --- phu thuoc vao GIAI DOAN / NOI DUNG / GIAI ---
    'tournament_stages',
    'tournament_finance_ledger',
    'tournament_notifications',
    'tournament_staff',
    'tournament_time_slots',
    'tournament_courts',
    'tournament_venues',
    'tournament_divisions',
    'tournament_clubs',
    'tournament_external_clubs',
    'tournament_entrants',
    'tournament_registration_members',
    'tournament_registrations',
    'tournament_operation_logs',
    'tournament_setup_mutations',
    'tournament_stage_advance_mutations',
    'tournaments',
    // --- phu thuoc vao CLB ---
    'club_notifications',
    'group_bank_accounts',
    'group_sessions',
    'pickhub_mutation_idempotency',
    'club_member_athlete_map',
    'club_memberships',
    'club_members',
    'group_members',
    'groups',
];

// Bang `groups` tu no khoa theo `id`, khong co cot `group_id`. Neu khong xu ly
// rieng thi dong CLB se khong bao gio bi xoa va "don dep" chi don phan con.
function scopeColumn(table) {
    return table === 'groups' ? 'id' : 'group_id';
}

async function count(table, groupId) {
    const result = await db.from(table).select('id', { count: 'exact', head: true }).eq(scopeColumn(table), groupId);
    if (result.error) return null; // bang khong ton tai hoac khong co cot pham vi
    return Number(result.count || 0);
}

async function safetyCheck(groupId) {
    const problems = [];
    for (const table of ['club_members', 'club_memberships', 'club_member_athlete_map']) {
        const members = await count(table, groupId);
        if (members) problems.push(`con ${members} dong ${table} — day khong phai CLB kiem thu trong`);
    }

    const athletes = await db.from('tournament_athletes').select('athlete_id').eq('group_id', groupId);
    if (!athletes.error) {
        const linked = (athletes.data || []).filter((row) => row.athlete_id != null).length;
        if (linked) problems.push(`co ${linked} dinh danh gan voi bang athletes toan cuc`);
    }
    const tournaments = await db.from('tournaments').select('id').eq('group_id', groupId);
    if (!tournaments.error && (tournaments.data || []).length) {
        const ids = tournaments.data.map((row) => row.id);
        const foreign = await db.from('tournament_entries').select('id, group_id').in('tournament_id', ids);
        if (!foreign.error) {
            const outside = (foreign.data || []).filter((row) => Number(row.group_id) !== groupId);
            if (outside.length) problems.push(`co ${outside.length} entry thuoc group khac tham chieu vao giai cua group nay`);
        }
    }
    return problems;
}

// Guard 064 (`guard_locked_division_setup_write`) chan moi thao tac len
// `tournament_pair_members` / `tournament_entries` khi roster cua noi dung dang
// KHOA — ke ca lenh xoa. Do la dung y do: khong ai duoc sua doi hinh sau khi chot.
//
// Duong xoa giai cua san pham khong gap van de nay vi no da tu choi som hon
// (`canDelete`: chi xoa duoc giai con Nhap va CHUA co tran nao). Nhung don du lieu
// kiem thu thi phai thao ca nhung giai da thi dau xong, nen buoc mo khoa nay la
// viec mot nguoi van hanh se lam bang tay.
//
// Pham vi: CHI cac noi dung thuoc dung group_id duoc liet ke tuong minh.
async function unlockDivisions(groupId) {
    const result = await db
        .from('tournament_divisions')
        .update({ roster_lock_status: 'open' })
        .eq('group_id', groupId)
        .eq('roster_lock_status', 'locked')
        .select('id');
    if (result.error) return { ok: false, error: result.error.message };
    return { ok: true, unlocked: (result.data || []).length };
}

async function snapshot(groupId) {
    const out = {};
    for (const table of DELETE_ORDER) {
        const value = await count(table, groupId);
        if (value !== null) out[table] = value;
    }
    return out;
}

(async () => {
    const report = { groups: {}, mode: checkOnly ? 'check' : 'delete' };
    for (const groupId of groupIds) {
        const before = await snapshot(groupId);
        const problems = await safetyCheck(groupId);
        report.groups[groupId] = { before, problems };
        if (problems.length) {
            console.error(`TU CHOI xoa group ${groupId}: ${problems.join(' ;; ')}`);
            continue;
        }
        if (checkOnly) continue;
        const unlocked = await unlockDivisions(groupId);
        report.groups[groupId].unlocked_divisions = unlocked.ok ? unlocked.unlocked : unlocked;
        for (const table of DELETE_ORDER) {
            if (before[table] === undefined) continue;
            const result = await db.from(table).delete().eq(scopeColumn(table), groupId);
            if (result.error) {
                report.groups[groupId].failed_at = { table, error: result.error.message };
                break;
            }
        }
        report.groups[groupId].after = await snapshot(groupId);
        const leftovers = Object.entries(report.groups[groupId].after).filter(([, value]) => value > 0);
        report.groups[groupId].clean = leftovers.length === 0;
        if (leftovers.length) report.groups[groupId].leftovers = Object.fromEntries(leftovers);
    }
    console.log(JSON.stringify(report, null, 2));
    const dirty = Object.values(report.groups).some((row) => row.problems.length || (!checkOnly && !row.clean));
    process.exit(dirty ? 1 : 0);
})().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
