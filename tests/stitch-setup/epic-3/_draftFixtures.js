'use strict';
// Fixture Lát 0 cho khoá "normalizeDraft không đổi" (F1 §8 f1-roster). Không phải file test.
// Thêm fixture mới thì phải cập nhật băm trong f1-roster.test.js — có chủ đích.

const GUEST = 'g_abcdef12';

module.exports = [
  null,
  { draftVersion: 3 },
  {
    draftVersion: 2,
    participants: { selectedMemberIds: ['11', '12', '13', '14', '15'] },
    pairs: [{ pairId: 'pair-1', memberIds: ['11', '12'], locked: true }],
    unpairedMemberIds: ['13'],
    reserveMemberIds: ['15'],
  },
  { draftVersion: 2, draw: { seed: 'abc', previewFingerprint: 'f'.repeat(64), assignments: [{}] } },
  { draftVersion: 2, tournament: { name: 'Giải nội bộ chưa đặt tên' }, format: { formatKey: 'group_knockout', config: { courtCount: 4, groupCount: 2 } } },
  {
    draftVersion: 3,
    participants: { memberIds: ['1', '2', '4'], guests: [] },
    pairs: [
      { pairId: 'p1', participantRefs: ['member:1', 'member:2'] },
      { pairId: 'p2', participantRefs: ['member:3', 'member:4'] },
    ],
    unpairedRefs: [],
  },
  {
    draftVersion: 3,
    participants: { memberIds: ['1', '2', '3'], guests: [] },
    pairs: [
      { pairId: 'p1', participantRefs: ['member:1', 'member:2'] },
      { pairId: 'p2', participantRefs: ['member:2', 'member:3'] },
    ],
  },
  {
    draftVersion: 3,
    tournament: { name: '  Giải Thu  ', eventDate: '2026-10-12', startTime: '07:30', courtCount: '4', location: ' Sân A ', organizerMode: 'friendly' },
    participants: { memberIds: ['1', '1', 'x', '2'], guests: [{ clientRef: GUEST, displayName: ' Minh Anh ' }, { clientRef: GUEST, displayName: 'x' }] },
    pairs: [{ pairId: 'p1', participantRefs: ['member:1', `guest:${GUEST}`], locked: true }],
    unpairedRefs: ['member:2'],
    format: { formatKey: 'round_robin', config: { courtCount: 3 } },
    draw: { status: 'draft', seed: 's1', previewFingerprint: 'a'.repeat(64), plan: { formatKey: 'round_robin' } },
    progress: { completedThrough: 7 },
    currentStep: 9,
  },
];
