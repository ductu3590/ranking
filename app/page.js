'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function Home() {
    const [stats, setStats] = useState([]);
    const [totalFund, setTotalFund] = useState(0);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchData();
    }, []);

    async function fetchData() {
        setLoading(true);
        // Lấy dữ liệu tháng hiện tại
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

        const { data, error } = await supabase
            .from('quy_pickleball')
            .select('nguoi_nop, so_tien')
            .gte('created_at', startOfMonth);

        if (error) {
            console.log(error);
            setLoading(false);
        } else {
            // Tính toán xếp hạng (Group by người nộp)
            const ranking = {};
            let total = 0;

            data.forEach(item => {
                total += item.so_tien;
                if (!ranking[item.nguoi_nop]) ranking[item.nguoi_nop] = 0;
                ranking[item.nguoi_nop] += item.so_tien;
            });

            // Chuyển object thành array và sort giảm dần
            const sortedRanking = Object.entries(ranking)
                .map(([name, amount]) => ({ name, amount }))
                .sort((a, b) => b.amount - a.amount);

            setStats(sortedRanking);
            setTotalFund(total);
            setLoading(false);
        }
    }

    return (
        <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif', maxWidth: '600px', margin: '0 auto', backgroundColor: '#f9f9f9', minHeight: '100vh' }}>
            <h1 style={{ textAlign: 'center', color: '#0070f3', marginBottom: '10px' }}>🏓 QUỸ PICKLEBALL</h1>
            <p style={{ textAlign: 'center', color: '#666', marginBottom: '30px' }}>Tháng {new Date().getMonth() + 1}/{new Date().getFullYear()}</p>

            <div style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', padding: '20px', borderRadius: '12px', marginBottom: '30px', textAlign: 'center', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
                <h3 style={{ color: '#fff', margin: '0 0 10px 0', fontSize: '16px', fontWeight: 'normal' }}>Tổng quỹ hiện tại</h3>
                <h2 style={{ color: '#fff', margin: 0, fontSize: '36px' }}>{new Intl.NumberFormat('vi-VN').format(totalFund)} đ</h2>
            </div>

            {loading ? (
                <p style={{ textAlign: 'center', color: '#999' }}>Đang tải dữ liệu...</p>
            ) : (
                <>
                    <h3 style={{ marginBottom: '15px', color: '#333' }}>🏆 Bảng Xếp Hạng "Đóng Góp"</h3>

                    {stats.length === 0 ? (
                        <p style={{ textAlign: 'center', color: '#999', padding: '40px 0' }}>Chưa có dữ liệu đóng góp trong tháng này</p>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: '#fff', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                            <thead>
                                <tr style={{ background: '#333', color: '#fff' }}>
                                    <th style={{ padding: '12px', fontSize: '14px' }}>Hạng</th>
                                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px' }}>Thành viên</th>
                                    <th style={{ padding: '12px', textAlign: 'right', fontSize: '14px' }}>Số tiền</th>
                                </tr>
                            </thead>
                            <tbody>
                                {stats.map((item, index) => (
                                    <tr key={index} style={{ borderBottom: '1px solid #eee', transition: 'background 0.2s' }}>
                                        <td style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold', color: index === 0 ? '#ffd700' : index === 1 ? '#c0c0c0' : index === 2 ? '#cd7f32' : '#666' }}>
                                            {index + 1}
                                        </td>
                                        <td style={{ padding: '12px', fontWeight: 'bold', color: '#333' }}>{item.name}</td>
                                        <td style={{ padding: '12px', textAlign: 'right', color: '#0070f3', fontWeight: '600' }}>
                                            {new Intl.NumberFormat('vi-VN').format(item.amount)} đ
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}

                    <button
                        onClick={fetchData}
                        style={{
                            marginTop: '20px',
                            width: '100%',
                            padding: '12px',
                            backgroundColor: '#0070f3',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '8px',
                            fontSize: '16px',
                            cursor: 'pointer',
                            fontWeight: '600'
                        }}
                    >
                        🔄 Làm mới
                    </button>
                </>
            )}
        </div>
    );
}
