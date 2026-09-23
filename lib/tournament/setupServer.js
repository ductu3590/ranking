'use strict';
// Phần I/O phía server dùng chung cho các route setup v3 (save/preview/finalize).
// Nhận `db` từ route (không tự tạo client) để domain giữ thuần.

const { normalizeDraft } = require('./setupDraftV3');
const { computeCompletedThrough, allowedStep, validateStep } = require('./setupStepRules');
const { computeSetupReadiness } = require('./setupReadiness');

function todayInVietnam() {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

// Định danh thành viên cho luật Bước 2: chỉ thành viên thuộc group trong session,
// và có athlete (athletes.legacy_club_member_id) mới hợp lệ.
async function loadMemberContext(db, groupId, memberIds) {
  const ids = [...new Set((memberIds || []).map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))];
  if (!ids.length) return new Map();
  const [{ data: members, error: membersError }, { data: athletes, error: athletesError }] = await Promise.all([
    db.from('club_members').select('id, full_name, is_active').eq('group_id', Number(groupId)).in('id', ids),
    db.from('athletes').select('legacy_club_member_id').in('legacy_club_member_id', ids),
  ]);
  if (membersError || athletesError) throw Object.assign(new Error('Không thể xác thực danh tính VĐV'), { code: 'SETUP_READ_FAILED', status: 500 });
  const withAthlete = new Set((athletes || []).map((row) => String(row.legacy_club_member_id)));
  return new Map((members || []).map((member) => [String(member.id), {
    name: member.full_name,
    active: member.is_active !== false,
    hasAthlete: withAthlete.has(String(member.id)),
  }]));
}

async function setupContext(db, groupId, draft) {
  return { members: await loadMemberContext(db, groupId, draft.participants.memberIds), today: todayInVietnam() };
}

// Draft v3 kèm progress do server tính. Client không tự nâng progress (spec Lát 0 §4.1).
async function setupView(db, groupId, rawDraft) {
  const draft = normalizeDraft(rawDraft);
  const ctx = await setupContext(db, groupId, draft);
  const completedThrough = computeCompletedThrough(draft, ctx);
  const resumeStep = allowedStep(draft.currentStep, completedThrough);
  return {
    draft: { ...draft, progress: { completedThrough }, currentStep: resumeStep },
    resumeStep,
    readiness: computeSetupReadiness(draft, ctx),
  };
}

// Blocker đầu tiên của các bước 1..upTo (dùng cho preview/finalize).
function firstBlocker(draft, ctx, upTo) {
  for (let step = 1; step <= upTo; step += 1) {
    const result = validateStep(draft, step, ctx);
    if (!result.ok) return result.blockers[0];
  }
  return null;
}

// Tên hiển thị theo participantRef (thành viên từ ctx, khách từ bản nháp).
function participantNames(draft, ctx) {
  const names = new Map();
  for (const memberId of draft.participants.memberIds) names.set(`member:${memberId}`, ctx.members.get(String(memberId))?.name || '');
  for (const guest of draft.participants.guests) names.set(`guest:${guest.clientRef}`, guest.displayName);
  return names;
}

module.exports = { todayInVietnam, loadMemberContext, setupContext, setupView, firstBlocker, participantNames };
