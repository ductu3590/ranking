'use strict';

// T2.C — thao tác bốc thăm ở bước setup. Kiểm HÀNH VI của domain thuần, và kiểm
// DÂY NỐI của UI (mọi prop on* mà step khai báo phải được TournamentWizard truyền).

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.join(__dirname, '..', '..', '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const { entrantsFromDraft, rollDraw, swapDraw, groupAssignments } = require(path.join(ROOT, 'app/giai-dau/v2/setup/draw/drawActions.js'));

function makeDraft(pairCount = 7, groupCount = 2) {
    return {
        pairs: Array.from({ length: pairCount }, (_, index) => ({
            pairId: `pair-${index + 1}`,
            memberIds: [`m${index}a`, `m${index}b`],
            nameSnapshot: `Cặp ${index + 1}`,
        })),
        format: { config: { groupCount } },
    };
}

// --- Bốc thăm ---------------------------------------------------------------

const draft = makeDraft();
const rolled = rollDraw(draft, { seed: 42 });
assert.equal(rolled.status, 'drafted', 'bốc xong thì draw ở trạng thái drafted');
assert.equal(rolled.assignments.length, 7, 'mỗi cặp đã ghép đủ người có đúng một suất');
assert.equal(rolled.seed, 42, 'seed được giữ lại trong draft để tái lập');

const groups = groupAssignments({ ...draft, draw: rolled });
assert.deepEqual(groups.map((group) => [group.label, group.slots.length]), [['A', 4], ['B', 3]],
    'ca 14 người: 7 cặp chia 2 bảng thành 4/3');

// Cùng seed phải cho cùng kết quả, nếu không preview và bản lưu sẽ lệch nhau.
assert.deepEqual(rollDraw(draft, { seed: 42 }).assignments, rolled.assignments,
    'cùng seed cho cùng kết quả bốc thăm');
assert.notDeepEqual(rollDraw(draft, { seed: 43 }).assignments, rolled.assignments,
    'seed khác cho kết quả khác');

// --- Cặp thiếu người không thành suất ---------------------------------------

const oddDraft = makeDraft(3);
oddDraft.pairs.push({ pairId: 'pair-le', memberIds: ['solo'], nameSnapshot: 'Thiếu người' });
assert.equal(entrantsFromDraft(oddDraft).length, 3, 'cặp thiếu người không được tính là suất thi đấu');
assert.ok(!rollDraw(oddDraft, { seed: 7 }).assignments.some((slot) => slot.entry_id === 'pair-le'),
    'BYE không thay đồng đội: cặp thiếu người không xuất hiện trong bản bốc');

// --- Đổi chỗ ----------------------------------------------------------------

const swapped = swapDraw({ ...draft, draw: rolled }, 'pair-1', 'pair-2');
const before = new Map(rolled.assignments.map((slot) => [slot.entry_id, `${slot.group_label}#${slot.seed_in_stage}`]));
const after = new Map(swapped.assignments.map((slot) => [slot.entry_id, `${slot.group_label}#${slot.seed_in_stage}`]));
assert.equal(after.get('pair-1'), before.get('pair-2'), 'suất thứ nhất nhận vị trí của suất thứ hai');
assert.equal(after.get('pair-2'), before.get('pair-1'), 'suất thứ hai nhận vị trí của suất thứ nhất');
for (const entryId of before.keys()) {
    if (entryId === 'pair-1' || entryId === 'pair-2') continue;
    assert.equal(after.get(entryId), before.get(entryId), `đổi chỗ không đụng tới ${entryId}`);
}
assert.equal(swapped.assignments.length, rolled.assignments.length, 'đổi chỗ không làm mất suất nào');
assert.equal(swapped.mode, 'manual', 'đổi chỗ chuyển draw sang manual');
assert.equal(swapped.status, 'stale', 'bốc thủ công phải được server preview lại trước khi chốt');

// --- Lỗi phải nêu rõ, không crash -------------------------------------------

assert.throws(() => swapDraw({ ...draft, draw: rolled }, 'pair-1', 'khong-ton-tai'),
    /không có trong bản bốc thăm/, 'đổi chỗ với suất không tồn tại thì báo lỗi rõ');
assert.throws(() => swapDraw({ ...draft, draw: rolled }, 'pair-1', 'pair-1'),
    /hai suất khác nhau/i, 'không cho đổi chỗ một suất với chính nó');
assert.throws(() => swapDraw(draft, 'pair-1', 'pair-2'),
    /Chưa bốc thăm/, 'chưa bốc thăm thì không đổi chỗ được');
assert.throws(() => rollDraw(makeDraft(1)), /ít nhất 2 cặp/, 'dưới 2 cặp thì không bốc được');
assert.throws(() => rollDraw(makeDraft(2)), /máy chủ cấp/, 'client không tự sinh random seed');
assert.throws(() => rollDraw(makeDraft(2, 5), { seed: 9 }), /Số bảng nhiều hơn số cặp/, 'số bảng nhiều hơn số cặp thì báo lỗi hiểu được');

// --- Dây nối UI: không được có nút gọi handler undefined --------------------

const wizard = read('app/giai-dau/v2/TournamentWizard.js');
for (const [file, component] of [
    ['app/giai-dau/v2/setup/steps/DrawScheduleStep.js', 'DrawScheduleStep'],
    ['app/giai-dau/v2/setup/steps/ReviewFinalizeStep.js', 'ReviewFinalizeStep'],
    ['app/giai-dau/v2/setup/steps/InfoParticipantsStep.js', 'InfoParticipantsStep'],
    ['app/giai-dau/v2/setup/steps/FormatPairingStep.js', 'FormatPairingStep'],
]) {
    const source = read(file);
    const signature = source.match(/export default function \w+\(\{([\s\S]*?)\}\)/);
    assert.ok(signature, `${component} có chữ ký props đọc được`);
    const declared = signature[1].split(',').map((part) => part.split('=')[0].trim()).filter((name) => /^on[A-Z]/.test(name));
    const rendered = wizard.match(new RegExp(`<${component}[\\s\\S]*?/>`));
    assert.ok(rendered, `TournamentWizard render ${component}`);
    for (const prop of declared) {
        // Prop co guard `{onX ? ... : null}` la tinh nang tuy chon: khong truyen thi
        // nut khong render, khong phai nut chet. Chi bat prop dung KHONG guard.
        const guarded = new RegExp('\{\s*' + prop + '\s*\?').test(source);
        if (guarded) continue;
        assert.ok(rendered[0].includes(prop + '='),
            component + ' khai bao ' + prop + ' va dung khong guard, nhung TournamentWizard khong truyen -> nut chet');
    }
}

console.log('T2.C draw actions: roll/reroll/swap và dây nối handler ok');
