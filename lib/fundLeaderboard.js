// BXH đóng góp — hàm thuần, không I/O.
// Múi giờ chốt là Asia/Ho_Chi_Minh (UTC+7, không có DST).
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const EXCLUDED_SENTINELS = new Set(['', 'UNKNOWN', 'TAI KHOAN GOC', 'THỦ QUỸ']);
const STREAK_DISPLAY_MIN = 2;
const STREAK_BADGE_MIN = 3;
const IDLE_MIN_PERIODS = 3;

function normalizeName(value) {
    return String(value || '').trim().replace(/\s+/g, ' ').toLocaleUpperCase('vi-VN');
}

function toVnWall(date) { return new Date(date.getTime() + VN_OFFSET_MS); }
function fromVnWall(wall) { return new Date(wall.getTime() - VN_OFFSET_MS); }

function startOfPeriodWall(period, wall) {
    const start = new Date(wall.getTime());
    if (period === 'year') start.setUTCMonth(0, 1);
    else if (period === 'month') start.setUTCDate(1);
    else if (period === 'week') {
        const dayFromMonday = (start.getUTCDay() + 6) % 7;
        start.setUTCDate(start.getUTCDate() - dayFromMonday);
    }
    start.setUTCHours(0, 0, 0, 0);
    return start;
}

function getPeriodBounds(period, now = new Date()) {
    if (period === 'all') return { start: null, end: now };
    return { start: fromVnWall(startOfPeriodWall(period, toVnWall(now))), end: now };
}

function shiftPeriod(period, now, back) {
    const wall = startOfPeriodWall(period, toVnWall(now));
    if (period === 'week') wall.setUTCDate(wall.getUTCDate() - 7 * back);
    else if (period === 'month') wall.setUTCMonth(wall.getUTCMonth() - back);
    else if (period === 'year') wall.setUTCFullYear(wall.getUTCFullYear() - back);
    const start = fromVnWall(wall);
    const nextWall = new Date(wall.getTime());
    if (period === 'week') nextWall.setUTCDate(nextWall.getUTCDate() + 7);
    else if (period === 'month') nextWall.setUTCMonth(nextWall.getUTCMonth() + 1);
    else if (period === 'year') nextWall.setUTCFullYear(nextWall.getUTCFullYear() + 1);
    return { start, end: fromVnWall(nextWall) };
}

function buildRosterIndex(members) {
    const index = new Map();
    for (const member of members || []) {
        const key = normalizeName(member.full_name);
        if (key) index.set(key, member);
    }
    return index;
}

function classify(transaction, roster) {
    const amount = Number(transaction?.so_tien || 0);
    const at = new Date(transaction?.created_at);
    if (transaction?.huong_giao_dich !== 'in') return null;
    if (!Number.isFinite(amount) || amount <= 0) return null;
    if (Number.isNaN(at.getTime())) return null;
    const key = normalizeName(transaction?.nguoi_nop);
    if (!key || EXCLUDED_SENTINELS.has(key)) return { at, amount, member: null };
    const member = roster.get(key);
    return { at, amount, member: member || null, key };
}

function inRange(at, start, end) {
    if (start && at < start) return false;
    return at <= end;
}

function computeStreak(dates, period, now) {
    if (period === 'all' || period === 'year') return 0;
    let streak = 0;
    for (let back = 0; back < 520; back += 1) {
        const { start, end } = shiftPeriod(period, now, back);
        if (!dates.some((at) => at >= start && at < end)) break;
        streak += 1;
    }
    return streak;
}

function periodLabelUnit(period) { return period === 'month' ? 'tháng' : 'tuần'; }

function buildContributionLeaderboard({ transactions, members, period, now = new Date(), shameBadgesEnabled = true }) {
    const roster = buildRosterIndex(members);
    const { start, end } = getPeriodBounds(period, now);
    const byMember = new Map();
    const allDatesByMember = new Map();
    const firstEverByMember = new Map();
    let unassignedAmount = 0;
    let unassignedCount = 0;

    for (const transaction of transactions || []) {
        const item = classify(transaction, roster);
        if (!item) continue;
        if (!item.member) {
            if (inRange(item.at, start, end)) {
                unassignedAmount += item.amount;
                unassignedCount += 1;
            }
            continue;
        }

        const dates = allDatesByMember.get(item.key) || [];
        dates.push(item.at);
        allDatesByMember.set(item.key, dates);
        const firstEver = firstEverByMember.get(item.key);
        if (!firstEver || item.at < firstEver) firstEverByMember.set(item.key, item.at);
        if (!inRange(item.at, start, end)) continue;
        const current = byMember.get(item.key) || { name: item.member.full_name, amount: 0, transactionCount: 0 };
        current.amount += item.amount;
        current.transactionCount += 1;
        byMember.set(item.key, current);
    }

    let championKey = null;
    if (period !== 'all') {
        const previous = shiftPeriod(period, now, 1);
        const previousTotals = new Map();
        for (const transaction of transactions || []) {
            const item = classify(transaction, roster);
            if (!item || !item.member || item.at < previous.start || item.at >= previous.end) continue;
            previousTotals.set(item.key, (previousTotals.get(item.key) || 0) + item.amount);
        }
        let best = 0;
        for (const [key, total] of previousTotals) {
            if (total > best) { best = total; championKey = key; }
        }
    }

    const rows = Array.from(byMember, ([key, value]) => {
        const dates = (allDatesByMember.get(key) || []).slice().sort((a, b) => b - a);
        const streak = computeStreak(dates, period, now);
        const badges = [];
        if (championKey === key) badges.push({ kind: 'champion', label: `Quán quân ${periodLabelUnit(period)} trước` });
        if (streak >= STREAK_BADGE_MIN) badges.push({ kind: 'streak', label: `Chuỗi ${streak} ${periodLabelUnit(period)}` });
        const firstEver = firstEverByMember.get(key);
        if (period !== 'all' && firstEver && inRange(firstEver, start, end)) badges.push({ kind: 'first_time', label: 'Lần đầu góp quỹ' });
        return {
            key,
            name: value.name,
            amount: value.amount,
            transactionCount: value.transactionCount,
            streak: streak >= STREAK_DISPLAY_MIN ? streak : (period === 'all' || period === 'year' ? 0 : streak),
            badges,
        };
    })
        .sort((a, b) => b.amount - a.amount || b.transactionCount - a.transactionCount || a.name.localeCompare(b.name, 'vi'))
        .map((row, index) => ({ rank: index + 1, ...row }));

    const idle = [];
    if (shameBadgesEnabled && (period === 'week' || period === 'month')) {
        for (const member of members || []) {
            if (member.is_active !== true) continue;
            const key = normalizeName(member.full_name);
            const dates = allDatesByMember.get(key);
            if (!dates || dates.length === 0) continue;
            let missed = 0;
            for (let back = 1; back <= IDLE_MIN_PERIODS; back += 1) {
                const window = shiftPeriod(period, now, back);
                if (dates.some((at) => at >= window.start && at < window.end)) break;
                missed += 1;
            }
            if (missed >= IDLE_MIN_PERIODS) {
                idle.push({
                    name: member.full_name,
                    periods: missed,
                    label: `Trắng tay ${missed} ${periodLabelUnit(period)}`,
                    description: `Chưa đóng quỹ trong ${missed} ${periodLabelUnit(period)}`,
                });
            }
        }
    }

    return {
        period: { key: period, start, end },
        rows,
        summary: {
            totalAmount: rows.reduce((sum, row) => sum + row.amount, 0),
            memberCount: rows.length,
            transactionCount: rows.reduce((sum, row) => sum + row.transactionCount, 0),
        },
        unassigned: { amount: unassignedAmount, count: unassignedCount },
        idle,
    };
}

module.exports = { normalizeName, getPeriodBounds, shiftPeriod, buildContributionLeaderboard };
