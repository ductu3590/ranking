import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export async function POST(request) {
    try {
        // Lấy ngày hiện tại (chỉ date, không có time)
        const today = new Date().toISOString().split('T')[0];

        // Lấy thời điểm bắt đầu tháng hiện tại
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

        // 1. Tính xếp hạng hiện tại từ bảng quy_pickleball
        const { data: transactions, error: fetchError } = await supabase
            .from('quy_pickleball')
            .select('nguoi_nop, so_tien, huong_giao_dich, loai_giao_dich')
            .gte('created_at', startOfMonth);

        if (fetchError) {
            console.error('Error fetching transactions:', fetchError);
            return Response.json({ error: 'Failed to fetch transactions' }, { status: 500 });
        }

        // Lọc và tính toán ranking giống như trong page.js
        const incomingTransactions = transactions.filter(
            item => item.nguoi_nop !== 'TAI KHOAN GOC'
                && item.huong_giao_dich === 'in'
                && (item.loai_giao_dich === 'nop_phat' || item.so_tien <= 100000)
        );

        // Tính tổng tiền cho mỗi người
        const ranking = {};
        incomingTransactions.forEach(item => {
            if (!ranking[item.nguoi_nop]) ranking[item.nguoi_nop] = 0;
            ranking[item.nguoi_nop] += item.so_tien;
        });

        // Sort và tạo array với rank position
        const sortedRanking = Object.entries(ranking)
            .map(([name, amount]) => ({ name, amount }))
            .sort((a, b) => b.amount - a.amount);

        if (sortedRanking.length === 0) {
            return Response.json({
                message: 'No rankings to save',
                count: 0
            }, { status: 200 });
        }

        // 2. Xóa snapshot cũ của ngày hôm nay (nếu có) để tránh duplicate
        const { error: deleteError } = await supabase
            .from('ranking_snapshots')
            .delete()
            .eq('snapshot_date', today);

        if (deleteError) {
            console.error('Error deleting old snapshots:', deleteError);
            // Không return error, tiếp tục insert
        }

        // 3. Tạo snapshot data
        const snapshotData = sortedRanking.map((item, index) => ({
            nguoi_nop: item.name,
            rank_position: index + 1,
            total_amount: item.amount,
            snapshot_date: today
        }));

        // 4. Insert snapshot mới
        const { data: insertedData, error: insertError } = await supabase
            .from('ranking_snapshots')
            .insert(snapshotData)
            .select();

        if (insertError) {
            console.error('Error inserting snapshots:', insertError);
            return Response.json({ error: 'Failed to save snapshots' }, { status: 500 });
        }

        return Response.json({
            message: 'Snapshot saved successfully',
            date: today,
            count: insertedData.length,
            data: insertedData
        }, { status: 200 });

    } catch (error) {
        console.error('Unexpected error:', error);
        return Response.json({
            error: 'Internal server error',
            details: error.message
        }, { status: 500 });
    }
}

// GET method để kiểm tra snapshot gần nhất
export async function GET(request) {
    try {
        const { data, error } = await supabase
            .from('ranking_snapshots')
            .select('*')
            .order('snapshot_date', { ascending: false })
            .order('rank_position', { ascending: true })
            .limit(20);

        if (error) {
            return Response.json({ error: error.message }, { status: 500 });
        }

        return Response.json({
            snapshots: data,
            count: data.length
        }, { status: 200 });

    } catch (error) {
        return Response.json({
            error: 'Internal server error',
            details: error.message
        }, { status: 500 });
    }
}
