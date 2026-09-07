// Phase 3 Task 7 — hợp đồng Wizard trên mô hình đã hội tụ.
// Phần A chạy thật lib/tournament/wizardModel.js (không tự dựng object giả).
// Phần B/C/D kiểm tra hợp đồng nguồn của UI, API route và client, theo đúng
// kiểu các file tests/tournament/ui-*.contract.test.js.

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));

let failures = 0;
const assert = (condition, message) => {
    if (!condition) { console.error(`FAIL: ${message}`); failures += 1; }
};
const assertThrowsCode = (fn, code, message) => {
    try { fn(); } catch (error) {
        assert(error.code === code, `${message} (nhận code=${error.code || 'none'})`);
        return;
    }
    assert(false, `${message} (không throw)`);
};

/* ==================== A. Domain view-model chạy thật ==================== */

assert(exists('lib/tournament/wizardModel.js'), 'có lib/tournament/wizardModel.js');
if (!exists('lib/tournament/wizardModel.js')) {
    console.error('FAIL: thiếu wizardModel, dừng phần runtime');
    process.exit(1);
}

const model = require(path.join(root, 'lib/tournament/wizardModel.js'));
const { assertTournamentOrganizer } = require(path.join(root, 'lib/tournament/interclub.js'));
const { SCORING_PRESETS } = require(path.join(root, 'lib/tournament/rules/scoring.js'));
const { TIEBREAK_PRESETS } = require(path.join(root, 'lib/tournament/rules/tiebreak.js'));

/* --- A1. Chế độ tổ chức: nội bộ / giao hữu / cộng đồng --- */

assert(Array.isArray(model.ORGANIZER_MODES), 'ORGANIZER_MODES là mảng');
const modeIds = (model.ORGANIZER_MODES || []).map((mode) => mode.id);
for (const id of ['internal', 'friendly', 'community']) {
    assert(modeIds.includes(id), `ORGANIZER_MODES có chế độ ${id}`);
}
assert((model.ORGANIZER_MODES || []).every((mode) => typeof mode.label === 'string' && mode.label.trim()), 'mỗi chế độ có nhãn tiếng Việt');

const internalPayload = model.resolveOrganizerPayload('internal', { clubId: 7 });
assert(internalPayload.organizer_type === 'club', 'nội bộ → organizer_type club');
assert(internalPayload.organizer_club_id === 7, 'nội bộ giữ organizer_club_id');
assert(internalPayload.organizer_mode === 'internal', 'nội bộ ghi organizer_mode');
assert(internalPayload.invites_clubs === false, 'nội bộ không mời CLB khác');

const friendlyPayload = model.resolveOrganizerPayload('friendly', { clubId: 7 });
assert(friendlyPayload.organizer_type === 'club', 'giao hữu → organizer_type club');
assert(friendlyPayload.invites_clubs === true, 'giao hữu cho phép mời CLB');

const communityPayload = model.resolveOrganizerPayload('community', {});
assert(communityPayload.organizer_type === 'community', 'cộng đồng → organizer_type community');
assert(communityPayload.organizer_club_id === null, 'cộng đồng không gắn organizer_club_id');
assert(communityPayload.open_registration === true, 'cộng đồng mở đăng ký toàn hệ thống');
assert(communityPayload.requires_platform_session === true, 'cộng đồng cần platform_session');

// Payload phải đi qua được validator thật của domain.
for (const payload of [internalPayload, friendlyPayload, communityPayload]) {
    let ok = true;
    try { assertTournamentOrganizer(payload); } catch (error) { ok = false; console.error(`  assertTournamentOrganizer: ${error.code}`); }
    assert(ok, `assertTournamentOrganizer chấp nhận payload ${payload.organizer_mode}`);
}

assertThrowsCode(() => model.resolveOrganizerPayload('internal', {}), 'ORGANIZER_CLUB_REQUIRED', 'nội bộ thiếu clubId phải lỗi');
assertThrowsCode(() => model.resolveOrganizerPayload('khong_co', { clubId: 1 }), 'INVALID_ORGANIZER_MODE', 'chế độ lạ phải lỗi');

/* --- A2. Nội dung thi đấu (division) --- */

const doubles = model.buildDivisionPayload({
    name: 'Đôi nam 5.2',
    play_type: 'doubles',
    scoring_scope: 'athlete',
    rating_policy: 'capped',
    rating_cap: 5.2,
    pairing_mode: 'random_balanced',
});
assert(doubles.play_type === 'doubles', 'doubles giữ play_type');
assert(doubles.entrant_type === 'pair', 'doubles → entrant_type pair');
assert(doubles.rating_cap === 5.2, 'doubles giữ rating_cap');
assert(doubles.scoring_scope === 'athlete', 'doubles tính thành tích cá nhân');
assert(doubles.name === 'Đôi nam 5.2', 'giữ tên nội dung');

const singles = model.buildDivisionPayload({ name: 'Đơn nam', play_type: 'singles' });
assert(singles.entrant_type === 'individual', 'singles → entrant_type individual');
assert(singles.pairing_mode === 'none', 'singles → pairing_mode none');

const team = model.buildDivisionPayload({ name: 'Đồng đội', play_type: 'team', scoring_scope: 'club' });
assert(team.entrant_type === 'team', 'team → entrant_type team');
assert(team.scoring_scope === 'club', 'team tính thành tích CLB');

assertThrowsCode(
    () => model.buildDivisionPayload({ name: 'Đơn nam', play_type: 'singles', pairing_mode: 'manual' }),
    'SINGLES_PAIRING_FORBIDDEN',
    'đơn không được ghép cặp',
);
assertThrowsCode(
    () => model.buildDivisionPayload({ name: 'Đôi', play_type: 'doubles', rating_policy: 'capped', pairing_mode: 'manual' }),
    'RATING_CAP_REQUIRED',
    'capped thiếu rating_cap phải lỗi',
);
assertThrowsCode(
    () => model.buildDivisionPayload({ name: '  ', play_type: 'doubles', pairing_mode: 'manual' }),
    'DIVISION_NAME_REQUIRED',
    'nội dung phải có tên',
);
assert(model.mapPlayTypeToEntrantType('doubles') === 'pair', 'mapPlayTypeToEntrantType doubles');
assert(model.mapPlayTypeToEntrantType('singles') === 'individual', 'mapPlayTypeToEntrantType singles');
assert(model.mapPlayTypeToEntrantType('team') === 'team', 'mapPlayTypeToEntrantType team');

/* --- A3. Bước luật điểm số và tie-break --- */

assert(Array.isArray(model.SCORING_PRESET_OPTIONS), 'SCORING_PRESET_OPTIONS là mảng');
const scoringOptionIds = (model.SCORING_PRESET_OPTIONS || []).map((option) => option.id).sort();
assert(
    JSON.stringify(scoringOptionIds) === JSON.stringify(Object.keys(SCORING_PRESETS).sort()),
    'SCORING_PRESET_OPTIONS lấy đúng preset thật trong rules/scoring.js',
);
const tiebreakOptionIds = (model.TIEBREAK_PRESET_OPTIONS || []).map((option) => option.id).sort();
assert(
    JSON.stringify(tiebreakOptionIds) === JSON.stringify(Object.keys(TIEBREAK_PRESETS).sort()),
    'TIEBREAK_PRESET_OPTIONS lấy đúng preset thật trong rules/tiebreak.js',
);

const preview = model.buildRulesPreview({
    tournament: { default_scoring: SCORING_PRESETS.phong_trao_11, tiebreak_policy: TIEBREAK_PRESETS.phong_trao_mac_dinh },
    divisions: [
        { id: 1, name: 'Đôi nam 5.2', scoring_override: SCORING_PRESETS.ban_ket_chung_ket, tiebreak_override: null },
        { id: 2, name: 'Đôi nữ', scoring_override: null, tiebreak_override: null },
    ],
    stages: [
        { id: 11, division_id: 1, name: 'Vòng bảng', status: 'pending', config: {} },
        { id: 12, division_id: 2, name: 'Vòng bảng', status: 'pending', config: {} },
        {
            id: 13,
            division_id: 2,
            name: 'Chung kết',
            status: 'active',
            config: { scoring: SCORING_PRESETS.phong_trao_15, tiebreak: TIEBREAK_PRESETS.giao_huu_clb },
        },
    ],
});
assert(Array.isArray(preview) && preview.length === 3, 'buildRulesPreview trả 1 dòng cho mỗi stage');

const previewById = new Map(preview.map((row) => [row.stage_id, row]));
const rowDivisionOverride = previewById.get(11);
assert(rowDivisionOverride.scoring_source === 'division', 'stage nội dung có override → nguồn division');
assert(rowDivisionOverride.scoring.best_of === 3, 'override ban_ket_chung_ket cho best_of 3');
assert(rowDivisionOverride.tiebreak_source === 'tournament', 'tie-break kế thừa giải khi nội dung không override');
assert(rowDivisionOverride.tiebreak.order[0] === 'match_points', 'tie-break bắt đầu bằng match_points');
assert(rowDivisionOverride.locked === false, 'stage chưa bốc thăm thì chưa khóa');

const rowTournamentDefault = previewById.get(12);
assert(rowTournamentDefault.scoring_source === 'tournament', 'stage không override → nguồn tournament');
assert(rowTournamentDefault.scoring.points_to === 11 && rowTournamentDefault.scoring.cap === 15, 'preset phong_trao_11 hiệu lực');

const rowSnapshot = previewById.get(13);
assert(rowSnapshot.scoring_source === 'stage', 'stage đã snapshot → nguồn stage');
assert(rowSnapshot.locked === true, 'stage đã snapshot/đang đấu thì khóa sửa luật');
assert(rowSnapshot.scoring.points_to === 15, 'snapshot giữ nguyên luật đã chốt');
assert(typeof rowSnapshot.division_name === 'string' && rowSnapshot.division_name, 'preview kèm tên nội dung');

const emptyPreview = model.buildRulesPreview({ tournament: {}, divisions: [], stages: [] });
assert(Array.isArray(emptyPreview) && emptyPreview.length === 0, 'preview rỗng không nổ');

/* --- A4. Cảnh báo PHR không chặn đăng ký --- */

const cappedDivision = { rating_policy: 'capped', rating_cap: 5.2 };
const summary = model.summarizeRosterWarnings([
    { id: 'p1', members: [{ tournament_athlete_id: 1, phr_rating: 3.0, phr_status: 'confirmed' }, { tournament_athlete_id: 2, phr_rating: 3.0, phr_status: 'confirmed' }] },
    { id: 'p2', members: [{ tournament_athlete_id: 3, phr_rating: null }, { tournament_athlete_id: 4, phr_rating: 2.5, phr_status: 'confirmed' }] },
    { id: 'p3', members: [{ tournament_athlete_id: 5, phr_rating: 2.5, phr_status: 'pending' }, { tournament_athlete_id: 6, phr_rating: 2.5, phr_status: 'confirmed' }] },
    { id: 'p4', members: [{ tournament_athlete_id: 7, phr_rating: 2.5, phr_status: 'rejected' }, { tournament_athlete_id: 8, phr_rating: 2.5, phr_status: 'confirmed' }] },
], cappedDivision);

assert(summary.blocking === false, 'tổng hợp cảnh báo không bao giờ chặn');
assert(Array.isArray(summary.warnings), 'summary.warnings là mảng');
const statuses = summary.warnings.map((warning) => warning.status).sort();
assert(JSON.stringify(statuses) === JSON.stringify(['missing', 'over_limit', 'pending', 'rejected']), `đủ 4 loại cảnh báo (nhận ${JSON.stringify(statuses)})`);
assert(summary.warnings.every((warning) => warning.blocking === false), 'mọi cảnh báo đều non-blocking');
assert(summary.warnings.every((warning) => typeof warning.message === 'string' && warning.message.trim()), 'cảnh báo có thông điệp tiếng Việt');
assert(summary.counts.over_limit === 1, 'đếm đúng cặp vượt giới hạn PHR');
assert(summary.counts.confirmed === 0, 'cặp hợp lệ không vào danh sách cảnh báo');

const submit = model.canSubmitRoster(summary);
assert(submit.allowed === true, 'vẫn gửi được đăng ký khi có cảnh báo');
const approve = model.canApproveRoster(summary);
assert(approve.allowed === true, 'BTC vẫn duyệt được khi có cảnh báo');

/* --- A5. VĐV CLB, VĐV khách và ghép cặp thủ công --- */

const guest = model.buildGuestAthletePayload({ tournament_id: 5, tournament_club_id: 9, display_name: 'Khách A', phr_rating: 2.5 });
assert(guest.athlete_id === null, 'VĐV khách không gắn athlete_id');
assert(guest.display_name_snapshot === 'Khách A', 'VĐV khách lưu snapshot tên');
assert(guest.source === 'guest', 'VĐV khách có source guest');
assert(guest.tournament_club_id === 9, 'VĐV khách gắn CLB đại diện');

const clubAthlete = model.buildClubMemberAthletePayload({ tournament_id: 5, tournament_club_id: 9, athlete_id: 41, phr_rating: 3.0, phr_status: 'confirmed' });
assert(clubAthlete.athlete_id === 41, 'VĐV CLB gắn athlete_id');
assert(clubAthlete.display_name_snapshot === null, 'VĐV CLB không dùng snapshot tên');
assert(clubAthlete.source === 'club_member', 'VĐV CLB có source club_member');

assertThrowsCode(
    () => model.buildGuestAthletePayload({ tournament_id: 5, tournament_club_id: 9, display_name: '   ' }),
    'ATHLETE_IDENTITY_REQUIRED',
    'VĐV khách phải có tên',
);
assertThrowsCode(
    () => model.buildClubMemberAthletePayload({ tournament_id: 5, tournament_club_id: 9, athlete_id: 41, display_name: 'X' }),
    'ATHLETE_IDENTITY_AMBIGUOUS',
    'không nhập vừa athlete_id vừa tên',
);

const manual = model.validateManualPairs([
    { id: 'a', members: [{ tournament_athlete_id: 1 }, { tournament_athlete_id: 2 }] },
    { id: 'b', members: [{ tournament_athlete_id: 3 }, { tournament_athlete_id: 4 }] },
]);
assert(manual.length === 2 && manual.every((pair) => pair.status === 'locked'), 'ghép thủ công hợp lệ được khóa');
assertThrowsCode(
    () => model.validateManualPairs([
        { id: 'a', members: [{ tournament_athlete_id: 1 }, { tournament_athlete_id: 2 }] },
        { id: 'b', members: [{ tournament_athlete_id: 2 }, { tournament_athlete_id: 3 }] },
    ]),
    'DIVISION_ATHLETE_DUPLICATE',
    'một VĐV không được ở hai cặp',
);

/* --- A6. Audit khi BTC nhập hộ roster --- */

const audit = model.buildRosterAudit({ actor: 'organizer', reason: 'CLB khách nhờ BTC nhập hộ' });
assert(audit.submitted_by_actor === 'organizer', 'audit ghi actor organizer');
assert(audit.club_confirmation_status === 'pending', 'roster nhập hộ chờ CLB xác nhận');
assert(audit.private_note.includes('nhờ BTC nhập hộ'), 'audit lưu lý do');
assert(audit.captain_declaration && audit.captain_declaration.audit, 'audit lưu vào captain_declaration');

const selfAudit = model.buildRosterAudit({ actor: 'club_admin' });
assert(selfAudit.submitted_by_actor === 'club_admin', 'CLB tự nộp giữ actor club_admin');
assert(selfAudit.club_confirmation_status === 'confirmed', 'CLB tự nộp là đã xác nhận');
assertThrowsCode(
    () => model.buildRosterAudit({ actor: 'organizer' }),
    'ROSTER_AUDIT_REASON_REQUIRED',
    'nhập hộ bắt buộc có lý do',
);

/* --- A7. Stage gắn với division --- */

const stagePayloads = model.buildDivisionStagePayloads({
    tournament_id: 3,
    division: { id: 12, name: 'Đôi nam 5.2', play_type: 'doubles' },
    stage_plan: 'group_knockout',
    config: { groupCount: 2, advancePerGroup: 2 },
});
assert(stagePayloads.length === 2, 'kế hoạch vòng bảng + chung kết tạo 2 stage');
assert(stagePayloads.every((stage) => stage.division_id === 12), 'stage bắt buộc có division_id');
assert(stagePayloads[0].schedule_format === 'round_robin' && stagePayloads[1].schedule_format === 'knockout', 'đúng thứ tự vòng bảng → loại trực tiếp');
assert(stagePayloads.every((stage) => stage.match_format === 'simple'), 'stage thường dùng match_format simple');

const mlpStages = model.buildDivisionStagePayloads({
    tournament_id: 3,
    division: { id: 13, name: 'Đồng đội MLP', play_type: 'team' },
    stage_plan: 'mlp',
    config: { gamesPerMatchup: 4, dreamBreaker: true },
});
assert(mlpStages.length === 1 && mlpStages[0].match_format === 'mlp', 'kế hoạch MLP dùng match_format mlp');
assertThrowsCode(
    () => model.buildDivisionStagePayloads({ tournament_id: 3, division: { name: 'X' }, stage_plan: 'single_round_robin' }),
    'DIVISION_ID_REQUIRED',
    'stage không có division_id phải lỗi',
);

/* ==================== B. Hợp đồng nguồn Wizard ====================
   Wizard tạo giải đã được thiết kế lại thành luồng 3 bước (spec
   2026-09-07-tournament-create-wizard-redesign). Hợp đồng nguồn của wizard MỚI
   nằm ở tests/phase3/wizard-redesign-contract.test.js — kiểm 3 bước, cấu hình
   thẻ, xem trước sống (previewSchedule), quyền từ /api/groups/session (không
   dùng getCurrentGroupClient nữa), và hai hình thức đăng ký.

   Các hành vi mà wizard cũ gộp chung nhưng đã DỜI sang spec khác (không mất, chỉ
   chuyển bề mặt): BTC nhập hộ roster + duyệt đăng ký (reviewRegistration,
   buildRosterAudit) → spec tournament-operations; nối roster/CLB thật + cảnh báo
   PHR trong luồng đăng ký → spec tournament-open-registration. Các hàm domain
   liên quan (buildRosterAudit, summarizeRosterWarnings, buildRulesPreview) vẫn
   được phần A ở trên kiểm chạy thật. */

assert(exists('app/giai-dau/v2/TournamentWizard.js'), 'wizard tồn tại');
assert(exists('app/giai-dau/v2/wizard.css'), 'có app/giai-dau/v2/wizard.css');
assert(!/saveEntrant\s*\(/.test(read('app/giai-dau/v2/TournamentWizard.js')), 'wizard không ghi tournament_entrants (legacy) nữa');

/* ==================== C. Hợp đồng API route ==================== */

const routes = [
    ['app/api/tournament-v2/divisions/route.js', ['validateDivisionOptions', 'tournament_divisions'], ['GET', 'POST', 'PATCH', 'DELETE']],
    ['app/api/tournament-v2/athletes/route.js', ['validateTournamentAthlete', 'tournament_athletes'], ['GET', 'POST']],
    ['app/api/tournament-v2/pairings/route.js', ['previewPairing', 'confirmPairing', 'tournament_pairs'], ['POST']],
    ['app/api/tournament-v2/entries/route.js', ['tournament_entries'], ['GET', 'POST']],
    ['app/api/tournament-v2/rules/route.js', ['resolveStageScoring', 'resolveTiebreak'], ['GET', 'PATCH']],
    ['app/api/tournament-v2/registrations/route.js', ['transitionRegistration', 'tournament_registrations'], ['GET', 'POST', 'PATCH']],
];
for (const [file, tokens, methods] of routes) {
    assert(exists(file), `có route ${file}`);
    if (!exists(file)) continue;
    const source = read(file);
    assert(source.includes('requireValidatedGroupAdmin'), `${file} có admin guard`);
    assert(source.includes(".eq('group_id'"), `${file} scope group_id`);
    for (const token of tokens) assert(source.includes(token), `${file} dùng ${token}`);
    for (const method of methods) {
        assert(new RegExp(`export async function ${method}`).test(source), `${file} có method ${method}`);
    }
    assert(!source.includes('tournament_entrants'), `${file} không dùng bảng legacy tournament_entrants`);
}

const clubsRoute = read('app/api/tournament-v2/clubs/route.js');
assert(clubsRoute.includes('tournament_external_clubs'), 'clubs route hỗ trợ CLB ngoài hệ thống');
assert(clubsRoute.includes('transitionTournamentClub'), 'clubs route dùng state machine domain');
assert(/export async function PATCH/.test(clubsRoute), 'clubs route có PATCH để BTC duyệt');

const tournamentsRoute = read('app/api/tournament-v2/tournaments/route.js');
assert(tournamentsRoute.includes('assertTournamentOrganizer'), 'tournaments route validate organizer bằng domain');
assert(tournamentsRoute.includes('organizer_type'), 'tournaments route nhận organizer_type');
assert(tournamentsRoute.includes('default_scoring') && tournamentsRoute.includes('tiebreak_policy'), 'tournaments route lưu luật mặc định');

/* ==================== D. Hợp đồng client ==================== */

const client = read('lib/tournamentV2Client.js');
for (const fn of [
    'listDivisions', 'saveDivision', 'deleteDivision',
    'listTournamentAthletes', 'saveTournamentAthlete',
    'previewDivisionPairing', 'confirmDivisionPairing',
    'listDivisionEntries', 'saveDivisionEntry',
    'getTournamentRules', 'updateTournamentRules',
    'listRegistrations', 'saveRegistration', 'reviewRegistration',
    'updateTournamentClub', 'inviteExternalClub',
]) {
    assert(client.includes(`export function ${fn}`) || client.includes(`export async function ${fn}`), `client export ${fn}`);
}
assert(!client.includes('supabase'), 'client không gọi Supabase trực tiếp');

if (failures > 0) {
    console.error(`\n${failures} assertion(s) thất bại`);
    process.exit(1);
}
console.log('phase3 wizard competition contract ok');
