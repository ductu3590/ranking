const assert = require('assert');
const { fetchAllRows } = require('../lib/fundContributions.js');

function fakeClient(total) {
    return {
        from() { return this; },
        select() { return this; },
        eq() { return this; },
        order() { return this; },
        range(from, to) {
            const rows = [];
            for (let i = from; i <= Math.min(to, total - 1); i += 1) rows.push({ id: i + 1 });
            return Promise.resolve({ data: rows, error: null });
        },
    };
}

(async () => {
    const rows = await fetchAllRows(fakeClient(2500), { table: 'quy_pickleball', groupId: 1 });
    assert.strictEqual(rows.length, 2500, 'Phải đọc đủ 2500 hàng, không bị cắt ở 1000');

    const small = await fetchAllRows(fakeClient(12), { table: 'quy_pickleball', groupId: 1 });
    assert.strictEqual(small.length, 12, 'Bộ nhỏ vẫn phải đúng');

    const empty = await fetchAllRows(fakeClient(0), { table: 'quy_pickleball', groupId: 1 });
    assert.deepStrictEqual(empty, [], 'Bộ rỗng trả mảng rỗng');

    console.log('transactions-completeness: PASS');
})();