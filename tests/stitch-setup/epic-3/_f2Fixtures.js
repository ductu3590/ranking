'use strict';
// Fixture dùng chung cho các test F2 (không phải file test). Dòng tournament_clubs đúng cột mà
// loadFriendlyContext chọn (không roster_draft, không invite_token_hash).

const HOST_GROUP = 59;

function roster(memberIds, pairIdPrefix = 'pair_') {
  const pairs = [];
  for (let i = 0; i + 1 < memberIds.length; i += 2) {
    pairs.push({ pairId: `${pairIdPrefix}${pairs.length + 1}`, participantRefs: [`member:${memberIds[i]}`, `member:${memberIds[i + 1]}`], locked: false });
  }
  const memberNames = Object.fromEntries(memberIds.map((id) => [String(id), `Khách ${id}`]));
  return { memberIds: memberIds.map(String), pairs, unpairedRefs: [], memberNames, pairCount: pairs.length };
}

// Dòng CLB khách. status mặc định approved với version 7.
function guestRow(id, clubId, { status = 'approved', version = 7, members = [], quota = null, external = null } = {}) {
  return {
    id,
    group_id: HOST_GROUP,
    tournament_id: 500,
    club_id: external ? null : clubId,
    external_club_id: external,
    invitation_status: status,
    quota,
    version: version + 1,
    roster_submitted: members.length ? roster(members) : null,
    roster_approved_version: status === 'approved' ? version : null,
  };
}

// Bản nháp chủ nhà: `pairCount` cặp từ thành viên 1..2n.
function hostDraft(pairCount, format = { formatKey: 'group_knockout', config: { groupCount: 2, qualifiersPerGroup: 2 } }, extra = {}) {
  const memberIds = Array.from({ length: pairCount * 2 }, (_, i) => String(i + 1));
  const pairs = Array.from({ length: pairCount }, (_, i) => ({ pairId: `h${i + 1}`, participantRefs: [`member:${2 * i + 1}`, `member:${2 * i + 2}`], locked: false }));
  return {
    draftVersion: 3,
    tournament: { name: 'Giao hữu 59', eventDate: '2026-10-12', startTime: '07:30', courtCount: 3, organizerMode: 'friendly' },
    participants: { memberIds, guests: [] },
    pairs,
    unpairedRefs: [],
    format,
    ...extra,
  };
}

const GROUP_NAMES = { 19: 'CLB Test Responsive UI', 20: 'CLB Khách B', 21: 'CLB Khách C' };

module.exports = { HOST_GROUP, roster, guestRow, hostDraft, GROUP_NAMES };
