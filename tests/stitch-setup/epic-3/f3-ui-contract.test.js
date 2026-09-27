'use strict';
// Epic 3 F3 — hợp đồng giao diện giải giao hữu liên CLB (spec lat-f3-giao-dien.md §8; ADR-007 D46–D53).
// Đọc mã nguồn (như epic-2/ui-contract) + chạy thật các module thuần (ngữ cảnh readiness phía client, nhóm lời mời).

const fs = require('node:fs');
const path = require('node:path');
const { assert, read, exists, lib, ROOT, suite } = require('../_harness');

const src = (file) => read(file).replace(/\r\n?/g, '\n');

const SETUP = 'app/giai-dau/v2/setup-v3';
const NEW_UI = [
  `${SETUP}/friendly/FriendlyClubsPanel.js`,
  `${SETUP}/friendly/InviteClubSheet.js`,
  `${SETUP}/friendly/InviteLinkDialog.js`,
  `${SETUP}/friendly/RegistrationWindowCard.js`,
  `${SETUP}/friendly/ClubReviewSheet.js`,
  `${SETUP}/friendly/FriendlyGuestPairs.js`,
  `${SETUP}/friendly/FriendlyDrawGate.js`,
  `${SETUP}/friendly/FinalizedLinkDialog.js`,
  `${SETUP}/friendly/friendlyContext.js`,
  `${SETUP}/friendly/friendlyUi.js`,
  'app/giai-dau/v2/console/friendly/ClubChip.js',
  'app/giai-dau/v2/console/friendly/ClubStandingsCard.js',
  'app/giai-dau/moi/[token]/page.js',
  'app/giai-dau/moi/[token]/InviteLinkClient.js',
  'app/giai-dau/loi-moi/page.js',
  'app/giai-dau/loi-moi/InvitationsClient.js',
  'app/giai-dau/loi-moi/AdminRequired.js',
  'app/giai-dau/loi-moi/liShared.js',
  'app/giai-dau/loi-moi/invitationGroups.js',
  'app/giai-dau/loi-moi/[id]/page.js',
  'app/giai-dau/loi-moi/[id]/InvitationDetailClient.js',
  'app/giai-dau/loi-moi/[id]/GuestRosterEditor.js',
];
const NEW_CSS = {
  [`${SETUP}/friendly/friendly.css`]: 'fr-',
  'app/giai-dau/v2/console/friendly/friendly-standings.css': 'fr-',
  'app/giai-dau/loi-moi/loi-moi.css': 'li-',
};

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

// Chuỗi người dùng thấy: văn bản JSX + chuỗi có dấu tiếng Việt hoặc có khoảng trắng (câu), không tính mã/đường dẫn.
function shownStrings(raw) {
  const text = stripComments(raw);
  const jsx = [...text.matchAll(/>([^<>{}]+)</g)].map((m) => m[1]).filter((chunk) => !/[=;()]/.test(chunk));
  const literals = [...text.matchAll(/'([^'\n]*)'|`([^`]*)`/g)].map((m) => m[1] ?? m[2])
    .filter((value) => /[À-ỹ]/.test(value) || (/\s/.test(value) && !/^[\w@./-]+$/.test(value) && !/^[a-z-]+( [a-z-]+)*$/.test(value)));
  return jsx.concat(literals).join('\n');
}

// Nạp module ESM thuần (không JSX) để chạy thật trong node: đổi import thành require.
function loadEsm(file) {
  let code = src(file);
  code = code.replace(/import\s*\{([^}]+)\}\s*from\s*'@\/([^']+)';/g, (all, names, rel) => `const {${names}} = require(${JSON.stringify(path.join(ROOT, rel))});`);
  const exported = [...code.matchAll(/export\s+(?:const|function)\s+(\w+)/g)].map((m) => m[1]);
  code = code.replace(/export\s+(const|function)/g, '$1');
  code += `\nmodule.exports = { ${exported.join(', ')} };`;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', code)(require, mod, mod.exports);
  return mod.exports;
}

suite('f3 ui contract — tệp, route, ranh giới dữ liệu', {
  'đủ file mới theo spec F3 §2 (route mở link, hộp lời mời, chi tiết lời mời, khu CLB tham dự, BXH CLB)'() {
    for (const file of [...NEW_UI, ...Object.keys(NEW_CSS)]) assert.ok(exists(file), `thiếu ${file}`);
  },

  'không file UI mới nào gọi Supabase; mọi gọi API giải đấu đi qua lib/tournamentV2Client'() {
    for (const file of NEW_UI) {
      const text = src(file);
      assert.equal(/@supabase|supabaseAdmin|supabaseClient|supabaseServer|\.from\('/.test(text), false, `${file} chạm Supabase`);
      assert.equal(/fetch\([^)]*tournament-v2/.test(text), false, `${file} gọi thẳng /api/tournament-v2`);
    }
    const linkClient = src('app/giai-dau/moi/[token]/InviteLinkClient.js');
    assert.ok(linkClient.includes("import { resolveInviteLink } from '@/lib/tournamentV2Client'"));
  },

  'trang link mời: chưa có phiên CLB → redirect đăng nhập CLB kèm next; không đọc giải ở server'() {
    const page = src('app/giai-dau/moi/[token]/page.js');
    assert.ok(page.includes('getValidatedGroupSessionFromCookies()'));
    assert.ok(/if \(!session\) redirect\(inviteLoginPath\(token\)\);/.test(page));
    assert.equal(/tournament|hostClub|supabase/i.test(page.replace(/\/\/.*$/gm, '').replace(/@\/lib\/tournament\/friendlyInviteLink/, '')), false);
    const L = lib('lib/tournament/friendlyInviteLink.js');
    const token = 'A'.repeat(43);
    assert.equal(L.inviteLoginPath(token), `/?dang-nhap=clb&next=${encodeURIComponent(`/giai-dau/moi/${token}`)}`);
  },

  'nhánh sai CLB chỉ hiện tên CLB của phiên — client link mời không đọc/hiện tournament, hostClub'() {
    const client = stripComments(src('app/giai-dau/moi/[token]/InviteLinkClient.js'));
    assert.ok(client.includes("'FRIENDLY_INVITE_WRONG_CLUB'") && client.includes('currentClubName'));
    assert.equal(/\btournament\b|hostClub/.test(client), false, 'client link mời không chạm dữ liệu giải');
    const branch = client.slice(client.indexOf("state.kind === 'wrong-club'"), client.indexOf("state.kind === 'admin-required'"));
    assert.ok(branch.includes('Link mời này dành cho một CLB khác') && branch.includes('Bạn đang đăng nhập'));
    for (const text of ['Cần tài khoản quản trị CLB để trả lời lời mời', 'Link mời không hợp lệ hoặc đã bị thu hồi', 'Đăng ký của giải này đã đóng', 'Xem lời mời', 'Mở hộp lời mời']) {
      assert.ok(client.includes(text), `thiếu trạng thái "${text}"`);
    }
    assert.ok(client.includes('router.replace(`/giai-dau/loi-moi/${encodeURIComponent(result.invitationId)}`)'), 'hợp lệ → chuyển tới chi tiết lời mời');
  },

  'hộp lời mời + chi tiết: gate phiên CLB ở server, thành viên thường thấy "cần quyền quản trị"'() {
    for (const file of ['app/giai-dau/loi-moi/page.js', 'app/giai-dau/loi-moi/[id]/page.js']) {
      const page = src(file);
      assert.ok(page.includes('getValidatedGroupSessionFromCookies()'), file);
      assert.ok(page.includes('redirect(`/?dang-nhap=clb&next=${encodeURIComponent('), `${file}: đăng nhập rồi quay lại`);
      assert.ok(page.includes("session.role !== 'admin'") && page.includes('<AdminRequired'), file);
    }
  },

  'app/page.js: ?dang-nhap=clb mở hộp đăng nhập CLB; next chỉ qua safeNextPath (không push next thô)'() {
    const page = src('app/page.js');
    assert.ok(page.includes("import { safeNextPath } from '@/lib/tournament/inviteNextPath'"));
    assert.ok(page.includes("params.get('dang-nhap') === 'clb'") && page.includes("setLoginNext(safeNextPath(params.get('next')))"));
    assert.ok(page.includes("router.push(loginNext || data.redirectTo || '/quy')"));
    assert.equal(/router\.push\(\s*(params\.get|next\b)/.test(page), false);
    assert.ok(page.includes('Đăng nhập để mở lời mời giải'));
    const nextLib = src('lib/tournament/inviteNextPath.js');
    assert.equal(/require\(['"](node:)?crypto['"]\)/.test(nextLib), false, 'module client import được, không kéo crypto');
    const { safeNextPath } = lib('lib/tournament/inviteNextPath.js');
    assert.equal(lib('lib/tournament/friendlyInviteLink.js').safeNextPath, safeNextPath, 'một nguồn duy nhất');
    for (const bad of ['//evil.example', 'https://evil.example', '/giai-dau/v2', '/giai-dau/moi/../../x', null]) assert.equal(safeNextPath(bad), null, String(bad));
    assert.equal(safeNextPath('/giai-dau/loi-moi/12'), '/giai-dau/loi-moi/12');
  },

  'chuông: giữ nguyên đường giao dịch "Gán cho thành viên"; mục giải đấu theo display + biểu tượng cúp'() {
    const bell = src('components/pickhub/PhNotificationBell.js');
    assert.ok(bell.includes("item.kind === 'unassigned_transaction'") && bell.includes('Gán cho thành viên') && bell.includes('đ chưa rõ người nộp'));
    assert.ok(bell.includes('display?.title') && bell.includes('href={display.href}') && bell.includes('display.actionLabel'));
    assert.ok(bell.includes("new Set(['tournament_invitation', 'tournament_roster_review'])"));
    assert.equal(/Đánh dấu đã đọc|Cài đặt thông báo/.test(bell), false, 'không thêm tính năng Stitch tự vẽ');
  },
});

suite('f3 ui contract — chủ nhà (dashboard, wizard, D46/D49/D51/D52)', {
  'dashboard: nút "Tạo giải giao hữu" (?create=friendly), thẻ nháp giao hữu có dòng lời mời, lối vào hộp lời mời'() {
    const dash = src('app/giai-dau/v2/TournamentV2DashboardClient.js');
    assert.ok(dash.includes("createMode === 'internal' || createMode === 'friendly'"));
    assert.ok(dash.includes("setCreateMode('friendly')") && dash.includes('Tạo giải giao hữu') && dash.includes('Tạo giải nội bộ'));
    assert.ok(dash.includes('create=internal') && dash.includes('create=friendly'), 'mở lại bản nháp đúng chế độ');
    assert.ok(dash.includes("t.status === 'draft' && t.organizer_mode === 'friendly'") && dash.includes('listFriendlyClubs(t.id)'));
    assert.ok(dash.includes('`Chờ ${name} phản hồi`') && dash.includes('`Cần bạn duyệt danh sách ${name}`'), 'dòng trạng thái lời mời D52');
    assert.ok(dash.includes('href="/giai-dau/loi-moi"') && dash.includes('Lời mời giải giao hữu') && dash.includes('needActionCount(invitations)'));
    const wizard = src('app/giai-dau/v2/TournamentWizard.js');
    assert.ok(wizard.includes("searchParams.get('create') === 'friendly' ? 'friendly' : 'internal'") && wizard.includes('organizerMode={organizerMode}'));
  },

  'Bước 1: ô "Loại giải" hai lựa chọn; sau lần lưu đầu chỉ đọc với câu ORGANIZER_MODE_LOCKED'() {
    const info = src(`${SETUP}/steps/StepInfo.js`);
    assert.ok(info.includes("title: 'Nội bộ CLB'") && info.includes("title: 'Giao hữu liên CLB'") && info.includes("desc: 'Mời CLB khác gửi cặp'"));
    assert.ok(info.includes("messageFor('ORGANIZER_MODE_LOCKED').text") && info.includes('role="radiogroup"'));
    const studio = src(`${SETUP}/SetupStudio.js`);
    assert.ok(studio.includes('modeLocked={Boolean(save.tournamentId)}'));
    assert.ok(studio.includes("create: isFriendly ? 'friendly' : 'internal'"), 'URL giữ đúng chế độ');
    const hook = src(`${SETUP}/useSetupStudio.js`);
    assert.ok(hook.includes("organizerMode: 'friendly'") && hook.includes('blankDraft(organizerMode)'), 'bản nháp mới mang organizerMode từ ?create=');
    assert.ok(hook.includes('clientFriendlyContext(friendly)') && hook.includes('friendly: friendlyCtx'), 'readiness client tính trên cặp hiệu lực');
    assert.ok(src('lib/tournamentV2Client.js').includes('{ ...data.setup, friendly: data.friendly }'), 'giữ khối friendly của GET /setup');
  },

  'D49: giải giao hữu ẩn khu "Khách mời" ở Bước 2; nháp cũ còn khách → blocker + nút xoá'() {
    const step = src(`${SETUP}/steps/StepParticipants.js`);
    const branch = step.indexOf('{isFriendly ? (');
    const panel = step.indexOf('<FriendlyClubsPanel', branch);
    const elseAt = step.indexOf(') : (', panel);
    const addGuest = step.indexOf('Thêm khách mời</button>');
    assert.ok(branch > 0 && panel > branch && elseAt > panel && addGuest > elseAt, 'nút "Thêm khách mời" chỉ ở nhánh giải nội bộ');
    assert.ok(step.includes("messageFor('FRIENDLY_HOST_GUEST_NOT_ALLOWED'") && step.includes('onClear={() => setGuests([])}'));
  },

  'D46: nút "Mời CLB" khoá theo limit.reached của server + câu gói trả phí (không so số cứng)'() {
    const panel = src(`${SETUP}/friendly/FriendlyClubsPanel.js`);
    assert.ok(panel.includes('const limitReached = Boolean(limit?.reached);'));
    assert.ok(panel.includes('disabled={!data || limitReached}') && panel.includes('Mời CLB'));
    assert.ok(panel.includes('{limit.upgradeHint}') && panel.includes('tối đa {limit.max} CLB khách'), 'câu hạn mức lấy max/upgradeHint từ API');
    assert.equal(/(used|max|length)\s*[<>=]==?\s*1\b|[<>]=?\s*1\s*\)/.test(stripComments(panel)), false, 'không so hạn mức với số 1 cứng');
    assert.ok(panel.includes('Đã mời {limit.used}/{limit.max} CLB khách'));
    const sheet = src(`${SETUP}/friendly/InviteClubSheet.js`);
    assert.ok(sheet.includes("code === 'FRIENDLY_CLUB_LIMIT_REACHED'") && sheet.includes('onLimitReached'), 'đua 409 → đóng sheet, tải lại');
  },

  'sheet "Mời CLB": không có dòng "Đã mời · Chờ phản hồi" (ADR-007 D52), CLB đang mời bị lọc khỏi danh sách'() {
    const sheet = src(`${SETUP}/friendly/InviteClubSheet.js`);
    assert.equal(sheet.includes('Đã mời · Chờ phản hồi'), false);
    assert.ok(sheet.includes('.filter((club) => !ACTIVE.includes(club.invitation?.status))'));
    assert.ok(sheet.includes('placeholder="Tìm CLB theo tên"') && sheet.includes('useState(4)') && sheet.includes('NOTE_MAX = 500'));
  },

  'link mời: chỉ trong state dialog — không lưu vào storage/cookie/URL; tạo link mới có xác nhận'() {
    const dialog = src(`${SETUP}/friendly/InviteLinkDialog.js`);
    assert.equal(/localStorage|sessionStorage|document\.cookie|history\.|router\./.test(dialog), false);
    assert.ok(dialog.includes("action: 'rotate_link'") && dialog.includes('Link cũ sẽ hết hiệu lực ngay'));
    assert.ok(dialog.includes('Link chỉ mở được khi đăng nhập đúng CLB được mời. Link chỉ hiện một lần'));
  },

  'D51: bộ đếm hạn mức dạng "x cặp (tối đa y)", chỉ đỏ khi vượt; không câu "Còn trống…"'() {
    const ui = src(`${SETUP}/friendly/friendlyUi.js`);
    assert.ok(ui.includes('`${count} cặp (tối đa ${quota})`'));
    const editor = src('app/giai-dau/loi-moi/[id]/GuestRosterEditor.js');
    assert.ok(editor.includes('pairCounterText(roster.pairs.length, quota)') && editor.includes('data-over={over || undefined}'));
    const review = src(`${SETUP}/friendly/ClubReviewSheet.js`);
    assert.ok(review.includes('pairCounterText(count, club?.quota)'));
    for (const file of NEW_UI) assert.equal(/Còn trống|phải đủ|cần đủ/.test(src(file)), false, `${file} ngụ ý phải đủ hạn mức`);
  },

  'duyệt danh sách: Duyệt / Yêu cầu sửa (lý do 2–300) / Đổi hạn mức / Rút CLB; xung đột version → Tải lại'() {
    const review = src(`${SETUP}/friendly/ClubReviewSheet.js`);
    assert.ok(review.includes("run('approve')") && review.includes("run('request_changes', { note: trimmed })"));
    assert.ok(review.includes('trimmed.length < NOTE_MIN') && review.includes('NOTE_MAX = 300'));
    assert.ok(review.includes("'FRIENDLY_CLUB_VERSION_CONFLICT'") && review.includes('CLB vừa cập nhật danh sách') && review.includes('Tải lại'));
    assert.ok(review.includes('Sẽ phải bốc thăm lại nếu đã bốc'));
  },

  'Bước 3: nhóm "Cặp CLB khách" chỉ đọc + tổng cặp; blocker CLB có nút "Tới danh sách CLB"'() {
    const guest = src(`${SETUP}/friendly/FriendlyGuestPairs.js`);
    assert.equal(/splitPair|setLocked|createPair/.test(guest), false, 'cặp khách không ghép/tách/khoá');
    assert.ok(guest.includes('Cặp CLB khách chỉ xem, không ghép hay tách được.') && guest.includes('Tới danh sách CLB'));
    assert.ok(guest.includes('của bạn + ${guestPairs.length} của ${guestLabel}'));
    const step3 = src(`${SETUP}/steps/StepFormatPairing.js`);
    assert.ok(step3.includes('<FriendlyGuestPairs') && step3.includes("item.field === 'clubs'"));
  },

  'D52: Bước 4 mở ở dạng chặn khi chỉ còn chờ CLB khách (checklist + về Bước 2); còn lại giữ allowedStep'() {
    const studio = src(`${SETUP}/SetupStudio.js`);
    assert.ok(studio.includes('onlyWaitingForClubs(readiness.byStep[3])'));
    assert.ok(studio.includes('const showGate = isFriendly && step === 4 && save.completedThrough < 3;'));
    assert.ok(studio.includes('<FriendlyDrawGate') && studio.includes('{step === 4 && !showGate ? ('));
    assert.ok(studio.includes('allowedStep(target, completedThrough)'), 'luật bước cũ giữ nguyên');
    const gate = src(`${SETUP}/friendly/FriendlyDrawGate.js`);
    assert.ok(gate.includes("{done ? '✓' : '⏳'}") && gate.includes('Về Bước 2 · CLB tham dự'));
    const panel = src(`${SETUP}/friendly/FriendlyClubsPanel.js`);
    assert.ok(panel.includes('Bạn có thể tiếp tục chuẩn bị cặp của CLB mình trong lúc chờ.'));
  },

  'Bước 4: chip CLB trên cặp, câu "Danh sách CLB khách đã thay đổi…", ghi chú link không liệt kê; D50 hiện link sau chốt'() {
    const draw = src(`${SETUP}/steps/StepDraw.js`);
    assert.ok(draw.includes('<PairLabel pairId={pairId}') && draw.includes('<ClubChip name={club.name} color={club.color} />'));
    assert.ok(draw.includes('Danh sách CLB khách đã thay đổi sau khi bốc thăm.'));
    assert.ok(draw.includes('Giải giao hữu sẽ có link xem không liệt kê để CLB khách theo dõi.'));
    const studio = src(`${SETUP}/SetupStudio.js`);
    assert.ok(studio.includes('if (outcome.result?.publicUrl) setFinalized(outcome.result);') && studio.includes('<FinalizedLinkDialog'));
  },
});

suite('f3 ui contract — CLB khách, BXH CLB (D53), chữ hiển thị, CSS', {
  'đăng ký cặp của CLB khách: chỉ thành viên CLB (không ô khách mời), ghép bằng chạm đúng hai người, không kéo-thả'() {
    const editor = src('app/giai-dau/loi-moi/[id]/GuestRosterEditor.js');
    assert.equal(/khách mời|guest:|guests|Thêm khách/i.test(stripComments(editor)), false, 'không có khách mời trong đội CLB khách (D38)');
    assert.equal(/draggable|onDragStart|onDrop|dnd/i.test(editor), false);
    assert.ok(editor.includes('Pairing.toggleSelection(current, ref)') && editor.includes('aria-pressed={pressed}'));
    assert.ok(editor.includes("disabled={phase !== 'ready' || busy}") && editor.includes('Pairing.createPair(state, selection.first, selection.second, makePairId)'));
    assert.ok(editor.includes('Chưa có hồ sơ thi đấu') && editor.includes('const disabled = !member.hasAthlete'), 'người thiếu hồ sơ không chọn được');
    assert.ok(editor.includes('Chọn thêm một người') && editor.includes('Bỏ chọn người lẻ'), 'người lẻ: hai lựa chọn, không dự bị');
    assert.ok(editor.includes('Lưu nháp') && editor.includes('Gửi danh sách') && editor.includes('disabled={blockers.length > 0 || busy}'));
  },

  'chi tiết lời mời: nút theo invitation.actions; gửi = lưu trước rồi submit; xung đột version; rời trang khi chưa lưu'() {
    const detail = src('app/giai-dau/loi-moi/[id]/InvitationDetailClient.js');
    for (const action of ['accept', 'decline', 'unsubmit', 'withdraw']) assert.ok(detail.includes(`has('${action}')`), `nút ${action} theo actions của server`);
    assert.ok(detail.includes("act('save_roster', { roster })") && detail.includes("act('submit_roster', { version })"));
    assert.ok(detail.includes('Danh sách vừa được lưu ở máy khác') && detail.includes('Tải bản mới nhất'));
    assert.ok(detail.includes("addEventListener('beforeunload'") && detail.includes('Rời trang khi chưa lưu?') && detail.includes('Lưu nháp rồi rời'));
    for (const text of ['Chờ chủ nhà duyệt', 'Rút lại để sửa', 'Đã duyệt · {sentCount} cặp', 'Rút khỏi giải', 'Giải đã chốt lịch', 'Xem trang giải', 'Đăng ký đã đóng']) {
      assert.ok(detail.includes(text) || detail.includes(text.replace('Chờ chủ nhà duyệt', 'chờ chủ nhà duyệt')), `thiếu "${text}"`);
    }
  },

  'hộp lời mời: ba nhóm + trạng thái trống đúng câu spec'() {
    const inbox = src('app/giai-dau/loi-moi/InvitationsClient.js');
    for (const title of ['Cần bạn xử lý', 'Đang diễn ra', 'Đã xong']) assert.ok(inbox.includes(`title="${title}"`));
    assert.ok(inbox.includes('Chưa có lời mời nào. Khi CLB khác mời, lời mời sẽ hiện ở đây và trong chuông thông báo.'));
    for (const label of ['Trả lời', 'Đăng ký cặp', 'Sửa danh sách', 'Xem trang giải']) assert.ok(inbox.includes(label), label);
  },

  'D53: BXH tổng CLB chỉ BỔ SUNG ở mục xếp hạng bàn điều hành + tab Xếp hạng công khai; giải nội bộ không gọi/không hiện'() {
    const bs = src('app/giai-dau/v2/console/bracket/BracketStandings.js');
    assert.ok(bs.includes('friendly = false }') && bs.includes('if (friendly) {') && bs.includes('getFriendlyStandings({ tournamentId })'));
    assert.ok(bs.includes('{friendly ? <ClubStandingsCard'));
    assert.ok(src('app/giai-dau/v2/console/TournamentConsoleV2.js').includes("friendly={tournament?.organizer_mode === 'friendly'}"));
    const pub = src('app/giai-dau/v2/[slug]/PublicLive.js');
    assert.ok(pub.includes('friendly={data.friendly || null}') && pub.includes('friendly?.clubStandings'));
    assert.ok(pub.includes('>Cặp</button>') && pub.includes('>CLB</button>'), 'đoạn chuyển Cặp · CLB');
    assert.equal(/tournamentV2Client/.test(pub), false, 'trang công khai vẫn chỉ đọc snapshot');
    const card = src('app/giai-dau/v2/console/friendly/ClubStandingsCard.js');
    assert.equal(/tournamentV2Client|fetch\(/.test(card), false, 'thẻ BXH CLB chỉ hiển thị');
    assert.ok(card.includes('Chỉ tính trận giữa hai CLB khác nhau. Không tính vào xếp hạng CLB.'));
    assert.ok(card.includes("'CLB khách'") && !/Khách mời/.test(card), 'CLB khách không gắn nhãn "Khách mời"');
    const chip = src('app/giai-dau/v2/console/friendly/ClubChip.js');
    assert.ok(chip.includes('CLUB_CHIP_MAX = 14') && chip.includes('title={String(name)}'));
  },

  'chữ hiển thị: không tiếng Anh cấm, không chữ Stitch tự thêm, không mã lỗi thô'() {
    const banned = [/\bpending\b/i, /\binvited\b/i, /\broster\b/i, /Match #/, /Chính thức/, /PLAYOFF/, /Đánh dấu đã đọc/, /trọng tài/i, /Khách mời\b(?! để)/, /DUPR/i];
    for (const file of NEW_UI) {
      const shown = shownStrings(src(file));
      for (const pattern of banned) assert.equal(pattern.test(shown), false, `${file}: chuỗi hiển thị chứa ${pattern}`);
      assert.equal(/\b[A-Z]{3,}_[A-Z_]{3,}\b/.test(shown), false, `${file}: mã lỗi thô trong chuỗi hiển thị`);
    }
  },

  'CSS mới: chỉ tiền tố fr-/li-, màu nằm trong token DESIGN.md / studio / bảng màu CLB'() {
    const { CLUB_COLORS } = lib('lib/tournament/friendlyStandings.js');
    const palette = new Set([
      ...CLUB_COLORS,
      ...(read('_workspace/stitch-internal-setup/canonical/DESIGN.md').match(/#[0-9a-f]{6}\b/gi) || []),
      ...(read(`${SETUP}/studio.css`).match(/#[0-9a-f]{3,6}\b/gi) || []),
      '#fff', '#ffffff',
    ].map((hex) => hex.toLowerCase()));
    for (const [file, prefix] of Object.entries(NEW_CSS)) {
      const css = stripComments(src(file));
      const selectors = css.replace(/\{[^}]*\}/g, '\n').split(/[\n,]/).map((s) => s.trim()).filter(Boolean)
        .filter((s) => !s.startsWith('@') && s !== '}');
      for (const selector of selectors) {
        const classes = selector.match(/\.[a-zA-Z][\w-]*/g) || [];
        assert.ok(classes.length && classes.every((cls) => cls.startsWith(`.${prefix}`) || /^\.(pc|pl)-/.test(cls)), `${file}: selector "${selector}" ngoài tiền tố ${prefix}`);
        assert.ok(classes.some((cls) => cls.startsWith(`.${prefix}`)), `${file}: selector phải gắn class ${prefix} (${selector})`);
      }
      for (const hex of css.match(/#[0-9a-f]{3,6}\b/gi) || []) assert.ok(palette.has(hex.toLowerCase()), `${file}: màu lạ ${hex}`);
    }
  },

  'readiness phía client (chạy thật): chờ CLB khách → Bước 4 chỉ mở dạng chặn; đã duyệt → đủ cặp, không báo bốc lại sai'() {
    const { clientFriendlyContext, onlyWaitingForClubs } = loadEsm(`${SETUP}/friendly/friendlyContext.js`);
    const { computeSetupReadiness } = lib('lib/tournament/setupReadiness.js');
    const { normalizeDraft } = lib('lib/tournament/setupDraftV3.js');
    const members = ['1', '2', '3', '4', '5', '6', '7', '8'];
    const draft = normalizeDraft({
      draftVersion: 3,
      tournament: { name: 'Giao hữu', eventDate: '2099-10-12', startTime: '07:30', courtCount: 2, organizerMode: 'friendly' },
      participants: { memberIds: members, guests: [] },
      pairs: [0, 1, 2, 3].map((i) => ({ pairId: `h${i}`, participantRefs: [`member:${members[2 * i]}`, `member:${members[2 * i + 1]}`] })),
      format: { formatKey: 'group_knockout', config: { groupCount: 2, qualifiersPerGroup: 2 } },
    });
    const view = { limit: { max: 1 }, hostClub: { name: 'CLB Test 23.9.2026', color: '#7c3aed' }, clubs: [{ tournamentClubId: 7, name: 'CLB Test Responsive UI', status: 'invited', statusLabel: 'Chờ phản hồi', pairCount: 0, color: '#0e7490' }], approvedPairs: [] };
    let readiness = computeSetupReadiness(draft, { friendly: clientFriendlyContext(view) });
    assert.equal(readiness.completedThrough, 2);
    assert.ok(readiness.byStep[3].blockers.some((item) => item.code === 'FRIENDLY_CLUB_NOT_READY' && /CLB Test Responsive UI/.test(item.message)));
    assert.equal(onlyWaitingForClubs(readiness.byStep[3]), true, 'chỉ còn chờ CLB khách → mở Bước 4 dạng chặn');
    const draftWithoutPairs = normalizeDraft({ ...draft, pairs: [] });
    assert.equal(onlyWaitingForClubs(computeSetupReadiness(draftWithoutPairs, { friendly: clientFriendlyContext(view) }).byStep[3]), false, 'chủ nhà chưa ghép xong → không mở Bước 4');
    view.clubs[0].status = 'approved';
    view.approvedPairs = ['a', 'b', 'c'].map((id) => ({ pairId: `c7.5.${id}`, tournamentClubId: 7, clubName: 'CLB Test Responsive UI', members: [{ name: 'A' }, { name: 'B' }] }));
    readiness = computeSetupReadiness(draft, { friendly: clientFriendlyContext(view) });
    assert.equal(readiness.completedThrough, 3);
    assert.deepEqual(readiness.byStep[4].blockers.map((item) => item.code), ['DRAW_REQUIRED']);
  },

  'nhóm lời mời (chạy thật): cần xử lý / đang diễn ra / đã xong'() {
    const { groupInvitations, needActionCount } = loadEsm('app/giai-dau/loi-moi/invitationGroups.js');
    const items = [
      { id: 1, status: 'invited', window: { open: true } },
      { id: 2, status: 'changes_requested', window: { open: true } },
      { id: 3, status: 'accepted', window: { open: true } },
      { id: 4, status: 'approved', finalized: true, window: { open: false } },
      { id: 5, status: 'declined', window: { open: true } },
      { id: 6, status: 'invited', window: { open: false } },
    ];
    const groups = groupInvitations(items);
    assert.deepEqual(groups.need.map((item) => item.id), [1, 2]);
    assert.deepEqual(groups.active.map((item) => item.id), [3, 6]);
    assert.deepEqual(groups.done.map((item) => item.id), [4, 5]);
    assert.equal(needActionCount(items), 2);
  },
});
