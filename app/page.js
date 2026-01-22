'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function Home() {
    const [stats, setStats] = useState([]);
    const [totalFund, setTotalFund] = useState(0);
    const [baseFund, setBaseFund] = useState(0);
    const [loading, setLoading] = useState(true);
    const [isMobile, setIsMobile] = useState(false);
    const [isSmallMobile, setIsSmallMobile] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [previousRanking, setPreviousRanking] = useState({}); // Map: nguoi_nop -> previous rank
    const [activeTab, setActiveTab] = useState('this-month'); // 'this-month' | 'last-month' | 'all-time'
    const itemsPerPage = 10;

    useEffect(() => {
        fetchData();

        // Detect mobile viewport
        const checkMobile = () => {
            setIsMobile(window.innerWidth <= 768);
            setIsSmallMobile(window.innerWidth <= 360);
        };

        checkMobile();
        window.addEventListener('resize', checkMobile);

        return () => window.removeEventListener('resize', checkMobile);
    }, [activeTab]); // Re-fetch when tab changes

    // Hàm tạo avatar dựa trên rank
    const getAvatar = (index) => {
        if (index === 0) return '/avatar_rank_1.png';
        if (index === 1) return '/avatar_rank_2.png';
        if (index === 2) return '/avatar_rank_3.png';
        return '/avatar_default.png';
    };

    // Hàm tạo biệt danh hài hước
    const getFunnyNickname = (index, name) => {
        const nicknames = [
            { title: '👑 VUA NỘP PHẠT', desc: `"Người dẫn đầu bảng xếp hạng danh dự! Cứ phạm lỗi rồi nộp tiền, chu kỳ hoàn hảo!" 😎` },
            { title: '🥈 Á VƯƠNG PHẠT NGUỘI', desc: `"Gần lắm rồi nhưng chưa đủ! Cố lên nữa là lên top 1 nha bạn ơi!" 😏` },
            { title: '🥉 ĐỒNG HẠNG BA', desc: `"Ít nhất cũng lọt top 3! Danh dự mà, đừng buồn!" 🤗` },
            { title: '💀 TÂN BINH MỚI VỀ ĐỘI', desc: `"Mới toanh! Làm quen với việc nộp phạt đi nhé!" 🔰` },
            { title: '😅 CAO THỦ PHẠM LỖI', desc: `"Đã có kinh nghiệm nộp phạt rồi đấy!" 💪` },
            { title: '🤡 VUA HÀI HƯỚC', desc: `"Nộp ít nhưng vui là được!" 🎭` },
            { title: '🐢 CHẬM MÀ CHẮC', desc: `"Từ từ nộp phạt, đừng vội!" 🚶` },
            { title: '💸 THẦN TÀI NHỎ', desc: `"Đóng góp ít nhưng có tâm!" 🙏` },
            { title: '🎯 XẠ THỦ BỦA', desc: `"Lỡ tay phạm lỗi thôi mà!" 😬` },
            { title: '🌟 NGÔI SAO MỚI NỔI', desc: `"Tài năng trẻ của làng pickleball!" ✨` }
        ];

        return nicknames[Math.min(index, nicknames.length - 1)];
    };

    // Hàm format số tiền cho mobile (compact) và desktop (full)
    const formatAmount = (amount, isMobile) => {
        if (isMobile) {
            // Mobile: 200.000 -> 200K, 1.500.000 -> 1,5Tr
            if (amount >= 1000000) {
                return (amount / 1000000).toFixed(amount % 1000000 === 0 ? 0 : 1) + 'Tr';
            } else if (amount >= 1000) {
                return (amount / 1000).toFixed(amount % 1000 === 0 ? 0 : 0) + 'K';
            }
            return amount.toString();
        } else {
            // Desktop: Format đầy đủ với dấu phẩy
            return new Intl.NumberFormat('vi-VN').format(amount) + ' đ';
        }
    };

    // Hàm render icon thay đổi rank
    const getRankChangeIcon = (currentRank, previousRank) => {
        if (!previousRank) {
            return <span style={{ fontSize: isMobile ? '10px' : '12px', color: '#999', fontWeight: '600' }}>NEW</span>;
        }

        const change = previousRank - currentRank; // Positive = tăng hạng, Negative = giảm hạng

        if (change > 0) {
            // Tăng hạng (số rank nhỏ hơn = tốt hơn)
            return (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#00C853' }}>
                    <span style={{ fontSize: isMobile ? '18px' : '22px', lineHeight: '1' }}>↑</span>
                    <span style={{ fontSize: isMobile ? '11px' : '13px', fontWeight: '700' }}>+{change}</span>
                </div>
            );
        } else if (change < 0) {
            // Giảm hạng
            return (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#FF3D00' }}>
                    <span style={{ fontSize: isMobile ? '18px' : '22px', lineHeight: '1' }}>↓</span>
                    <span style={{ fontSize: isMobile ? '11px' : '13px', fontWeight: '700' }}>{change}</span>
                </div>
            );
        } else {
            // Giữ nguyên
            return (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#999' }}>
                    <span style={{ fontSize: isMobile ? '14px' : '16px', lineHeight: '1' }}>=</span>
                </div>
            );
        }
    };

    async function fetchData() {
        setLoading(true);
        const now = new Date();

        // Calculate date ranges based on active tab
        let startDate, endDate;

        if (activeTab === 'this-month') {
            // Tháng này: từ đầu tháng đến giờ
            startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
            endDate = null; // No end date = up to now
        } else if (activeTab === 'last-month') {
            // Tháng trước: từ đầu tháng trước đến cuối tháng trước
            startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
            endDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        } else {
            // All-time: không filter date
            startDate = null;
            endDate = null;
        }

        // Lấy TẤT CẢ giao dịch (cả tiền vào và tiền ra) theo date range
        let query = supabase
            .from('quy_pickleball')
            .select('nguoi_nop, so_tien, huong_giao_dich, loai_giao_dich');

        if (startDate) query = query.gte('created_at', startDate);
        if (endDate) query = query.lt('created_at', endDate);

        const { data, error } = await query;

        // Lấy snapshot gần nhất để so sánh rank
        const { data: snapshotData } = await supabase
            .from('ranking_snapshots')
            .select('nguoi_nop, rank_position, snapshot_date')
            .lt('snapshot_date', new Date().toISOString().split('T')[0]) // Lấy snapshot trước hôm nay
            .order('snapshot_date', { ascending: false })
            .limit(100); // Lấy nhiều record để đảm bảo có đủ của ngày gần nhất

        // Tạo map previous ranking từ snapshot gần nhất
        const prevRankMap = {};
        if (snapshotData && snapshotData.length > 0) {
            const latestDate = snapshotData[0].snapshot_date;
            snapshotData
                .filter(s => s.snapshot_date === latestDate)
                .forEach(snapshot => {
                    prevRankMap[snapshot.nguoi_nop] = snapshot.rank_position;
                });
        }
        setPreviousRanking(prevRankMap);

        if (error) {
            console.log(error);
            setLoading(false);
        } else {
            // Tách riêng tài khoản gốc
            const baseAccount = data.filter(item => item.nguoi_nop === 'TAI KHOAN GOC');

            // Chỉ lấy giao dịch TIỀN VÀO và chỉ hiển thị các giao dịch NỘP PHẠT (≤200K hoặc đã được phân loại là nộp phạt)
            const incomingTransactions = data.filter(
                item => item.nguoi_nop !== 'TAI KHOAN GOC'
                    && item.huong_giao_dich === 'in'
                    && (item.loai_giao_dich === 'nop_phat' || item.so_tien <= 200000)
            );

            // Lấy tất cả giao dịch TIỀN RA để tính tổng quỹ
            const outgoingTransactions = data.filter(item => item.huong_giao_dich === 'out');

            // Tính tài khoản gốc
            let base = 0;
            baseAccount.forEach(item => {
                base += item.so_tien;
            });

            // Tính toán xếp hạng (chỉ từ giao dịch tiền vào)
            const ranking = {};
            let penaltyTotal = 0;

            incomingTransactions.forEach(item => {
                penaltyTotal += item.so_tien;
                if (!ranking[item.nguoi_nop]) ranking[item.nguoi_nop] = 0;
                ranking[item.nguoi_nop] += item.so_tien;
            });

            // Tính tổng tiền ra
            let totalOut = 0;
            outgoingTransactions.forEach(item => {
                totalOut += Math.abs(item.so_tien); // Dùng abs vì tiền ra có thể là số âm
            });

            // Chuyển object thành array và sort giảm dần
            const sortedRanking = Object.entries(ranking)
                .map(([name, amount]) => ({ name, amount }))
                .sort((a, b) => b.amount - a.amount);

            setStats(sortedRanking);
            setBaseFund(base);
            // Tổng quỹ = Gốc + Tiền vào - Tiền ra
            setTotalFund(base + penaltyTotal - totalOut);
            setLoading(false);
        }
    }

    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            padding: isMobile ? '12px' : '20px',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        }}>
            <div style={{ maxWidth: '900px', margin: '0 auto' }}>
                {/* Header */}
                <div style={{ textAlign: 'center', marginBottom: isMobile ? '20px' : '30px', color: '#fff' }}>
                    <h1 style={{
                        fontSize: isMobile ? '28px' : '42px',
                        fontWeight: '800',
                        margin: '0 0 10px 0',
                        textShadow: '2px 2px 4px rgba(0,0,0,0.2)',
                        lineHeight: '1.2'
                    }}>
                        🏓 PICKLEBALL 246 CLUB
                    </h1>
                </div>

                {/* Navigation Menu */}
                <div style={{
                    display: 'flex',
                    gap: isMobile ? '8px' : '12px',
                    marginBottom: isMobile ? '20px' : '30px',
                    flexWrap: 'wrap',
                    justifyContent: 'center'
                }}>
                    <a href="/" style={{
                        flex: isMobile ? '1 1 calc(50% - 4px)' : '0 1 auto',
                        padding: isMobile ? '12px 16px' : '14px 24px',
                        background: 'rgba(255, 255, 255, 0.95)',
                        color: '#667eea',
                        textDecoration: 'none',
                        borderRadius: '12px',
                        fontSize: isMobile ? '13px' : '15px',
                        fontWeight: '700',
                        textAlign: 'center',
                        boxShadow: '0 4px 15px rgba(0,0,0,0.15)',
                        transition: 'all 0.2s',
                        border: '2px solid rgba(255,255,255,0.3)'
                    }}
                        onMouseEnter={(e) => {
                            if (!isMobile) {
                                e.currentTarget.style.transform = 'translateY(-2px)';
                                e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.2)';
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (!isMobile) {
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.boxShadow = '0 4px 15px rgba(0,0,0,0.15)';
                            }
                        }}>
                        🏆 Bảng xếp hạng
                    </a>
                    <a href="/transactions" style={{
                        flex: isMobile ? '1 1 calc(50% - 4px)' : '0 1 auto',
                        padding: isMobile ? '12px 16px' : '14px 24px',
                        background: 'rgba(255, 255, 255, 0.95)',
                        color: '#667eea',
                        textDecoration: 'none',
                        borderRadius: '12px',
                        fontSize: isMobile ? '13px' : '15px',
                        fontWeight: '700',
                        textAlign: 'center',
                        boxShadow: '0 4px 15px rgba(0,0,0,0.15)',
                        transition: 'all 0.2s',
                        border: '2px solid rgba(255,255,255,0.3)'
                    }}
                        onMouseEnter={(e) => {
                            if (!isMobile) {
                                e.currentTarget.style.transform = 'translateY(-2px)';
                                e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.2)';
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (!isMobile) {
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.boxShadow = '0 4px 15px rgba(0,0,0,0.15)';
                            }
                        }}>
                        💰 Theo dõi quỹ
                    </a>
                    <a href="/tournament" style={{
                        flex: isMobile ? '1 1 100%' : '0 1 auto',
                        padding: isMobile ? '14px 20px' : '16px 28px',
                        background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                        color: '#fff',
                        textDecoration: 'none',
                        borderRadius: '12px',
                        fontSize: isMobile ? '14px' : '16px',
                        fontWeight: '800',
                        textAlign: 'center',
                        boxShadow: '0 6px 20px rgba(245, 158, 11, 0.4)',
                        transition: 'all 0.2s',
                        border: '2px solid rgba(255, 255, 255, 0.5)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                    }}
                        onMouseEnter={(e) => {
                            if (!isMobile) {
                                e.currentTarget.style.transform = 'translateY(-3px) scale(1.02)';
                                e.currentTarget.style.boxShadow = '0 8px 25px rgba(245, 158, 11, 0.6)';
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (!isMobile) {
                                e.currentTarget.style.transform = 'translateY(0) scale(1)';
                                e.currentTarget.style.boxShadow = '0 6px 20px rgba(245, 158, 11, 0.4)';
                            }
                        }}>
                        🏆 Giải Tất Niên ⚡
                    </a>
                    <a href="/admin" style={{
                        flex: isMobile ? '1 1 100%' : '0 1 auto',
                        padding: isMobile ? '12px 16px' : '14px 24px',
                        background: 'rgba(255, 255, 255, 0.95)',
                        color: '#667eea',
                        textDecoration: 'none',
                        borderRadius: '12px',
                        fontSize: isMobile ? '13px' : '15px',
                        fontWeight: '700',
                        textAlign: 'center',
                        boxShadow: '0 4px 15px rgba(0,0,0,0.15)',
                        transition: 'all 0.2s',
                        border: '2px solid rgba(255,255,255,0.3)'
                    }}
                        onMouseEnter={(e) => {
                            if (!isMobile) {
                                e.currentTarget.style.transform = 'translateY(-2px)';
                                e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.2)';
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (!isMobile) {
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.boxShadow = '0 4px 15px rgba(0,0,0,0.15)';
                            }
                        }}>
                        ⚙️ Quản trị
                    </a>
                </div>

                {/* Total Fund Card */}
                <div style={{
                    background: 'rgba(255, 255, 255, 0.95)',
                    borderRadius: isMobile ? '15px' : '20px',
                    padding: isMobile ? '20px' : '30px',
                    marginBottom: isMobile ? '20px' : '30px',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
                    backdropFilter: 'blur(10px)'
                }}>
                    <div style={{ textAlign: 'center' }}>
                        <h3 style={{
                            color: '#667eea',
                            margin: '0 0 15px 0',
                            fontSize: isMobile ? '15px' : '18px',
                            fontWeight: '600'
                        }}>
                            💰 TỔNG QUỸ HIỆN TẠI
                        </h3>
                        <div style={{
                            fontSize: isMobile ? '36px' : '48px',
                            fontWeight: '800',
                            color: '#764ba2',
                            marginBottom: '15px'
                        }}>
                            {new Intl.NumberFormat('vi-VN').format(totalFund)} đ
                        </div>
                        <div style={{
                            display: 'flex',
                            flexDirection: isMobile ? 'column' : 'row',
                            justifyContent: 'center',
                            gap: isMobile ? '8px' : '30px',
                            fontSize: isMobile ? '13px' : '14px'
                        }}>
                            <div>
                                <span style={{ color: '#666' }}>🏦 Tài khoản gốc: </span>
                                <strong style={{ color: '#0070f3' }}>{new Intl.NumberFormat('vi-VN').format(baseFund)} đ</strong>
                            </div>
                            <div>
                                <span style={{ color: '#666' }}>💸 Tiền phạt: </span>
                                <strong style={{ color: '#e74c3c' }}>{new Intl.NumberFormat('vi-VN').format(totalFund - baseFund)} đ</strong>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Time Period Tabs */}
                <div style={{
                    display: 'flex',
                    gap: isMobile ? '8px' : '12px',
                    marginBottom: isMobile ? '20px' : '30px',
                    justifyContent: 'center',
                    flexWrap: 'wrap'
                }}>
                    <button
                        onClick={() => setActiveTab('this-month')}
                        style={{
                            flex: isMobile ? '1 1 calc(33% - 6px)' : '0 1 auto',
                            padding: isMobile ? '12px 8px' : '14px 24px',
                            background: activeTab === 'this-month'
                                ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                                : 'rgba(255, 255, 255, 0.95)',
                            color: activeTab === 'this-month' ? '#fff' : '#667eea',
                            border: activeTab === 'this-month' ? 'none' : '2px solid rgba(102, 126, 234, 0.3)',
                            borderRadius: '12px',
                            fontSize: isMobile ? '12px' : '15px',
                            fontWeight: '700',
                            cursor: 'pointer',
                            boxShadow: activeTab === 'this-month'
                                ? '0 4px 15px rgba(102, 126, 234, 0.4)'
                                : '0 2px 8px rgba(0,0,0,0.1)',
                            transition: 'all 0.3s',
                            whiteSpace: 'nowrap'
                        }}
                        onMouseEnter={(e) => {
                            if (!isMobile && activeTab !== 'this-month') {
                                e.currentTarget.style.transform = 'translateY(-2px)';
                                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (!isMobile) {
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.boxShadow = activeTab === 'this-month'
                                    ? '0 4px 15px rgba(102, 126, 234, 0.4)'
                                    : '0 2px 8px rgba(0,0,0,0.1)';
                            }
                        }}
                    >
                        📅 Tháng này
                    </button>

                    <button
                        onClick={() => setActiveTab('last-month')}
                        style={{
                            flex: isMobile ? '1 1 calc(33% - 6px)' : '0 1 auto',
                            padding: isMobile ? '12px 8px' : '14px 24px',
                            background: activeTab === 'last-month'
                                ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                                : 'rgba(255, 255, 255, 0.95)',
                            color: activeTab === 'last-month' ? '#fff' : '#667eea',
                            border: activeTab === 'last-month' ? 'none' : '2px solid rgba(102, 126, 234, 0.3)',
                            borderRadius: '12px',
                            fontSize: isMobile ? '12px' : '15px',
                            fontWeight: '700',
                            cursor: 'pointer',
                            boxShadow: activeTab === 'last-month'
                                ? '0 4px 15px rgba(102, 126, 234, 0.4)'
                                : '0 2px 8px rgba(0,0,0,0.1)',
                            transition: 'all 0.3s',
                            whiteSpace: 'nowrap'
                        }}
                        onMouseEnter={(e) => {
                            if (!isMobile && activeTab !== 'last-month') {
                                e.currentTarget.style.transform = 'translateY(-2px)';
                                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (!isMobile) {
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.boxShadow = activeTab === 'last-month'
                                    ? '0 4px 15px rgba(102, 126, 234, 0.4)'
                                    : '0 2px 8px rgba(0,0,0,0.1)';
                            }
                        }}
                    >
                        📆 Tháng trước
                    </button>

                    <button
                        onClick={() => setActiveTab('all-time')}
                        style={{
                            flex: isMobile ? '1 1 calc(33% - 6px)' : '0 1 auto',
                            padding: isMobile ? '12px 8px' : '14px 24px',
                            background: activeTab === 'all-time'
                                ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                                : 'rgba(255, 255, 255, 0.95)',
                            color: activeTab === 'all-time' ? '#fff' : '#667eea',
                            border: activeTab === 'all-time' ? 'none' : '2px solid rgba(102, 126, 234, 0.3)',
                            borderRadius: '12px',
                            fontSize: isMobile ? '12px' : '15px',
                            fontWeight: '700',
                            cursor: 'pointer',
                            boxShadow: activeTab === 'all-time'
                                ? '0 4px 15px rgba(102, 126, 234, 0.4)'
                                : '0 2px 8px rgba(0,0,0,0.1)',
                            transition: 'all 0.3s',
                            whiteSpace: 'nowrap'
                        }}
                        onMouseEnter={(e) => {
                            if (!isMobile && activeTab !== 'all-time') {
                                e.currentTarget.style.transform = 'translateY(-2px)';
                                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (!isMobile) {
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.boxShadow = activeTab === 'all-time'
                                    ? '0 4px 15px rgba(102, 126, 234, 0.4)'
                                    : '0 2px 8px rgba(0,0,0,0.1)';
                            }
                        }}
                    >
                        🏆 Tất cả
                    </button>
                </div>

                {loading ? (
                    <div style={{ textAlign: 'center', padding: '60px', color: '#fff', fontSize: '18px' }}>
                        ⏳ Đang tải bảng xếp hạng...
                    </div>
                ) : (
                    <>
                        <h2 style={{
                            color: '#fff',
                            textAlign: 'center',
                            marginBottom: isMobile ? '15px' : '25px',
                            fontSize: isMobile ? '22px' : '28px',
                            fontWeight: '700',
                            textShadow: '2px 2px 4px rgba(0,0,0,0.2)'
                        }}>
                            🏆 BẢNG XẾP HẠNG {
                                activeTab === 'this-month'
                                    ? `THÁNG ${new Date().getMonth() + 1}/${new Date().getFullYear()}`
                                    : activeTab === 'last-month'
                                        ? `THÁNG ${new Date().getMonth() === 0 ? 12 : new Date().getMonth()}/${new Date().getMonth() === 0 ? new Date().getFullYear() - 1 : new Date().getFullYear()}`
                                        : 'TẤT CẢ THỜI GIAN'
                            }
                        </h2>

                        {stats.length === 0 ? (
                            <div style={{
                                background: 'rgba(255, 255, 255, 0.9)',
                                borderRadius: '15px',
                                padding: isMobile ? '40px 20px' : '60px',
                                textAlign: 'center',
                                color: '#666'
                            }}>
                                <div style={{ fontSize: isMobile ? '48px' : '64px', marginBottom: '20px' }}>🎾</div>
                                <p style={{ fontSize: isMobile ? '16px' : '18px', margin: 0 }}>Chưa có ai nộp phạt trong tháng này!</p>
                                <p style={{ fontSize: isMobile ? '13px' : '14px', color: '#999', margin: '10px 0 0 0' }}>
                                    Hãy là người đầu tiên &quot;đóng góp&quot; nha! 😄
                                </p>
                            </div>
                        ) : (
                            <>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '10px' : '20px' }}>
                                    {stats.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((item, idx) => {
                                        const index = (currentPage - 1) * itemsPerPage + idx; // Real index for ranking
                                        const nickname = getFunnyNickname(index, item.name);
                                        const isTopThree = index < 3;

                                        return (
                                            <div
                                                key={index}
                                                style={{
                                                    background: isTopThree
                                                        ? 'linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(255,255,255,0.95) 100%)'
                                                        : 'rgba(255, 255, 255, 0.92)',
                                                    borderRadius: isMobile ? '15px' : '20px',
                                                    padding: isMobile ? '12px' : '25px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: isMobile ? '10px' : '20px',
                                                    boxShadow: isTopThree
                                                        ? '0 8px 24px rgba(0,0,0,0.15)'
                                                        : '0 4px 12px rgba(0,0,0,0.1)',
                                                    border: isTopThree ? '3px solid ' + (index === 0 ? '#FFD700' : index === 1 ? '#C0C0C0' : '#CD7F32') : 'none',
                                                    transition: 'transform 0.2s, box-shadow 0.2s',
                                                    cursor: 'pointer',
                                                    position: 'relative',
                                                    overflow: 'hidden'
                                                }}
                                                onMouseEnter={(e) => {
                                                    if (!isMobile) {
                                                        e.currentTarget.style.transform = 'translateY(-5px)';
                                                        e.currentTarget.style.boxShadow = '0 12px 32px rgba(0,0,0,0.2)';
                                                    }
                                                }}
                                                onMouseLeave={(e) => {
                                                    if (!isMobile) {
                                                        e.currentTarget.style.transform = 'translateY(0)';
                                                        e.currentTarget.style.boxShadow = isTopThree
                                                            ? '0 8px 24px rgba(0,0,0,0.15)'
                                                            : '0 4px 12px rgba(0,0,0,0.1)';
                                                    }
                                                }}
                                            >
                                                {/* Rank Number with Previous Rank */}
                                                <div style={{
                                                    display: 'flex',
                                                    flexDirection: isMobile ? 'column' : 'row',
                                                    alignItems: 'center',
                                                    gap: isMobile ? '4px' : '12px',
                                                    width: isSmallMobile ? '55px' : isMobile ? '60px' : '120px',
                                                    flexShrink: 0
                                                }}>
                                                    {/* Current Rank - Large */}
                                                    <div style={{
                                                        fontSize: isSmallMobile ? '24px' : isMobile ? '28px' : '48px',
                                                        fontWeight: '900',
                                                        color: index === 0 ? '#FFD700' : index === 1 ? '#C0C0C0' : index === 2 ? '#CD7F32' : '#999',
                                                        textShadow: '2px 2px 4px rgba(0,0,0,0.1)',
                                                        lineHeight: '1'
                                                    }}>
                                                        {index + 1}
                                                    </div>

                                                    {/* Previous Rank & Change Icon */}
                                                    <div style={{
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        alignItems: 'center',
                                                        gap: '2px'
                                                    }}>
                                                        <div style={{
                                                            fontSize: isMobile ? '9px' : '11px',
                                                            color: '#999',
                                                            fontWeight: '600',
                                                            textTransform: 'uppercase',
                                                            letterSpacing: '0.5px'
                                                        }}>
                                                            Prev
                                                        </div>
                                                        <div style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '3px'
                                                        }}>
                                                            <span style={{
                                                                fontSize: isMobile ? '13px' : '16px',
                                                                fontWeight: '700',
                                                                color: '#666'
                                                            }}>
                                                                {previousRanking[item.name] || '-'}
                                                            </span>
                                                            {getRankChangeIcon(index + 1, previousRanking[item.name])}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Avatar */}
                                                <div style={{
                                                    width: isSmallMobile ? '45px' : isMobile ? '50px' : '100px',
                                                    height: isSmallMobile ? '45px' : isMobile ? '50px' : '100px',
                                                    borderRadius: '50%',
                                                    overflow: 'hidden',
                                                    border: isSmallMobile ? '3px solid ' : '4px solid ' + (index === 0 ? '#FFD700' : index === 1 ? '#C0C0C0' : index === 2 ? '#CD7F32' : '#ddd'),
                                                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                                    flexShrink: 0,
                                                    background: '#f0f0f0',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    fontSize: isSmallMobile ? '28px' : isMobile ? '32px' : '48px'
                                                }}>
                                                    {/* Fallback emoji avatar */}
                                                    {index === 0 ? '👑' : index === 1 ? '🥈' : index === 2 ? '🥉' : '😊'}
                                                </div>

                                                {/* Info */}
                                                <div style={{ flex: 1, minWidth: isMobile ? '40%' : 0 }}>
                                                    <div style={{
                                                        fontSize: isSmallMobile ? '10px' : isMobile ? '11px' : '14px',
                                                        fontWeight: '700',
                                                        color: '#667eea',
                                                        marginBottom: isMobile ? '3px' : '4px'
                                                    }}>
                                                        {nickname.title}
                                                    </div>
                                                    <div style={{
                                                        fontSize: isSmallMobile ? '16px' : isMobile ? '18px' : '22px',
                                                        fontWeight: '700',
                                                        color: '#333',
                                                        marginBottom: isMobile ? '4px' : '8px'
                                                    }}>
                                                        {item.name}
                                                    </div>
                                                    <div style={{
                                                        fontSize: isSmallMobile ? '10px' : isMobile ? '11px' : '13px',
                                                        color: '#555',
                                                        lineHeight: '1.5',
                                                        fontStyle: 'italic',
                                                        display: isMobile ? '-webkit-box' : 'block',
                                                        WebkitLineClamp: isMobile ? '2' : 'unset',
                                                        WebkitBoxOrient: 'vertical',
                                                        overflow: isMobile ? 'hidden' : 'visible'
                                                    }}>
                                                        {nickname.desc}
                                                    </div>
                                                </div>

                                                {/* Amount */}
                                                <div style={{
                                                    textAlign: 'right',
                                                    paddingRight: isMobile ? '5px' : '10px',
                                                    flexShrink: 0,
                                                    minWidth: isMobile ? 'auto' : '120px'
                                                }}>
                                                    <div style={{
                                                        fontSize: isSmallMobile ? '17px' : isMobile ? '20px' : '28px',
                                                        fontWeight: '800',
                                                        color: index === 0 ? '#e74c3c' : index === 1 ? '#3498db' : index === 2 ? '#f39c12' : '#27ae60',
                                                        marginBottom: '3px',
                                                        whiteSpace: 'nowrap'
                                                    }}>
                                                        {formatAmount(item.amount, isMobile)}
                                                    </div>
                                                    <div style={{
                                                        fontSize: isSmallMobile ? '8px' : isMobile ? '9px' : '12px',
                                                        color: '#999',
                                                        whiteSpace: 'nowrap'
                                                    }}>
                                                        {((item.amount / (totalFund - baseFund)) * 100).toFixed(1)}% tổng phạt
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Pagination Controls */}
                                {stats.length > itemsPerPage && (
                                    <div style={{
                                        display: 'flex',
                                        justifyContent: 'center',
                                        alignItems: 'center',
                                        gap: '10px',
                                        marginTop: '30px'
                                    }}>
                                        <button
                                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                            disabled={currentPage === 1}
                                            style={{
                                                padding: isMobile ? '10px 20px' : '12px 24px',
                                                background: currentPage === 1 ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.95)',
                                                color: currentPage === 1 ? '#999' : '#667eea',
                                                border: 'none',
                                                borderRadius: '10px',
                                                fontSize: isMobile ? '14px' : '16px',
                                                fontWeight: '700',
                                                cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                                                transition: 'all 0.2s'
                                            }}
                                        >
                                            ← Trước
                                        </button>

                                        <span style={{
                                            color: '#fff',
                                            fontSize: isMobile ? '14px' : '16px',
                                            fontWeight: '600',
                                            padding: '0 10px'
                                        }}>
                                            Trang {currentPage} / {Math.ceil(stats.length / itemsPerPage)}
                                        </span>

                                        <button
                                            onClick={() => setCurrentPage(prev => Math.min(Math.ceil(stats.length / itemsPerPage), prev + 1))}
                                            disabled={currentPage >= Math.ceil(stats.length / itemsPerPage)}
                                            style={{
                                                padding: isMobile ? '10px 20px' : '12px 24px',
                                                background: currentPage >= Math.ceil(stats.length / itemsPerPage) ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.95)',
                                                color: currentPage >= Math.ceil(stats.length / itemsPerPage) ? '#999' : '#667eea',
                                                border: 'none',
                                                borderRadius: '10px',
                                                fontSize: isMobile ? '14px' : '16px',
                                                fontWeight: '700',
                                                cursor: currentPage >= Math.ceil(stats.length / itemsPerPage) ? 'not-allowed' : 'pointer',
                                                transition: 'all 0.2s'
                                            }}
                                        >
                                            Sau →
                                        </button>
                                    </div>
                                )}
                            </>
                        )}

                        {/* Refresh Button */}
                        <button
                            onClick={fetchData}
                            style={{
                                marginTop: isMobile ? '20px' : '30px',
                                width: '100%',
                                padding: isMobile ? '14px' : '18px',
                                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '15px',
                                fontSize: isMobile ? '16px' : '18px',
                                fontWeight: '700',
                                cursor: 'pointer',
                                boxShadow: '0 4px 15px rgba(102, 126, 234, 0.4)',
                                transition: 'all 0.3s',
                                WebkitTapHighlightColor: 'transparent'
                            }}
                            onMouseEnter={(e) => {
                                if (!isMobile) {
                                    e.currentTarget.style.transform = 'scale(1.02)';
                                    e.currentTarget.style.boxShadow = '0 6px 20px rgba(102, 126, 234, 0.6)';
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (!isMobile) {
                                    e.currentTarget.style.transform = 'scale(1)';
                                    e.currentTarget.style.boxShadow = '0 4px 15px rgba(102, 126, 234, 0.4)';
                                }
                            }}
                        >
                            🔄 Làm mới bảng xếp hạng
                        </button>

                        {/* Footer */}
                        <div style={{
                            textAlign: 'center',
                            marginTop: isMobile ? '30px' : '40px',
                            padding: isMobile ? '15px' : '20px',
                            color: 'rgba(255,255,255,0.8)',
                            fontSize: isMobile ? '13px' : '14px'
                        }}>
                            <p style={{ margin: '0 0 5px 0' }}>
                                💡 <strong>Mẹo:</strong> Chuyển khoản với nội dung &quot;PKB + TÊN&quot; để hệ thống tự động ghi nhận!
                            </p>
                            <p style={{ margin: 0, fontSize: isMobile ? '11px' : '12px', opacity: 0.7 }}>
                                Ví dụ: &quot;PKB TUAN&quot; hoặc &quot;PKB HUNG NOP PHAT&quot;
                            </p>
                        </div>
                    </>
                )}
            </div>
        </div >
    );
}
