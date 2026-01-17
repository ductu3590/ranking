'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function Home() {
    const [stats, setStats] = useState([]);
    const [totalFund, setTotalFund] = useState(0);
    const [baseFund, setBaseFund] = useState(0);
    const [loading, setLoading] = useState(true);
    const [isMobile, setIsMobile] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    useEffect(() => {
        fetchData();

        // Detect mobile viewport
        const checkMobile = () => {
            setIsMobile(window.innerWidth <= 768);
        };

        checkMobile();
        window.addEventListener('resize', checkMobile);

        return () => window.removeEventListener('resize', checkMobile);
    }, []);

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

    async function fetchData() {
        setLoading(true);
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

        // Lấy TẤT CẢ giao dịch (cả tiền vào và tiền ra) để tính tổng quỹ chính xác
        const { data, error } = await supabase
            .from('quy_pickleball')
            .select('nguoi_nop, so_tien, huong_giao_dich')
            .gte('created_at', startOfMonth);

        if (error) {
            console.log(error);
            setLoading(false);
        } else {
            // Tách riêng tài khoản gốc
            const baseAccount = data.filter(item => item.nguoi_nop === 'TAI KHOAN GOC');

            // Chỉ lấy giao dịch TIỀN VÀO để hiển thị trong bảng xếp hạng
            const incomingTransactions = data.filter(
                item => item.nguoi_nop !== 'TAI KHOAN GOC' && item.huong_giao_dich === 'in'
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
                    <p style={{ fontSize: isMobile ? '14px' : '18px', opacity: 0.9, margin: 0 }}>
                        📊 Bảng Xếp Hạng &quot;Danh Dự&quot; Tháng {new Date().getMonth() + 1}/{new Date().getFullYear()}
                    </p>
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
                            🏆 BẢNG XẾP HẠNG &quot;ĐÓNG GÓP&quot;
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
                                <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '12px' : '20px' }}>
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
                                                    padding: isMobile ? '15px' : '25px',
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
                                                {/* Rank Number */}
                                                <div style={{
                                                    fontSize: isMobile ? '32px' : '48px',
                                                    fontWeight: '900',
                                                    width: isMobile ? '50px' : '80px',
                                                    textAlign: 'center',
                                                    color: index === 0 ? '#FFD700' : index === 1 ? '#C0C0C0' : index === 2 ? '#CD7F32' : '#999',
                                                    textShadow: '2px 2px 4px rgba(0,0,0,0.1)',
                                                    flexShrink: 0
                                                }}>
                                                    {index + 1}
                                                </div>

                                                {/* Avatar */}
                                                <div style={{
                                                    width: isMobile ? '60px' : '100px',
                                                    height: isMobile ? '60px' : '100px',
                                                    borderRadius: '50%',
                                                    overflow: 'hidden',
                                                    border: '4px solid ' + (index === 0 ? '#FFD700' : index === 1 ? '#C0C0C0' : index === 2 ? '#CD7F32' : '#ddd'),
                                                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                                    flexShrink: 0,
                                                    background: '#f0f0f0',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    fontSize: isMobile ? '32px' : '48px'
                                                }}>
                                                    {/* Fallback emoji avatar */}
                                                    {index === 0 ? '👑' : index === 1 ? '🥈' : index === 2 ? '🥉' : '😊'}
                                                </div>

                                                {/* Info */}
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{
                                                        fontSize: isMobile ? '11px' : '14px',
                                                        fontWeight: '700',
                                                        color: '#667eea',
                                                        marginBottom: '4px'
                                                    }}>
                                                        {nickname.title}
                                                    </div>
                                                    <div style={{
                                                        fontSize: isMobile ? '16px' : '22px',
                                                        fontWeight: '700',
                                                        color: '#333',
                                                        marginBottom: isMobile ? '4px' : '8px'
                                                    }}>
                                                        {item.name}
                                                    </div>
                                                    <div style={{
                                                        fontSize: isMobile ? '11px' : '13px',
                                                        color: '#666',
                                                        lineHeight: '1.4',
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
                                                    flexShrink: 0
                                                }}>
                                                    <div style={{
                                                        fontSize: isMobile ? '18px' : '28px',
                                                        fontWeight: '800',
                                                        color: index === 0 ? '#e74c3c' : index === 1 ? '#3498db' : index === 2 ? '#f39c12' : '#27ae60',
                                                        marginBottom: '3px',
                                                        whiteSpace: 'nowrap'
                                                    }}>
                                                        {new Intl.NumberFormat('vi-VN').format(item.amount)} đ
                                                    </div>
                                                    <div style={{
                                                        fontSize: isMobile ? '10px' : '12px',
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
