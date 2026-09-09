const path = require('path');
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };
const {
  TOURNAMENT_STATUSES,
  canTransition,
  groupOf,
  sortForGroup,
  canDelete,
} = require(path.join(__dirname, '..', '..', 'lib', 'tournament', 'lifecycle'));

assert(
  JSON.stringify(TOURNAMENT_STATUSES) === JSON.stringify([
    'draft', 'registration_open', 'registration_closed',
    'scheduled', 'live', 'completed', 'archived',
  ]),
  'TOURNAMENT_STATUSES đúng 7 giá trị theo đúng thứ tự vòng đời'
);
assert(!TOURNAMENT_STATUSES.includes('active'), "'active' không phải trạng thái hợp lệ");

const OK = [
  ['draft', 'registration_open'], ['draft', 'scheduled'],
  ['registration_open', 'registration_closed'], ['registration_closed', 'scheduled'],
  ['scheduled', 'live'], ['live', 'completed'], ['completed', 'archived'],
  ['registration_closed', 'registration_open'], ['scheduled', 'draft'],
  ['live', 'scheduled'], ['registration_open', 'draft'],
];
for (const [from, to] of OK) {
  assert(canTransition(from, to).ok === true, `cạnh hợp lệ ${from} -> ${to}`);
}

const BAD = [
  ['draft', 'live'], ['draft', 'completed'], ['completed', 'live'],
  ['archived', 'completed'], ['archived', 'draft'], ['live', 'draft'],
  ['registration_open', 'live'],
];
for (const [from, to] of BAD) {
  const r = canTransition(from, to);
  assert(r.ok === false, `cạnh cấm ${from} -> ${to}`);
  assert(r.code === 'INVALID_STATUS_TRANSITION', `mã lỗi đúng cho ${from} -> ${to}`);
  assert(/hiện đang/.test(r.message), `thông báo tiếng Việt cho ${from} -> ${to}`);
}

assert(canTransition('active', 'live').code === 'INVALID_STATUS', "'active' -> INVALID_STATUS");
assert(canTransition('draft', 'active').code === 'INVALID_STATUS', "đích 'active' -> INVALID_STATUS");

assert(canTransition('scheduled', 'draft').guards.includes('no_approved_registrations'), 'cạnh 9 cần guard đăng ký');
assert(canTransition('scheduled', 'draft').guards.includes('no_played_matches'), 'cạnh 9 cần guard trận đã đấu');
assert(canTransition('registration_open', 'draft').guards.includes('no_approved_registrations'), 'cạnh 11 cần guard đăng ký');
assert(canTransition('live', 'completed').guards.includes('all_matches_finalized'), 'chốt giải cần mọi trận finalized');
assert(canTransition('draft', 'scheduled').guards.length === 0, 'draft -> scheduled không cần guard');

assert(groupOf('draft') === 'upcoming', 'draft -> upcoming');
assert(groupOf('registration_open') === 'upcoming', 'registration_open -> upcoming');
assert(groupOf('registration_closed') === 'upcoming', 'registration_closed -> upcoming');
assert(groupOf('scheduled') === 'upcoming', 'scheduled -> upcoming');
assert(groupOf('live') === 'running', 'live -> running');
assert(groupOf('completed') === 'finished', 'completed -> finished');
assert(groupOf('archived') === 'finished', 'archived -> finished');
assert(groupOf('active') === 'upcoming', 'trạng thái lạ rơi về upcoming, không văng lỗi');

const up = sortForGroup([
  { id: 1, event_date: '2026-10-05' },
  { id: 2, event_date: null },
  { id: 3, event_date: '2026-09-20' },
], 'upcoming');
assert(up.map((t) => t.id).join(',') === '3,1,2', 'nhóm Sắp: tăng dần, null xuống cuối');

const fin = sortForGroup([
  { id: 1, event_date: '2026-01-05' },
  { id: 2, event_date: null },
  { id: 3, event_date: '2026-03-20' },
], 'finished');
assert(fin.map((t) => t.id).join(',') === '3,1,2', 'nhóm Đã: giảm dần, null xuống cuối');

assert(canDelete({ status: 'draft' }, 0).ok === true, 'draft + 0 trận: xoá được');
assert(canDelete({ status: 'draft' }, 3).ok === false, 'draft + có trận: không xoá');
assert(canDelete({ status: 'draft' }, 3).code === 'TOURNAMENT_HAS_MATCHES', 'mã lỗi khi có trận');
assert(canDelete({ status: 'completed' }, 0).ok === false, 'completed: không xoá');
assert(canDelete({ status: 'completed' }, 0).code === 'TOURNAMENT_NOT_DRAFT', 'mã lỗi khi không phải draft');
assert(/lưu trữ/.test(canDelete({ status: 'completed' }, 0).message), 'gợi ý dùng lưu trữ');

// ---- operationLog ----
const { buildLogRow, writeOperationLog } = require(path.join(__dirname, '..', '..', 'lib', 'tournament', 'operationLog'));

const row = buildLogRow({
  groupId: 1,
  tournamentId: 7,
  actor: 'Nguyễn Anh Tuấn',
  action: 'tournament_status_changed',
  targetType: 'tournament',
  targetId: 7,
  before: { status: 'scheduled' },
  after: { status: 'live' },
});
assert(row.group_id === 1 && row.tournament_id === 7, 'buildLogRow map id đúng');
assert(row.division_id === null, 'division_id mặc định null');
assert(row.reason === null, 'reason mặc định null');
assert(row.before.status === 'scheduled' && row.after.status === 'live', 'giữ before/after');
assert(!('created_at' in row), 'không tự đặt created_at, để DB dùng default');

let threw = null;
try { buildLogRow({ groupId: 1, tournamentId: 7, actor: 'a', action: 'x', targetType: 't' }); } catch (e) { threw = e; }
assert(threw === null, 'targetId không bắt buộc');

threw = null;
try { buildLogRow({ groupId: 1, tournamentId: 7, actor: '', action: 'x', targetType: 't' }); } catch (e) { threw = e; }
assert(threw !== null && /actor/.test(threw.message), 'thiếu actor thì ném lỗi');

// writeOperationLog không được làm hỏng nghiệp vụ chính khi ghi log lỗi.
let called = 0;
const fakeDbOk = { from() { return { insert: async () => { called += 1; return { error: null }; } }; } };
const fakeDbErr = { from() { return { insert: async () => ({ error: { message: 'boom' } }) }; } };
(async () => {
  const okResult = await writeOperationLog(fakeDbOk, { groupId: 1, tournamentId: 7, actor: 'a', action: 'x', targetType: 't' });
  assert(okResult.ok === true && called === 1, 'ghi log thành công');
  const errResult = await writeOperationLog(fakeDbErr, { groupId: 1, tournamentId: 7, actor: 'a', action: 'x', targetType: 't' });
  assert(errResult.ok === false, 'ghi log lỗi trả ok:false');
  assert(errResult.error === 'boom', 'giữ thông báo lỗi');
  console.log('lifecycle ok');
})();
