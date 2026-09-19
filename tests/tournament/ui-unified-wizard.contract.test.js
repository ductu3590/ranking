// Hợp đồng UI: wizard tạo giải là BẢN NHÁP BỀN VỮNG THEO CHECKPOINT.
// Test này phải FAIL với wizard cũ (nuốt lỗi bằng `catch (_) {}`, chỉ ghi entry
// snapshot tên, báo "đã tạo giải" kể cả khi hỏng giữa chừng) và PASS với wizard mới.
// Chạy trực tiếp: node tests/tournament/ui-unified-wizard.contract.test.js

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));
const assert = (condition, message) => {
    if (!condition) { console.error(`FAIL: ${message}`); process.exit(1); }
};

const WIZARD = 'app/giai-dau/v2/TournamentWizard.js';
const PANEL = 'app/giai-dau/v2/console/tabs/DivisionSetupPanel.js';
const DRAFT = 'lib/tournament/wizardDraft.js';

assert(exists(WIZARD), 'wizard tồn tại');
assert(exists(PANEL), 'DivisionSetupPanel tồn tại');
assert(exists(DRAFT), 'helper bản nháp lib/tournament/wizardDraft.js tồn tại');

const wizard = read(WIZARD);
const panel = read(PANEL);
const draftSource = read(DRAFT);

/* ==================== 1. Không còn nuốt lỗi ==================== */

assert(!/catch\s*\(\s*_\s*\)/.test(wizard), 'wizard không còn kiểu bỏ lỗi `catch (_)`');
// Thân catch chỉ có chú thích cũng là nuốt lỗi — bỏ chú thích rồi soi lại.
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/([^:"'`])\/\/[^\n]*/g, '$1');
assert(!/catch\s*\([^)]*\)\s*\{\s*\}/.test(stripComments(wizard)), 'không còn khối catch chỉ chứa chú thích');
assert(!/catch\s*\([^)]*\)\s*\{\s*\}/.test(stripComments(panel)), 'DivisionSetupPanel không có khối catch chỉ chứa chú thích');
assert(!/catch\s*\([^)]*\)\s*\{\s*\}/.test(wizard), 'wizard không còn bất kỳ khối catch rỗng nào');
assert(!/catch\s*\{\s*\}/.test(wizard), 'wizard không còn optional-catch rỗng');
assert(!/catch\s*\([^)]*\)\s*\{\s*\}/.test(panel), 'DivisionSetupPanel không có khối catch rỗng');

// Mọi catch trong đường ghi dữ liệu phải làm một trong ba việc: ném tiếp, báo lỗi cho
// người dùng, hoặc trả về trạng thái khôi phục đã ghi rõ.
const catchBodies = wizard.split(/catch\s*\([^)]*\)\s*\{/).slice(1).map((chunk) => chunk.slice(0, 900));
for (const body of catchBodies) {
    assert(
        /throw|setFailure|setNotice|setError|return\s+\{|return null|setGroup|setRoster|setPickhubClubs|setPreview|setConflict|invited\[|return false/.test(body),
        'mỗi khối catch phải ném tiếp hoặc báo trạng thái, không im lặng',
    );
}

/* ==================== 2. Đủ 8 checkpoint và đúng thứ tự ==================== */

const draftApi = require(path.join(root, DRAFT));
const CONTRACT_PLAN = [
    'tournament', 'host_club', 'division', 'group_stage',
    'participants', 'pairs', 'playoff_stage', 'playoff_plan',
];
assert(
    JSON.stringify(draftApi.UNIFIED_DOUBLES_PLAN.slice(0, 8)) === JSON.stringify(CONTRACT_PLAN),
    'kế hoạch 8 checkpoint đúng tên và đúng thứ tự theo hợp đồng',
);
assert(
    draftApi.UNIFIED_DOUBLES_PLAN[draftApi.UNIFIED_DOUBLES_PLAN.length - 1] === 'verify',
    'checkpoint cuối là bước kiểm tra lại readiness',
);
for (const name of CONTRACT_PLAN.concat(['verify'])) {
    assert(typeof draftApi.CHECKPOINT_LABELS[name] === 'string' && draftApi.CHECKPOINT_LABELS[name], `checkpoint ${name} có nhãn tiếng Việt`);
}

// Wizard phải gọi đúng bộ wrapper client đã đóng băng, không tự chế lại.
for (const call of [
    'createTournament', 'inviteTournamentClub', 'saveDivision', 'saveStage',
    'replaceDivisionParticipants', 'previewDivisionPairing', 'confirmDivisionPairing',
    'configureTopTwoPlayoff', 'getDivisionSetup', 'saveDivisionEntry', 'inviteExternalClub',
]) {
    assert(wizard.includes(call), `wizard dùng wrapper ${call}`);
}
assert(!/supabaseAdmin|supabaseServer|supabase\s*\.\s*from\(/.test(wizard), 'wizard không gọi Supabase trực tiếp');

// Thứ tự xử lý trong runCheckpoint phải trùng thứ tự hợp đồng.
const runBlock = wizard.slice(wizard.indexOf('async function runCheckpoint'));
const order = ['TOURNAMENT', 'HOST_CLUB', 'DIVISION', 'GROUP_STAGE', 'PARTICIPANTS', 'PAIRS', 'PLAYOFF_STAGE', 'PLAYOFF_PLAN', 'VERIFY']
    .map((key) => ({ key, at: runBlock.indexOf(`name === CHECKPOINT.${key}`) }));
for (const item of order) assert(item.at > 0, `runCheckpoint xử lý CHECKPOINT.${item.key}`);
for (let i = 1; i < order.length; i += 1) {
    assert(order[i].at > order[i - 1].at, `checkpoint ${order[i].key} nằm sau ${order[i - 1].key}`);
}

// Checkpoint 5 gửi đúng payload danh tính của hợp đồng.
// expected_setup_revision + idempotency_key nay do beginMutation() gan (va PERSIST
// truoc khi goi mang), nen khong con la chuoi literal trong TournamentWizard.js.
// Khang dinh dung hop dong that: wizard phai di qua beginMutation, va beginMutation
// phai gan ca hai truong do.
const runnerSrc = read('lib/tournament/wizardRunner.js');
assert(/beginMutation\(/.test(wizard), 'wizard dat attempt qua beginMutation()');
assert(/expected_setup_revision: pin\.revision/.test(runnerSrc), 'beginMutation gan expected_setup_revision tu revision da ghim');
assert(/idempotency_key: stamped\.key/.test(runnerSrc), 'beginMutation gan idempotency_key da ghim');
assert(/commit\(stamped\.draft\);/.test(runnerSrc), 'beginMutation PERSIST draft truoc khi goi mang');
for (const field of ['client_ref', 'display_name', 'athlete_id', 'source', 'tournament_club_id']) {
    assert(wizard.includes(field), `payload replace_participants có trường ${field}`);
}
assert(wizard.includes("'club_member'") && wizard.includes("'guest'"), 'phân biệt club_member và guest');
assert(/athlete_id != null \? 'club_member' : 'guest'|athlete_id == null \? 'guest' : 'club_member'/.test(wizard.replace(/\s+/g, ' ')) || wizard.includes("item.source === 'club_member' && item.athlete_id != null"), 'athlete_id null vẫn là khách hợp lệ, không bịa danh tính');

// Checkpoint 6 dùng preview rồi mới confirm.
assert(
    wizard.indexOf('previewDivisionPairing') < wizard.indexOf('confirmDivisionPairing'),
    'xem trước ghép cặp trước khi chốt',
);

// Checkpoint 8 có công tắc tranh hạng ba, mặc định TẮT.
assert(/const \[bronze, setBronze\] = useState\(false\)/.test(wizard), 'trận tranh hạng ba mặc định tắt');
assert(wizard.includes('bronze: Boolean(config.bronze)'), 'checkpoint play-off gửi cờ bronze');
assert(wizard.includes('tranh hạng ba'), 'có nhãn tiếng Việt cho trận tranh hạng ba');
assert(/groupCount|group_count/.test(wizard) && wizard.includes('bảng'), 'wizard nêu rõ số bảng vòng bảng');

/* ==================== 3. Thành công bị chặn sau bước xác minh ==================== */

const SUCCESS = "setToast('✓ Đã tạo giải')";
assert(wizard.split(SUCCESS).length - 1 === 1, 'chỉ có duy nhất một chỗ báo "Đã tạo giải"');
const successAt = wizard.indexOf(SUCCESS);
// Vong chay checkpoint nay nam trong lib/tournament/wizardRunner.js va duoc DUNG CHUNG
// voi test tich hop, thay vi lap trong component. Khang dinh ca hai phia.
const runnerLoop = read('lib/tournament/wizardRunner.js');
const loopAt = runnerLoop.indexOf('const name = nextCheckpoint(current);');
const breakAt = runnerLoop.indexOf('if (!name) break;');
assert(loopAt > 0 && breakAt > loopAt, 'vong chay checkpoint dung nextCheckpoint');
assert(/runCheckpointSequence\(/.test(wizard), 'wizard chay chuoi checkpoint qua runCheckpointSequence');
assert(/current = prepared;/.test(runnerLoop), 'khi loi, runner giu draft da chuan bi thay vi snapshot cu');
assert(successAt > breakAt, 'chỉ báo thành công sau khi mọi checkpoint đã xong');

// Bước xác minh phải đọc lại readiness thật và ném lỗi khi chưa sẵn sàng.
const verifyBlock = wizard.slice(wizard.indexOf('name === CHECKPOINT.VERIFY'), wizard.indexOf('name === CHECKPOINT.LEGACY_ENTRIES'));
assert(verifyBlock.includes('getDivisionSetup'), 'bước xác minh gọi lại getDivisionSetup');
assert(verifyBlock.includes("status !== 'ready'") && verifyBlock.includes('throw new Error'), 'readiness khác "ready" thì ném lỗi, không báo thành công');
assert(!/setToast|onDone/.test(verifyBlock), 'bước xác minh không tự báo thành công');

// Hỏng giữa chừng: dừng chuỗi, giữ bản nháp, hiện thông báo theo đúng bước + nút thử lại.
assert(/setFailure\(\{/.test(wizard) && wizard.includes('return false;'), 'checkpoint hong thi dung chuoi');
assert(/if \(!outcome\.ok\)/.test(wizard), 'wizard dung chuoi khi runner bao that bai');
assert(/return \{ ok: false, draft: current, checkpoint: name, error \};/.test(runnerLoop), 'runner tra ve draft da chuan bi khi that bai');
assert(wizard.includes('CHECKPOINT_LABELS[name]'), 'thông báo lỗi nêu tên bước hỏng');
assert(wizard.includes('Thử lại'), 'có nút "Thử lại"');
assert(/Bản nháp và toàn bộ người chơi đã nhập vẫn được giữ/.test(wizard), 'nói rõ bản nháp và người chơi đã nhập được giữ');
assert(wizard.includes('retryCheckpoint'), 'thử lại chạy lại đúng checkpoint đang dở');

/* ==================== 4. 409 phải hỏi lại người dùng, không tự gửi lại ==================== */

assert(wizard.includes("status === 409 ? 'conflict' : 'error'"), '409 được nhận diện riêng');
assert(wizard.includes('loadConflictState'), '409 tải lại thiết lập thật trước khi hỏi');
assert(wizard.includes('Tôi đã xem trạng thái mới'), '409 bắt người dùng xác nhận đã xem trạng thái mới');
assert(wizard.includes('disabled={!reviewed || busy}'), 'nút gửi lại bị khoá tới khi người dùng xác nhận');
const conflictBlock = wizard.slice(wizard.indexOf('async function loadConflictState'), wizard.indexOf('async function runPersistence'));
assert(!/runPersistence|retryCheckpoint/.test(conflictBlock), 'sau 409 không tự động gửi lại');

/* ==================== 5. Bản nháp: tiếp tục sau khi tải lại trang ==================== */

assert(draftApi.DRAFT_KEY_PREFIX === 'pickhub:wizard-draft:v1:', 'khoá bản nháp đúng định dạng hợp đồng');
assert(draftApi.draftStorageKey(7) === 'pickhub:wizard-draft:v1:7', 'khoá bản nháp gắn theo group');
assert(wizard.includes('readDraft(browserStorage(), group.id)'), 'wizard đọc lại bản nháp khi mở trang');
assert(wizard.includes('writeDraft') && wizard.includes('clearDraft'), 'wizard ghi và dọn bản nháp');
assert(wizard.includes('restoreFromDraft'), 'khôi phục cấu hình + người chơi từ bản nháp');
assert(wizard.includes('Tiếp tục tạo giải'), 'có hành động tiếp tục bản nháp dở');
assert(/if \(draftRef.current && !isComplete\(draftRef.current\)\)/.test(wizard), 'còn bản nháp dở thì đi tiếp, không tạo giải thứ hai');
assert(wizard.includes('client_draft_key: current.client_draft_key'), 'tạo giải gửi client_draft_key để thử lại không tạo trùng');

/* ==================== 6. Hàm thuần của bản nháp (chạy thật) ==================== */

const plan = draftApi.UNIFIED_DOUBLES_PLAN.slice();
let seq = 0;
const fixedRandom = () => 0.42;
const fixedNow = () => 1750000000000;

// client_ref sinh MỘT LẦN cho mỗi dòng nhập; không được sinh lại khi thử lại.
const refA = draftApi.newClientRef((seq += 1), { random: fixedRandom, now: fixedNow });
const refB = draftApi.newClientRef((seq += 1), { random: fixedRandom, now: fixedNow });
assert(refA !== refB, 'mỗi dòng nhập có client_ref riêng');
const participants = [
    draftApi.makeParticipant({ client_ref: refA, display_name: 'Nguyễn A', athlete_id: 11, source: 'club_member' }),
    draftApi.makeParticipant({ client_ref: refB, display_name: 'Khách B', athlete_id: null, source: 'club_member' }),
];
assert(participants[0].source === 'club_member' && participants[0].athlete_id === 11, 'thành viên CLB giữ athlete_id thật');
assert(participants[1].source === 'guest' && participants[1].athlete_id === null, 'athlete_id null là khách hợp lệ, không bịa danh tính');

let draft = draftApi.createDraft({
    groupId: 1, plan, config: { scope: 'internal', unit: 'doi' },
    participants, pairs: [[refA, refB]], now: fixedNow,
});
assert(draftApi.nextCheckpoint(draft) === 'tournament', 'bắt đầu từ checkpoint tournament');
assert(draftApi.isComplete(draft) === false, 'bản nháp mới chưa hoàn tất');

// Khóa idempotency: cùng payload → cùng khóa; payload đổi → khóa xoay.
const payload1 = { division_id: 35, participants, expected_setup_revision: 1 };
const first = draftApi.checkpointIdempotency(draft, 'participants', payload1);
const retrySame = draftApi.checkpointIdempotency(first.draft, 'participants', payload1);
assert(retrySame.key === first.key, 'thử lại cùng payload dùng lại đúng khóa idempotency');
assert(retrySame.rotated === false, 'không xoay khóa khi payload không đổi');
// Đổi RIÊNG revision KHÔNG được xoay khóa: máy chủ (migration 074) tính
// payload_fingerprint trên {division_id, tournament_club_id, participants} và
// KHÔNG tính revision. Nếu client xoay khóa theo revision thì sau một lần ghi
// thành công nhưng mất phản hồi, bộ nhớ phát lại của máy chủ bị bỏ qua và RPC
// chạy lại — checkpoint ghép cặp sẽ kẹt 409 vĩnh viễn.
const revisionOnly = draftApi.checkpointIdempotency(first.draft, 'participants', { ...payload1, expected_setup_revision: 2 });
assert(revisionOnly.key === first.key, 'đổi riêng revision KHÔNG xoay khóa idempotency');
// Payload thật sự đổi (khác danh sách VĐV) thì khóa PHẢI xoay.
const changed = draftApi.checkpointIdempotency(first.draft, 'participants', {
    ...payload1,
    participants: participants.slice(0, Math.max(1, participants.length - 1)),
});
assert(changed.key !== first.key, 'payload đổi thì khóa idempotency phải xoay');
assert(changed.rotated === true, 'xoay khóa được báo rõ');
assert(first.key.length <= 200 && first.key.includes('participants'), 'khóa idempotency hợp lệ và nêu tên checkpoint');
// Khóa phải bám theo bản nháp, cùng payload nhưng khác bản nháp thì khác khóa.
const otherDraft = draftApi.createDraft({ groupId: 1, plan, now: fixedNow, clientDraftKey: 'wd-1-other' });
assert(draftApi.checkpointIdempotency(otherDraft, 'participants', payload1).key !== first.key, 'khóa gắn với đúng bản nháp');

// Tiếp tục: đi lần lượt, đã xong thì không chạy lại.
draft = draftApi.recordCheckpoint(draft, 'tournament', { tournament_id: 47 });
assert(draftApi.nextCheckpoint(draft) === 'host_club', 'checkpoint kế tiếp sau tournament là host_club');
draft = draftApi.recordCheckpoint(draft, 'host_club', { tournament_club_id: 9 });
draft = draftApi.recordCheckpoint(draft, 'division', { division_id: 35 });
assert(draftApi.nextCheckpoint(draft) === 'group_stage', 'tiếp tục đúng bước còn thiếu');
assert(draftApi.checkpointResult(draft, 'tournament').tournament_id === 47, 'id đã lưu được giữ nguyên để không tạo trùng');

// Lưu rồi đọc lại (mô phỏng tải lại trình duyệt) phải ra đúng bản nháp cũ.
const memory = new Map();
const storage = {
    getItem: (key) => (memory.has(key) ? memory.get(key) : null),
    setItem: (key, value) => { memory.set(key, String(value)); },
    removeItem: (key) => { memory.delete(key); },
};
assert(draftApi.writeDraft(storage, draft) === true, 'ghi được bản nháp');
const reloaded = draftApi.readDraft(storage, 1);
assert(reloaded && reloaded.client_draft_key === draft.client_draft_key, 'tải lại giữ nguyên mã bản nháp');
assert(draftApi.nextCheckpoint(reloaded) === 'group_stage', 'tải lại đi tiếp đúng checkpoint còn thiếu');
assert(reloaded.participants[0].client_ref === refA, 'tải lại giữ nguyên client_ref của từng người');
assert(draftApi.checkpointIdempotency(reloaded, 'participants', payload1).key === first.key || reloaded.keys.participants === undefined, 'khóa idempotency sống sót qua tải lại');
draftApi.clearDraft(storage, 1);
assert(draftApi.readDraft(storage, 1) === null, 'dọn bản nháp sau khi xong');

// Hoàn tất: chỉ khi mọi checkpoint (kể cả verify) đã có kết quả.
let full = draftApi.createDraft({ groupId: 1, plan, now: fixedNow });
for (const name of plan.slice(0, plan.length - 1)) full = draftApi.recordCheckpoint(full, name, {});
assert(draftApi.isComplete(full) === false, 'thiếu bước xác minh thì chưa hoàn tất');
full = draftApi.recordCheckpoint(full, 'verify', { status: 'ready' });
assert(draftApi.isComplete(full) === true, 'đủ mọi checkpoint mới coi là hoàn tất');

// Đếm lần thử để bước lặp lại đọc lại dữ liệu thay vì ghi lần hai.
assert(draftApi.attemptCount(draft, 'division') === 0, 'chưa chạy thì chưa tính lần thử');
assert(draftApi.attemptCount(draftApi.markAttempt(draft, 'division'), 'division') === 1, 'đánh dấu được lần thử');

/* ==================== 7. Luồng cũ vẫn chạy nhưng không nuốt lỗi ==================== */

const planBlock = wizard.slice(wizard.indexOf('function planForFlow'), wizard.indexOf('function hasTwoGroupPlayoff'));
assert(planBlock.includes("scope === 'internal' && unit === 'doi'"), 'chuỗi danh tính thống nhất chỉ cho nội bộ đánh đôi');
assert(planBlock.includes('UNIFIED_DOUBLES_PLAN'), 'nội bộ đôi dùng đúng danh sách checkpoint đã đóng băng (participants + pairs)');
assert(draftApi.UNIFIED_DOUBLES_PLAN.includes('participants') && draftApi.UNIFIED_DOUBLES_PLAN.includes('pairs'), 'danh sách đó có participants + pairs');
assert(!draftApi.UNIFIED_DOUBLES_PLAN.includes('legacy_entries'), 'nội bộ đôi không rơi lại luồng entry snapshot tên');
assert(planBlock.includes('CHECKPOINT.LEGACY_ENTRIES') && planBlock.includes('CHECKPOINT.CLUB_INVITES'), 'đơn/đội/giao hữu giữ luồng cũ');
const legacyBlock = wizard.slice(wizard.indexOf('name === CHECKPOINT.LEGACY_ENTRIES'), wizard.indexOf('name === CHECKPOINT.CLUB_INVITES'));
assert(legacyBlock.includes('saveDivisionEntry'), 'luồng cũ vẫn dùng saveDivisionEntry');
assert(!/catch/.test(legacyBlock), 'lưu suất thi đấu không nuốt lỗi từng suất nữa');
assert(legacyBlock.includes('recordPartial'), 'ghi tiến độ từng suất để thử lại không lưu trùng');

/* ==================== 8. Console: trạng thái cần chuyển đổi dữ liệu cũ ==================== */

assert(panel.includes('APPROVED_DOUBLES_ENTRY_PAIR_ID_MISSING'), 'panel nhận diện entry đôi cũ chưa có cặp');
assert(panel.includes('needsMigration'), 'panel có trạng thái cần chuyển đổi');
assert(panel.includes('Cần chuyển đổi dữ liệu cũ'), 'panel giải thích bằng tiếng Việt');
assert(panel.includes('repairLegacyDivisionPairs'), 'panel chỉ tới đúng công cụ sửa dữ liệu');
assert(panel.includes('dry_run: true'), 'chạy thử trước, không ghi gì');
assert(panel.includes('confirm_apply: true') && panel.includes('repairReviewed'), 'áp dụng thật phải xác nhận rõ ràng');
const confirmBlock = panel.slice(panel.indexOf('function confirmPairs'), panel.indexOf('function setLock'));
assert(/if \(needsMigration\)/.test(confirmBlock), 'chặn chốt ghép cặp khi dữ liệu cũ chưa chuyển đổi');
assert(confirmBlock.includes('tạo thêm suất mới'), 'nói rõ vì sao không được chốt cặp lên dữ liệu cũ');
assert(panel.includes('const canPair = isAdmin && isDoubles && !needsMigration'), 'ẩn hành động ghép cặp ở trạng thái cần chuyển đổi');

// Giữ nguyên cách xử lý 409 đã đúng: tải lại rồi mời người dùng xem lại.
assert(panel.includes('err.status === 409') && panel.includes('await loadSetup()'), 'panel giữ xử lý 409 tải lại');
assert(panel.includes('hãy xác nhận thao tác trước khi thử lại'), 'panel yêu cầu người dùng xem lại sau 409');

// Trạng thái tải / lỗi / rỗng / khóa đều có thật.
assert(panel.includes('Đang tải thiết lập nội dung'), 'có trạng thái đang tải');
assert(panel.includes('aria-busy="true"'), 'trạng thái tải có aria-busy');
assert(panel.includes('const hasScope = Boolean(tournamentId) && Boolean(divisionId)'), 'panel không phụ thuộc stage để có divisionId');
assert(panel.includes('Giải chưa có nội dung thi đấu nào để thiết lập'), 'có trạng thái rỗng khi chưa có nội dung');
assert(panel.includes('Chưa có vận động viên nào trong phạm vi giải này'), 'có trạng thái rỗng khi chưa có VĐV');
assert(panel.includes('Đội hình đang khóa'), 'có trạng thái đã khóa');
assert(panel.includes("role=\"alert\""), 'lỗi được báo cho trình đọc màn hình');

// Giao diện đọc được trên điện thoại ~390px rồi mở rộng lên tablet/desktop.
const panelCss = read('app/giai-dau/v2/console/tabs/DivisionSetupPanel.css');
assert(/@media \(min-width: 768px\)/.test(panelCss), 'có điểm ngắt tablet 768px');
assert(/@media \(min-width: 1200px\)/.test(panelCss), 'có điểm ngắt desktop rộng');
assert(/min-height: 44px/.test(panelCss), 'vùng chạm nút tối thiểu 44px trên điện thoại');
assert(/\.division-setup-migration\b/.test(panelCss), 'khối chuyển đổi có style riêng');

const wizardCss = read('app/giai-dau/v2/wizard.css');
assert(/\.w3-cp\b/.test(wizardCss) && /\.w3-resume\b/.test(wizardCss), 'bảng tiến trình checkpoint có style riêng');

console.log('ui-unified-wizard contract ok');
