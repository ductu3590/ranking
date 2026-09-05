// Phase 3 Task 6b: chia sẻ link, xuất ảnh và copy text (kênh Zalo).
// Dữ liệu đầu vào của test được dựng bằng CHÍNH các hàm thật của hệ thống
// (generateSchedule -> buildResolvedMatches -> computeStandings -> buildPublicSnapshot),
// không tự bịa object theo định dạng tưởng tượng.
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const { buildPublicSnapshot } = require('../../lib/tournament/publicSnapshot');
const { generateSchedule, computeStandings } = require('../../lib/tournament/engines/roundRobin');
const { buildResolvedMatches } = require('../../lib/tournament/results');
const simpleMatch = require('../../lib/tournament/match/simple');
const {
  SHARE_TEXT_VERSION,
  SHARE_IMAGE_KINDS,
  SHARE_TEXT_TEMPLATES,
  ShareError,
  isShareableVisibility,
  buildShareUrl,
  buildOpenGraph,
  buildShareText,
  buildShareImageModel,
  renderShareImage,
} = require('../../lib/tournament/share');

const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));

const PRIVATE_MARKERS = ['Ghi chú nội bộ', '0900123456', 'captain@example.com', 'group_id', 'changes_requested'];
function assertNoPrivateData(value, label) {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  for (const marker of PRIVATE_MARKERS) {
    assert(!serialized.includes(marker), `${label} không được chứa dữ liệu riêng tư: ${marker}`);
  }
}

// --- 1. Dựng dữ liệu bằng hàm thật -------------------------------------------------

const tournamentRow = {
  id: 4101,
  group_id: 9,
  public_slug: 'yen-bai-mo-rong-2026',
  name: 'Giải Pickleball Cộng đồng Yên Bái mở rộng 2026',
  description: 'Giải phong trào liên CLB, thi đấu vòng tròn tính điểm.',
  event_date: '2026-10-12',
  status: 'live',
  location: 'Nhà thi đấu Trung tâm Yên Bái',
  entrant_type: 'team',
  visibility: 'public',
  share_settings: { public_phr: false },
  internal_note: 'Ghi chú nội bộ: chờ CLB C chuyển lệ phí',
  contact_phone: '0900123456',
  contact_email: 'captain@example.com',
};

const divisionRows = [
  {
    id: 10, tournament_id: 4101, group_id: 9, name: 'Đôi nam 5.2',
    entrant_type: 'team', play_type: 'team', scoring_scope: 'club',
    competition_status: 'active', registration_status: 'locked',
    eligibility: { note: 'Ghi chú nội bộ: ưu tiên CLB chủ nhà' },
  },
  {
    id: 11, tournament_id: 4101, group_id: 9, name: 'Đôi nữ 4.8',
    entrant_type: 'pair', play_type: 'doubles', scoring_scope: 'athlete',
    competition_status: 'pending', registration_status: 'open',
  },
];

const entryRows = [
  { id: 201, division_id: 10, name: 'CLB Sông Hồng', seed: 1, color: '#e11d48', group_id: 9, internal_note: 'Ghi chú nội bộ: nợ lệ phí' },
  { id: 202, division_id: 10, name: 'CLB Đại Lải & Bạn', seed: 2, color: '#2563eb', group_id: 9 },
  { id: 203, division_id: 10, name: 'CLB Yên Bái', seed: 3, color: '#16a34a', group_id: 9 },
  { id: 204, division_id: 10, name: 'CLB Nghĩa Lộ', seed: 4, color: '#f59e0b', group_id: 9 },
];

const stageRow = {
  id: 50, tournament_id: 4101, division_id: 10, stage_order: 1, name: 'Vòng bảng',
  schedule_format: 'round_robin', match_format: 'simple', status: 'active',
  config: { groupCount: 1, shuffle: false, scoring: { bestOf: 1 } },
};

const engineEntrants = entryRows.map((row) => ({ id: row.id, seed: row.seed }));
const generated = generateSchedule(stageRow, engineEntrants, 7);
assert(generated.length === 6, 'fixture: vòng tròn 4 đội sinh 6 trận');

const matchRows = generated.map((match, index) => ({
  id: 900 + index,
  division_id: 10,
  stage_id: 50,
  round: match.round,
  bracket_slot: match.bracket_slot,
  group_label: match.group_label,
  court: `Sân ${(index % 2) + 1}`,
  match_order: match.order,
  entrant_a_id: match.entrant_a_id,
  entrant_b_id: match.entrant_b_id,
  status: index < 3 ? 'done' : 'pending',
  winner_entrant_id: null,
  parent_match_id: null,
  internal_note: 'Ghi chú nội bộ: trọng tài đổi ca',
}));

const gameRows = [];
for (const match of matchRows) {
  if (match.status !== 'done') continue;
  const offset = match.id % 3;
  gameRows.push({
    match_id: match.id, game_no: 1, kind: 'simple',
    score_a: 11, score_b: 7 + offset, winner_entrant_id: match.entrant_a_id,
  });
}
const gamesByMatchId = {};
for (const game of gameRows) (gamesByMatchId[game.match_id] ||= []).push(game);

const resolved = buildResolvedMatches(matchRows, gamesByMatchId, simpleMatch, { bestOf: 1 });
for (const row of resolved) {
  const target = matchRows.find((match) => match.id === row.id);
  target.winner_entrant_id = row.winner_entrant_id;
}
const standingsRows = computeStandings(stageRow, engineEntrants, resolved);
assert(standingsRows.length === 4 && standingsRows[0].rank === 1, 'fixture: computeStandings trả BXH thật');

const snapshot = buildPublicSnapshot({
  tournament: tournamentRow,
  divisions: divisionRows,
  stages: [stageRow],
  entrants: entryRows,
  matches: matchRows,
  games: gameRows,
  standingsByStage: { 50: { schedule_format: 'round_robin', standings: standingsRows } },
});

assert(Array.isArray(snapshot.divisions) && snapshot.divisions.length === 2, 'snapshot công khai có danh sách nội dung');
assert(snapshot.divisions[0].name === 'Đôi nam 5.2', 'nội dung công khai giữ tên hiển thị');
assertNoPrivateData(snapshot, 'public snapshot');

const topName = snapshot.entrants.find((entry) => String(entry.id) === String(standingsRows[0].entrant_id)).name;
const FIXED_NOW = new Date('2026-09-05T03:00:00Z'); // 10:00 giờ Việt Nam
const BASE_URL = 'https://pickhub.vn';

// --- 2. Open Graph ------------------------------------------------------------------

assert.strictEqual(isShareableVisibility('public'), true, 'giải public chia sẻ được');
assert.strictEqual(isShareableVisibility('unlisted'), true, 'giải unlisted chia sẻ được bằng link');
assert.strictEqual(isShareableVisibility('private'), false, 'giải private không chia sẻ được');

const og = buildOpenGraph(snapshot, { baseUrl: BASE_URL });
assert(og.title.includes(tournamentRow.name), 'OG title có tên giải');
assert(typeof og.description === 'string' && og.description.length > 10, 'OG có mô tả ngắn');
assert(og.description.includes('Nhà thi đấu Trung tâm Yên Bái'), 'OG mô tả có địa điểm công khai');
assert(og.image && typeof og.image.url === 'string' && og.image.url.length > 0, 'OG có ảnh');
assert(og.image.source === 'generated', 'chưa có poster thì dùng ảnh tự sinh');
assert(og.url === `${BASE_URL}/giai-dau/v2/yen-bai-mo-rong-2026`, 'OG url resolve bằng public_slug toàn hệ thống');
assert(og.robots.index === true, 'giải public cho index');
assertNoPrivateData(og, 'openGraph');

const ogDivision = buildOpenGraph(snapshot, { baseUrl: BASE_URL, divisionId: 11 });
assert(ogDivision.title.includes('Đôi nữ 4.8'), 'OG theo division có tên nội dung');
assert(ogDivision.url === `${BASE_URL}/giai-dau/v2/yen-bai-mo-rong-2026/noi-dung/11`, 'OG division dùng link riêng');
assert(ogDivision.image.url.includes('division=11'), 'ảnh OG của division truyền division');

const posterSnapshot = buildPublicSnapshot({
  ...{ tournament: { ...tournamentRow, share_settings: { poster_url: 'https://cdn.pickhub.vn/poster.png' } } },
  divisions: divisionRows,
  stages: [stageRow],
  entrants: entryRows,
  matches: matchRows,
  games: gameRows,
  standingsByStage: {},
});
const ogPoster = buildOpenGraph(posterSnapshot, { baseUrl: BASE_URL });
assert.strictEqual(ogPoster.image.url, 'https://cdn.pickhub.vn/poster.png', 'có poster thì OG dùng poster');
assert.strictEqual(ogPoster.image.source, 'poster', 'nguồn ảnh OG là poster');

const unlistedSnapshot = buildPublicSnapshot({
  tournament: { ...tournamentRow, visibility: 'unlisted' },
  divisions: divisionRows, stages: [stageRow], entrants: entryRows,
  matches: matchRows, games: gameRows, standingsByStage: {},
});
assert.strictEqual(buildOpenGraph(unlistedSnapshot, { baseUrl: BASE_URL }).robots.index, false, 'giải unlisted không cho index');

const privateSnapshot = buildPublicSnapshot({
  tournament: { ...tournamentRow, visibility: 'private' },
  divisions: divisionRows, stages: [stageRow], entrants: entryRows,
  matches: matchRows, games: gameRows, standingsByStage: {},
});
assert.throws(
  () => buildOpenGraph(privateSnapshot, { baseUrl: BASE_URL }),
  (error) => error instanceof ShareError && error.code === 'SHARE_NOT_PUBLIC',
  'giải private không dựng được Open Graph',
);
assert.strictEqual(buildShareUrl(snapshot, { baseUrl: BASE_URL, divisionId: 10 }), `${BASE_URL}/giai-dau/v2/yen-bai-mo-rong-2026/noi-dung/10`, 'link chia sẻ theo nội dung');

// --- 3. Copy text ---------------------------------------------------------------------

assert.deepStrictEqual(SHARE_TEXT_TEMPLATES.slice().sort(), ['call_to_court', 'result', 'schedule'], 'ba template thông báo');

const scheduleText = buildShareText(snapshot, 'schedule', { stageId: 50, now: FIXED_NOW });
assert.strictEqual(scheduleText.version, SHARE_TEXT_VERSION, 'text template có version');
assert.strictEqual(scheduleText.template, 'schedule', 'trả đúng template');
assert(scheduleText.text.includes(tournamentRow.name), 'thông báo lịch có tên giải');
assert(scheduleText.text.includes('Vòng bảng'), 'thông báo lịch có tên giai đoạn');
const pendingMatch = matchRows.find((match) => match.status === 'pending');
const pendingA = snapshot.entrants.find((entry) => String(entry.id) === String(pendingMatch.entrant_a_id)).name;
assert(scheduleText.text.includes(pendingA), 'thông báo lịch có tên đội của trận chưa đấu');
assert(scheduleText.text.includes(pendingMatch.court), 'thông báo lịch có sân');
assertNoPrivateData(scheduleText.text, 'text lịch thi đấu');

const resultText = buildShareText(snapshot, 'result', { stageId: 50, now: FIXED_NOW });
const doneMatch = matchRows.find((match) => match.status === 'done');
const doneGame = gamesByMatchId[doneMatch.id][0];
assert(resultText.text.includes(`${doneGame.score_a}-${doneGame.score_b}`), 'thông báo kết quả có tỉ số từng ván thật');
assert(resultText.text.includes(topName), 'thông báo kết quả có tên đội đã thi đấu');
assertNoPrivateData(resultText.text, 'text kết quả');

const callText = buildShareText(snapshot, 'call_to_court', { matchIds: [pendingMatch.id], now: FIXED_NOW });
assert(callText.text.includes(pendingA), 'gọi vào sân có tên đội');
assert(callText.text.includes(pendingMatch.court), 'gọi vào sân có số sân');
assert(Array.isArray(callText.lines) && callText.lines.length > 0, 'text trả về theo dòng để BTC sửa trước khi copy');
assertNoPrivateData(callText.text, 'text gọi vào sân');

assert.throws(
  () => buildShareText(snapshot, 'khong_ton_tai', {}),
  (error) => error instanceof ShareError && error.code === 'SHARE_UNKNOWN_TEMPLATE',
  'template lạ bị từ chối',
);
assert.throws(
  () => buildShareText(privateSnapshot, 'schedule', {}),
  (error) => error instanceof ShareError && error.code === 'SHARE_NOT_PUBLIC',
  'giải private không copy được thông báo',
);

// --- 4. Xuất ảnh ------------------------------------------------------------------------

assert.deepStrictEqual(
  SHARE_IMAGE_KINDS.slice().sort(),
  ['card', 'draw', 'honors', 'results', 'schedule_club', 'schedule_court', 'standings'].sort(),
  'đủ các loại ảnh theo mục 17.2',
);

const standingsImage = renderShareImage(snapshot, 'standings', { stageId: 50, now: FIXED_NOW });
assert.strictEqual(standingsImage.contentType, 'image/svg+xml', 'ảnh chia sẻ render server-side dạng vector');
assert(standingsImage.svg.startsWith('<svg'), 'render ra SVG hợp lệ');
assert(standingsImage.height > standingsImage.width, 'ảnh xuất theo màn hình dọc điện thoại');
assert(standingsImage.svg.includes(topName.replace('&', '&amp;')), 'ảnh BXH có tên đội đứng đầu lấy từ computeStandings');
assert(standingsImage.svg.includes(tournamentRow.name), 'watermark có tên giải');
assert(standingsImage.svg.includes('05/09/2026 10:00'), 'watermark có thời điểm xuất theo giờ Việt Nam');
assert(standingsImage.filename.endsWith('.png'), 'tên file tải về là PNG');
assertNoPrivateData(standingsImage.svg, 'ảnh bảng xếp hạng');

const ampersandEntry = snapshot.entrants.find((entry) => entry.name.includes('&'));
assert(ampersandEntry, 'fixture có tên chứa ký tự cần escape');
assert(standingsImage.svg.includes(ampersandEntry.name.replace('&', '&amp;')), 'SVG escape ký tự & thành &amp;');
assert(!standingsImage.svg.includes(ampersandEntry.name), 'SVG không nhả thẳng ký tự & chưa escape');

for (const kind of SHARE_IMAGE_KINDS) {
  const image = renderShareImage(snapshot, kind, { stageId: 50, divisionId: 10, now: FIXED_NOW });
  assert(image.svg.includes('<svg') && image.svg.includes('</svg>'), `kind ${kind} render được`);
  assert(image.model && Array.isArray(image.model.blocks), `kind ${kind} có model dựng từ projection công khai`);
  assertNoPrivateData(image.svg, `ảnh ${kind}`);
}

const cardImage = renderShareImage(snapshot, 'card', { now: FIXED_NOW });
assert(cardImage.width === 1200 && cardImage.height === 630, 'ảnh OG mặc định đúng tỉ lệ card');
assert(cardImage.svg.includes('Nhà thi đấu Trung tâm Yên Bái') && cardImage.svg.includes('12/10/2026'), 'ảnh OG mặc định có địa điểm và ngày');

const cardWithLogo = renderShareImage(snapshot, 'card', { now: FIXED_NOW, host: { name: 'CLB Yên Bái', logo_url: 'data:image/png;base64,AAAA' } });
assert(cardWithLogo.svg.includes('data:image/png;base64,AAAA'), 'ảnh OG mặc định nhúng logo CLB chủ giải');
assert(cardWithLogo.svg.includes('CLB Yên Bái'), 'ảnh OG mặc định có tên CLB chủ giải');

assert.throws(
  () => renderShareImage(privateSnapshot, 'standings', { stageId: 50 }),
  (error) => error instanceof ShareError && error.code === 'SHARE_NOT_PUBLIC',
  'giải private không xuất được ảnh',
);
assert.throws(
  () => renderShareImage(snapshot, 'khong_ton_tai', {}),
  (error) => error instanceof ShareError && error.code === 'SHARE_UNKNOWN_KIND',
  'loại ảnh lạ bị từ chối',
);

const model = buildShareImageModel(snapshot, 'schedule_court', { stageId: 50, now: FIXED_NOW });
assert(model.blocks.some((block) => JSON.stringify(block).includes('Sân 1')), 'lịch theo sân gom theo sân');
const clubModel = buildShareImageModel(snapshot, 'schedule_club', { stageId: 50, now: FIXED_NOW });
assert(clubModel.blocks.some((block) => JSON.stringify(block).includes(topName)), 'lịch theo CLB gom theo đội/CLB');

// --- 5. Domain thuần ---------------------------------------------------------------------

const shareSource = read('lib/tournament/share.js');
assert(!/require\(['"](react|next|@\/lib\/supabase)/.test(shareSource), 'domain share.js không import React/Next/Supabase');
assert(!shareSource.includes('supabase'), 'domain share.js không chạm Supabase');

// --- 6. Nối dây route và UI ----------------------------------------------------------------

const shareImageRoute = 'app/api/tournament-v2/public/share-image/route.js';
assert(exists(shareImageRoute), 'route ảnh chia sẻ tồn tại');
const shareImageSource = read(shareImageRoute);
assert(shareImageSource.includes('renderShareImage'), 'route ảnh gọi domain renderShareImage');
assert(!shareImageSource.includes('requireGroupAdmin'), 'route ảnh là public read');
assert(!shareImageSource.includes('getEffectiveGroupContext'), 'route ảnh không phụ thuộc cookie group');
assert(shareImageSource.includes('public_slug'), 'route ảnh resolve bằng slug toàn hệ thống');

assert(exists('app/giai-dau/v2/[slug]/opengraph-image.js'), 'route ảnh Open Graph mặc định tồn tại');
const ogImageSource = read('app/giai-dau/v2/[slug]/opengraph-image.js');
assert(ogImageSource.includes('logo_url'), 'ảnh OG mặc định dùng logo CLB chủ giải');

const metadataFiles = ['app/giai-dau/v2/[slug]/layout.js', 'app/giai-dau/v2/[slug]/noi-dung/[division]/page.js'];
for (const file of metadataFiles) {
  assert(exists(file), `${file} tồn tại`);
  const source = read(file);
  assert(source.includes('generateMetadata'), `${file} export generateMetadata`);
  assert(source.includes('buildPublicMetadata'), `${file} dựng metadata từ public projection`);
  assert(source.includes('loadPublicShareData'), `${file} resolve giải bằng slug toàn hệ thống`);
}
const shareMetadataSource = read('app/giai-dau/v2/[slug]/shareMetadata.js');
assert(shareMetadataSource.includes('buildOpenGraph'), 'metadata helper dùng buildOpenGraph của domain');
assert(shareMetadataSource.includes('robots'), 'metadata tôn trọng visibility qua robots');
const divisionPage = read('app/giai-dau/v2/[slug]/noi-dung/[division]/page.js');
assert(divisionPage.includes('divisionId'), 'trang nội dung dựng metadata theo division');

const shareActions = 'app/giai-dau/v2/ShareActions.js';
assert(exists(shareActions), 'component chia sẻ tồn tại');
const shareActionsSource = read(shareActions);
assert(shareActionsSource.includes('Xuất ảnh'), 'có nút Xuất ảnh');
assert(shareActionsSource.includes('Sao chép thông báo'), 'có nút Sao chép thông báo');
assert(shareActionsSource.includes('Sao chép link'), 'có nút sao chép link');
assert(shareActionsSource.includes('textarea'), 'thông báo sửa được trước khi copy');
assert(shareActionsSource.includes('buildShareText'), 'dùng template text có version từ domain');

const canvasSource = read('app/giai-dau/v2/shareCanvas.js');
assert(canvasSource.includes("'image/png'") || canvasSource.includes('"image/png"'), 'xuất ảnh ra PNG');

const publicPage = read('app/giai-dau/v2/[slug]/page.js');
assert(publicPage.includes('ShareActions'), 'trang công khai có hành động chia sẻ');
const overview = read('app/giai-dau/v2/console/tabs/OverviewTab.js');
assert(overview.includes('ShareActions'), 'console BTC có hành động chia sẻ');

console.log('phase3 share ok');
