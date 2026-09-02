function getPenaltyPeriodBounds(period, now = new Date()) {
    const end = new Date(now);
    const start = new Date(now);

    if (period === 'month') {
        start.setDate(1);
    } else {
        const dayFromMonday = (start.getDay() + 6) % 7;
        start.setDate(start.getDate() - dayFromMonday);
    }

    start.setHours(0, 0, 0, 0);

    return { start, end };
}

function buildPenaltyLeaderboard(transactions, period, now = new Date()) {
    const { start, end } = getPenaltyPeriodBounds(period, now);
    const totalsByMember = new Map();

    for (const transaction of transactions || []) {
        const name = String(transaction?.nguoi_nop || '').trim();
        const amount = Number(transaction?.so_tien || 0);
        const transactionDate = new Date(transaction?.created_at);
        const normalizedName = name.toLocaleUpperCase('vi-VN');

        if (
            !name
            || normalizedName === 'UNKNOWN'
            || normalizedName === 'TAI KHOAN GOC'
            || transaction?.huong_giao_dich !== 'in'
            || transaction?.loai_giao_dich !== 'nop_phat'
            || !Number.isFinite(amount)
            || amount <= 0
            || Number.isNaN(transactionDate.getTime())
            || transactionDate < start
            || transactionDate > end
        ) {
            continue;
        }

        const current = totalsByMember.get(name) || { amount: 0, transactionCount: 0 };
        totalsByMember.set(name, {
            amount: current.amount + amount,
            transactionCount: current.transactionCount + 1,
        });
    }

    return Array.from(totalsByMember, ([name, total]) => ({ name, ...total }))
        .sort((a, b) => b.amount - a.amount || b.transactionCount - a.transactionCount || a.name.localeCompare(b.name, 'vi'))
        .map((entry, index) => ({ rank: index + 1, ...entry }));
}

function summarizePenaltyLeaderboard(leaderboard) {
    return (leaderboard || []).reduce((summary, entry) => ({
        memberCount: summary.memberCount + 1,
        totalAmount: summary.totalAmount + entry.amount,
        transactionCount: summary.transactionCount + entry.transactionCount,
    }), {
        memberCount: 0,
        totalAmount: 0,
        transactionCount: 0,
    });
}

module.exports = {
    buildPenaltyLeaderboard,
    getPenaltyPeriodBounds,
    summarizePenaltyLeaderboard,
};
