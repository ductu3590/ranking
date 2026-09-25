'use strict';
// Luật hợp lệ từng bước của luồng tạo giải (spec Lát 0 §4.1). Server dùng để quyết
// định progress.completedThrough; client dùng cùng hàm để báo sớm. Thuần, không I/O.
//
// ctx (tùy chọn):
//   members: Map<memberId, { name, active, hasAthlete }>  — có thì kiểm định danh
//   today: 'YYYY-MM-DD'                                     — có thì cảnh báo ngày đã qua
//   isFormatEnabled: (key) => boolean                       — mặc định theo registry

const { normalizeDraft, parseRef } = require('./setupDraftV3');
const { getFormat, isFormatEnabled: registryEnabled } = require('./setupFormats');

const { planInputSignature } = require('./setupPlans/common');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Đổi cặp hoặc cách chia bảng thì phải bốc lại; chỉ đổi tranh hạng ba / BO chung kết thì
// cập nhật xem trước với seed cũ là đủ (spec Lát A §3).
function drawGroupsChanged(draft, plan) {
  if (!plan) return true;
  const pairIds = draft.pairs.map((pair) => String(pair.pairId)).sort().join(',');
  const planIds = (plan.groups || []).flatMap((group) => group.entryIds).map(String).sort().join(',');
  if (draft.format.formatKey !== plan.formatKey || pairIds !== planIds) return true;
  if (plan.formatKey !== 'group_knockout') return false;
  const config = draft.format.config || {};
  const stageConfig = plan.stages?.[0]?.config || {};
  return Number(config.groupCount ?? 2) !== Number(stageConfig.groupCount)
    || Number(config.qualifiersPerGroup ?? 2) !== Number(stageConfig.advancePerGroup);
}
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function issue(code, step, severity, params, field) {
  return { code, step, severity, ...(field ? { field } : {}), ...(params ? { params } : {}) };
}

function validDate(value) {
  if (!DATE_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function nameKey(value) {
  return String(value || '').normalize('NFC').trim().toLocaleLowerCase('vi').replace(/\s+/g, ' ');
}

function step1(draft, ctx) {
  const t = draft.tournament;
  const blockers = [];
  const warnings = [];
  if (!t.name) blockers.push(issue('TOURNAMENT_NAME_REQUIRED', 1, 'blocker', null, 'name'));
  else if (t.name.length > 120) blockers.push(issue('TOURNAMENT_NAME_TOO_LONG', 1, 'blocker', null, 'name'));
  if (!validDate(t.eventDate)) blockers.push(issue('EVENT_DATE_REQUIRED', 1, 'blocker', null, 'eventDate'));
  else if (ctx.today && t.eventDate < ctx.today) warnings.push(issue('EVENT_DATE_IN_PAST', 1, 'warning', null, 'eventDate'));
  if (!TIME_RE.test(t.startTime)) blockers.push(issue('START_TIME_REQUIRED', 1, 'blocker', null, 'startTime'));
  if (t.posterUrl && !/^https:\/\/\S+$/i.test(t.posterUrl)) blockers.push(issue('POSTER_URL_INVALID', 1, 'blocker', null, 'posterUrl'));
  return { blockers, warnings };
}

function step2(draft, ctx) {
  const { memberIds, guests } = draft.participants;
  const blockers = [];
  const warnings = [];
  if (memberIds.length + guests.length < 2) blockers.push(issue('ROSTER_EMPTY', 2, 'blocker', null, 'participants'));

  const memberNames = new Map();
  if (ctx.members) {
    let inactive = 0;
    for (const memberId of memberIds) {
      const member = ctx.members.get(String(memberId));
      if (!member) {
        blockers.push(issue('MEMBER_OUTSIDE_GROUP', 2, 'blocker', { memberId }, 'participants'));
        continue;
      }
      memberNames.set(nameKey(member.name), member.name);
      if (!member.hasAthlete) blockers.push(issue('ATHLETE_ID_MISSING', 2, 'blocker', { memberId, name: member.name }, 'participants'));
      if (member.active === false) inactive += 1;
    }
    if (inactive) warnings.push(issue('INACTIVE_MEMBER_SELECTED', 2, 'warning', { count: inactive }, 'participants'));
  }

  const guestNames = new Map();
  for (const guest of guests) {
    const ref = parseRef(`guest:${guest.clientRef}`);
    const length = guest.displayName.length;
    if (!ref) blockers.push(issue('GUEST_REF_INVALID', 2, 'blocker', { clientRef: guest.clientRef }, 'guests'));
    if (length < 2 || length > 60) blockers.push(issue('GUEST_NAME_INVALID', 2, 'blocker', { clientRef: guest.clientRef }, 'guests'));
    const key = nameKey(guest.displayName);
    if (key && (memberNames.has(key) || guestNames.has(key))) {
      warnings.push(issue('GUEST_NAME_MATCHES_MEMBER', 2, 'warning', { clientRef: guest.clientRef, name: guest.displayName }, 'guests'));
    }
    guestNames.set(key, guest.clientRef);
  }
  return { blockers, warnings };
}

function step3(draft, ctx) {
  const blockers = [];
  const warnings = [];
  const formatKey = draft.format.formatKey;
  const format = getFormat(formatKey);
  const enabled = typeof ctx.isFormatEnabled === 'function' ? ctx.isFormatEnabled : registryEnabled;
  if (!format) blockers.push(issue('FORMAT_REQUIRED', 3, 'blocker', null, 'format'));
  else if (!enabled(formatKey)) blockers.push(issue('FORMAT_NOT_AVAILABLE', 3, 'blocker', { formatKey }, 'format'));
  else blockers.push(...format.validateConfig(draft.format.config));

  const selected = new Set([
    ...draft.participants.memberIds.map((id) => `member:${id}`),
    ...draft.participants.guests.map((guest) => `guest:${guest.clientRef}`),
  ]);
  const used = new Set();
  for (const pair of draft.pairs) {
    const refs = pair.participantRefs;
    const ok = refs.length === 2 && refs[0] !== refs[1] && refs.every((ref) => selected.has(ref) && !used.has(ref));
    refs.forEach((ref) => used.add(ref));
    if (!ok) blockers.push(issue('PAIR_MEMBER_COUNT_INVALID', 3, 'blocker', { pairId: pair.pairId }, 'pairs'));
  }
  // Số sân chọn ở Bước 3, sau khi biết số cặp và thể thức (yêu cầu người dùng 2026-09-24).
  const courtCount = draft.tournament.courtCount;
  if (!Number.isInteger(courtCount) || courtCount < 1 || courtCount > 20) {
    blockers.push(issue('COURT_COUNT_INVALID', 3, 'blocker', null, 'courtCount'));
  }

  const unpaired = [...selected].filter((ref) => !used.has(ref));
  if (unpaired.length) blockers.push(issue('UNPAIRED_MEMBER', 3, 'blocker', { count: unpaired.length, refs: unpaired }, 'pairs'));

  if (format) {
    const count = draft.pairs.length;
    const min = format.minPairs(draft.format.config);
    const [recMin, recMax] = format.recommended;
    const max = typeof format.maxPairs === 'function' ? format.maxPairs(draft.format.config) : null;
    if (count < min) blockers.push(issue('PAIR_COUNT_BELOW_MINIMUM', 3, 'blocker', { min, count }, 'pairs'));
    else if (max != null && count > max) blockers.push(issue('PAIR_COUNT_ABOVE_MAXIMUM', 3, 'blocker', { max, count }, 'pairs'));
    else if (count < recMin || count > recMax) {
      warnings.push(issue('PAIR_COUNT_OUTSIDE_RECOMMENDED', 3, 'warning', { min: recMin, max: recMax, count }, 'pairs'));
    }
  }
  return { blockers, warnings };
}

function step4(draft) {
  const blockers = [];
  const plan = draft.draw.plan;
  // Draw hết hạn khi cặp/thể thức/cấu hình khác lúc bốc (spec Lát 0 §4.3); không tự bốc lại.
  const currentSignature = planInputSignature({
    formatKey: draft.format.formatKey,
    config: draft.format.config,
    pairIds: draft.pairs.map((pair) => pair.pairId),
  });
  if (draft.draw.status === 'stale' || (plan && plan.inputSignature !== currentSignature)) {
    blockers.push(issue('DRAW_STALE', 4, 'blocker', { groupsChanged: drawGroupsChanged(draft, plan) }, 'draw'));
  } else if (draft.draw.status !== 'draft' || !plan || !draft.draw.previewFingerprint) {
    blockers.push(issue('DRAW_REQUIRED', 4, 'blocker', null, 'draw'));
  }
  const warnings = (draft.draw.plan?.warnings || []).map((code) => issue(code, 4, 'warning', null, 'draw'));
  return { blockers, warnings };
}

const RULES = { 1: step1, 2: step2, 3: step3, 4: step4 };

function validateStep(rawDraft, step, ctx = {}) {
  const rule = RULES[Number(step)];
  if (!rule) throw new Error(`Unknown setup step ${step}`);
  const draft = normalizeDraft(rawDraft);
  const result = rule(draft, ctx);
  return { ok: result.blockers.length === 0, blockers: result.blockers, warnings: result.warnings };
}

// Số bước liên tiếp từ 1 đã hợp lệ (0–3). Bước 4 chỉ "xong" khi chốt giải.
function computeCompletedThrough(rawDraft, ctx = {}) {
  let completed = 0;
  for (const step of [1, 2, 3]) {
    if (!validateStep(rawDraft, step, ctx).ok) break;
    completed = step;
  }
  return completed;
}

// Bước được phép mở: ≤ completedThrough + 1.
function allowedStep(requested, completedThrough) {
  const step = Math.max(1, Math.min(4, Math.round(Number(requested) || 1)));
  return Math.min(step, Math.max(1, Math.min(4, Number(completedThrough || 0) + 1)));
}

module.exports = { validateStep, computeCompletedThrough, allowedStep };
