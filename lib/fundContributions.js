// Đọc đủ dữ liệu bất kể trần số hàng của PostgREST (mặc định 1000).
// Dùng chung cho trang BXH và route sinh ảnh, để hai nơi không bao giờ lệch nhau.
const PAGE_SIZE = 1000;

async function fetchAllRows(client, { table, groupId, orderColumn = 'created_at' }) {
    const rows = [];
    for (let page = 0; ; page += 1) {
        const from = page * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;
        const { data, error } = await client
            .from(table)
            .select('*')
            .eq('group_id', groupId)
            .order(orderColumn, { ascending: false })
            .range(from, to);
        if (error) throw new Error(error.message);
        const batch = data || [];
        rows.push(...batch);
        if (batch.length < PAGE_SIZE) return rows;
    }
}

async function loadContributionInputs(client, groupId) {
    const [transactions, members] = await Promise.all([
        fetchAllRows(client, { table: 'quy_pickleball', groupId }),
        fetchAllRows(client, { table: 'club_members', groupId, orderColumn: 'full_name' }),
    ]);
    return { transactions, members };
}

module.exports = { fetchAllRows, loadContributionInputs, PAGE_SIZE };