'use strict';

// Ai được quản trị một giải?
//
// Quyền sở hữu đến từ chính bản ghi giải (`organizer_type`, `organizer_club_id`,
// `group_id`), KHÔNG phải từ việc phiên đăng nhập tình cờ thuộc CLB nào. Trước
// module này mọi route con của tournament-v2 đều dùng `requireValidatedGroupAdmin()`
// + `.eq('group_id', ...)`, nên giải cộng đồng tạo được bằng platform_session
// rồi kẹt: không sửa được division/clubs/athletes/rules của chính nó.
//
// Module thuần: không Supabase, không Next, không fetch. Tầng route nạp bản ghi
// giải rồi hỏi ở đây.

const GROUP_ADMIN_ROLE = 'admin';
const PLATFORM_ROLES = Object.freeze(['platform_admin', 'community_admin']);

// Trường riêng tư của đăng ký: chỉ actor quản trị được giải mới thấy. Lý do BTC
// nhập hộ roster và tuyên bố của đội trưởng là dữ liệu nội bộ, không phải thông
// tin công khai cho mọi thành viên trong CLB.
const PRIVATE_REGISTRATION_FIELDS = Object.freeze(['private_note', 'captain_declaration']);

function grant({ groupId, actorKind, canReadPrivate }) {
  return { allowed: true, code: null, message: null, status: 200, groupId, actorKind, canReadPrivate };
}

function deny(code, message, status) {
  return { allowed: false, code, message, status, groupId: null, actorKind: null, canReadPrivate: false };
}

function normalizeActor(actor) {
  if (!actor || typeof actor !== 'object') return null;
  const kind = actor.kind === 'platform' ? 'platform' : 'group';
  if (kind === 'platform') {
    const role = actor.role || null;
    if (!PLATFORM_ROLES.includes(role)) return null;
    return { kind, role, accountId: actor.accountId ?? actor.account_id ?? null };
  }
  const groupId = actor.groupId ?? actor.group_id ?? null;
  if (groupId == null) return null;
  return { kind, role: actor.role || null, groupId: Number(groupId) };
}

function sameId(left, right) {
  if (left == null || right == null) return false;
  return String(left) === String(right);
}

// Quyền GHI trên một giải. Đây cũng là định nghĩa của "actor quản trị được giải"
// dùng cho `canReadPrivate`, nên chỉ có một nguồn sự thật.
function resolveTournamentWrite({ tournament, actor } = {}) {
  const normalized = normalizeActor(actor);
  if (!normalized) return deny('UNAUTHENTICATED', 'Cần đăng nhập để thao tác trên giải này.', 401);
  if (!tournament || tournament.id == null) {
    return deny('TOURNAMENT_NOT_FOUND', 'Không tìm thấy giải.', 404);
  }

  const organizerType = tournament.organizer_type || 'club';
  const tenantGroupId = tournament.group_id ?? null;

  if (normalized.kind === 'platform') {
    // platform_admin quản trị được mọi giải; community_admin chỉ giải cộng đồng.
    if (normalized.role === 'platform_admin') {
      return grant({ groupId: tenantGroupId, actorKind: 'platform', canReadPrivate: true });
    }
    if (organizerType === 'community') {
      return grant({ groupId: tenantGroupId, actorKind: 'platform', canReadPrivate: true });
    }
    return deny('ORGANIZER_MISMATCH', 'Tài khoản cộng đồng chỉ quản trị được giải cộng đồng.', 403);
  }

  if (normalized.role !== GROUP_ADMIN_ROLE) {
    return deny('GROUP_ADMIN_REQUIRED', 'Cần quyền quản trị CLB để thao tác trên giải này.', 403);
  }
  // Tenant scope vẫn bắt buộc: group_session không bao giờ vượt CLB của nó.
  if (!sameId(tenantGroupId, normalized.groupId)) {
    return deny('TOURNAMENT_NOT_FOUND', 'Không tìm thấy giải trong CLB hiện tại.', 404);
  }
  if (organizerType === 'club') {
    // `organizer_club_id` rỗng là giải cũ trước Phase 3: coi tenant là chủ giải.
    if (tournament.organizer_club_id == null || sameId(tournament.organizer_club_id, normalized.groupId)) {
      return grant({ groupId: normalized.groupId, actorKind: 'group', canReadPrivate: true });
    }
    return deny('ORGANIZER_MISMATCH', 'CLB hiện tại không phải đơn vị tổ chức giải này.', 403);
  }
  // Giải cộng đồng/platform nằm dưới CLB hệ thống chỉ để thỏa NOT NULL của
  // group_id; admin CLB đó vẫn không phải BTC.
  return deny(
    'PLATFORM_SESSION_REQUIRED',
    'Giải cộng đồng cần đăng nhập tài khoản quản trị cộng đồng để thao tác.',
    403,
  );
}

// Quyền ĐỌC: rộng hơn ghi (member trong CLB chủ nhà đọc được), nhưng cờ
// `canReadPrivate` chỉ bật cho actor thực sự quản trị được giải.
function resolveTournamentRead({ tournament, actor } = {}) {
  const normalized = normalizeActor(actor);
  if (!normalized) return deny('UNAUTHENTICATED', 'Cần đăng nhập để xem giải này.', 401);
  if (!tournament || tournament.id == null) {
    return deny('TOURNAMENT_NOT_FOUND', 'Không tìm thấy giải.', 404);
  }

  const write = resolveTournamentWrite({ tournament, actor });
  if (write.allowed) return write;

  if (normalized.kind === 'platform') {
    // Platform actor đọc được để hỗ trợ vận hành, nhưng không thấy field riêng tư
    // của giải mình không quản trị.
    return grant({ groupId: tournament.group_id ?? null, actorKind: 'platform', canReadPrivate: false });
  }
  if (!sameId(tournament.group_id, normalized.groupId)) {
    return deny('TOURNAMENT_NOT_FOUND', 'Không tìm thấy giải trong CLB hiện tại.', 404);
  }
  return grant({ groupId: normalized.groupId, actorKind: 'group', canReadPrivate: false });
}

function resolveTournamentAccess({ tournament, actor, need = 'write' } = {}) {
  return need === 'read'
    ? resolveTournamentRead({ tournament, actor })
    : resolveTournamentWrite({ tournament, actor });
}

// Bỏ field riêng tư khỏi payload đọc khi actor không quản trị được giải.
// Chính sách field thuộc domain; route chỉ truyền cờ vào.
function projectRegistration(row, { canReadPrivate = false } = {}) {
  if (!row || typeof row !== 'object') return row;
  if (canReadPrivate) return row;
  const projected = { ...row };
  for (const field of PRIVATE_REGISTRATION_FIELDS) delete projected[field];
  return projected;
}

function projectRegistrations(rows = [], options = {}) {
  return (rows || []).map((row) => projectRegistration(row, options));
}

module.exports = {
  GROUP_ADMIN_ROLE,
  PLATFORM_ROLES,
  PRIVATE_REGISTRATION_FIELDS,
  resolveTournamentAccess,
  resolveTournamentRead,
  resolveTournamentWrite,
  projectRegistration,
  projectRegistrations,
};
