import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getClubScope, requireValidatedGroupAdmin } from '@/lib/groupSession';

export async function POST() {
    const adminCheck = await requireValidatedGroupAdmin();
    if (!adminCheck.ok) return adminCheck.response;

    const groupId = adminCheck.groupId;

    try {
        // Lấy ngày hiện tại (chỉ date, không có time)
        const today = new Date().toISOString().split('T')[0];

        // Lấy thời điểm bắt đầu tháng hiện tại
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

        // 1. Tính xếp hạng hiện tại từ bảng quy_pickleball trong tenant hiện tại
        const { data: transactions, error: fetchError } = await supabaseAdmin
            .from('quy_pickleball')
            .select('nguoi_nop, so_tien, huong_giao_dich, loai_giao_dich')
            .eq('group_id', groupId)
            .gte('created_at', startOfMonth);

        if (fetchError) {
            console.error('Error fetching transactions:', fetchError);
            return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 });
        }

        // Lọc và tính toán ranking giống như trong page.js
        const incomingTransactions = (transactions || []).filter(
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
            return NextResponse.json({
                message: 'No rankings to save',
                count: 0
            }, { status: 200 });
        }

        // 2. Xóa snapshot cũ của ngày hôm nay trong tenant hiện tại
        const { error: deleteError } = await supabaseAdmin
            .from('ranking_snapshots')
            .delete()
            .eq('group_id', groupId)
            .eq('snapshot_date', today);

        if (deleteError) {
            console.error('Error deleting old snapshots:', deleteError);
            // Không return error, tiếp tục insert
        }

        // 3. Tạo snapshot data
        const snapshotData = sortedRanking.map((item, index) => ({
            group_id: groupId,
            nguoi_nop: item.name,
            rank_position: index + 1,
            total_amount: item.amount,
            snapshot_date: today
        }));

        // 4. Insert snapshot mới
        const { data: insertedData, error: insertError } = await supabaseAdmin
            .from('ranking_snapshots')
            .insert(snapshotData)
            .select();

        if (insertError) {
            console.error('Error inserting snapshots:', insertError);
            return NextResponse.json({ error: 'Failed to save snapshots' }, { status: 500 });
        }

        return NextResponse.json({
            message: 'Snapshot saved successfully',
            date: today,
            count: insertedData.length,
            data: insertedData
        }, { status: 200 });

    } catch (error) {
        console.error('Unexpected error:', error);
        return NextResponse.json({
            error: 'Internal server error',
            details: error.message
        }, { status: 500 });
    }
}

// GET method để kiểm tra snapshot gần nhất trong tenant hiện tại
export async function GET() {
    const scope = getClubScope();
    if (!scope.ok) return scope.response;

    try {
        const { data, error } = await supabaseAdmin
            .from('ranking_snapshots')
            .select('*')
            .eq('group_id', scope.groupId)
            .order('snapshot_date', { ascending: false })
            .order('rank_position', { ascending: true })
            .limit(20);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({
            snapshots: data || [],
            count: (data || []).length
        }, { status: 200 });

    } catch (error) {
        return NextResponse.json({
            error: 'Internal server error',
            details: error.message
        }, { status: 500 });
    }
}
