'use strict';
// Epic 4 · C3 — hợp đồng route setup giải cộng đồng (spec lat-c3 §2, D62): admin hệ thống đi qua CÙNG pipeline setup của giải CLB,
// phiên CLB giữ nguyên, quyền chỉ mở với giải cộng đồng, không lộ dữ liệu cá nhân. Đọc mã nguồn.

const { assert, read, exists, suite } = require('../_harness');

const norm = (text) => text.replace(/\r\n?/g, '\n');
const src = (file) => (exists(file) ? norm(read(file)) : '');

const setup = src('app/api/tournament-v2/setup/route.js');
const finalize = src('app/api/tournament-v2/setup/finalize/route.js');
const preview = src('app/api/tournament-v2/preview-schedule/route.js');
const games = src('app/api/tournament-v2/games/route.js');
const server = src('lib/communitySetupServer.js');
const setupServer = src('lib/tournament/setupServer.js');

suite('C3 cổng quyền setup giải cộng đồng', {
  'admin hệ thống ưu tiên trên giải cộng đồng, phiên CLB giữ nguyên cho giải khác': () => {
    for (const [name, code] of [['setup', setup], ['finalize', finalize], ['preview-schedule', preview], ['games', games]]) {
      assert.ok(code.includes('await requireValidatedGroupAdmin()'), `${name}: phải giữ guard phiên CLB`);
      // Giải cộng đồng ưu tiên phiên admin hệ thống (người dùng có thể đang mở cả phiên CLB); null → phiên CLB đi đường cũ.
      assert.ok(/\(await community(Setup|Score)Admin\([^)]*\)\) \|\| await requireValidatedGroupAdmin\(\)/.test(code), `${name}: cổng cộng đồng trước, rồi mới guard CLB`);
    }
  },
  'communitySetupAdmin chỉ cấp cho platform actor trên giải cộng đồng': () => {
    assert.ok(/requireTournamentAccess\(\{ tournamentId: id, need: 'write' \}\)/.test(server));
    assert.ok(/access\.actorKind !== 'platform'/.test(server));
    assert.ok(/organizer_type !== 'community'/.test(server));
    assert.ok(/return null;/.test(server));
  },
  'ghi tỉ số: suy giải từ trận rồi cùng cổng quyền': () => {
    assert.ok(/from\('tournament_matches'\)\.select\('id, division_id'\)/.test(server));
    assert.ok(/requireTournamentAccess\(\{ divisionId: match\.division_id, need: 'write' \}\)/.test(server));
    assert.ok(games.includes("communityScoreAdmin(matchId)"));
    // Link ghi điểm của trọng tài vẫn hoạt động y như cũ.
    assert.ok(games.includes('body?.scorekeeper_token'));
  },
  'không đọc SĐT / ngày sinh trong loader setup cộng đồng': () => {
    assert.ok(!/phone|\bdob\b|contact_phone/i.test(server.replace(/\/\/.*$/gm, '')), 'loader không được select SĐT/ngày sinh');
    const select = server.match(/\.select\('registration_id, seat, player_account_id, full_name, self_declared_phr'\)/);
    assert.ok(select, 'chỉ chọn tên + PHR + tài khoản ở ghế');
  },
});

suite('C3 setup route', {
  'chỉ cho phép save_aggregate / unseed / configure_top_two với giải cộng đồng và bắt buộc có id giải': () => {
    assert.ok(/adminCheck\.community && \(!\['save_aggregate', 'unseed_playoff', 'configure_top_two_playoff'\]\.includes\(action\) \|\| !hasTournamentId\)/.test(setup));
    assert.ok(setup.includes("code: 'COMMUNITY_ACTION_NOT_ALLOWED'") && setup.includes('status: 403'));
  },
  'GET trả khối community đã chiếu (không SĐT) và tính bước theo cặp đã duyệt': () => {
    assert.ok(setup.includes('loadCommunitySetup('));
    assert.ok(setup.includes('projectCommunityView(community)'));
    assert.ok(/buildSetupView\(db, groupId, applyCommunityTournamentMeta\(division\.setup_draft, community\.meta\), \{ friendly, community \}\)/.test(setup), 'Bước 1 được điền sẵn từ bản ghi giải');
    assert.ok(/buildSetupView\(db, groupId, division\.setup_draft, \{ friendly \}\)/.test(setup), 'nhánh giải CLB / giao hữu không đổi');
  },
  'lưu bản nháp nạp ctx.community để progress do server tính': () => {
    assert.ok(/if \(community\) ctx = \{ \.\.\.ctx, community \};/.test(setup));
  },
  'setupContext nhận community mà không đổi shape khi vắng': () => {
    assert.ok(/\{ friendly = null, community = null \} = \{\}/.test(setupServer));
    assert.ok(/\.\.\.\(community \? \{ community \} : \{\}\)/.test(setupServer));
  },
});

suite('C3 preview + finalize', {
  'bốc thăm dùng cặp đã duyệt và chặn chọn người ở Bước 3': () => {
    assert.ok(preview.includes('loadCommunitySetup('));
    assert.ok(/const pairs = community \? community\.approvedPairs : effectivePairs\(draft, friendly\)/.test(preview));
    assert.ok(preview.includes('if (community) ctx.community = community;'));
    // Không rải theo CLB: entryClubs chỉ dựng cho giao hữu.
    assert.ok(/\.\.\.\(friendly \? \{ entryClubs: entryClubs\(pairs\) \} : \{\}\)/.test(preview));
  },
  'chốt: tính lại plan trên server từ cặp đã duyệt, p_plan.pairs = { pairId, refs } từ DB': () => {
    assert.ok(finalize.includes('loadCommunitySetup('));
    assert.ok(finalize.includes('if (community) ctx.community = community;'));
    assert.ok(/const pairs = community \? community\.approvedPairs : effectivePairs\(draft, friendly\)/.test(finalize));
    assert.ok(finalize.includes('p_plan: finalizePlanPayload({ plan, pairs, friendly })'), 'p_plan.pairs = { pairId, refs } từ cặp đã duyệt trên server');
    assert.ok(/ORGANIZER_MODE_LOCKED/.test(finalize), 'giữ khóa chế độ');
  },
  'mã lỗi cộng đồng của RPC được map (không rơi vào FINALIZE_NOT_ATOMIC)': () => {
    for (const code of ['COMMUNITY_MEMBER_PICK_NOT_ALLOWED', 'COMMUNITY_ROSTER_CHANGED', 'COMMUNITY_TOO_FEW_PAIRS']) {
      assert.ok(finalize.includes(`'${code}'`), `finalize thiếu ${code}`);
    }
  },
  'giải giao hữu / CLB không đổi: vẫn gọi finalizePlanPayload và publishFriendlyTournament': () => {
    assert.ok(finalize.includes('finalizePlanPayload({ plan, pairs, friendly })'));
    assert.ok(finalize.includes('publishFriendlyTournament('));
  },
});
