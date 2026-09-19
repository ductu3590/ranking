'use strict';
// Bản nháp bốc thăm. Thuần, không I/O.
// Bốc thăm KHÔNG tạo trận — chốt bốc thăm mới tạo. Nhờ vậy BTC sửa tay và bốc
// lại thoải mái mà không phải xoá đi xoá lại lịch.

const { seedOrder, nextPowerOfTwo } = require('./seeding');
const { resolveGroupCount } = require('./setupContract');

// Bộ sinh số giả ngẫu nhiên có hạt giống: cùng seed cho cùng kết quả, để BTC
// bốc lại được và giải thích được với VĐV.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a += 0x6D2B79F5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(list, seed) {
  const rand = mulberry32(seed);
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function groupLabel(index) {
  return String.fromCharCode(65 + index); // 0 -> 'A'
}

function buildDrawSlots(stage = {}, entrants = [], seed = 1) {
  const order = shuffled(entrants, Number(seed) || 1);

  if (stage.schedule_format === 'knockout') {
    const size = nextPowerOfTwo(Math.max(2, order.length));
    const positions = seedOrder(size);
    return order.map((entrant, index) => ({
      entry_id: entrant.id,
      group_label: null,
      seed_in_stage: positions[index] != null ? positions[index] : index + 1,
    }));
  }

  const groups = resolveGroupCount(stage.config || {});
  if (groups > entrants.length) throw new Error('GROUP_COUNT_EXCEEDS_ENTRIES');
  return order.map((entrant, index) => ({
    entry_id: entrant.id,
    group_label: groupLabel(index % groups),
    seed_in_stage: Math.floor(index / groups) + 1,
  }));
}

function swapDrawSlots(slots, entryA, entryB) {
  const a = slots.findIndex((s) => String(s.entry_id) === String(entryA));
  const b = slots.findIndex((s) => String(s.entry_id) === String(entryB));
  if (a < 0 || b < 0) throw new Error('Đội cần đổi chỗ không có trong bản bốc thăm.');
  const out = slots.map((s) => ({ ...s }));
  const tmp = { group_label: out[a].group_label, seed_in_stage: out[a].seed_in_stage };
  out[a].group_label = out[b].group_label;
  out[a].seed_in_stage = out[b].seed_in_stage;
  out[b].group_label = tmp.group_label;
  out[b].seed_in_stage = tmp.seed_in_stage;
  return out;
}

// Trả { ok, code, message, warnings }. Cảnh báo KHÔNG chặn — giống cách wizard
// đang xử lý cảnh báo ghép cặp: nói cho BTC biết rồi để họ quyết.
function validateDraw(slots = [], entrants = [], options = {}) {
  const warnings = [];
  const invalid = (code, message) => ({ ok: false, code, message, warnings });
  if (!Array.isArray(slots) || slots.some((slot) => !slot || slot.entry_id == null)) {
    return invalid('DRAW_INVALID_SLOTS', 'Bản bốc thăm không hợp lệ.');
  }
  const ids = slots.map((s) => String(s.entry_id));
  if (new Set(ids).size !== ids.length) {
    return {
      ok: false,
      code: 'DRAW_DUPLICATE_ENTRY',
      message: 'Có đội xuất hiện nhiều hơn một lần trong bản bốc thăm.',
      warnings,
    };
  }
  if (slots.length < 2) {
    return {
      ok: false,
      code: 'DRAW_TOO_FEW_ENTRIES',
      message: 'Cần ít nhất 2 đội mới bốc thăm được.',
      warnings,
    };
  }

  const expectedIds = new Set(entrants.map((entry) => String(entry.id)));
  if (ids.some((id) => !expectedIds.has(id))) {
    return invalid('DRAW_UNKNOWN_ENTRY', 'Bản bốc thăm chứa đội không thuộc danh sách hiện tại.');
  }
  if (ids.length !== expectedIds.size) {
    return invalid('DRAW_MISSING_ENTRY', 'Danh sách đội đã thay đổi. Hãy bốc thăm lại trước khi chốt.');
  }
  if (options.stage) {
    const stage = options.stage;
    const knockout = stage.schedule_format === 'knockout';
    let groupCount;
    try { groupCount = knockout ? 1 : resolveGroupCount(stage.config || {}); } catch (_) {
      return invalid('DRAW_INVALID_CONFIG', 'Số bảng không hợp lệ hoặc mâu thuẫn.');
    }
    const labels = new Set(Array.from({ length: Math.min(groupCount, slots.length) }, (_, index) => groupLabel(index)));
    if (groupCount > slots.length || slots.some((slot) => knockout
      ? slot.group_label != null
      : !labels.has(slot.group_label))) {
      return invalid('DRAW_INVALID_GROUP', 'Vị trí bảng không khớp cấu hình giai đoạn.');
    }
    if (!knockout && new Set(slots.map((slot) => slot.group_label)).size !== groupCount) {
      return invalid('DRAW_EMPTY_GROUP', 'Có bảng chưa có đội.');
    }
    const positions = new Set();
    const maxSeed = knockout ? nextPowerOfTwo(slots.length) : slots.length;
    for (const slot of slots) {
      const seed = Number(slot.seed_in_stage);
      if (!Number.isSafeInteger(seed) || seed < 1 || seed > maxSeed) {
        return invalid('DRAW_INVALID_SEED', 'Vị trí hạt giống không hợp lệ.');
      }
      const key = JSON.stringify([slot.group_label, seed]);
      if (positions.has(key)) return invalid('DRAW_DUPLICATE_POSITION', 'Hai đội đang ở cùng một vị trí bốc thăm.');
      positions.add(key);
    }
  }

  const byGroup = new Map();
  for (const slot of slots) {
    const key = slot.group_label == null ? '' : slot.group_label;
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key).push(slot);
  }

  // Chỉ cảnh báo lệch khi thực sự có chia bảng. Knockout không có bảng nên
  // byGroup chỉ có một khoá rỗng — không có gì để so.
  if (byGroup.size > 1) {
    const sizes = [...byGroup.values()].map((g) => g.length);
    if (Math.max(...sizes) - Math.min(...sizes) > 1) {
      warnings.push({
        code: 'DRAW_UNEVEN_GROUPS',
        blocking: false,
        message: `Các bảng lệch nhau quá 1 đội (${sizes.join(' / ')}). Đội ở bảng ít hơn sẽ đá ít trận hơn.`,
      });
    }
  }

  const clubOf = new Map(entrants.map((e) => [String(e.id), e.club_id]));
  for (const [label, group] of byGroup.entries()) {
    if (options.organizerMode === 'internal') continue;
    if (!label) continue;
    const clubs = group.map((s) => clubOf.get(String(s.entry_id))).filter((c) => c != null);
    const dup = clubs.filter((c, i) => clubs.indexOf(c) !== i);
    if (dup.length > 0) {
      warnings.push({
        code: 'DRAW_SAME_CLUB_IN_GROUP',
        blocking: false,
        message: `Bảng ${label} có hai đội cùng một CLB.`,
      });
    }
  }

  return { ok: true, code: null, message: null, warnings };
}

module.exports = { buildDrawSlots, swapDrawSlots, validateDraw };
