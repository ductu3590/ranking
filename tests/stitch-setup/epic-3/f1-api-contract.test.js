'use strict';
// Khoá hợp đồng API + migration 110 của Lát F1 (spec Epic 3 F1 §8, dòng `f1-api-contract.test.js`).
// Đọc mã nguồn: route, client, migration, SQL tích hợp. Không gọi mạng/DB.

const fs = require('node:fs');
const path = require('node:path');
const { assert, read, exists, lib, suite, ROOT } = require('../_harness');

const norm = (text) => text.replace(/\r\n?/g, '\n');
const src = (file) => norm(read(file));
const MIGRATION = 'database/migrations/110_friendly_club_rosters.sql';
const INTEGRATION_SQL = 'database/tests/epic3_f1_integration.sql';
const INTEGRATION_SCRIPT = 'scripts/qa/epic3-f1-integration.js';
const { renderFriendlyTransitionsSql } = lib('lib/tournament/friendlyClubs.js');
const { renderFriendlyNotificationsSql } = lib('lib/tournament/friendlyNotifications.js');

const migration = exists(MIGRATION) ? src(MIGRATION) : '';
// Bỏ comment `--` để kiểm từ khoá chỉ trên mã chạy thật.
const code = migration.split('\n').map((line) => line.replace(/--.*$/, '')).join('\n');

// Khối giữa `-- <marker>` và `-- <marker>:end`: bỏ \r, khoảng trắng đầu dòng, dòng rỗng, dòng comment.
function block(sql, marker) {
  const lines = sql.split('\n');
  const start = lines.findIndex((line) => line.trim() === `-- ${marker}`);
  const end = lines.findIndex((line, index) => index > start && line.trim() === `-- ${marker}:end`);
  assert.ok(start >= 0 && end > start, `thiếu khối -- ${marker} … -- ${marker}:end`);
  return lines.slice(start + 1, end)
    .map((line) => line.replace(/\r/g, '').replace(/^\s+/, ''))
    .filter((line) => line && !line.startsWith('--'))
    .join('\n');
}

// Thân một hàm: từ `CREATE OR REPLACE FUNCTION public.<name>(` tới `$$;` đầu tiên sau đó.
function fnBody(name) {
  const start = migration.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  assert.ok(start >= 0, `thiếu hàm ${name}`);
  const end = migration.indexOf('$$;', start);
  return migration.slice(start, end + 3);
}

const PUBLIC_RPCS = {
  friendly_invite_club: 'bigint, bigint, bigint, integer, text, integer, text',
  friendly_club_action: 'bigint, text, bigint, text, bigint, jsonb',
  set_friendly_registration_window: 'bigint, bigint, timestamptz, boolean',
};

const clubsRoute = src('app/api/tournament-v2/clubs/route.js');
const invitationsRoute = exists('app/api/tournament-v2/friendly/invitations/route.js') ? src('app/api/tournament-v2/friendly/invitations/route.js') : '';
const invitationRoute = exists('app/api/tournament-v2/friendly/invitations/[id]/route.js') ? src('app/api/tournament-v2/friendly/invitations/[id]/route.js') : '';
const resolveRoute = exists('app/api/tournament-v2/friendly/invite-links/resolve/route.js') ? src('app/api/tournament-v2/friendly/invite-links/resolve/route.js') : '';
const windowRoute = exists('app/api/tournament-v2/friendly/window/route.js') ? src('app/api/tournament-v2/friendly/window/route.js') : '';
const accessRuntime = src('lib/tournament/accessRuntime.js');
const setupRoute = src('app/api/tournament-v2/setup/route.js');
const notificationsRoute = src('app/api/club/notifications/route.js');
const client = src('lib/tournamentV2Client.js');

// Body chỉ mang action/expected_version/roster/note/quota (+ id, tournament_id, club_id, invitation_note, deadline,
// locked, token tuỳ route). Không bao giờ đọc phía, actor, hạn mức, băm token từ body.
const FORBIDDEN_BODY_READ = /body\??\.(side|group_id|groupId|actor|max_guest_clubs|maxGuestClubs|invite_token_hash|inviteTokenHash|token_hash|tokenHash|club_group_id)\b/;

function walk(dir) {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return walk(rel);
    return /\.(js|jsx)$/.test(entry.name) ? [rel] : [];
  });
}

suite('f1 api contract — migration 110', {
  'migration 110 tồn tại, một transaction, số 110 chưa bị dùng'() {
    assert.ok(migration, `thiếu ${MIGRATION}`);
    const others = fs.readdirSync(path.join(ROOT, 'database/migrations')).filter((name) => /^110_/.test(name));
    assert.deepEqual(others, ['110_friendly_club_rosters.sql']);
    assert.ok(/^BEGIN;$/m.test(migration) && migration.trimEnd().endsWith('COMMIT;'));
  },

  'additive: không DROP, TRUNCATE, DELETE FROM; không đụng finalize_internal_setup_v4'() {
    assert.equal(/\bDROP\b/i.test(code), false, 'không DROP');
    assert.equal(/\bTRUNCATE\b/i.test(code), false);
    assert.equal(/\bDELETE\s+FROM\b/i.test(code), false);
    assert.equal(code.includes('finalize_internal_setup_v4'), false, 'finalize thuộc F2/111');
    assert.equal(/ALTER\s+COLUMN/i.test(code), false);
  },

  'cột mới trên tournament_clubs + CHECK + COMMENT (README §3.1)'() {
    for (const column of ['roster_draft jsonb NOT NULL DEFAULT \'{}\'::jsonb', 'roster_submitted jsonb', 'roster_submitted_at timestamptz',
      'roster_reviewed_at timestamptz', 'responded_at timestamptz', 'roster_approved_version bigint', 'review_note text',
      'invite_token_hash text', 'invite_token_issued_at timestamptz']) {
      assert.ok(code.includes(`ADD COLUMN IF NOT EXISTS ${column}`), `cột ${column}`);
      assert.ok(migration.includes(`COMMENT ON COLUMN public.tournament_clubs.${column.split(' ')[0]} IS`), `comment ${column}`);
    }
    assert.ok(code.includes("CHECK (jsonb_typeof(roster_draft) = 'object')"));
    assert.ok(code.includes("CHECK (roster_submitted IS NULL OR jsonb_typeof(roster_submitted) = 'object')"));
    assert.ok(code.includes('CHECK (review_note IS NULL OR length(btrim(review_note)) BETWEEN 2 AND 300)'));
    assert.ok(code.includes("CHECK (invite_token_hash IS NULL OR invite_token_hash ~ '^[a-f0-9]{64}$')"));
  },

  'index hộp lời mời + unique băm token'() {
    assert.ok(/CREATE INDEX IF NOT EXISTS idx_tournament_clubs_club_tournament\s+ON public\.tournament_clubs\(club_id, tournament_id\) WHERE club_id IS NOT NULL/.test(code));
    assert.ok(/CREATE UNIQUE INDEX IF NOT EXISTS idx_tournament_clubs_invite_token\s+ON public\.tournament_clubs\(invite_token_hash\) WHERE invite_token_hash IS NOT NULL/.test(code));
  },

  'ba RPC công khai: SECURITY DEFINER, search_path, REVOKE PUBLIC/anon/authenticated, GRANT service_role'() {
    for (const [name, signature] of Object.entries(PUBLIC_RPCS)) {
      const body = fnBody(name);
      assert.ok(/LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS \$\$/.test(body), `${name}: SECURITY DEFINER + search_path`);
      assert.ok(code.includes(`REVOKE ALL ON FUNCTION public.${name}(${signature}) FROM PUBLIC, anon, authenticated;`), `${name}: REVOKE`);
      assert.ok(code.includes(`GRANT EXECUTE ON FUNCTION public.${name}(${signature}) TO service_role;`), `${name}: GRANT`);
      assert.ok(body.includes("- 'invite_token_hash'") || name === 'set_friendly_registration_window', `${name}: không trả băm token`);
    }
  },

  'friendly_sync_notifications: nội bộ, không SECURITY DEFINER, không GRANT cho ai'() {
    const body = fnBody('friendly_sync_notifications');
    assert.ok(body.includes('RETURNS void'));
    assert.equal(body.includes('SECURITY DEFINER'), false);
    assert.ok(body.includes('SET search_path = public'));
    assert.ok(code.includes('REVOKE ALL ON FUNCTION public.friendly_sync_notifications(bigint) FROM PUBLIC, anon, authenticated, service_role;'));
    assert.equal(/GRANT[^;]*friendly_sync_notifications/.test(code), false);
    assert.ok(body.includes("ON CONFLICT (group_id, kind, subject_type, subject_id) WHERE subject_id IS NOT NULL"));
    assert.ok(body.includes("DO UPDATE SET status = 'open', resolved_at = NULL, payload = EXCLUDED.payload, created_at = now()"));
    // Đóng chỉ dòng đang mở: dòng người dùng đã `dismissed` giữ nguyên.
    assert.equal((body.match(/AND status = 'open';/g) || []).length, 2);
    for (const key of ["'tournamentName'", "'hostClubName'", "'eventDate'", "'guestClubName'", "'pairCount'", "'tournamentId'", "'divisionId'"]) {
      assert.ok(body.includes(key), `payload ${key}`);
    }
  },

  'khối -- friendly:transitions bằng đúng các dòng rpc:action của FRIENDLY_TRANSITIONS'() {
    assert.equal(block(migration, 'friendly:transitions'), renderFriendlyTransitionsSql());
    assert.ok(fnBody('friendly_club_action').includes('-- friendly:transitions'));
  },

  'khối -- friendly:notifications bằng đúng desiredNotificationState'() {
    assert.equal(block(migration, 'friendly:notifications'), renderFriendlyNotificationsSql());
    assert.ok(fnBody('friendly_sync_notifications').includes('-- friendly:notifications'));
  },

  'friendly_invite_club: kiểm tham số, khoá division → tournament FOR UPDATE, hạn mức, mời lại'() {
    const body = fnBody('friendly_invite_club');
    assert.ok(body.includes('p_max_guest_clubs IS NULL OR p_max_guest_clubs NOT BETWEEN 1 AND 31'));
    assert.ok(body.includes("p_invite_token_hash !~ '^[a-f0-9]{64}$'"));
    assert.ok(body.includes('p_quota IS NOT NULL AND p_quota NOT BETWEEN 1 AND 32'));
    const division = body.indexOf('FROM public.tournament_divisions');
    const divisionLock = body.indexOf('FOR SHARE', division);
    const tournamentLock = body.indexOf('FROM public.tournaments WHERE id = p_tournament_id AND group_id = p_group_id FOR UPDATE');
    const clubLock = body.indexOf('WHERE tournament_id = p_tournament_id AND club_id = p_club_id FOR UPDATE');
    assert.ok(division >= 0 && divisionLock > division && tournamentLock > divisionLock && clubLock > tournamentLock, 'thứ tự khoá division → tournament → club');
    assert.ok(body.includes('club_id IS DISTINCT FROM p_group_id'));
    assert.ok(body.includes("invitation_status NOT IN ('declined', 'withdrawn')"));
    assert.ok(body.includes('v_used >= p_max_guest_clubs'));
    for (const errorCode of ['SETUP_PAYLOAD_INVALID', 'FRIENDLY_QUOTA_INVALID', 'FRIENDLY_MODE_REQUIRED', 'FRIENDLY_REGISTRATION_CLOSED',
      'CLUB_IS_HOST', 'CLUB_NOT_FOUND', 'CLUB_ALREADY_INVITED', 'FRIENDLY_CLUB_LIMIT_REACHED']) {
      assert.ok(body.includes(`'${errorCode}'`), `mã ${errorCode}`);
    }
    assert.ok(body.includes("RAISE EXCEPTION 'FRIENDLY_CLUB_LIMIT_REACHED' USING ERRCODE = 'PH409'"));
    assert.ok(body.includes('PERFORM public.friendly_sync_notifications(r.id);'));
    // Mời lại: giữ roster_draft, xoá ảnh chụp/duyệt/lý do.
    const reinvite = body.slice(body.indexOf('UPDATE public.tournament_clubs'));
    assert.equal(/roster_draft\s*=/.test(reinvite.slice(0, reinvite.indexOf('RETURNING'))), false, 'mời lại giữ roster_draft');
    for (const cleared of ['roster_submitted = NULL', 'review_note = NULL', 'roster_approved_version = NULL', 'responded_at = NULL']) {
      assert.ok(reinvite.includes(cleared), `mời lại: ${cleared}`);
    }
  },

  'friendly_club_action: khoá division → tournament FOR SHARE → dòng FOR UPDATE, version, cửa sổ, kiểm theo hành động'() {
    const body = fnBody('friendly_club_action');
    const division = body.indexOf('FROM public.tournament_divisions');
    const tournament = body.indexOf('FROM public.tournaments WHERE id = v_tournament_id AND group_id = v_group_id FOR SHARE');
    const club = body.indexOf('FROM public.tournament_clubs WHERE id = p_tournament_club_id FOR UPDATE');
    assert.ok(division >= 0 && tournament > division && club > tournament, 'thứ tự khoá');
    assert.ok(body.includes("(p_side = 'guest' AND club_id = p_actor_group_id AND group_id <> p_actor_group_id)"));
    assert.ok(body.includes("(p_side = 'host' AND group_id = p_actor_group_id)"));
    assert.ok(body.includes('r.version <> p_expected_version'));
    assert.ok(body.includes('WHERE id = r.id AND version = p_expected_version'));
    for (const errorCode of ['FRIENDLY_CLUB_NOT_FOUND', 'FRIENDLY_CLUB_VERSION_CONFLICT', 'FRIENDLY_TRANSITION_INVALID', 'FRIENDLY_REGISTRATION_CLOSED',
      'FRIENDLY_GUEST_NOT_ALLOWED', 'FRIENDLY_MEMBER_OUTSIDE_CLUB', 'FRIENDLY_ROSTER_EMPTY', 'FRIENDLY_ROSTER_UNPAIRED', 'FRIENDLY_QUOTA_EXCEEDED',
      'FRIENDLY_ATHLETE_ID_MISSING', 'FRIENDLY_NOTE_REQUIRED', 'FRIENDLY_QUOTA_INVALID', 'FRIENDLY_QUOTA_BELOW_ROSTER', 'SETUP_PAYLOAD_INVALID']) {
      assert.ok(body.includes(`'${errorCode}'`), `mã ${errorCode}`);
    }
    assert.ok(body.includes('cm.group_id = r.club_id'), 'thành viên theo CLB khách (D17)');
    assert.ok(body.includes('legacy_club_member_id'), 'hồ sơ thi đấu');
    assert.ok(body.includes("registrationLockedAt") && body.includes('registrationDeadline'));
    assert.ok(body.includes('now() >= v_deadline'), 'đúng mốc hạn chót là đã đóng');
    assert.ok(body.includes('roster_approved_version := p_expected_version + 1'));
    assert.ok(body.includes('n.invite_token_hash := NULL'), 'remove thu hồi link');
    assert.ok(body.includes("_payload->>'inviteTokenHash'"), 'rotate_link nhận băm do route sinh');
    assert.ok(body.includes('PERFORM public.friendly_sync_notifications(r.id);'));
    assert.equal(body.includes("'invite'"), false, 'invite/reinvite không đi qua RPC hành động');
  },

  'set_friendly_registration_window: merge settings, không ghi đè khoá khác'() {
    const body = fnBody('set_friendly_registration_window');
    assert.ok(body.includes("settings = COALESCE(settings, '{}'::jsonb) || jsonb_build_object('friendly', v_friendly)"));
    const division = body.indexOf('FROM public.tournament_divisions');
    const tournament = body.indexOf('FOR UPDATE', division);
    assert.ok(division >= 0 && body.indexOf('FOR SHARE', division) < tournament);
    assert.ok(body.includes("'FRIENDLY_REGISTRATION_CLOSED'") && body.includes("'FRIENDLY_MODE_REQUIRED'"));
  },
});

suite('f1 api contract — routes', {
  'GET /clubs mode=available: chỉ id, name; lọc chính mình + CLB hệ thống; tournamentId → requireTournamentAccess + hạn mức'() {
    const start = clubsRoute.indexOf("=== 'available'");
    const available = clubsRoute.slice(start, clubsRoute.indexOf('.select(HOST_CLUB_FIELDS)', start));
    const loadLimit = clubsRoute.slice(clubsRoute.indexOf('async function loadLimit('), clubsRoute.indexOf('async function loadWindow('));
    assert.ok(loadLimit.includes('resolveFriendlyEntitlements({ db, groupId })') && loadLimit.includes('guestClubLimitView({ maxGuestClubs: entitlements.maxGuestClubs'));
    assert.ok(available.includes('loadLimit('), 'mode=available + tournamentId trả hạn mức');
    assert.ok(available.includes(".from('groups').select('id, name')"));
    assert.ok(available.includes(".neq('id', adminCheck.groupId)"));
    assert.ok(available.includes('PICKHUB_SYSTEM_GROUP_ID') || clubsRoute.includes('systemGroupId'));
    assert.ok(available.includes(".order('name').limit(200)"));
    assert.ok(available.includes('.ilike('));
    assert.ok(available.includes("requireTournamentAccess({ tournamentId") && available.includes("need: 'write'"));
    assert.equal(/select\([^)]*\b(code|logo_url)\b/.test(clubsRoute), false, 'không chọn groups.code / logo_url');
  },

  'GET /clubs?tournamentId: requireTournamentAccess write, trả window + limit + HostClubView (không roster_draft)'() {
    assert.ok(clubsRoute.includes('projectHostClubRow') || clubsRoute.includes('projectClubForHost'));
    assert.ok(clubsRoute.includes('registrationWindow'));
    assert.ok(clubsRoute.includes('HOST_CLUB_FIELDS'));
    const { HOST_CLUB_FIELDS } = lib('lib/tournament/friendlyServer.js');
    assert.equal(HOST_CLUB_FIELDS.includes('roster_draft'), false, 'chủ nhà không đọc roster_draft');
  },

  'POST /clubs: entitlement + token do server sinh, từ chối CLB ngoài, không đọc hạn mức/băm từ body'() {
    const post = clubsRoute.slice(clubsRoute.indexOf('export async function POST'), clubsRoute.indexOf('export async function PATCH'));
    assert.ok(post.includes('resolveFriendlyEntitlements({ db, groupId: access.groupId })'));
    assert.ok(post.includes('issueInviteToken()'));
    assert.ok(post.includes("db.rpc('friendly_invite_club'"));
    assert.ok(post.includes('p_max_guest_clubs: entitlements.maxGuestClubs'));
    assert.ok(post.includes('p_invite_token_hash: token.tokenHash'));
    assert.ok(post.includes('EXTERNAL_CLUB_NOT_SUPPORTED'));
    assert.ok(post.includes('invitePath(token.rawToken)'));
    assert.equal(FORBIDDEN_BODY_READ.test(post), false);
    assert.equal(post.includes('tournament_external_clubs'), false, 'không tạo CLB ngoài (D39)');
  },

  'PATCH /clubs: phía host do server đặt, rotate_link sinh token ở route'() {
    const patch = clubsRoute.slice(clubsRoute.indexOf('export async function PATCH'));
    assert.ok(patch.includes("db.rpc('friendly_club_action'"));
    assert.ok(patch.includes("p_side: 'host'"));
    assert.ok(patch.includes('p_actor_group_id: Number(access.groupId)'));
    assert.ok(patch.includes('requireTournamentAccess({ tournamentId: row.tournament_id'));
    assert.ok(patch.includes('issueInviteToken()'));
    assert.equal(FORBIDDEN_BODY_READ.test(patch), false);
  },

  'route CLB khách: lọc club_id trong truy vấn, phía guest do server đặt'() {
    assert.ok(invitationsRoute, 'thiếu friendly/invitations/route.js');
    assert.ok(invitationRoute, 'thiếu friendly/invitations/[id]/route.js');
    assert.ok(invitationsRoute.includes(".eq('club_id', groupId)") && invitationsRoute.includes(".neq('group_id', groupId)"));
    assert.ok(invitationsRoute.includes('requireValidatedGroupAdmin'));
    assert.ok(accessRuntime.includes('export async function requireParticipantClubAccess'));
    assert.ok(accessRuntime.includes('export async function loadParticipantClubRow'));
    assert.ok(/\.eq\('id', tournamentClubId\)\.eq\('club_id', clubGroupId\)/.test(accessRuntime), 'lọc club_id ngay trong truy vấn');
    assert.ok(accessRuntime.includes('resolveParticipantClubAccess'));
    assert.ok(invitationRoute.includes('requireParticipantClubAccess({ tournamentClubId'));
    assert.ok(invitationRoute.includes("p_side: 'guest'"));
    assert.ok(invitationRoute.includes('p_actor_group_id: Number(access.clubGroupId)'));
    assert.ok(invitationRoute.includes('normalizeClubRoster') && invitationRoute.includes('validateClubRosterForSave'));
    assert.ok(invitationRoute.includes('validateClubRosterForSubmit'));
    assert.ok(invitationRoute.includes('loadMemberContext(db, access.clubGroupId'));
    for (const source of [invitationsRoute, invitationRoute]) {
      assert.equal(FORBIDDEN_BODY_READ.test(source), false);
      assert.equal(/body\??\.club_id/.test(source), false);
    }
  },

  'giải link: rate limit, token trong body, kiểm dạng trước khi truy vấn, chỉ chọn 5 cột'() {
    assert.ok(resolveRoute, 'thiếu invite-links/resolve/route.js');
    assert.ok(resolveRoute.includes("consumeRateLimit(`invite-link:${getClientIdentifier(request)}`, { limit: 30, windowMs: 600000 })"));
    assert.ok(resolveRoute.includes('getValidatedGroupSessionFromCookies'));
    assert.ok(resolveRoute.includes('request.json()'));
    assert.equal(/searchParams/.test(resolveRoute), false, 'token không nằm trong query');
    const shape = resolveRoute.indexOf('isInviteTokenShape(token)');
    const query = resolveRoute.indexOf(".eq('invite_token_hash'");
    assert.ok(shape >= 0 && query > shape, 'kiểm dạng token trước truy vấn');
    assert.ok(resolveRoute.includes(".select('id, club_id, group_id, tournament_id, invitation_status')"));
    assert.ok(resolveRoute.includes('decideInviteLink') && resolveRoute.includes('inviteLoginPath(token)'));
    assert.ok(resolveRoute.includes("'Cache-Control': 'no-store'"));
  },

  'cửa sổ đăng ký: requireTournamentAccess write + parseDeadlineInput + RPC'() {
    assert.ok(windowRoute, 'thiếu friendly/window/route.js');
    assert.ok(windowRoute.includes("requireTournamentAccess({ tournamentId, need: 'write' })"));
    assert.ok(windowRoute.includes('parseDeadlineInput'));
    assert.ok(windowRoute.includes("db.rpc('set_friendly_registration_window'"));
  },

  'setup: replace_invited_clubs trả 410 SETUP_ACTION_RETIRED khi division có bản nháp v3'() {
    const branch = setupRoute.slice(setupRoute.indexOf("action === 'replace_invited_clubs'"), setupRoute.indexOf("action === 'lock_roster'"));
    assert.ok(branch.includes('SETUP_ACTION_RETIRED'));
    assert.ok(branch.includes('410'));
    assert.ok(branch.indexOf('SETUP_ACTION_RETIRED') < branch.indexOf("db.rpc('replace_tournament_invited_clubs_revisioned'"));
  },

  'thông báo: giữ nguyên khối unassigned_transaction, thêm display + dọn mồ côi cho kind giải đấu'() {
    assert.ok(notificationsRoute.includes(".eq('kind', 'unassigned_transaction')"));
    assert.ok(notificationsRoute.includes("kind: 'unassigned_transaction'"));
    assert.ok(notificationsRoute.includes('projectClubNotification'));
    assert.ok(notificationsRoute.includes('shouldResolveNotification'));
    assert.ok(notificationsRoute.includes('isFriendlyNotificationKind'));
    assert.ok(notificationsRoute.includes(".from('tournament_clubs')"));
  },

  'không nơi nào trong app/ viết số hạn mức cứng'() {
    for (const file of walk('app')) {
      const source = norm(read(file));
      assert.equal(/maxGuestClubs\s*:\s*\d/.test(source), false, `${file}: maxGuestClubs cứng`);
      assert.equal(/p_max_guest_clubs\s*:\s*\d/.test(source), false, `${file}: p_max_guest_clubs cứng`);
    }
  },

  'client: đủ hàm F1, giữ tên listAvailableTournamentClubs'() {
    for (const fn of ['listAvailableTournamentClubs', 'listFriendlyClubs', 'inviteFriendlyClub', 'hostClubAction', 'setFriendlyWindow',
      'listFriendlyInvitations', 'getFriendlyInvitation', 'guestInvitationAction', 'resolveInviteLink']) {
      assert.ok(new RegExp(`export (async )?function ${fn}\\(`).test(client), `client ${fn}`);
    }
    assert.ok(client.includes("'/friendly/invite-links/resolve'"));
  },
});

suite('f1 api contract — SQL tích hợp', {
  'script sinh SQL tồn tại; SQL một transaction, kết thúc ROLLBACK, không COMMIT'() {
    assert.ok(exists(INTEGRATION_SCRIPT), `thiếu ${INTEGRATION_SCRIPT}`);
    assert.ok(exists(INTEGRATION_SQL), `thiếu ${INTEGRATION_SQL}`);
    const sql = src(INTEGRATION_SQL);
    assert.ok(sql.trimStart().split('\n').some((line) => line.trim() === 'BEGIN;'));
    assert.ok(sql.trimEnd().endsWith('ROLLBACK;'));
    assert.equal(/^\s*COMMIT;/m.test(sql), false);
    for (const key of ['limit.second_club', 'invite.already', 'invite.host', 'invite.internal', 'invite.max_null', 'version.conflict',
      'side.wrong_guest', 'side.guest_approve', 'notify.invite_open', 'notify.dismissed_kept', 'notify.review_open', 'notify.changes_reopen',
      'roster.guest', 'roster.outside', 'roster.quota_exceeded', 'roster.athlete_missing', 'quota.below_roster', 'link.unique',
      'window.locked', 'window.deadline_passed', 'window.settings_kept', 'finalized.action', 'token.no_raw', 'core3.two_guests']) {
      assert.ok(sql.includes(`'${key}'`), `ca ${key}`);
    }
  },

  'SQL tích hợp nạp đúng thân migration 110 hiện tại (không lệch file)'() {
    const sql = src(INTEGRATION_SQL);
    const bodyStart = migration.indexOf('ALTER TABLE public.tournament_clubs');
    const bodyEnd = migration.lastIndexOf('COMMIT;');
    assert.ok(sql.includes(migration.slice(bodyStart, bodyEnd).trim()), 'chạy lại: node scripts/qa/epic3-f1-integration.js > database/tests/epic3_f1_integration.sql');
  },
});
