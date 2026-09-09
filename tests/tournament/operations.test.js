const path = require('path');
const assert = (condition, message) => {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
};

const lifecycle = require(path.join(__dirname, '..', '..', 'lib', 'tournament', 'matchLifecycle'));
const board = require(path.join(__dirname, '..', '..', 'lib', 'tournament', 'courtBoard'));

const validTransitions = [
  ['pending', 'warmup'], ['warmup', 'pending'], ['warmup', 'live'], ['live', 'paused'],
  ['paused', 'live'], ['live', 'finalized'], ['warmup', 'finalized'], ['paused', 'finalized'],
];
for (const [from, to] of validTransitions) assert(lifecycle.canTransitionMatch(from, to).ok, `cạnh hợp lệ ${from} -> ${to}`);
assert(Object.values(lifecycle.MATCH_TRANSITIONS).reduce((count, map) => count + Object.keys(map).length, 0) === 8, 'đúng 8 cạnh');
for (const [from, to] of [['pending', 'live'], ['pending', 'finalized'], ['finalized', 'live'], ['finalized', 'pending'], ['live', 'pending']]) {
  const result = lifecycle.canTransitionMatch(from, to);
  assert(!result.ok && result.code === 'INVALID_MATCH_TRANSITION', `cạnh cấm ${from} -> ${to}`);
}
assert(/khởi động/.test(lifecycle.canTransitionMatch('pending', 'live').message), 'nêu bước khởi động');
assert(lifecycle.canTransitionMatch('warmup', 'pending').requiresReason, 'huỷ gọi bắt lý do');
assert(lifecycle.canTransitionMatch('warmup', 'finalized').requiresReason, 'walkover bắt lý do');
assert(lifecycle.canTransitionMatch('paused', 'finalized').requiresReason, 'retired bắt lý do');
assert(!lifecycle.canTransitionMatch('live', 'finalized').requiresReason, 'chốt bình thường không bắt lý do');
assert(lifecycle.resultTypeFor('warmup', 'finalized') === 'walkover', 'walkover');
assert(lifecycle.resultTypeFor('paused', 'finalized') === 'retired', 'retired');
const now = '2026-09-09T08:00:00.000Z';
assert(lifecycle.timestampsFor('pending', 'warmup', now).warmup_started_at === now, 'ghi mốc warmup');
assert(lifecycle.timestampsFor('warmup', 'live', now).started_at === now, 'ghi mốc bắt đầu');
assert(lifecycle.timestampsFor('live', 'finalized', now).ended_at === now, 'ghi mốc kết thúc');
assert(lifecycle.timestampsFor('warmup', 'pending', now).warmup_started_at === null, 'xoá mốc warmup khi huỷ');
assert(Object.keys(lifecycle.timestampsFor('live', 'paused', now)).length === 0, 'tạm dừng không đổi mốc');
const t0 = Date.parse('2026-09-09T08:00:00Z');
assert(lifecycle.matchElapsed({ status: 'live', started_at: '2026-09-09T08:00:00Z' }, t0 + 125000).seconds === 125, 'đồng hồ live');
assert(lifecycle.matchElapsed({ status: 'paused', started_at: '2026-09-09T08:00:00Z' }, t0 + 125000).seconds === 125, 'đồng hồ paused');
assert(lifecycle.matchElapsed({ status: 'finalized', started_at: '2026-09-09T08:00:00Z', ended_at: '2026-09-09T08:20:00Z' }, t0).seconds === 1200, 'thời lượng đã chốt');
assert(lifecycle.matchElapsed({ status: 'warmup', warmup_started_at: '2026-09-09T08:00:00Z' }, t0 + 60000, { warmupMinutes: 4 }).countdownSeconds === 180, 'đếm ngược warmup');
assert(lifecycle.matchElapsed({ status: 'warmup', warmup_started_at: '2026-09-09T08:00:00Z' }, t0 + 600000, { warmupMinutes: 4 }).countdownSeconds === 0, 'warmup không âm');
assert(lifecycle.matchElapsed({ status: 'pending' }, t0).seconds === null, 'pending không có đồng hồ');

const court = { id: 1, label: 'Sân 01', active: true };
assert(board.computeCourtState(court, [{ status: 'live' }], 3).state === 'playing', 'live -> playing');
assert(board.computeCourtState(court, [{ status: 'warmup' }], 3).state === 'warming', 'warmup -> warming');
assert(board.computeCourtState(court, [{ status: 'paused' }], 3).state === 'playing', 'paused vẫn bận');
assert(board.computeCourtState(court, [], 3).state === 'needs_call', 'có hàng đợi -> cần gọi');
assert(board.computeCourtState(court, [], 0).state === 'idle', 'hết hàng đợi -> trống');
assert(board.computeCourtState({ ...court, active: false }, [], 3).state === 'off', 'sân tắt -> off');
assert(board.computeCourtState({ ...court, active: false }, [{ status: 'live' }], 3).state === 'playing', 'trận đang đấu vẫn hiện');

const current = Date.parse('2026-09-09T08:00:00Z');
const projection = board.projectSchedule({
  courts: [{ id: 1, active: true }, { id: 2, active: true }], runningByCourt: {},
  queue: [{ id: 11 }, { id: 12 }, { id: 13 }], matchMinutes: 20, now: current,
});
assert(projection.byMatchId[11] === current && projection.byMatchId[12] === current, 'hai trận đầu vào sân ngay');
assert(projection.byMatchId[13] === current + 20 * 60000, 'trận thứ ba chờ sân');
assert(projection.finishAt === current + 40 * 60000, 'giờ hoàn tất');
const oneCourt = board.projectSchedule({ courts: [{ id: 1, active: true }], runningByCourt: {}, queue: [{ id: 11 }, { id: 12 }, { id: 13 }], matchMinutes: 20, now: current });
assert(oneCourt.finishAt - projection.finishAt === 20 * 60000, 'ít sân thì lùi đúng thời lượng');
const running = board.projectSchedule({ courts: [{ id: 1, active: true }], runningByCourt: { 1: { started_at: '2026-09-09T07:50:00Z' } }, queue: [{ id: 11 }], matchMinutes: 20, now: current });
assert(running.byMatchId[11] === current + 10 * 60000, 'né trận đang chạy');
const locked = board.projectSchedule({ courts: [{ id: 1, active: true }, { id: 2, active: true }], runningByCourt: {}, queue: [{ id: 11, locked_start: '2026-09-09T09:00:00Z' }, { id: 12 }], matchMinutes: 20, now: current });
assert(locked.byMatchId[11] === Date.parse('2026-09-09T09:00:00Z'), 'giữ giờ ghim');
assert(locked.byMatchId[12] === current, 'trận khác không bị chặn bởi giờ ghim');
assert(board.projectSchedule({ courts: [], runningByCourt: {}, queue: [{ id: 1 }], matchMinutes: 20, now: current }).finishAt === null, 'không sân -> null');
assert(board.averageMatchMinutes([{ status: 'finalized', started_at: '2026-09-09T08:00:00Z', ended_at: '2026-09-09T08:20:00Z' }, { status: 'finalized', started_at: '2026-09-09T08:00:00Z', ended_at: '2026-09-09T08:30:00Z' }]) === 25, 'trung bình thời lượng');
assert(board.averageMatchMinutes([{ status: 'finalized', started_at: null, ended_at: '2026-09-09T08:30:00Z' }]) === null, 'bỏ qua mốc thiếu');
assert(board.averageMatchMinutes([]) === null, 'không có trận -> null');

console.log('operations ok');