'use strict';

// Thao tác bốc thăm ở BƯỚC SETUP, chạy hoàn toàn trên draft.
//
// Không gọi /api/tournament-v2/draw: route đó nạp stage theo id có thật trong DB
// (draw/route.js loadStage), mà draft trước finalize chưa có stage row nào —
// draw.stagePlans mới chỉ là payload. Seed và assignments sống trong draft theo
// contract (`draw: { status, seed, assignments, stagePlans, matches }`), finalize
// mới ghi xuống DB.
//
// Logic chia bảng và đổi chỗ tái dùng lib/tournament/draw.js (file đóng băng,
// chỉ gọi) để preview và bản lưu không lệch nhau.

const { buildDrawSlots, swapDrawSlots } = require('../../../../../lib/tournament/draw');

// Cặp đã ghép -> entrant cho engine. Chỉ lấy cặp đủ hai người: cặp thiếu người
// không phải suất thi đấu, và BYE không thay được đồng đội (bất biến §3.4).
function entrantsFromDraft(draft = {}) {
    const pairs = Array.isArray(draft.pairs) ? draft.pairs : [];
    return pairs
        .filter((pair) => pair && pair.pairId && Array.isArray(pair.memberIds) && pair.memberIds.length === 2)
        .map((pair) => ({ id: pair.pairId, name: pair.nameSnapshot || pair.pairId }));
}

function stageFromDraft(draft = {}) {
    const config = (draft.format && draft.format.config) || {};
    const groupCount = Number(config.groupCount || config.groups || config.group_count) || 1;
    return { schedule_format: 'round_robin', config: { groupCount } };
}

// Bốc thăm mới. Trả về đối tượng draw để ghi thẳng vào draft.
function rollDraw(draft = {}, options = {}) {
    const entrants = entrantsFromDraft(draft);
    if (entrants.length < 2) {
        const error = new Error('Cần ít nhất 2 cặp đã ghép đủ người mới bốc thăm được.');
        error.code = 'DRAW_TOO_FEW_ENTRIES';
        throw error;
    }
    const seed = Number(options.seed);
    if (!Number.isInteger(seed) || seed < 1) {
        const error = new Error('Seed bốc thăm phải do máy chủ cấp. Hãy dùng nút bốc thăm tự động.');
        error.code = 'SERVER_DRAW_SEED_REQUIRED';
        throw error;
    }
    let assignments;
    try {
        assignments = buildDrawSlots(stageFromDraft(draft), entrants, seed);
    } catch (engineError) {
        if (engineError?.message === 'GROUP_COUNT_EXCEEDS_ENTRIES') {
            const error = new Error('Số bảng nhiều hơn số cặp. Giảm số bảng rồi bốc lại.');
            error.code = 'GROUP_COUNT_EXCEEDS_ENTRIES';
            throw error;
        }
        throw engineError;
    }
    return { ...(draft.draw || {}), status: 'drafted', mode: 'automatic', seed, assignments };
}

// Đổi chỗ hai suất đã bốc. Ném lỗi có thông điệp tiếng Việt nếu entry không tồn tại.
function swapDraw(draft = {}, entryA, entryB) {
    const current = Array.isArray(draft.draw?.assignments) ? draft.draw.assignments : [];
    if (!current.length) {
        const error = new Error('Chưa bốc thăm nên chưa có gì để đổi chỗ.');
        error.code = 'DRAW_NOT_DRAFT';
        throw error;
    }
    if (String(entryA) === String(entryB)) {
        const error = new Error('Hãy chọn hai suất khác nhau.');
        error.code = 'DRAW_SWAP_SAME_ENTRY';
        throw error;
    }
    const assignments = swapDrawSlots(current, entryA, entryB);
    return { ...(draft.draw || {}), status: 'stale', mode: 'manual', assignments, previewFingerprint: undefined, schedulePreview: undefined };
}

// Gom assignments theo bảng để render. Giữ thứ tự seed_in_stage trong mỗi bảng.
function groupAssignments(draft = {}) {
    const assignments = Array.isArray(draft.draw?.assignments) ? draft.draw.assignments : [];
    const nameById = new Map(entrantsFromDraft(draft).map((entrant) => [String(entrant.id), entrant.name]));
    const byLabel = new Map();
    for (const slot of assignments) {
        const label = slot.group_label || 'A';
        if (!byLabel.has(label)) byLabel.set(label, []);
        byLabel.get(label).push({
            entryId: slot.entry_id,
            name: nameById.get(String(slot.entry_id)) || String(slot.entry_id),
            seedInStage: slot.seed_in_stage,
        });
    }
    return [...byLabel.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([label, slots]) => ({ label, slots: slots.slice().sort((a, b) => a.seedInStage - b.seedInStage) }));
}

module.exports = { entrantsFromDraft, rollDraw, swapDraw, groupAssignments };
