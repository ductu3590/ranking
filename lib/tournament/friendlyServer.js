'use strict';
// Lớp server của giải giao hữu liên CLB (spec Epic 3 F1 §6): hằng cột select, kiểm tham số body, ánh xạ lỗi RPC →
// HTTP + mã ổn định, chiếu dòng cho chủ nhà / CLB khách, sắp hộp lời mời. Route (Next) chỉ nạp dữ liệu, gọi RPC rồi
// dùng các hàm ở đây. CommonJS; các hàm có `db` chỉ đọc (Supabase), còn lại thuần.

const {
  FRIENDLY_ERROR_STATUS,
  isValidQuota,
  validateReviewNote,
  registrationWindow,
  projectClubForHost,
  projectInvitationForGuest,
  statusLabel,
  HOST_VISIBLE_SUBMITTED_STATUSES,
} = require('./friendlyClubs');
const { MESSAGES, messageFor } = require('./setupMessages');
const { INVITE_LINK_MESSAGES } = require('./friendlyInviteLink');
const { getFormat } = require('./setupFormats');
const { resolveFriendlyEntitlements, guestClubLimitView } = require('./friendlyEntitlements');
const { HOST_CLUB_KEY, approvedGuestPairs, buildFriendlyContext, projectApprovedPairs } = require('./friendlySetup');
const { CLUB_COLORS, clubPalette, computeFriendlyClubStandings } = require('./friendlyStandings');
const { generateSlug } = require('./publicSlug');

const FRIENDLY_DIVISION_TEMPLATE = 'unified_setup_draft_v2';

// Chủ nhà: KHÔNG roster_draft (README §6 — chủ nhà không đọc bản đang soạn của khách). invite_token_hash chỉ để tính
// hasInviteLink trên server; projectClubForHost không trả nó ra.
const HOST_CLUB_FIELDS = 'id, group_id, tournament_id, club_id, external_club_id, invitation_status, quota, invitation_note, version, '
  + 'review_note, responded_at, roster_submitted, roster_submitted_at, roster_reviewed_at, roster_approved_version, '
  + 'invite_token_hash, invite_token_issued_at';
// CLB khách: dòng của chính mình, không băm token, không captain_contact_profile_id.
const GUEST_CLUB_FIELDS = 'id, group_id, tournament_id, club_id, invitation_status, quota, invitation_note, version, review_note, '
  + 'responded_at, roster_draft, roster_submitted, roster_submitted_at, roster_reviewed_at, roster_approved_version';
const GUEST_TOURNAMENT_FIELDS = 'id, group_id, name, event_date, location, description, status, settings, visibility, public_slug';

const HOST_ACTIONS = Object.freeze(['approve', 'request_changes', 'remove', 'set_quota', 'rotate_link']);
const GUEST_ACTIONS = Object.freeze(['accept', 'decline', 'save_roster', 'submit_roster', 'unsubmit', 'withdraw']);
const INVITATION_NOTE_MAX = 500;
const SEARCH_MAX = 60;

// Mã dài khớp trước: 'FRIENDLY_CLUB_NOT_FOUND' chứa 'CLUB_NOT_FOUND'.
const KNOWN_CODES = Object.freeze(Object.keys(FRIENDLY_ERROR_STATUS).sort((a, b) => b.length - a.length));

function positiveId(value) {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0 ? value : null;
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,15}$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}

// Mã quyền chung (access.js) không nằm trong setupMessages.
const ACCESS_MESSAGES = Object.freeze({ TOURNAMENT_NOT_FOUND: 'Không tìm thấy giải.' });

// Câu tiếng Việt: setupMessages trước; mã chỉ có ở luồng link mời (UNAUTHENTICATED…) lấy INVITE_LINK_MESSAGES.
function textFor(code, params) {
  if (Object.prototype.hasOwnProperty.call(MESSAGES, code)) return messageFor(code, params).text;
  return INVITE_LINK_MESSAGES[code] || ACCESS_MESSAGES[code] || messageFor(code, params).text;
}

// { status, body: { error, code, params? } } — route bọc bằng NextResponse.json(body, { status }).
function friendlyErrorPayload(code, params, status) {
  const body = { error: textFor(code, params), code };
  if (params && typeof params === 'object' && Object.keys(params).length) body.params = params;
  return { status: status || FRIENDLY_ERROR_STATUS[code] || 400, body };
}

function parseDetails(details) {
  if (typeof details !== 'string' || !details.trim().startsWith('{')) return null;
  try {
    const value = JSON.parse(details);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

// Lỗi RPC → mã theo message (như setup/route.js), không theo SQLSTATE; SQLSTATE chỉ là dự phòng.
function rpcErrorPayload(error, extraParams) {
  const message = String(error?.message || '');
  const code = KNOWN_CODES.find((candidate) => message.includes(candidate)) || null;
  if (code) {
    const params = { ...(parseDetails(error?.details) || {}), ...(extraParams || {}) };
    return friendlyErrorPayload(code, Object.keys(params).length ? params : undefined);
  }
  const pgCode = error?.code;
  const status = pgCode === 'P0002' ? 404 : pgCode === 'PH409' ? 409 : pgCode === '22023' ? 400 : 500;
  return { status, body: { error: status === 500 ? 'Không thể cập nhật lời mời. Thử lại sau.' : 'Thao tác không hợp lệ.', code: 'FRIENDLY_MUTATION_FAILED' } };
}

// Blocker domain (validateClubRosterFor*) → 400 với blocker đầu tiên + đủ danh sách cho UI.
function blockerPayload(blockers) {
  const list = Array.isArray(blockers) ? blockers : [];
  const first = list[0] || { code: 'SETUP_PAYLOAD_INVALID' };
  const payload = friendlyErrorPayload(first.code, first.params, 400);
  payload.body.blockers = list.map((item) => ({ code: item.code, ...(item.params ? { params: item.params } : {}), text: textFor(item.code, item.params) }));
  return payload;
}

// Dòng RPC không kèm băm (có has_invite_link) hoặc dòng DB (có băm) → HostClubView.
function projectHostClubRow(row, names = {}) {
  if (!row || typeof row !== 'object') return null;
  const { has_invite_link: hasLinkFlag, ...rest } = row;
  const view = projectClubForHost(rest, names);
  if (rest.invite_token_hash === undefined && typeof hasLinkFlag === 'boolean') {
    view.hasInviteLink = hasLinkFlag;
    view.inviteLinkIssuedAt = hasLinkFlag ? (rest.invite_token_issued_at ?? null) : null;
  }
  return view;
}

// Hạn mức cặp: bỏ trống → null (không giới hạn); số nguyên 1–32 (chấp nhận chuỗi số từ form).
function parseQuotaInput(value) {
  if (value === undefined || value === null || value === '') return { ok: true, quota: null };
  let number = null;
  if (typeof value === 'number') number = value;
  else if (typeof value === 'string' && /^[0-9]{1,2}$/.test(value.trim())) number = Number(value.trim());
  return number !== null && isValidQuota(number) ? { ok: true, quota: number } : { ok: false, code: 'FRIENDLY_QUOTA_INVALID' };
}

function parseInvitationNote(value) {
  if (value === undefined || value === null) return { ok: true, note: null };
  if (typeof value !== 'string' || value.length > INVITATION_NOTE_MAX) return { ok: false, code: 'SETUP_PAYLOAD_INVALID' };
  return { ok: true, note: value.trim() || null };
}

// Payload RPC cho hành động chủ nhà. rotate_link: băm do route tự sinh (issueInviteToken), không lấy từ body.
function hostActionPayload(action, body = {}) {
  if (!HOST_ACTIONS.includes(action)) return { ok: false, code: 'SETUP_PAYLOAD_INVALID' };
  if (action === 'request_changes') {
    const note = validateReviewNote(body.note);
    return note.ok ? { ok: true, payload: { note: note.note } } : { ok: false, code: note.code };
  }
  if (action === 'set_quota') {
    if (!Object.prototype.hasOwnProperty.call(body, 'quota')) return { ok: false, code: 'FRIENDLY_QUOTA_INVALID' };
    const quota = parseQuotaInput(body.quota);
    return quota.ok ? { ok: true, payload: { quota: quota.quota } } : { ok: false, code: quota.code };
  }
  return { ok: true, payload: {} };
}

function publicUrlFor(tournament) {
  if (!tournament || tournament.visibility === 'private' || !tournament.public_slug) return null;
  return `/giai-dau/v2/${encodeURIComponent(tournament.public_slug)}`;
}

function formatLabelFor(formatKey) {
  if (!formatKey) return null;
  try {
    return getFormat(String(formatKey))?.label || null;
  } catch {
    return null;
  }
}

// GuestInvitationView đầy đủ. division: { roster_lock_status, format_key? }.
function guestInvitationView({ row, tournament, hostClub, division, now = new Date() } = {}) {
  const window = registrationWindow({ settings: tournament?.settings, rosterLockStatus: division?.roster_lock_status, now });
  return projectInvitationForGuest({
    row,
    tournament,
    hostClub: { name: hostClub?.name ?? null, logoUrl: hostClub?.logoUrl ?? hostClub?.logo_url ?? null },
    window,
    formatLabel: formatLabelFor(division?.format_key),
    publicUrl: publicUrlFor(tournament),
  });
}

const LIST_ITEM_KEYS = Object.freeze(['id', 'tournament', 'hostClub', 'status', 'statusLabel', 'quota', 'pairCount', 'window', 'finalized', 'publicUrl']);
function guestListItem(view) {
  const out = {};
  for (const key of LIST_ITEM_KEYS) out[key] = view?.[key] ?? null;
  return out;
}

// Cần làm (invited / changes_requested) → đang mở → đã chốt → từ chối / rút; trong nhóm: ngày thi đấu sớm trước, rồi id.
function invitationRank(view) {
  if (['declined', 'withdrawn'].includes(view?.status)) return 3;
  if (view?.finalized) return 2;
  if (['invited', 'changes_requested'].includes(view?.status)) return 0;
  return 1;
}
function sortGuestInvitations(views) {
  return [...(views || [])].sort((a, b) => {
    const rank = invitationRank(a) - invitationRank(b);
    if (rank) return rank;
    const dateA = a?.tournament?.eventDate || '9999-12-31';
    const dateB = b?.tournament?.eventDate || '9999-12-31';
    if (dateA !== dateB) return dateA < dateB ? -1 : 1;
    return Number(a?.id || 0) - Number(b?.id || 0);
  });
}

function escapeLike(value) {
  return String(value).replace(/[\\%_,()]/g, (char) => `\\${char}`);
}

// Tìm theo tên CLB (≤ 60 ký tự); rỗng → null.
function parseClubSearch(value) {
  if (value == null) return { ok: true, q: null };
  const text = String(value).trim();
  if (!text) return { ok: true, q: null };
  if (text.length > SEARCH_MAX) return { ok: false, code: 'SETUP_PAYLOAD_INVALID' };
  return { ok: true, q: text };
}

function systemGroupId(env = process.env) {
  const configured = Number(env.PICKHUB_SYSTEM_GROUP_ID);
  return Number.isSafeInteger(configured) && configured > 0 ? configured : null;
}

// --- Nạp dữ liệu (chỉ đọc) ------------------------------------------------------------------------------------------

async function loadFriendlyDivisions(db, tournamentIds) {
  const ids = [...new Set((tournamentIds || []).map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))];
  if (!ids.length) return new Map();
  const { data, error } = await db.from('tournament_divisions')
    .select('id, group_id, tournament_id, roster_lock_status, format_key:setup_draft->format->>formatKey')
    .in('tournament_id', ids).eq('competition_template', FRIENDLY_DIVISION_TEMPLATE).order('id');
  if (error) throw error;
  const map = new Map();
  for (const row of data || []) if (!map.has(String(row.tournament_id))) map.set(String(row.tournament_id), row);
  return map;
}

async function loadGroupNames(db, ids, { withLogo = false } = {}) {
  const list = [...new Set((ids || []).filter((id) => id != null).map(Number))];
  if (!list.length) return new Map();
  const { data, error } = await db.from('groups').select(withLogo ? 'id, name, logo_url' : 'id, name').in('id', list);
  if (error) throw error;
  return new Map((data || []).map((row) => [String(row.id), row]));
}

// Thành viên của CHÍNH CLB khách (cùng nguồn với athletes?mode=roster) + cờ hồ sơ thi đấu.
async function loadClubMembers(db, clubGroupId) {
  const { data: members, error } = await db.from('club_members')
    .select('id, full_name, is_active').eq('group_id', Number(clubGroupId)).order('full_name', { ascending: true });
  if (error) throw error;
  const ids = (members || []).map((member) => member.id);
  let withAthlete = new Set();
  if (ids.length) {
    const { data: athletes, error: athletesError } = await db.from('athletes').select('legacy_club_member_id').in('legacy_club_member_id', ids);
    if (athletesError) throw athletesError;
    withAthlete = new Set((athletes || []).map((row) => String(row.legacy_club_member_id)));
  }
  return (members || []).map((member) => ({
    memberId: String(member.id),
    name: member.full_name,
    active: member.is_active !== false,
    hasAthlete: withAthlete.has(String(member.id)),
  }));
}

// --- Epic 3 F2: chốt giải giao hữu, BXH tổng CLB (spec lat-f2 §3.3, §3.5, §5, §7.2) --------------------------------

// Cột tournament_clubs cho ctx.friendly: như HOST_CLUB_FIELDS nhưng KHÔNG roster_draft, KHÔNG invite_token_hash.
const FRIENDLY_CONTEXT_CLUB_FIELDS = 'id, group_id, tournament_id, club_id, external_club_id, invitation_status, quota, version, '
  + 'roster_submitted, roster_approved_version';
const FRIENDLY_TOURNAMENT_FIELDS = 'id, group_id, name, settings, visibility, public_slug';
const MEMBER_REF_RE = /^member:([1-9][0-9]{0,17})$/;

function readFailure(error) {
  if (error) console.error('Friendly read error:', error);
  return Object.assign(new Error('Không thể tải dữ liệu giải giao hữu'), { code: 'SETUP_READ_FAILED', status: 500 });
}

async function loadFriendlyTournament(db, { groupId, tournamentId }) {
  const gid = positiveId(groupId);
  const tid = positiveId(tournamentId);
  if (!gid || !tid) return null;
  const { data, error } = await db.from('tournaments').select(FRIENDLY_TOURNAMENT_FIELDS).eq('id', tid).eq('group_id', gid).maybeSingle();
  if (error) throw readFailure(error);
  return data || null;
}

function isFriendlyTournament(tournament) {
  return tournament?.settings?.organizer_mode === 'friendly';
}

// athletes cho friendlyReadiness (FRIENDLY_ATHLETE_DUPLICATE): thành viên cặp khách đã duyệt (trước, để tên lấy từ ảnh
// chụp đã gửi) + thành viên chủ nhà của bản nháp. MỘT truy vấn athletes.in('legacy_club_member_id').
async function loadFriendlyAthletes(db, { hostMemberIds = [], guestPairs = [] }) {
  const items = [];
  const seen = new Set();
  const push = (clubKey, memberId, name) => {
    const key = `${clubKey}|${memberId}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push({ clubKey, memberId, name: name || '' });
  };
  for (const pair of guestPairs) {
    (pair.participantRefs || []).forEach((ref, index) => {
      const match = MEMBER_REF_RE.exec(String(ref));
      if (match) push(pair.clubKey, match[1], pair.memberNames?.[index]);
    });
  }
  for (const id of hostMemberIds) if (/^[1-9][0-9]{0,17}$/.test(String(id))) push(HOST_CLUB_KEY, String(id), '');
  if (!items.length) return [];
  const ids = [...new Set(items.map((item) => item.memberId))];
  const { data, error } = await db.from('athletes').select('id, legacy_club_member_id, display_name').in('legacy_club_member_id', ids.map(Number));
  if (error) throw readFailure(error);
  const byMember = new Map((data || []).map((row) => [String(row.legacy_club_member_id), row]));
  return items.filter((item) => byMember.has(item.memberId)).map((item) => {
    const athlete = byMember.get(item.memberId);
    return { clubKey: item.clubKey, memberId: item.memberId, athleteId: String(athlete.id), name: item.name || athlete.display_name || '' };
  });
}

// ctx.friendly của giải (null nếu giải không phải friendly). Chỉ I/O; shape do buildFriendlyContext quyết định.
// tournament (tuỳ chọn): dòng FRIENDLY_TOURNAMENT_FIELDS đã nạp (route setup đọc settings một lần).
async function loadFriendlyContext(db, { groupId, tournamentId, draft = null, tournament } = {}) {
  const gid = positiveId(groupId);
  const tid = positiveId(tournamentId);
  if (!gid || !tid) return null;
  const row = tournament === undefined ? await loadFriendlyTournament(db, { groupId: gid, tournamentId: tid }) : tournament;
  if (!row || !isFriendlyTournament(row) || String(row.id) !== String(tid) || String(row.group_id) !== String(gid)) return null;
  const { data: clubRows, error } = await db.from('tournament_clubs').select(FRIENDLY_CONTEXT_CLUB_FIELDS)
    .eq('group_id', gid).eq('tournament_id', tid).order('id');
  if (error) throw readFailure(error);
  const rows = clubRows || [];
  const names = await loadGroupNames(db, [gid, ...rows.map((club) => club.club_id)]);
  const groupNames = Object.fromEntries([...names].map(([id, group]) => [id, group.name]));
  const entitlements = await resolveFriendlyEntitlements({ db, groupId: gid });
  const athletes = await loadFriendlyAthletes(db, {
    hostMemberIds: draft?.participants?.memberIds || [],
    guestPairs: approvedGuestPairs(rows, { groupNames }),
  });
  return buildFriendlyContext({ clubRows: rows, groupNames, hostClubName: groupNames[String(gid)] || null, entitlements, athletes });
}

// Chế độ bản nháp phải khớp chế độ của giải (settings.organizer_mode, nguồn sự thật phía server).
function organizerModeMismatch(draft, friendly) {
  return (draft?.tournament?.organizerMode === 'friendly') !== Boolean(friendly);
}

function submittedPairCount(row) {
  if (!HOST_VISIBLE_SUBMITTED_STATUSES.includes(row?.invitation_status)) return 0;
  const pairs = row?.roster_submitted?.pairs;
  return Array.isArray(pairs) ? pairs.length : 0;
}

// Khối `friendly` của view setup (§3.5): chỉ tên, trạng thái, số cặp, màu — không memberId, không điện thoại, không băm.
function friendlySetupView(friendly, { tournament, rosterLockStatus, now = new Date() } = {}) {
  if (!friendly) return null;
  const rows = friendly.clubRows || [];
  const palette = clubPalette([{ tournamentClubId: HOST_CLUB_KEY, isHost: true }, ...rows.map((row) => ({ tournamentClubId: row.id, isHost: false }))]);
  return {
    limit: guestClubLimitView({ maxGuestClubs: friendly.maxGuestClubs, rows }),
    window: registrationWindow({ settings: tournament?.settings, rosterLockStatus, now }),
    clubs: rows.map((row) => ({
      tournamentClubId: row.id,
      name: row.clubName ?? null,
      status: row.invitation_status ?? null,
      statusLabel: statusLabel(row.invitation_status, 'host'),
      pairCount: submittedPairCount(row),
      color: palette.get(String(row.id)) || null,
    })),
    approvedPairs: projectApprovedPairs(friendly.approvedPairs),
    hostClub: { name: friendly.hostClubName ?? null, color: CLUB_COLORS[0] },
  };
}

// BXH tổng CLB (D40) của giải friendly: CLB chủ nhà + CLB khách đã duyệt; entries/trận/ván của division v3.
// tournament: { id, group_id } đã qua kiểm quyền. Mọi truy vấn scope group_id của giải.
async function loadFriendlyClubStandings(db, { tournament }) {
  const gid = positiveId(tournament?.group_id);
  const tid = positiveId(tournament?.id);
  if (!gid || !tid) throw readFailure(null);
  const [divisionsResult, clubsResult] = await Promise.all([
    db.from('tournament_divisions').select('id, roster_lock_status').eq('group_id', gid).eq('tournament_id', tid)
      .eq('competition_template', FRIENDLY_DIVISION_TEMPLATE).order('id').limit(1),
    db.from('tournament_clubs').select('id, club_id, invitation_status').eq('group_id', gid).eq('tournament_id', tid).order('id'),
  ]);
  if (divisionsResult.error || clubsResult.error) throw readFailure(divisionsResult.error || clubsResult.error);
  const division = (divisionsResult.data || [])[0] || null;
  const clubRows = (clubsResult.data || []).filter((row) => String(row.club_id) === String(gid)
    || (row.club_id != null && row.invitation_status === 'approved'));
  const names = await loadGroupNames(db, clubRows.map((row) => row.club_id));
  const clubs = clubRows.map((row) => ({
    tournamentClubId: row.id,
    name: names.get(String(row.club_id))?.name ?? null,
    isHost: String(row.club_id) === String(gid),
  }));
  let entries = [];
  let matches = [];
  let games = [];
  if (division) {
    const [entriesResult, matchesResult] = await Promise.all([
      db.from('tournament_entries').select('id, tournament_club_id').eq('group_id', gid).eq('division_id', division.id).order('id'),
      db.from('tournament_matches').select('id, entry_a_id, entry_b_id, winner_entry_id, status').eq('group_id', gid).eq('division_id', division.id).order('id'),
    ]);
    if (entriesResult.error || matchesResult.error) throw readFailure(entriesResult.error || matchesResult.error);
    entries = (entriesResult.data || []).map((row) => ({ id: row.id, tournamentClubId: row.tournament_club_id }));
    matches = (matchesResult.data || []).map((row) => ({
      id: row.id, entryAId: row.entry_a_id, entryBId: row.entry_b_id, winnerEntryId: row.winner_entry_id, status: row.status,
    }));
    const matchIds = matches.map((match) => match.id);
    if (matchIds.length) {
      const { data, error } = await db.from('tournament_games').select('match_id, score_a, score_b').eq('group_id', gid).in('match_id', matchIds);
      if (error) throw readFailure(error);
      games = (data || []).map((row) => ({ matchId: row.match_id, scoreA: row.score_a, scoreB: row.score_b }));
    }
  }
  const standings = computeFriendlyClubStandings({ clubs, entries, matches, games });
  const palette = clubPalette(clubs);
  const clubIds = new Set(clubs.map((club) => String(club.tournamentClubId)));
  const entryClubs = {};
  for (const entry of entries) if (clubIds.has(String(entry.tournamentClubId))) entryClubs[String(entry.id)] = entry.tournamentClubId;
  return {
    finalized: Boolean(division && division.roster_lock_status !== 'open'),
    clubs: clubs.map((club) => ({ ...club, color: palette.get(String(club.tournamentClubId)) || null })),
    entryClubs,
    ...standings,
  };
}

const PUBLIC_CLUB_KEYS = Object.freeze(['tournamentClubId', 'name', 'color', 'isHost']);
const PUBLIC_STANDING_KEYS = Object.freeze(['rank', 'tournamentClubId', 'name', 'color', 'isHost', 'played', 'won', 'lost',
  'pointsFor', 'pointsAgainst', 'diff', 'pairCount']);
const PUBLIC_SIDE_KEYS = Object.freeze(['tournamentClubId', 'name', 'color']);
function pick(source, keys) {
  const out = {};
  for (const key of keys) out[key] = source?.[key] ?? null;
  return out;
}

// Khối `friendly` của trang công khai (§7.2) — allowlist: không club_id (group id), logo, thành viên.
function publicFriendlyBlock(standings) {
  if (!standings) return null;
  const headToHead = standings.headToHead
    ? { left: pick(standings.headToHead.left, PUBLIC_SIDE_KEYS), right: pick(standings.headToHead.right, PUBLIC_SIDE_KEYS),
      wins: Array.isArray(standings.headToHead.wins) ? standings.headToHead.wins.map(Number) : [0, 0] }
    : null;
  const entryClubs = {};
  for (const [entryId, clubId] of Object.entries(standings.entryClubs || {})) entryClubs[String(entryId)] = clubId;
  return {
    clubs: (standings.clubs || []).map((club) => pick(club, PUBLIC_CLUB_KEYS)),
    entryClubs,
    clubStandings: { rows: (standings.rows || []).map((row) => pick(row, PUBLIC_STANDING_KEYS)), headToHead },
  };
}

// D50: chốt giải giao hữu đang `private` → `unlisted` + public_slug (nếu chưa có) để thành viên CLB khách xem qua link.
// Chỉ đổi khi còn private (điều kiện ngay trong UPDATE). Trả publicUrl hiện hành (null nếu vẫn riêng tư).
async function publishFriendlyTournament(db, { groupId, tournamentId }) {
  const row = await loadFriendlyTournament(db, { groupId, tournamentId });
  if (!row) return null;
  if (row.visibility !== 'private') return publicUrlFor(row);
  const { data, error } = await db.from('tournaments')
    .update({ visibility: 'unlisted', public_slug: row.public_slug || generateSlug(row.name), updated_at: new Date().toISOString() })
    .eq('id', row.id).eq('group_id', row.group_id).eq('visibility', 'private')
    .select('id, visibility, public_slug').maybeSingle();
  if (error) throw error;
  return publicUrlFor(data || row);
}

module.exports = {
  FRIENDLY_DIVISION_TEMPLATE,
  FRIENDLY_CONTEXT_CLUB_FIELDS,
  FRIENDLY_TOURNAMENT_FIELDS,
  loadFriendlyTournament,
  isFriendlyTournament,
  loadFriendlyAthletes,
  loadFriendlyContext,
  organizerModeMismatch,
  friendlySetupView,
  loadFriendlyClubStandings,
  publicFriendlyBlock,
  publishFriendlyTournament,
  HOST_CLUB_FIELDS,
  GUEST_CLUB_FIELDS,
  GUEST_TOURNAMENT_FIELDS,
  HOST_ACTIONS,
  GUEST_ACTIONS,
  positiveId,
  friendlyErrorPayload,
  rpcErrorPayload,
  blockerPayload,
  projectHostClubRow,
  parseQuotaInput,
  parseInvitationNote,
  hostActionPayload,
  publicUrlFor,
  formatLabelFor,
  guestInvitationView,
  guestListItem,
  sortGuestInvitations,
  escapeLike,
  parseClubSearch,
  systemGroupId,
  loadFriendlyDivisions,
  loadGroupNames,
  loadClubMembers,
};
