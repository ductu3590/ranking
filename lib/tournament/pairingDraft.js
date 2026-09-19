'use strict';

function clone(state) {
  return { ...state, memberIds: state.memberIds.slice(), pairs: state.pairs.map((p) => ({ ...p, memberIds: p.memberIds.slice() })), unpairedMemberIds: state.unpairedMemberIds.slice(), reserveMemberIds: state.reserveMemberIds.slice() };
}
function createPairingDraft(input = {}) {
  const memberIds = [...new Set((input.memberIds || []).map(String))];
  return { memberIds, pairs: [], unpairedMemberIds: memberIds.slice(), reserveMemberIds: [], nextPairNumber: 1 };
}
function getPairs(state) { return state.pairs || []; }
function getPair(state, id) { return getPairs(state).find((p) => p.pairId === id) || null; }
function usedIds(state) { return new Set(getPairs(state).flatMap((p) => p.memberIds)); }
function pairMembers(state, pairs) {
  const next = clone(state); const used = new Set();
  next.pairs = (pairs || []).map((members, index) => {
    const ids = members.map(String);
    if (ids.length !== 2 || ids.some((id) => used.has(id))) throw new Error('PAIR_MEMBER_COUNT_INVALID');
    ids.forEach((id) => used.add(id));
    const old = next.pairs[index];
    return { pairId: old ? old.pairId : `pair-${next.nextPairNumber++}`, memberIds: ids, locked: old ? old.locked : false, status: 'ready' };
  });
  next.unpairedMemberIds = next.memberIds.filter((id) => !used.has(id) && !next.reserveMemberIds.includes(id));
  return next;
}
function addMember(state, memberId) { const next = clone(state); const id = String(memberId); if (!next.memberIds.includes(id)) next.memberIds.push(id); if (!usedIds(next).has(id) && !next.unpairedMemberIds.includes(id)) next.unpairedMemberIds.push(id); return next; }
function removeMember(state, memberId) { const next = clone(state); const id = String(memberId); next.memberIds = next.memberIds.filter((x) => x !== id); next.reserveMemberIds = next.reserveMemberIds.filter((x) => x !== id); const pair = next.pairs.find((p) => p.memberIds.includes(id)); if (pair) { pair.memberIds = pair.memberIds.filter((x) => x !== id); next.pairs = next.pairs.filter((p) => p.memberIds.length === 2); pair.memberIds.forEach((x) => { if (!next.unpairedMemberIds.includes(x)) next.unpairedMemberIds.push(x); }); } next.unpairedMemberIds = next.unpairedMemberIds.filter((x) => x !== id && next.memberIds.includes(x)); return next; }
function setLocked(state, pairId, locked) { const next = clone(state); const pair = getPair(next, pairId); if (!pair) throw new Error('PAIR_NOT_FOUND'); pair.locked = Boolean(locked); return next; }
function regenerateUnlockedPairs(state) { const next = clone(state); const lockedIds = new Set(next.pairs.filter((p) => p.locked).flatMap((p) => p.memberIds)); const pool = next.memberIds.filter((id) => !lockedIds.has(id)); const oldLocked = next.pairs.filter((p) => p.locked); const regenerated = []; for (let i = 0; i + 1 < pool.length; i += 2) regenerated.push({ pairId: `pair-${next.nextPairNumber++}`, memberIds: [pool[i], pool[i + 1]], locked: false, status: 'ready' }); next.pairs = oldLocked.concat(regenerated); next.unpairedMemberIds = pool.slice(pool.length % 2); return next; }
function finalizeBlockers(state) { return state.unpairedMemberIds.length ? ['UNPAIRED_MEMBER'] : state.pairs.some((p) => p.memberIds.length !== 2) ? ['PAIR_MEMBER_COUNT_INVALID'] : []; }
function canSaveDraft() { return true; }
function oddChoices(state) { return state.unpairedMemberIds.length % 2 ? ['add_member', 'reserve_member', 'switch_format'] : []; }
Object.assign(createPairingDraft, { pairMembers, addMember, removeMember, setLocked, regenerateUnlockedPairs, getPairs, getPair, getUnpairedMemberIds: (s) => s.unpairedMemberIds.slice(), finalizeBlockers, canSaveDraft, oddChoices });
module.exports = { createPairingDraft };
