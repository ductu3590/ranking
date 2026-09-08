const assert = require('assert');
const {
    getPeriodBounds,
    buildContributionLeaderboard,
    normalizeName,
} = require('../lib/fundLeaderboard.js');

const members = [
    { full_name: 'NGUYỄN VĂN A', is_active: true },
    { full_name: 'TRẦN THỊ B', is_active: true },
    { full_name: 'LÊ VĂN C', is_active: false },
];

function tx(name, amount, iso, loai = 'nop_phat') {
    return { nguoi_nop: name, so_tien: amount, created_at: iso, huong_giao_dich: 'in', loai_giao_dich: loai };
}

const now = new Date('2026-09-08T05:00:00.000Z');

const week = getPeriodBounds('week', now);
assert.strictEqual(week.start.toISOString(), '2026-09-06T17:00:00.000Z');
const month = getPeriodBounds('month', now);
assert.strictEqual(month.start.toISOString(), '2026-08-31T17:00:00.000Z');
const year = getPeriodBounds('year', now);
assert.strictEqual(year.start.toISOString(), '2025-12-31T17:00:00.000Z');
assert.strictEqual(getPeriodBounds('all', now).start, null);

const board = buildContributionLeaderboard({
    transactions: [
        tx('NGUYỄN VĂN A', 100000, '2026-09-08T02:00:00.000Z', 'nop_phat'),
        tx('NGUYỄN VĂN A', 500000, '2026-09-08T03:00:00.000Z', 'khac'),
        tx('TRẦN THỊ B', 200000, '2026-09-08T02:00:00.000Z', 'nop_quy'),
    ],
    members, period: 'week', now,
});
assert.strictEqual(board.rows[0].name, 'NGUYỄN VĂN A');
assert.strictEqual(board.rows[0].amount, 600000);
assert.strictEqual(board.summary.totalAmount, 800000);

const withJunk = buildContributionLeaderboard({
    transactions: [
        tx('NGUYỄN VĂN A', 100000, '2026-09-08T02:00:00.000Z'),
        tx('BANKAPINOTIFY NOP TIEN QUY 3', 1560000, '2026-09-08T02:00:00.000Z'),
        tx('Unknown', 50000, '2026-09-08T02:00:00.000Z'),
        tx('THỦ QUỸ', 6240000, '2026-09-08T02:00:00.000Z'),
        tx('TAI KHOAN GOC', 1544000, '2026-09-08T02:00:00.000Z'),
    ],
    members, period: 'week', now,
});
assert.strictEqual(withJunk.rows.length, 1);
assert.strictEqual(withJunk.unassigned.amount, 9394000);
assert.strictEqual(withJunk.unassigned.count, 4);

const tie = buildContributionLeaderboard({
    transactions: [
        tx('TRẦN THỊ B', 100000, '2026-09-08T02:00:00.000Z'),
        tx('NGUYỄN VĂN A', 50000, '2026-09-08T02:00:00.000Z'),
        tx('NGUYỄN VĂN A', 50000, '2026-09-08T03:00:00.000Z'),
    ],
    members, period: 'week', now,
});
assert.strictEqual(tie.rows[0].name, 'NGUYỄN VĂN A');

const invalid = buildContributionLeaderboard({
    transactions: [
        tx('NGUYỄN VĂN A', 0, '2026-09-08T02:00:00.000Z'),
        tx('NGUYỄN VĂN A', -5000, '2026-09-08T02:00:00.000Z'),
        tx('NGUYỄN VĂN A', 10000, 'ngay-khong-hop-le'),
    ],
    members, period: 'week', now,
});
assert.strictEqual(invalid.rows.length, 0);

const streak = buildContributionLeaderboard({
    transactions: [
        tx('NGUYỄN VĂN A', 10000, '2026-09-08T02:00:00.000Z'),
        tx('NGUYỄN VĂN A', 10000, '2026-09-01T02:00:00.000Z'),
        tx('NGUYỄN VĂN A', 10000, '2026-08-25T02:00:00.000Z'),
    ],
    members, period: 'week', now,
});
assert.strictEqual(streak.rows[0].streak, 3);

const broken = buildContributionLeaderboard({
    transactions: [
        tx('NGUYỄN VĂN A', 10000, '2026-09-08T02:00:00.000Z'),
        tx('NGUYỄN VĂN A', 10000, '2026-08-25T02:00:00.000Z'),
    ],
    members, period: 'week', now,
});
assert.strictEqual(broken.rows[0].streak, 1);

const noStreak = buildContributionLeaderboard({
    transactions: [tx('NGUYỄN VĂN A', 10000, '2026-09-08T02:00:00.000Z')],
    members, period: 'all', now,
});
assert.strictEqual(noStreak.rows[0].streak, 0);

const badges = buildContributionLeaderboard({
    transactions: [
        tx('NGUYỄN VĂN A', 10000, '2026-09-08T02:00:00.000Z'),
        tx('NGUYỄN VĂN A', 10000, '2026-09-01T02:00:00.000Z'),
        tx('NGUYỄN VĂN A', 10000, '2026-08-25T02:00:00.000Z'),
        tx('TRẦN THỊ B', 1000, '2026-09-08T02:00:00.000Z'),
        tx('TRẦN THỊ B', 90000, '2026-09-01T02:00:00.000Z'),
    ],
    members, period: 'week', now,
});
assert(badges.rows.find((r) => r.name === 'NGUYỄN VĂN A').badges.some((b) => b.kind === 'streak'));
assert.strictEqual(badges.rows.find((r) => r.badges.some((b) => b.kind === 'champion')).name, 'TRẦN THỊ B');

const first = buildContributionLeaderboard({
    transactions: [tx('TRẦN THỊ B', 20000, '2026-09-08T02:00:00.000Z')],
    members, period: 'week', now,
});
assert(first.rows[0].badges.some((b) => b.kind === 'first_time'));

const idle = buildContributionLeaderboard({
    transactions: [
        tx('NGUYỄN VĂN A', 10000, '2026-09-08T02:00:00.000Z'),
        tx('TRẦN THỊ B', 10000, '2026-08-04T02:00:00.000Z'),
    ],
    members, period: 'week', now, shameBadgesEnabled: true,
});
assert(idle.idle.some((p) => p.name === 'TRẦN THỊ B'));
assert(!idle.idle.some((p) => p.name === 'LÊ VĂN C'));

const idleOff = buildContributionLeaderboard({
    transactions: [
        tx('NGUYỄN VĂN A', 10000, '2026-09-08T02:00:00.000Z'),
        tx('TRẦN THỊ B', 10000, '2026-08-04T02:00:00.000Z'),
    ],
    members, period: 'week', now, shameBadgesEnabled: false,
});
assert.deepStrictEqual(idleOff.idle, []);

const newcomer = buildContributionLeaderboard({
    transactions: [tx('NGUYỄN VĂN A', 10000, '2026-09-08T02:00:00.000Z')],
    members, period: 'week', now, shameBadgesEnabled: true,
});
assert(!newcomer.idle.some((p) => p.name === 'TRẦN THỊ B'));
assert.strictEqual(normalizeName('  nguyễn   văn a '), 'NGUYỄN VĂN A');

// nudge: có người thực sự chưa góp gần đây (bỏ current + previous) → nhắc họ
const nudgeBehind = buildContributionLeaderboard({
    transactions: [
        tx('NGUYỄN VĂN A', 10000, '2026-09-08T02:00:00.000Z'),
        tx('TRẦN THỊ B', 10000, '2026-08-04T02:00:00.000Z'),
    ],
    members, period: 'week', now, shameBadgesEnabled: true,
});
assert.strictEqual(nudgeBehind.nudge.mode, 'behind');
assert(nudgeBehind.nudge.items.some((p) => p.name === 'TRẦN THỊ B'));
assert(!nudgeBehind.nudge.items.some((p) => p.name === 'NGUYỄN VĂN A'), 'người vừa góp tuần này không bị nhắc');

// nudge: cả CLB đã góp tuần này → chuyển sang nhắc người góp ít nhất
const membersLow = [
    { full_name: 'NGUYỄN VĂN A', is_active: true },
    { full_name: 'TRẦN THỊ B', is_active: true },
    { full_name: 'PHẠM VĂN D', is_active: true },
];
const nudgeLow = buildContributionLeaderboard({
    transactions: [
        tx('NGUYỄN VĂN A', 30000, '2026-09-08T02:00:00.000Z'),
        tx('TRẦN THỊ B', 20000, '2026-09-08T02:00:00.000Z'),
        tx('PHẠM VĂN D', 10000, '2026-09-08T02:00:00.000Z'),
    ],
    members: membersLow, period: 'week', now, shameBadgesEnabled: true,
});
assert.strictEqual(nudgeLow.nudge.mode, 'low');
assert(nudgeLow.nudge.items.some((p) => p.name === 'PHẠM VĂN D'), 'người góp ít nhất được nhắc');
assert(!nudgeLow.nudge.items.some((p) => p.name === 'NGUYỄN VĂN A'), 'người góp nhiều không bị nhắc');

// nudge: mọi người góp đều nhau → không nhắc ai
const nudgeEqual = buildContributionLeaderboard({
    transactions: [
        tx('NGUYỄN VĂN A', 20000, '2026-09-08T02:00:00.000Z'),
        tx('TRẦN THỊ B', 20000, '2026-09-08T02:00:00.000Z'),
        tx('PHẠM VĂN D', 20000, '2026-09-08T02:00:00.000Z'),
    ],
    members: membersLow, period: 'week', now, shameBadgesEnabled: true,
});
assert.strictEqual(nudgeEqual.nudge.mode, null);

const nudgeOff = buildContributionLeaderboard({
    transactions: [tx('NGUYỄN VĂN A', 30000, '2026-09-08T02:00:00.000Z')],
    members: membersLow, period: 'week', now, shameBadgesEnabled: false,
});
assert.strictEqual(nudgeOff.nudge.mode, null);

console.log('fund-leaderboard: PASS');
