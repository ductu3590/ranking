const assert = require('assert');

const {
    buildPenaltyLeaderboard,
    getPenaltyPeriodBounds,
    summarizePenaltyLeaderboard,
} = require('../lib/fundLeaderboard');

const now = new Date(2026, 8, 1, 15, 30, 0);

const week = getPenaltyPeriodBounds('week', now);
assert.strictEqual(
    week.start.getTime(),
    new Date(2026, 7, 31, 0, 0, 0, 0).getTime(),
    'Tuần hiện tại phải bắt đầu lúc 00:00 thứ Hai.'
);
assert.strictEqual(
    week.end.getTime(),
    now.getTime(),
    'Khoảng thời gian tuần phải kết thúc tại thời điểm hiện tại.'
);

const month = getPenaltyPeriodBounds('month', now);
assert.strictEqual(
    month.start.getTime(),
    new Date(2026, 8, 1, 0, 0, 0, 0).getTime(),
    'Tháng hiện tại phải bắt đầu lúc 00:00 ngày đầu tháng.'
);
assert.strictEqual(
    month.end.getTime(),
    now.getTime(),
    'Khoảng thời gian tháng phải kết thúc tại thời điểm hiện tại.'
);

const transactions = [
    { id: 1, nguoi_nop: 'An', so_tien: 100000, huong_giao_dich: 'in', loai_giao_dich: 'nop_phat', created_at: '2026-08-31T03:00:00.000Z' },
    { id: 2, nguoi_nop: 'An', so_tien: 50000, huong_giao_dich: 'in', loai_giao_dich: 'nop_phat', created_at: '2026-09-01T05:00:00.000Z' },
    { id: 3, nguoi_nop: 'Bình', so_tien: 200000, huong_giao_dich: 'in', loai_giao_dich: 'nop_phat', created_at: '2026-09-01T04:00:00.000Z' },
    { id: 4, nguoi_nop: 'Chi', so_tien: 500000, huong_giao_dich: 'in', loai_giao_dich: 'nop_quy', created_at: '2026-09-01T04:00:00.000Z' },
    { id: 5, nguoi_nop: 'Dũng', so_tien: -300000, huong_giao_dich: 'out', loai_giao_dich: 'nop_phat', created_at: '2026-09-01T04:00:00.000Z' },
    { id: 6, nguoi_nop: 'Unknown', so_tien: 900000, huong_giao_dich: 'in', loai_giao_dich: 'nop_phat', created_at: '2026-09-01T04:00:00.000Z' },
    { id: 7, nguoi_nop: 'Bình', so_tien: 100000, huong_giao_dich: 'in', loai_giao_dich: 'nop_phat', created_at: '2026-09-01T09:00:00.000Z' },
];

assert.deepStrictEqual(
    buildPenaltyLeaderboard(transactions, 'week', now),
    [
        { rank: 1, name: 'Bình', amount: 200000, transactionCount: 1 },
        { rank: 2, name: 'An', amount: 150000, transactionCount: 2 },
    ],
    'BXH tuần phải cộng đúng tiền phạt, sắp xếp giảm dần và loại giao dịch không hợp lệ.'
);

assert.deepStrictEqual(
    buildPenaltyLeaderboard(transactions, 'month', now),
    [
        { rank: 1, name: 'Bình', amount: 200000, transactionCount: 1 },
        { rank: 2, name: 'An', amount: 50000, transactionCount: 1 },
    ],
    'BXH tháng chỉ tính giao dịch từ đầu tháng hiện tại.'
);

assert.deepStrictEqual(
    summarizePenaltyLeaderboard(buildPenaltyLeaderboard(transactions, 'week', now)),
    { memberCount: 2, totalAmount: 350000, transactionCount: 3 },
    'Phần tổng quan phải phản ánh đúng số thành viên, tổng tiền và số lượt nộp phạt.'
);

console.log('fund leaderboard logic ok');
