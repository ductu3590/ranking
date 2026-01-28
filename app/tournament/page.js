'use client';
import './tournament.css';
import TournamentNavBar from '@/components/TournamentNavBar';

export default function Tournament() {
    return (
        <>
            <TournamentNavBar />
            <div className="app-background">
                <div className="card-container">
                    <header className="card-header">
                        <h1 className="tournament-title">PICKLEBALL YEAR-END CUP</h1>
                        <div className="tournament-subtitle">
                            16 Chiến binh - 1 Ngày duy nhất - 3 Vòng Kịch Tính
                        </div>
                        <div className="tournament-badge">
                            THỂ THỨC RYDER CUP: TEAM A vs TEAM B
                        </div>
                    </header>

                    <div className="tournament-content">
                        {/* Teams */}
                        <div className="team-section">
                            <div className="team-card team-blue">
                                <h3>TEAM XANH</h3>
                                <p>Đội trưởng: [Tên A]</p>
                            </div>
                            <div className="vs-circle">VS</div>
                            <div className="team-card team-red">
                                <h3>TEAM ĐỎ</h3>
                                <p>Đội trưởng: [Tên B]</p>
                            </div>
                        </div>

                        {/* Rules Summary */}
                        <h2 className="section-heading">1. THỂ THỨC & TÍNH ĐIỂM</h2>
                        <div className="rules-box">
                            <ul>
                                <li><strong>Thời gian & Địa điểm:</strong> 17:00 - 20:05 (Dự kiến 3 tiếng) tại 02 sân nhà của CLB.</li>

                                <li><strong>Cách chia đội (&quot;Draft Day&quot;):</strong> Chọn ra 2 đội trưởng (có uy tín hoặc hay &quot;kháy&quot; nhau nhất). Hai người này sẽ lần lượt &quot;đi chợ&quot; (draft) để chọn thành viên về đội mình cho đến khi đủ 8 người/đội.</li>

                                <li><strong>Thể thức thi đấu chi tiết - 3 VÒNG CHIẾN THUẬT:</strong>
                                    <ul>
                                        <li>📌 <strong>Vòng 1 - ĐÁNH ĐÔI BÍ MẬT (4 trận):</strong>
                                            <ul>
                                                <li>Đội trưởng nộp danh sách thi đấu kín cho BTC <strong>trước giờ thi đấu 60 phút</strong>.</li>
                                                <li>Đến giờ G, mở phong bì: Cặp 1 vs Cặp 1, Cặp 2 vs Cặp 2... theo thứ tự đã nộp.</li>
                                            </ul>
                                        </li>
                                        <li>📌 <strong>Vòng 2 - THÁCH ĐẤU (4 trận):</strong>
                                            <ul>
                                                <li><strong>Luật đổi cặp:</strong> Không được giữ nguyên cặp của Vòng 1. Phải ghép cặp mới hoàn toàn.</li>
                                                <li><strong>Luật thách đấu:</strong> Đội THẮNG Vòng 1 phải công bố danh sách 4 cặp đấu trước. Đội THUA Vòng 1 sẽ nhìn vào danh sách đó để <strong>sắp xếp cặp đối đầu</strong> (chọn cặp &quot;ngon&quot; để gỡ điểm).</li>
                                                <li>Nếu Vòng 1 hòa (2-2): Bốc thăm xem đội nào chọn cặp.</li>
                                            </ul>
                                        </li>
                                        <li>📌 <strong>Vòng 3 - SUPER TEAM (1 trận - 3 điểm):</strong>
                                            <ul>
                                                <li><strong>Chạm 25 điểm</strong> - Ăn điểm trực tiếp.</li>
                                                <li><strong>Thay người liên tục:</strong> Cứ mỗi <strong>4 điểm tổng</strong> (VD: 2-2, 3-1, 4-0) thì <strong>CẢ 2 ĐỘI đổi cặp kế tiếp</strong> vào sân.</li>
                                                <li>Đội trưởng sắp xếp thứ tự 4 cặp (1-2-3-4) từ trước. Các cặp xoay vòng 4 lượt (1-2-3-4-1...) đến khi chạm 25.</li>
                                            </ul>
                                        </li>
                                    </ul>
                                </li>

                                <li><strong>Cách tính điểm đồng đội:</strong>
                                    <ul>
                                        <li><strong>Vòng 1-2:</strong> Tổng có 8 trận đấu, mỗi trận thắng = <strong>1 điểm</strong>.</li>
                                        <li><strong>Vòng 3 - ĐỒNG ĐỘI:</strong> Đội thắng nhận = <strong>+3 ĐIỂM</strong> 🔥</li>
                                        <li>🎯 <strong>Tổng điểm tối đa:</strong> 8 điểm (Vòng 1-2) + 3 điểm (Vòng 3) = <strong>11 điểm</strong></li>
                                        <li>🏆 <strong>Điều kiện vô địch:</strong> Đội nào có tổng điểm cao hơn sau Vòng 3.</li>
                                        <li>⚡ <strong>Yếu tố bất ngờ:</strong> Dù thua 3-5 sau Vòng 1-2, nếu thắng ĐỒNG ĐỘI +3 điểm = 6 điểm! Cục diện có thể thay đổi hoàn toàn ở vòng cuối.</li>
                                    </ul>
                                </li>

                                <li><strong>Luật thi đấu & Tính điểm:</strong>
                                    <ul>
                                        <li>🏓 <strong>Vòng 1 & 2:</strong> 1 Set chạm 15 điểm. Đổi sân khi đạt 8 điểm.</li>
                                        <li>🏓 <strong>Vòng 3 - ĐỒNG ĐỘI:</strong> Chạm 25 điểm trực tiếp. Đổi sân khi đạt 13 điểm.</li>
                                        <li>⚠️ <strong>Lưu ý:</strong> Mỗi thành viên sẽ được <strong>ra sân thi đấu đúng 3 lần</strong> (Vòng 1, Vòng 2 và Vòng 3).</li>
                                    </ul>
                                </li>
                            </ul>
                        </div>

                        {/* Schedule */}
                        <h2 className="section-heading">2. LỊCH THI ĐẤU CHI TIẾT</h2>
                        <table className="schedule-table">
                            <thead>
                                <tr>
                                    <th width="12%">Giờ</th>
                                    <th width="8%">Số trận</th>
                                    <th width="12%">Sân</th>
                                    <th width="23%">Team XANH</th>
                                    <th width="8%">VS</th>
                                    <th width="23%">Team ĐỎ</th>
                                    <th width="8%">Loại</th>
                                </tr>
                            </thead>
                            <tbody>
                                {/* Phase 1 */}
                                <tr>
                                    <td colSpan="7" className="phase-header">
                                        VÒNG 1: ĐÁNH ĐÔI BÍ MẬT<br />
                                        <span style={{ fontWeight: 'normal', fontSize: '0.85rem' }}>Đội trưởng nộp danh sách kín - Set chạm 15 </span>
                                    </td>
                                </tr>
                                <tr>
                                    <td rowSpan="2">17:00 - 17:25</td>
                                    <td>1</td>
                                    <td className="court-col">Sân 1</td>
                                    <td>Cặp Xanh 1</td>
                                    <td>-</td>
                                    <td>Cặp Đỏ 1</td>
                                    <td>Đôi</td>
                                </tr>
                                <tr>
                                    <td>2</td>
                                    <td className="court-col">Sân 2</td>
                                    <td>Cặp Xanh 2</td>
                                    <td>-</td>
                                    <td>Cặp Đỏ 2</td>
                                    <td>Đôi</td>
                                </tr>
                                <tr>
                                    <td rowSpan="2">17:25 - 17:50</td>
                                    <td>3</td>
                                    <td className="court-col">Sân 1</td>
                                    <td>Cặp Xanh 3</td>
                                    <td>-</td>
                                    <td>Cặp Đỏ 3</td>
                                    <td>Đôi</td>
                                </tr>
                                <tr>
                                    <td>4</td>
                                    <td className="court-col">Sân 2</td>
                                    <td>Cặp Xanh 4</td>
                                    <td>-</td>
                                    <td>Cặp Đỏ 4</td>
                                    <td>Đôi</td>
                                </tr>

                                {/* Phase 2 */}
                                <tr>
                                    <td colSpan="7" className="phase-header">
                                        VÒNG 2: ĐỔI CẶP XOAY VÒNG<br />
                                        <span style={{ fontWeight: 'normal', fontSize: '0.85rem' }}>Bắt buộc đổi cặp - Đội THUA Vòng 1 chọn đối thủ - Set chạm 15</span>
                                    </td>
                                </tr>
                                <tr>
                                    <td rowSpan="2">17:55 - 18:20</td>
                                    <td>5</td>
                                    <td className="court-col">Sân 1</td>
                                    <td>Cặp Xanh A</td>
                                    <td>-</td>
                                    <td>Cặp Đỏ A</td>
                                    <td>Đôi</td>
                                </tr>
                                <tr>
                                    <td>6</td>
                                    <td className="court-col">Sân 2</td>
                                    <td>Cặp Xanh B</td>
                                    <td>-</td>
                                    <td>Cặp Đỏ B</td>
                                    <td>Đôi</td>
                                </tr>
                                <tr>
                                    <td rowSpan="2">18:20 - 18:45</td>
                                    <td>7</td>
                                    <td className="court-col">Sân 1</td>
                                    <td>Cặp Xanh C</td>
                                    <td>-</td>
                                    <td>Cặp Đỏ C</td>
                                    <td>Đôi</td>
                                </tr>
                                <tr>
                                    <td>8</td>
                                    <td className="court-col">Sân 2</td>
                                    <td>Cặp Xanh D</td>
                                    <td>-</td>
                                    <td>Cặp Đỏ D</td>
                                    <td>Đôi</td>
                                </tr>

                                {/* Phase 3 */}
                                <tr>
                                    <td colSpan="7" className="phase-header">
                                        VÒNG 3: ĐỒNG ĐỘI<br />
                                        <span style={{ fontWeight: 'normal', fontSize: '0.85rem' }}>Cả đội ra sân - Chạm 25 - Thay cặp sau mỗi 4 điểm TỔNG (VD: 2-2, 3-1, 4-0)</span>
                                    </td>
                                </tr>
                                <tr>
                                    <td>18:50 - 20:05</td>
                                    <td>9</td>
                                    <td className="court-col">Sân 1</td>
                                    <td colSpan="3" style={{ textAlign: 'center', fontWeight: 'bold' }}>Team XANH vs Team ĐỎ</td>
                                    <td>Đồng Đội</td>
                                </tr>
                                <tr>
                                    <td colSpan="7" style={{ padding: '10px', fontSize: '0.85rem', background: 'rgba(139, 92, 246, 0.1)' }}>
                                        <strong>Luật Đồng Đội:</strong> Đội trưởng sắp xếp 4 cặp đôi theo thứ tự 1-2-3-4 (sắp xếp cặp mới hoặc cũ tùy chiến thuật). Cặp 1 ra sân, cứ sau <strong>mỗi 4 điểm TỔNG (của cả 2 bên cộng lại)</strong> thì CẢ 2 ĐỘI cùng thay cặp tiếp theo (1→2→3→4→1...). Đội nào chạm 25 điểm trước thắng.
                                    </td>
                                </tr>
                            </tbody>
                        </table>

                        {/* Prizes & Finance */}
                        <div className="prize-section">
                            <h3 style={{ marginTop: 0, color: 'var(--secondary)' }}>🏆 GIẢI THƯỞNG & LỄ TRAO CÚP</h3>
                            <p><strong>Đội Vô Địch nhận:</strong></p>
                            <ul style={{ listStyle: 'none', padding: 0, marginBottom: '15px' }}>
                                <li>🏆 01 Cúp Vô Địch</li>
                                <li>👏 Toàn bộ đội thua phải đứng lên vỗ tay chúc mừng</li>
                                <li>🤝 Đội trưởng đội thua lên trao cúp cho đội thắng</li>
                            </ul>

                            <h3 style={{ marginTop: '20px', color: 'var(--secondary)' }}>💰 CƠ CẤU TÀI CHÍNH</h3>
                            <p>Toàn bộ thành viên tham gia Gala Dinner tổng kết ngay sau trận đấu.</p>
                            <p><strong>QUY TẮC THANH TOÁN BILL:</strong></p>
                            <ul style={{ listStyle: 'none', padding: 0 }}>
                                <li>✅ <strong>Bước 1:</strong> Dùng 100% tiền Quỹ CLB hiện có để thanh toán.</li>
                                <li>✅ <strong>Bước 2:</strong> Nếu thiếu, số tiền còn lại sẽ chia theo tỷ lệ:</li>
                            </ul>

                            <div className="cost-split">
                                <div className="split-box" style={{ borderColor: 'var(--success)' }}>
                                    <span style={{ color: '#64748b', fontSize: '0.9rem' }}>Đội Vô Địch</span>
                                    <strong style={{ color: 'var(--success)' }}>Đóng 40%</strong>
                                    <small>Phần bill còn thiếu</small>
                                </div>
                                <div className="split-box">
                                    <span style={{ color: '#64748b', fontSize: '0.9rem' }}>Đội Thua Cuộc</span>
                                    <strong style={{ color: 'var(--secondary)' }}>Đóng 60%</strong>
                                    <small>Phần bill còn thiếu</small>
                                </div>
                            </div>
                            <p style={{ marginTop: '15px', fontStyle: 'italic', fontSize: '0.9rem' }}>
                                (Ví dụ: Quỹ có 2tr, Bill hết 4tr. Còn thiếu 2tr. Đội thắng đóng 800k, Đội thua đóng 1tr2).
                            </p>
                        </div>
                    </div>

                    <div className="tournament-footer">
                        Kế hoạch được lập tự động ngày 22/01/2026 cho CLB Pickleball.
                    </div>
                </div>
            </div>
        </>
    );
}
