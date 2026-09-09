'use strict';

const TOURNAMENT_STATUSES = Object.freeze([
  'draft',
  'registration_open',
  'registration_closed',
  'scheduled',
  'live',
  'completed',
  'archived',
]);

const STATUS_LABELS = Object.freeze({
  draft: 'Nháp',
  registration_open: 'Đang nhận đăng ký',
  registration_closed: 'Đã đóng đăng ký',
  scheduled: 'Đã chốt lịch',
  live: 'Đang diễn ra',
  completed: 'Đã kết thúc',
  archived: 'Lưu trữ',
});

const STATUS_TRANSITIONS = Object.freeze({
  draft: Object.freeze({
    registration_open: [],
    scheduled: [],
  }),
  registration_open: Object.freeze({
    registration_closed: [],
    draft: ['no_approved_registrations'],
  }),
  registration_closed: Object.freeze({
    scheduled: [],
    registration_open: [],
  }),
  scheduled: Object.freeze({
    live: [],
    draft: ['no_played_matches', 'no_approved_registrations'],
  }),
  live: Object.freeze({
    completed: ['all_matches_finalized'],
    scheduled: ['no_finalized_matches'],
  }),
  completed: Object.freeze({
    archived: [],
  }),
  archived: Object.freeze({}),
});

const GROUPS = Object.freeze({
  draft: 'upcoming',
  registration_open: 'upcoming',
  registration_closed: 'upcoming',
  scheduled: 'upcoming',
  live: 'running',
  completed: 'finished',
  archived: 'finished',
});

function isStatus(value) {
  return TOURNAMENT_STATUSES.includes(value);
}

function reachableFrom(status) {
  return Object.keys(STATUS_TRANSITIONS[status] || {});
}

function describeReachable(status) {
  const next = reachableFrom(status);
  if (next.length === 0) return 'không chuyển sang trạng thái nào khác được nữa';
  return `chỉ chuyển sang: ${next.map((s) => STATUS_LABELS[s]).join(', ')}`;
}

function canTransition(from, to) {
  if (!isStatus(from) || !isStatus(to)) {
    return {
      ok: false,
      code: 'INVALID_STATUS',
      guards: [],
      message: `Trạng thái không hợp lệ. Chỉ nhận: ${TOURNAMENT_STATUSES.join(', ')}.`,
    };
  }
  const guards = STATUS_TRANSITIONS[from]?.[to];
  if (!guards) {
    return {
      ok: false,
      code: 'INVALID_STATUS_TRANSITION',
      guards: [],
      message: `Giải hiện đang ở "${STATUS_LABELS[from]}", ${describeReachable(from)}.`,
    };
  }
  return { ok: true, code: null, guards: guards.slice(), message: null };
}

function groupOf(status) {
  return GROUPS[status] || 'upcoming';
}

function sortForGroup(tournaments, group) {
  const desc = group === 'finished';
  return tournaments.slice().sort((a, b) => {
    const da = a.event_date || null;
    const db = b.event_date || null;
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    if (da === db) return 0;
    return desc ? (da < db ? 1 : -1) : (da < db ? -1 : 1);
  });
}

function canDelete(tournament, matchCount) {
  if ((tournament || {}).status !== 'draft') {
    return {
      ok: false,
      code: 'TOURNAMENT_NOT_DRAFT',
      message: 'Chỉ xoá được giải còn ở trạng thái Nháp. Giải đã chạy thì chuyển sang lưu trữ để giữ kết quả.',
    };
  }
  if (Number(matchCount) > 0) {
    return {
      ok: false,
      code: 'TOURNAMENT_HAS_MATCHES',
      message: `Giải đã có ${matchCount} trận trong lịch. Xoá lịch trước, hoặc chuyển giải sang lưu trữ.`,
    };
  }
  return { ok: true, code: null, message: null };
}

module.exports = {
  TOURNAMENT_STATUSES,
  STATUS_LABELS,
  STATUS_TRANSITIONS,
  isStatus,
  canTransition,
  groupOf,
  sortForGroup,
  canDelete,
};
