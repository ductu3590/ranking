'use strict';
// Ghép cặp đánh đôi cho luồng tạo giải (spec Lát 0 §6, ADR-005 D1/D3).
// Thay cho mọi logic ghép cặp khác. Thuần: ID và ngẫu nhiên được truyền vào
// (makeId, random) để test lặp lại được. Định danh là participantRef
// ('member:<id>' | 'guest:<clientRef>'), không bao giờ là tên.
//
// state = { pairs: [{ pairId, participantRefs: [a, b], locked }], unpairedRefs: [] }

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function clone(state) {
  return {
    pairs: (state?.pairs || []).map((pair) => ({ ...pair, participantRefs: pair.participantRefs.slice() })),
    unpairedRefs: (state?.unpairedRefs || []).slice(),
  };
}

function pairedRefs(state) {
  return new Set(state.pairs.flatMap((pair) => pair.participantRefs));
}

// --- Máy trạng thái chọn hai người -------------------------------------------
// selection = { first: ref|null, second: ref|null }
//   idle        : first=null
//   first(A)    : first=A, second=null
//   ready(A,B)  : first=A, second=B  → nút "Ghép cặp" bật
const IDLE = Object.freeze({ first: null, second: null });

function selectionPhase(selection) {
  if (!selection?.first) return 'idle';
  return selection.second ? 'ready' : 'first';
}

function toggleSelection(selection, ref) {
  const current = selection || IDLE;
  const value = String(ref);
  if (!current.first) return { first: value, second: null };
  if (!current.second) {
    if (current.first === value) return IDLE;               // chọn lại người thứ nhất = hủy
    return { first: current.first, second: value };
  }
  if (current.second === value) return { first: current.first, second: null };
  if (current.first === value) return { first: current.second, second: null };
  return { first: current.first, second: value };           // đổi người thứ hai
}

function clearSelection() {
  return IDLE;
}

// Bỏ lựa chọn không còn nằm trong danh sách chưa ghép (vd sau khi dữ liệu đổi).
function pruneSelection(selection, state) {
  const open = new Set(state?.unpairedRefs || []);
  const first = selection?.first && open.has(selection.first) ? selection.first : null;
  const second = first && selection?.second && open.has(selection.second) ? selection.second : null;
  return { first, second };
}

// --- Thao tác trên cặp ------------------------------------------------------------

function createPair(state, firstRef, secondRef, makeId) {
  const next = clone(state);
  const a = String(firstRef);
  const b = String(secondRef);
  if (a === b || !next.unpairedRefs.includes(a) || !next.unpairedRefs.includes(b)) fail('PAIR_MEMBER_COUNT_INVALID');
  if (typeof makeId !== 'function') fail('PAIR_ID_FACTORY_REQUIRED');
  const pairId = String(makeId());
  if (!pairId || next.pairs.some((pair) => pair.pairId === pairId)) fail('DUPLICATE_PAIR_ID');
  next.pairs.push({ pairId, participantRefs: [a, b], locked: false });
  next.unpairedRefs = next.unpairedRefs.filter((ref) => ref !== a && ref !== b);
  return next;
}

function splitPair(state, pairId) {
  const next = clone(state);
  const pair = next.pairs.find((item) => item.pairId === pairId);
  if (!pair) fail('PAIR_NOT_FOUND');
  if (pair.locked) fail('LOCKED_PAIR_MUTATION_FORBIDDEN');
  next.pairs = next.pairs.filter((item) => item.pairId !== pairId);
  next.unpairedRefs.push(...pair.participantRefs);
  return next;
}

function setLocked(state, pairId, locked) {
  const next = clone(state);
  const pair = next.pairs.find((item) => item.pairId === pairId);
  if (!pair) fail('PAIR_NOT_FOUND');
  pair.locked = Boolean(locked);
  return next;
}

// Đồng bộ với danh sách người đang chọn (Bước 2 đổi): người mới chỉ vào danh sách
// chưa ghép; người bị bỏ chỉ tách đúng cặp chứa họ (kể cả cặp đã khóa, vì người đó
// không còn tham gia). Mọi cặp khác giữ nguyên.
function syncParticipants(state, selectedRefs) {
  const next = clone(state);
  const selected = new Set((selectedRefs || []).map(String));
  const released = [];
  next.pairs = next.pairs.filter((pair) => {
    if (pair.participantRefs.every((ref) => selected.has(ref))) return true;
    pair.participantRefs.filter((ref) => selected.has(ref)).forEach((ref) => released.push(ref));
    return false;
  });
  const used = pairedRefs(next);
  const seen = new Set();
  next.unpairedRefs = [...next.unpairedRefs, ...released, ...selected]
    .filter((ref) => selected.has(ref) && !used.has(ref) && !seen.has(ref) && seen.add(ref));
  return next;
}

// Bỏ chọn người lẻ: gỡ ref khỏi danh sách chưa ghép. Việc bỏ khỏi danh sách tham gia
// (participants) do caller làm; hàm này chỉ đảm bảo không đụng cặp nào.
function dropUnpaired(state, ref) {
  const next = clone(state);
  if (!next.unpairedRefs.includes(String(ref))) fail('REF_NOT_UNPAIRED');
  next.unpairedRefs = next.unpairedRefs.filter((item) => item !== String(ref));
  return next;
}

function shuffled(items, random) {
  const out = items.slice();
  for (let index = out.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [out[index], out[swap]] = [out[swap], out[index]];
  }
  return out;
}

// Ghép ngẫu nhiên người chưa ghép; không đụng cặp đã có. Lẻ thì còn lại một người.
function pairRemainingRandomly(state, { random, makeId }) {
  let next = clone(state);
  const pool = shuffled(next.unpairedRefs, random);
  for (let index = 0; index + 1 < pool.length; index += 2) next = createPair(next, pool[index], pool[index + 1], makeId);
  return next;
}

// Ghép lại mọi cặp CHƯA KHÓA cùng người chưa ghép. Thao tác riêng, caller phải xác nhận.
function regenerateUnlocked(state, { random, makeId }) {
  const next = clone(state);
  const unlocked = next.pairs.filter((pair) => !pair.locked);
  next.pairs = next.pairs.filter((pair) => pair.locked);
  next.unpairedRefs = [...next.unpairedRefs, ...unlocked.flatMap((pair) => pair.participantRefs)];
  return pairRemainingRandomly(next, { random, makeId });
}

function pairingBlockers(state) {
  const blockers = [];
  if (state.unpairedRefs.length) blockers.push({ code: 'UNPAIRED_MEMBER', params: { count: state.unpairedRefs.length } });
  const seen = new Set();
  for (const pair of state.pairs) {
    const refs = pair.participantRefs;
    if (refs.length !== 2 || refs[0] === refs[1] || refs.some((ref) => seen.has(ref))) {
      blockers.push({ code: 'PAIR_MEMBER_COUNT_INVALID', params: { pairId: pair.pairId } });
    }
    refs.forEach((ref) => seen.add(ref));
  }
  return blockers;
}

module.exports = {
  IDLE,
  selectionPhase,
  toggleSelection,
  clearSelection,
  pruneSelection,
  createPair,
  splitPair,
  setLocked,
  syncParticipants,
  dropUnpaired,
  pairRemainingRandomly,
  regenerateUnlocked,
  pairingBlockers,
};
