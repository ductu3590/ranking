'use client';
import './tournament.css';

export default function Tournament() {
    return (
        <div className="app-background">
            <a href="/" className="back-button">
                ← Trở về trang chủ
            </a>
            <div className="card-container">
                <header className="card-header">
                    <h1 className="tournament-title">PICKLEBALL YEAR-END CUP</h1>
                    <div className="tournament-subtitle">
                        16 Chiến binh - 1 Ngày duy nhất - Quyết đấu vì bữa nhậu
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
                            <li><strong>Thời gian & Địa điểm:</strong> 17:30 - 19:30 (Dự kiến 02 tiếng) tại 02 sân nhà của CLB.</li>

                            <li><strong>Cách chia đội (&quot;Draft Day&quot;):</strong> Chọn ra 2 đội trưởng (có uy tín hoặc hay &quot;kháy&quot; nhau nhất). Hai người này sẽ lần lượt &quot;đi chợ&quot; (draft) để chọn thành viên về đội mình cho đến khi đủ 8 người/đội.</li>

                            <li><strong>Thể thức thi đấu chi tiết:</strong>
                                <ul>
                                    <li>📌 <strong>Vòng 1 (4 trận đôi ngẫu nhiên):</strong> Đội trưởng sắp xếp cặp đôi bí mật, nộp danh sách cho Ban Tổ Chức (BTC). Mở bài ra cặp nào đấu cặp đó.</li>
                                    <li>📌 <strong>Vòng 2 (4 trận đôi chiến thuật):</strong> Bên thua vòng 1 được quyền chọn cặp đấu (ví dụ: &quot;Cặp mạnh nhất của tôi thách đấu cặp mạnh nhất của ông&quot;).</li>
                                    <li>📌 <strong>Vòng 3 (8 trận đơn):</strong> Nếu anh em đủ sức khỏe sẽ đánh đơn, hoặc tiếp tục đánh đôi nhưng đổi người đánh cặp. (Quyết định cụ thể vào ngày thi đấu).</li>
                                </ul>
                            </li>

                            <li><strong>Cách tính điểm đồng đội:</strong>
                                <ul>
                                    <li>Tổng giải có <strong>16 trận đấu</strong> (8 trận Đôi + 8 trận Đơn).</li>
                                    <li>Mỗi trận thắng mang về <strong>1 điểm</strong> cho Team.</li>
                                    <li>Đội nào chạm mốc <strong>8.5 điểm</strong> trước là VÔ ĐỊCH.</li>
                                    <li>Nếu hòa 8-8: Mỗi đội cử 1 cặp mạnh nhất đánh Tie-break &quot;bàn thắng vàng&quot; (Golden Point).</li>
                                </ul>
                            </li>

                            <li><strong>Luật thi đấu (Cập nhật):</strong>
                                <ul>
                                    <li>🏓 <strong>Đánh Đôi:</strong> 1 Set 15 điểm, cách 2 điểm thắng (Nếu hòa 16-16 thì ai lên 17 trước là thắng - <strong>Chạm 17</strong>).</li>
                                    <li>🏓 <strong>Đánh Đơn:</strong> 1 Set 11 điểm, cách 2 điểm thắng (Nếu hòa 12-12 thì ai lên 13 trước là thắng - <strong>Chạm 13</strong>).</li>
                                    <li>Đổi sân khi đạt 8 điểm (với Đôi) hoặc 6 điểm (với Đơn).</li>
                                </ul>
                            </li>
                        </ul>
                    </div>

                    {/* Schedule */}
                    <h2 className="section-heading">2. LỊCH THI ĐẤU CHI TIẾT</h2>
                    <table className="schedule-table">
                        <thead>
                            <tr>
                                <th width="15%">Giờ</th>
                                <th width="15%">Sân</th>
                                <th width="25%">Team XANH</th>
                                <th width="10%">VS</th>
                                <th width="25%">Team ĐỎ</th>
                                <th width="10%">Loại</th>
                            </tr>
                        </thead>
                        <tbody>
                            {/* Phase 1 */}
                            <tr>
                                <td colSpan="6" className="phase-header">
                                    VÒNG 1: ĐÁNH ĐÔI BÍ MẬT<br />
                                    <span style={{ fontWeight: 'normal', fontSize: '0.85rem' }}>Đội trưởng nộp danh sách kín - Set 15 (Chạm 17)</span>
                                </td>
                            </tr>
                            <tr>
                                <td rowSpan="2">17:45 - 18:10</td>
                                <td className="court-col">Sân 1</td>
                                <td>Cặp Xanh 1</td>
                                <td>-</td>
                                <td>Cặp Đỏ 1</td>
                                <td>Đôi</td>
                            </tr>
                            <tr>
                                <td className="court-col">Sân 2</td>
                                <td>Cặp Xanh 2</td>
                                <td>-</td>
                                <td>Cặp Đỏ 2</td>
                                <td>Đôi</td>
                            </tr>
                            <tr>
                                <td rowSpan="2">18:10 - 18:35</td>
                                <td className="court-col">Sân 1</td>
                                <td>Cặp Xanh 3</td>
                                <td>-</td>
                                <td>Cặp Đỏ 3</td>
                                <td>Đôi</td>
                            </tr>
                            <tr>
                                <td className="court-col">Sân 2</td>
                                <td>Cặp Xanh 4</td>
                                <td>-</td>
                                <td>Cặp Đỏ 4</td>
                                <td>Đôi</td>
                            </tr>

                            {/* Phase 2 */}
                            <tr>
                                <td colSpan="6" className="phase-header">
                                    VÒNG 2: ĐÁNH ĐÔI THÁCH ĐẤU<br />
                                    <span style={{ fontWeight: 'normal', fontSize: '0.85rem' }}>Đội THUA Vòng 1 được quyền chọn cặp đấu - Set 15 (Chạm 17)</span>
                                </td>
                            </tr>
                            <tr>
                                <td rowSpan="2">18:40 - 19:05</td>
                                <td className="court-col">Sân 1</td>
                                <td>Cặp Xanh A</td>
                                <td>-</td>
                                <td>Cặp Đỏ A</td>
                                <td>Đôi</td>
                            </tr>
                            <tr>
                                <td className="court-col">Sân 2</td>
                                <td>Cặp Xanh B</td>
                                <td>-</td>
                                <td>Cặp Đỏ B</td>
                                <td>Đôi</td>
                            </tr>
                            <tr>
                                <td rowSpan="2">19:05 - 19:30</td>
                                <td className="court-col">Sân 1</td>
                                <td>Cặp Xanh C</td>
                                <td>-</td>
                                <td>Cặp Đỏ C</td>
                                <td>Đôi</td>
                            </tr>
                            <tr>
                                <td className="court-col">Sân 2</td>
                                <td>Cặp Xanh D</td>
                                <td>-</td>
                                <td>Cặp Đỏ D</td>
                                <td>Đôi</td>
                            </tr>

                            {/* Phase 3 */}
                            <tr>
                                <td colSpan="6" className="phase-header">
                                    VÒNG 3: SOLO 1vs1 QUYẾT ĐỊNH<br />
                                    <span style={{ fontWeight: 'normal', fontSize: '0.85rem' }}>Khớp cặp theo trình độ tương đương - Set 11 (Chạm 13)</span>
                                </td>
                            </tr>
                            <tr>
                                <td rowSpan="2">19:35 - 19:50</td>
                                <td className="court-col">Sân 1</td>
                                <td>Đơn Nam 8</td>
                                <td>-</td>
                                <td>Đơn Nam 8</td>
                                <td>Đơn</td>
                            </tr>
                            <tr>
                                <td className="court-col">Sân 2</td>
                                <td>Đơn Nam 7</td>
                                <td>-</td>
                                <td>Đơn Nam 7</td>
                                <td>Đơn</td>
                            </tr>
                            <tr>
                                <td rowSpan="2">19:50 - 20:05</td>
                                <td className="court-col">Sân 1</td>
                                <td>Đơn Nam 6</td>
                                <td>-</td>
                                <td>Đơn Nam 6</td>
                                <td>Đơn</td>
                            </tr>
                            <tr>
                                <td className="court-col">Sân 2</td>
                                <td>Đơn Nam 5</td>
                                <td>-</td>
                                <td>Đơn Nam 5</td>
                                <td>Đơn</td>
                            </tr>
                            <tr>
                                <td rowSpan="2">20:05 - 20:20</td>
                                <td className="court-col">Sân 1</td>
                                <td>Đơn Nam 4</td>
                                <td>-</td>
                                <td>Đơn Nam 4</td>
                                <td>Đơn</td>
                            </tr>
                            <tr>
                                <td className="court-col">Sân 2</td>
                                <td>Đơn Nam 3</td>
                                <td>-</td>
                                <td>Đơn Nam 3</td>
                                <td>Đơn</td>
                            </tr>
                            <tr>
                                <td rowSpan="2">20:20 - 20:35</td>
                                <td className="court-col">Sân 1</td>
                                <td>Đơn Nam 2 (Ace)</td>
                                <td>-</td>
                                <td>Đơn Nam 2 (Ace)</td>
                                <td>Đơn</td>
                            </tr>
                            <tr>
                                <td className="court-col">Sân 2</td>
                                <td>Đơn Nam 1 (Super Ace)</td>
                                <td>-</td>
                                <td>Đơn Nam 1 (Super Ace)</td>
                                <td>Đơn</td>
                            </tr>
                        </tbody>
                    </table>

                    {/* Prizes & Finance */}
                    <div className="prize-section">
                        <h3 style={{ marginTop: 0, color: 'var(--secondary)' }}>💰 CƠ CẤU GIẢI THƯỞNG & TÀI CHÍNH</h3>
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
    );
}
