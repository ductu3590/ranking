'use strict';
// Fixture hồi quy F2 (spec F2 §3.4, §9): "ctx.friendly vắng → kết quả bằng đúng trước Epic 3".
// Băm trong f2-step-rules.test.js tính trên code TRƯỚC F2 (HEAD b4b3652). Không phải file test.
// Thêm/sửa fixture ở đây thì phải tính lại băm trên code trước F2 — có chủ đích.

const path = require('node:path');
const ROOT = path.join(__dirname, '..', '..', '..');
const { buildSetupPlan } = require(path.join(ROOT, 'lib/tournament/setupPlans/index.js'));
const DRAFT_FIXTURES = require('./_draftFixtures');

const info = (overrides = {}) => ({ name: 'Giải tháng 10', eventDate: '2026-10-12', startTime: '07:30', courtCount: 4, ...overrides });
const pairIds = (n) => Array.from({ length: n }, (_, i) => `pair_${String(i + 1).padStart(2, '0')}`);

function pairedDraft(pairCount, format, extra = {}) {
  const memberIds = Array.from({ length: pairCount * 2 }, (_, i) => String(i + 1));
  const pairs = pairIds(pairCount).map((pairId, i) => ({ pairId, participantRefs: [`member:${2 * i + 1}`, `member:${2 * i + 2}`] }));
  return { draftVersion: 3, tournament: info(), participants: { memberIds, guests: [] }, pairs, format, ...extra };
}

function drawn(pairCount, format, seed) {
  const draft = pairedDraft(pairCount, format);
  const plan = buildSetupPlan({ formatKey: format.formatKey, config: format.config, pairIds: draft.pairs.map((p) => p.pairId), seed, divisionId: '9' });
  return { ...draft, draw: { status: 'draft', seed, previewFingerprint: plan.fingerprint, plan } };
}

const GK = { formatKey: 'group_knockout', config: { groupCount: 2, qualifiersPerGroup: 2 } };

function drafts() {
  const gk14 = drawn(7, GK, 'seed-1');
  const odd15 = pairedDraft(7, GK);
  odd15.participants.memberIds.push('15');
  const withGuest = pairedDraft(3, { formatKey: 'round_robin', config: {} });
  withGuest.participants.guests = [{ clientRef: 'g_abcdef12', displayName: 'Khách Một' }];
  withGuest.participants.memberIds = withGuest.participants.memberIds.slice(0, 5);
  withGuest.pairs[2] = { pairId: 'pair_03', participantRefs: ['member:5', 'guest:g_abcdef12'] };
  return [
    ...DRAFT_FIXTURES,
    gk14,
    { ...gk14, pairs: gk14.pairs.slice(0, 6) },
    { ...gk14, format: { formatKey: 'group_knockout', config: { ...GK.config, thirdPlaceEnabled: true } } },
    odd15,
    withGuest,
    drawn(5, { formatKey: 'round_robin', config: {} }, 'seed-rr'),
    drawn(7, { formatKey: 'knockout', config: {} }, 'seed-ko'),
    drawn(8, { formatKey: 'double_elimination', config: {} }, 'seed-de'),
    pairedDraft(2, { formatKey: 'knockout', config: {} }),
  ];
}

function members(n) {
  return new Map(Array.from({ length: n }, (_, i) => [String(i + 1), { name: `TV ${i + 1}`, active: i !== 3, hasAthlete: i !== 5 }]));
}

const CONTEXTS = [
  {},
  { isFormatEnabled: (key) => key !== 'knockout', today: '2026-10-13' },
  { members: members(16), today: '2026-10-20' },
];

module.exports = { drafts, CONTEXTS };
