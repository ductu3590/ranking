'use strict';

const { assert, lib, suite } = require('../_harness');
const { normalizeDraft, toSavePayload, parseRef, memberRef, guestRef } = lib('lib/tournament/setupDraftV3.js');

const GUEST = 'g_abcdef12';

suite('draft v3', {
  'draft rỗng có shape v3 và participants.memberIds là mảng'() {
    const draft = normalizeDraft(null);
    assert.equal(draft.draftVersion, 3);
    assert.deepEqual(draft.participants, { memberIds: [], guests: [] });
    assert.deepEqual(draft.pairs, []);
    assert.deepEqual(draft.unpairedRefs, []);
    assert.equal(draft.progress.completedThrough, 0);
    assert.equal(draft.draw.status, 'none');
  },

  'adapter v2: selectedMemberIds → memberIds, pairs.memberIds → participantRefs'() {
    const draft = normalizeDraft({
      draftVersion: 2,
      participants: { selectedMemberIds: ['11', '12', '13', '14', '15'] },
      pairs: [{ pairId: 'pair-1', memberIds: ['11', '12'], locked: true }],
      unpairedMemberIds: ['13'],
      reserveMemberIds: ['15'],
    });
    assert.deepEqual(draft.participants.memberIds, ['11', '12', '13', '14', '15']);
    assert.deepEqual(draft.pairs, [{ pairId: 'pair-1', participantRefs: ['member:11', 'member:12'], locked: true }]);
    // D3: dự bị cũ về danh sách chưa ghép; người chưa có trong danh sách nào cũng vào đây.
    assert.deepEqual(draft.unpairedRefs, ['member:13', 'member:15', 'member:14']);
    assert.equal('reserveMemberIds' in draft, false);
    assert.equal('selectedMemberIds' in draft.participants, false);
  },

  'adapter v2: draw cũ bị đánh dấu stale, không giữ seed'() {
    const draft = normalizeDraft({ draftVersion: 2, draw: { seed: 'abc', previewFingerprint: 'f'.repeat(64), assignments: [{}] } });
    assert.equal(draft.draw.status, 'stale');
    assert.equal(draft.draw.seed, null);
    assert.equal(draft.invalidation.earliestStep, 4);
  },

  'adapter v2: courtCount chuyển từ format.config sang tournament; tên tạm không hiện'() {
    const draft = normalizeDraft({ draftVersion: 2, tournament: { name: 'Giải nội bộ chưa đặt tên' }, format: { formatKey: 'group_knockout', config: { courtCount: 4, groupCount: 2 } } });
    assert.equal(draft.tournament.courtCount, 4);
    assert.equal(draft.tournament.name, '');
    assert.deepEqual(draft.format.config, { groupCount: 2 });
  },

  'cặp có người không còn được chọn thì tách; không ghép lại gì'() {
    const draft = normalizeDraft({
      draftVersion: 3,
      participants: { memberIds: ['1', '2', '4'], guests: [] },
      pairs: [
        { pairId: 'p1', participantRefs: ['member:1', 'member:2'] },
        { pairId: 'p2', participantRefs: ['member:3', 'member:4'] },
      ],
      unpairedRefs: [],
    });
    assert.deepEqual(draft.pairs.map((p) => p.pairId), ['p1']);
    assert.deepEqual(draft.unpairedRefs, ['member:4']);
  },

  'một người không xuất hiện ở hai cặp'() {
    const draft = normalizeDraft({
      draftVersion: 3,
      participants: { memberIds: ['1', '2', '3'], guests: [] },
      pairs: [
        { pairId: 'p1', participantRefs: ['member:1', 'member:2'] },
        { pairId: 'p2', participantRefs: ['member:2', 'member:3'] },
      ],
    });
    assert.deepEqual(draft.pairs.map((p) => p.pairId), ['p1']);
    assert.deepEqual(draft.unpairedRefs, ['member:3']);
  },

  'khách mời giữ clientRef, loại trùng, ghép cặp với thành viên'() {
    const draft = normalizeDraft({
      draftVersion: 3,
      participants: { memberIds: ['1'], guests: [{ clientRef: GUEST, displayName: ' Minh Anh ' }, { clientRef: GUEST, displayName: 'x' }] },
      pairs: [{ pairId: 'p1', participantRefs: ['member:1', `guest:${GUEST}`] }],
    });
    assert.deepEqual(draft.participants.guests, [{ clientRef: GUEST, displayName: 'Minh Anh' }]);
    assert.equal(draft.pairs.length, 1);
    assert.deepEqual(draft.unpairedRefs, []);
  },

  'toSavePayload luôn có participants.memberIds mảng, không có trường cũ'() {
    const payload = toSavePayload({ tournament: { name: 'Giải tháng 10' }, participants: { selectedMemberIds: ['7'] } }, 2);
    assert.ok(Array.isArray(payload.participants.memberIds));
    assert.deepEqual(payload.participants.memberIds, ['7']);
    assert.equal(payload.currentStep, 2);
    assert.equal(payload.division.name, 'Giải tháng 10');
    for (const legacy of ['selectedMemberIds', 'reserveMemberIds', 'unpairedMemberIds', 'invitedClubs']) {
      assert.equal(JSON.stringify(payload).includes(legacy), false, `không còn ${legacy}`);
    }
  },

  'parseRef chỉ nhận ref hợp lệ'() {
    assert.deepEqual(parseRef(memberRef('42')), { kind: 'member', id: '42' });
    assert.deepEqual(parseRef(guestRef(GUEST)), { kind: 'guest', clientRef: GUEST });
    assert.equal(parseRef('member:0'), null);
    assert.equal(parseRef('guest:ab'), null);
    assert.equal(parseRef('Nguyễn Văn A'), null);
  },

  'currentStep bị kẹp 1–4, progress kẹp 0–3'() {
    const draft = normalizeDraft({ draftVersion: 3, currentStep: 9, progress: { completedThrough: 7 } });
    assert.equal(draft.currentStep, 4);
    assert.equal(draft.progress.completedThrough, 3);
  },
});
