'use strict';
// Bổ sung sau E1 (yêu cầu người dùng 2026-09-24): gõ được dấu cách ở Bước 1; Bước 3 ghép cặp trước,
// số sân chuyển từ Bước 1 sang Bước 3 kèm gợi ý; chốt giải → "Chờ diễn ra" + Sân 01…N;
// nút nổi bật vào trang điều hành.

const { read, lib, assert, suite } = require('../_harness');
const { initialSaveState, saveReducer } = lib('lib/tournament/setupSaveState.js');
const { toSavePayload, normalizeDraft } = lib('lib/tournament/setupDraftV3.js');
const { suggestCourts } = lib('lib/tournament/courtSuggestion.js');
const { STATUS_LABELS } = lib('lib/tournament/lifecycle.js');

const stepInfo = read('app/giai-dau/v2/setup-v3/steps/StepInfo.js');
const stepFormat = read('app/giai-dau/v2/setup-v3/steps/StepFormatPairing.js');
const finalizeRoute = read('app/api/tournament-v2/setup/finalize/route.js');
const transitionRoute = read('app/api/tournament-v2/match-transition/route.js');
const dashboard = read('app/giai-dau/v2/TournamentV2DashboardClient.js');
const migration = read('database/migrations/109_prepare_tournament_after_finalize.sql');

function typeInto(state, field, text) {
  let next = state;
  for (const char of text) {
    next = saveReducer(next, { type: 'edit', update: (draft) => ({ ...draft, tournament: { ...draft.tournament, [field]: draft.tournament[field] + char } }) });
  }
  return next;
}

suite('epic-2 · bổ sung sau E1', {
  'bước 1: gõ từng phím giữ được dấu cách ở tên, địa điểm, mô tả'() {
    let state = initialSaveState({});
    state = typeInto(state, 'name', 'Giải nội bộ tháng 10');
    state = typeInto(state, 'location', 'Cụm sân CLB');
    state = typeInto(state, 'description', 'Thể lệ: BO3 ');
    assert.equal(state.draft.tournament.name, 'Giải nội bộ tháng 10');
    assert.equal(state.draft.tournament.location, 'Cụm sân CLB');
    assert.equal(state.draft.tournament.description, 'Thể lệ: BO3 ');
  },

  'lưu và đọc lại vẫn cắt khoảng trắng hai đầu'() {
    let state = initialSaveState({});
    state = typeInto(state, 'name', '  Giải A  ');
    assert.equal(toSavePayload(state.draft).tournament.name, 'Giải A');
    assert.equal(normalizeDraft(state.draft).tournament.name, 'Giải A');
  },

  'gợi ý sân: vòng bảng = số bảng; vòng tròn = số trận mỗi lượt; loại trực tiếp = vòng đông nhất'() {
    assert.equal(suggestCourts({ formatKey: 'group_knockout', config: { groupCount: 3 }, pairCount: 9 }).suggested, 3);
    assert.equal(suggestCourts({ formatKey: 'group_knockout', config: { groupCount: 2 }, pairCount: 8 }).suggested, 2);
    assert.equal(suggestCourts({ formatKey: 'round_robin', config: {}, pairCount: 6 }).suggested, 3);
    assert.equal(suggestCourts({ formatKey: 'round_robin', config: {}, pairCount: 5 }).suggested, 2);
    assert.equal(suggestCourts({ formatKey: 'knockout', config: {}, pairCount: 8 }).suggested, 4);
    assert.equal(suggestCourts({ formatKey: 'knockout', config: {}, pairCount: 6 }).suggested, 2);
    assert.equal(suggestCourts({ formatKey: 'double_elimination', config: {}, pairCount: 12 }).suggested, 4);
    assert.equal(suggestCourts({ formatKey: null, config: {}, pairCount: 1 }), null);
    assert.equal(suggestCourts({ formatKey: 'round_robin', config: {}, pairCount: 60 }).suggested, 20, 'không quá 20 sân');
  },

  'gợi ý sân: báo số trận tối đa cùng lúc để cảnh báo sân thừa'() {
    const s = suggestCourts({ formatKey: 'group_knockout', config: { groupCount: 2 }, pairCount: 8 });
    assert.equal(s.maxUseful, 4);
    assert.match(s.reason, /2 bảng/);
  },

  'bước 1 không còn ô số sân; bước 3 có mục số sân + gợi ý'() {
    assert.equal(/courtCount/.test(stepInfo.replace(/^\s*\/\/.*$/gm, '')), false);
    assert.match(stepFormat, /function CourtConfig/);
    assert.match(stepFormat, /suggestCourts\(/);
    assert.match(stepFormat, /Dùng \{suggestion\.suggested\} sân/);
  },

  'bước 3: ghép cặp đứng trước thể thức, số sân đứng cuối'() {
    const body = stepFormat.slice(stepFormat.indexOf('export default function StepFormatPairing'));
    const pairs = body.indexOf('data-section="pairs"');
    const format = body.indexOf('data-section="format"');
    const courts = body.indexOf('<CourtConfig');
    assert.ok(pairs > 0 && format > pairs && courts > format, `pairs=${pairs} format=${format} courts=${courts}`);
  },

  'trạng thái: scheduled = "Chờ diễn ra"'() {
    assert.equal(STATUS_LABELS.scheduled, 'Chờ diễn ra');
    assert.equal(STATUS_LABELS.draft, 'Nháp');
  },

  'chốt giải gọi prepare_tournament_after_finalize SAU RPC chốt và mở mục Điều hành'() {
    const rpc = finalizeRoute.indexOf("db.rpc('finalize_internal_setup_v4'");
    const prepare = finalizeRoute.indexOf("db.rpc('prepare_tournament_after_finalize'");
    assert.ok(rpc > 0 && prepare > rpc);
    assert.match(finalizeRoute, /\?step=control/);
  },

  'migration 109: chỉ thêm, draft → scheduled, Sân 01…N khi chưa có sân, bỏ qua giải 204'() {
    assert.equal(/\b(DROP|TRUNCATE|DELETE)\b/i.test(migration), false);
    assert.match(migration, /SET status = 'scheduled'/);
    assert.match(migration, /IF t\.status = 'draft'/);
    assert.match(migration, /NOT EXISTS \(SELECT 1 FROM public\.tournament_courts/);
    assert.match(migration, /'Sân ' \|\| lpad\(n::text, 2, '0'\)/);
    assert.match(migration, /t\.id <> 204/);
    assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.prepare_tournament_after_finalize\(bigint, bigint\) TO service_role/);
  },

  'gọi trận đầu tiên: scheduled → live có điều kiện'() {
    assert.match(transitionRoute, /update\(\{ status: 'live'/);
    assert.match(transitionRoute, /\.eq\('status', 'scheduled'\)/);
  },

  'danh sách giải: Chờ diễn ra / Đang diễn ra có nút nổi bật "Vào trang điều hành"'() {
    assert.match(dashboard, /tournament\.status === 'scheduled'/);
    assert.equal((dashboard.match(/primaryAction: 'Vào trang điều hành',\s*ops: true/g) || []).length, 2);
    assert.match(dashboard, /v2-tournament-ops/);
    assert.match(read('app/giai-dau/v2/v2.css'), /\.v2-tournament-actions \.v2-tournament-ops \{/);
  },
});
