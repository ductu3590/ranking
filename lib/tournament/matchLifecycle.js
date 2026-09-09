'use strict';

const MATCH_STATUSES = Object.freeze(['pending', 'warmup', 'live', 'paused', 'finalized']);

const MATCH_STATUS_LABELS = Object.freeze({
  pending: 'Chưa gọi',
  warmup: 'Khởi động',
  live: 'Đang đấu',
  paused: 'Tạm dừng',
  finalized: 'Đã chốt',
});

const MATCH_TRANSITIONS = Object.freeze({
  pending: Object.freeze({
    warmup: { requiresReason: false, action: 'match_called' },
  }),
  warmup: Object.freeze({
    pending: { requiresReason: true, action: 'match_call_cancelled' },
    live: { requiresReason: false, action: 'match_started' },
    finalized: { requiresReason: true, action: 'match_walkover', resultType: 'walkover' },
  }),
  live: Object.freeze({
    paused: { requiresReason: false, action: 'match_paused' },
    finalized: { requiresReason: false, action: 'match_finalized' },
  }),
  paused: Object.freeze({
    live: { requiresReason: false, action: 'match_resumed' },
    finalized: { requiresReason: true, action: 'match_retired', resultType: 'retired' },
  }),
  finalized: Object.freeze({}),
});

function getEdge(from, to) {
  return (MATCH_TRANSITIONS[from] || {})[to] || null;
}

function canTransitionMatch(from, to) {
  if (!MATCH_STATUSES.includes(from) || !MATCH_STATUSES.includes(to)) {
    return {
      ok: false,
      code: 'INVALID_MATCH_STATUS',
      requiresReason: false,
      action: null,
      message: `Trạng thái trận không hợp lệ. Chỉ nhận: ${MATCH_STATUSES.join(', ')}.`,
    };
  }
  const transition = getEdge(from, to);
  if (!transition) {
    const next = Object.keys(MATCH_TRANSITIONS[from]);
    const hint = from === 'pending' && to === 'live'
      ? ' Mọi trận phải qua bước khởi động.'
      : '';
    return {
      ok: false,
      code: 'INVALID_MATCH_TRANSITION',
      requiresReason: false,
      action: null,
      message: `Trận đang ở "${MATCH_STATUS_LABELS[from]}", chỉ chuyển sang: ${next.length ? next.map((status) => MATCH_STATUS_LABELS[status]).join(', ') : 'không đi đâu được nữa'}.${hint}`,
    };
  }
  return { ok: true, code: null, requiresReason: transition.requiresReason, action: transition.action, message: null };
}

function resultTypeFor(from, to) {
  const transition = getEdge(from, to);
  return transition && transition.resultType ? transition.resultType : null;
}

function timestampsFor(from, to, nowIso) {
  if (from === 'pending' && to === 'warmup') return { warmup_started_at: nowIso };
  if (from === 'warmup' && to === 'pending') return { warmup_started_at: null };
  if (from === 'warmup' && to === 'live') return { started_at: nowIso };
  if (to === 'finalized') return { ended_at: nowIso };
  return {};
}

function parseTime(value) {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

function matchElapsed(match = {}, nowMs = Date.now(), options = {}) {
  const warmupMinutes = Number(options.warmupMinutes || 0);
  if (match.status === 'warmup') {
    const start = parseTime(match.warmup_started_at);
    if (start === null) return { seconds: null, countdownSeconds: null };
    return { seconds: null, countdownSeconds: Math.max(0, Math.round((start + warmupMinutes * 60000 - nowMs) / 1000)) };
  }
  if (match.status === 'live' || match.status === 'paused') {
    const start = parseTime(match.started_at);
    if (start === null) return { seconds: null, countdownSeconds: null };
    return { seconds: Math.round((nowMs - start) / 1000), countdownSeconds: null };
  }
  if (match.status === 'finalized') {
    const start = parseTime(match.started_at);
    const end = parseTime(match.ended_at);
    if (start === null || end === null) return { seconds: null, countdownSeconds: null };
    return { seconds: Math.round((end - start) / 1000), countdownSeconds: null };
  }
  return { seconds: null, countdownSeconds: null };
}

module.exports = {
  MATCH_STATUSES,
  MATCH_STATUS_LABELS,
  MATCH_TRANSITIONS,
  canTransitionMatch,
  resultTypeFor,
  timestampsFor,
  matchElapsed,
};