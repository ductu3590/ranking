'use strict';

// ARCHITECTURE MIGRATION GUARD — thay cho năm test cũ soi vào wizard 3 bước:
//   duplicate-safety.contract, wizard-checkpoints.contract, wizard-pair-identity.repro,
//   wizard-retry-replay.contract, wizard-swallowed-failure.repro
//
// Năm test đó khẳng định chuỗi 8 checkpoint chạy PHÍA CLIENT trong TournamentWizard.js.
// T2.D thay toàn bộ bằng workspace 4 bước + finalize NGUYÊN TỬ PHÍA SERVER, nên
// TournamentWizard.js còn 135 dòng và lib/tournament/{wizardRunner,wizardDraft}.js
// không còn ai gọi. Trỏ test cũ sang hai file đó sẽ cho đèn xanh trên CODE CHẾT —
// tệ hơn là xoá. Xem _workspace/unified-setup-ux/ADR-004-retire-legacy-wizard-tests.md.
//
// File này làm hai việc:
//   1. Chốt rằng kiến trúc cũ thật sự đã rời khỏi đường dùng chính (không ai lặng lẽ
//      dựng lại chuỗi checkpoint client).
//   2. Chốt rằng MỌI bất biến mà năm test cũ bảo vệ đều còn một chỗ sống, và chỉ đúng
//      chỗ đó. Bất biến nào mất nhà thì đỏ ở đây.
//
// EVIDENCE KIND: static. Bằng chứng chạy thật nằm ở tests/unified-setup-v2/.

const { readSource, createChecker, stripJsComments, exists } = require('./_harness');

const check = createChecker('legacy wizard retired, invariants rehomed', 'static');

const wizard = stripJsComments(readSource('app/giai-dau/v2/TournamentWizard.js'));
const client = stripJsComments(readSource('lib/tournamentV2Client.js'));
const finalizeRoute = stripJsComments(readSource('app/api/tournament-v2/setup/finalize/route.js'));
const setupRoute = stripJsComments(readSource('app/api/tournament-v2/setup/route.js'));

// ---------- 1. kiến trúc cũ đã rời đường dùng chính ----------

check.ok(
    wizard.split('\n').length < 300,
    'TournamentWizard.js là lớp adapter mỏng, không còn là wizard 1400 dòng',
    `hiện có ${wizard.split('\n').length} dòng`,
);
check.noMatch(wizard, /runCheckpointSequence/, 'wizard không chạy lại chuỗi checkpoint phía client');
check.noMatch(wizard, /localStorage|sessionStorage/, 'bản nháp không còn nằm ở browser storage');
check.match(wizard, /\bTournamentSetupWorkspace\b/, 'wizard uỷ quyền cho workspace 4 bước');

// Nếu ai đó nối lại wizardRunner vào sản phẩm thì phải cập nhật ADR-004 trước.
const runnerCallers = ['app/giai-dau/v2/TournamentWizard.js', 'lib/tournamentV2Client.js']
    .filter((file) => stripJsComments(readSource(file)).includes('wizardRunner'));
check.ok(
    runnerCallers.length === 0,
    'lib/tournament/wizardRunner.js vẫn ngoài đường dùng chính',
    runnerCallers.length ? `bị gọi lại từ: ${runnerCallers.join(', ')}` : '',
);

// ---------- 2. từng bất biến cũ phải còn một chỗ sống ----------

// (a) Không "thành công giả": finalize ghi nguyên tử phía server.
// R3 derives stages inside the transaction from the persisted draft, not client stage_plan.
check.match(finalizeRoute, /rpc\('finalize_internal_doubles_group_knockout_v2'/, 'finalize gọi đúng RPC dựng stage từ draft đã lưu');
const finalizeSql = readSource('database/migrations/092_internal_doubles_group_knockout_finalize.sql');
check.match(finalizeSql, /v_draft\s*:=\s*d\.setup_draft/, 'RPC đọc snapshot draft đã lưu');
check.ok((finalizeSql.match(/INSERT INTO public\.tournament_stages\(/g) || []).length === 2,
    'RPC ghi đủ hai stage trong cùng transaction');
check.match(finalizeSql, /INSERT INTO public\.tournament_stage_transitions/, 'RPC ghi tuyến đi tiếp tường minh');
check.match(finalizeRoute, /rpc\(/, 'finalize đi qua RPC, không phải chuỗi request nối tiếp từ client');
check.ok(
    exists('lib/tournament/setupFinalize.js'),
    'lib/tournament/setupFinalize.js giữ mã lỗi ổn định của finalize',
);
check.match(
    stripJsComments(readSource('lib/tournament/setupFinalize.js')),
    /\bFINALIZE_NOT_ATOMIC\b/,
    'mã FINALIZE_NOT_ATOMIC còn tồn tại để chặn thành công giả',
);

// (b) Retry không tạo bản ghi thứ hai.
check.match(client, /\bidempotencyKey\b|\bidempotency_key\b/, 'client gửi idempotency key khi ghi');
check.match(finalizeRoute, /\bidempotencyKey\b|\bidempotency_key\b/, 'finalize đọc idempotency key');
check.match(setupRoute, /\bidempotency_key\b|\bidempotencyKey\b/, 'route /setup đọc idempotency key');

// (c) Hai người sửa đồng thời không ghi đè âm thầm.
check.match(client, /\bexpectedRevision\b|\bexpected_setup_revision\b/, 'client gửi revision đang giữ');
check.match(setupRoute, /\bexpected_setup_revision\b|\bexpectedRevision\b/, 'route /setup kiểm revision (CAS)');

// (d) Bản nháp sống qua reload — nay bằng aggregate phía server, không phải localStorage.
check.match(client, /\bgetDivisionSetup\b/, 'client có đường đọc lại bản nháp từ server');
check.match(wizard, /\bgetDivisionSetup\b/, 'wizard nạp lại bản nháp khi mở lại');
check.match(setupRoute, /GET/, 'route /setup phục vụ đọc aggregate để resume');

// (e) Danh tính cặp/VĐV được ghi thật, không chỉ là tên hiển thị.
check.match(client, /\breplaceDivisionParticipants\b|\breplace_participants\b/,
    'client có đường ghi danh tính người tham gia');
check.match(setupRoute, /\breplace_participants\b/, 'route /setup xử lý action replace_participants');

// (f) Giải đã có kết quả thì không đổi được cấu trúc.
check.match(
    stripJsComments(readSource('lib/tournament/setupValidation.js')),
    /\bSTRUCTURE_LOCKED_BY_RESULTS\b/,
    'mã STRUCTURE_LOCKED_BY_RESULTS còn được kiểm ở validation',
);

check.done();
