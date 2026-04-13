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
                        <h1 className="tournament-title">GIAO HỮU HANA - BẢO LÂM</h1>
                        <div className="tournament-subtitle">
                            20 VĐV Đỉnh Cao - 1 Ngày Duy Nhất - 3 Vòng Kịch Tính
                        </div>
                        <div className="tournament-badge">
                            THỂ THỨc THI ĐẤU: ĐỒNG ĐỘI
                        </div>
                    </header>

                    <div className="tournament-content">
                        {/* Teams */}
                        <div className="team-section">
                            <div className="team-card team-blue">
                                <h3>CLB HANA</h3>
                                <p>Đội trưởng: [VŨ DUY TÙNG]</p>
                            </div>
                            <div className="vs-circle">VS</div>
                            <div className="team-card team-red">
                                <h3>CLB BẢO LÂM</h3>
                                <p>Đội trưởng: [BÔNG BÉ BỎNG]</p>
                            </div>
                        </div>

                        {/* Rules Summary */}
                        <h2 className="section-heading">1. THỂ THỨC & TÍNH ĐIỂM</h2>
                        <div className="rules-box">
                            <ul>
                                <li><strong>Thời gian & Địa điểm:</strong> 17:00 - 19:40 tại 03 sân thi đấu của CLB.</li>

                                <li><strong>Thể thức thi đấu chi tiết - 3 VÒNG CHIẾN THUẬT:</strong>
                                    <ul>
                                        <li>📌 <strong>Vòng 1 - ĐÁNH ĐÔI BÍ MẬT (5 trận):</strong>
                                            <ul>
                                                <li>Đội trưởng nộp danh sách thi đấu kín cho BTC <strong>trước giờ thi đấu 60 phút</strong>.</li>
                                                <li>Đến giờ G, mở phong bì: Cặp 1 vs Cặp 1, Cặp 2 vs Cặp 2... theo thứ tự đã nộp.</li>
                                            </ul>
                                        </li>
                                        <li>📌 <strong>Vòng 2 - THÁCH ĐẤU (5 trận):</strong>
                                            <ul>
                                                <li><strong>Luật đổi cặp:</strong> Không được giữ nguyên cặp đôi của Vòng 1. Phải ghép cặp mới hoàn toàn.</li>
                                                <li><strong>Luật thách đấu:</strong> Đội THẮNG Vòng 1 phải công bố danh sách 5 cặp đấu trước. Đội THUA Vòng 1 sẽ nhìn vào danh sách đó để <strong>sắp xếp cặp đối đầu</strong> (chọn cặp &quot;ngon&quot; để gỡ điểm).</li>
                                                <li>Do có 5 trận nên chắc chắn sẽ có một đội thắng Vòng 1.</li>
                                            </ul>
                                        </li>
                                        <li>📌 <strong>Vòng 3 - SUPER TEAM (1 trận - 3 điểm):</strong>
                                            <ul>
                                                <li><strong>Chạm 31 điểm</strong> - Ăn điểm trực tiếp.</li>
                                                <li><strong>Luật đổi cặp:</strong> Không được giữ nguyên cặp đôi của Vòng 1 và Vòng 2. Phải ghép cặp mới hoàn toàn.</li>
                                                <li><strong>Thay người liên tục:</strong> Cứ mỗi <strong>4 điểm tổng</strong> (VD: 2-2, 3-1, 4-0) thì <strong>CẢ 2 ĐỘI đổi cặp kế tiếp</strong> vào sân.</li>
                                                <li>Đội trưởng sắp xếp thứ tự 5 cặp (1-2-3-4-5) từ trước. Các cặp xoay vòng liên tục đến khi chạm 31.</li>
                                            </ul>
                                        </li>
                                    </ul>
                                </li>

                                <li><strong>Cách tính điểm đồng đội:</strong>
                                    <ul>
                                        <li><strong>Vòng 1-2:</strong> Tổng có 10 trận đấu, mỗi trận thắng = <strong>1 điểm</strong>.</li>
                                        <li><strong>Vòng 3 - ĐỒNG ĐỘI:</strong> Đội thắng nhận = <strong>+3 ĐIỂM</strong> 🔥</li>
                                        <li>🎯 <strong>Tổng điểm tối đa:</strong> 10 điểm (Vòng 1-2) + 3 điểm (Vòng 3) = <strong>13 điểm</strong></li>
                                        <li>🏆 <strong>Điều kiện vô địch:</strong> Đội nào có tổng điểm cao hơn sau Vòng 3.</li>
                                        <li>⚡ <strong>Yếu tố bất ngờ:</strong> Dù thua 4-6 sau Vòng 1-2, nếu thắng ĐỒNG ĐỘI +3 điểm = 7 điểm! Cục diện có thể thay đổi hoàn toàn ở vòng cuối.</li>
                                    </ul>
                                </li>

                                <li><strong>Luật thi đấu & Tính điểm:</strong>
                                    <ul>
                                        <li>🏓 <strong>Vòng 1 & 2:</strong> 1 Set chạm 11 điểm. Đổi sân khi có đội đạt 6 điểm.</li>
                                        <li>🏓 <strong>Vòng 3 - ĐỒNG ĐỘI:</strong> Chạm 31 điểm trực tiếp. Đổi sân khi có đội đạt 16 điểm.</li>
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
                                    <th width="23%">HANA</th>
                                    <th width="8%">VS</th>
                                    <th width="23%">BẢO LÂM</th>
                                    <th width="8%">Loại</th>
                                </tr>
                            </thead>
                            <tbody>
                                {/* Phase 1 */}
                                <tr>
                                    <td colSpan="7" className="phase-header">
                                        VÒNG 1: ĐÁNH ĐÔI BÍ MẬT<br />
                                        <span style={{ fontWeight: 'normal', fontSize: '0.85rem' }}>Đội trưởng nộp danh sách kín - Set chạm 11 </span>
                                    </td>
                                </tr>
                                <tr>
                                    <td rowSpan="3">17:00 - 17:20</td>
                                    <td>1</td>
                                    <td className="court-col">Sân 1</td>
                                    <td>Cặp HANA 1</td>
                                    <td>-</td>
                                    <td>Cặp BẢO LÂM 1</td>
                                    <td>Đôi</td>
                                </tr>
                                <tr>
                                    <td>2</td>
                                    <td className="court-col">Sân 2</td>
                                    <td>Cặp HANA 2</td>
                                    <td>-</td>
                                    <td>Cặp BẢO LÂM 2</td>
                                    <td>Đôi</td>
                                </tr>
                                <tr>
                                    <td>3</td>
                                    <td className="court-col">Sân 3</td>
                                    <td>Cặp HANA 3</td>
                                    <td>-</td>
                                    <td>Cặp BẢO LÂM 3</td>
                                    <td>Đôi</td>
                                </tr>
                                <tr>
                                    <td rowSpan="2">17:20 - 17:40</td>
                                    <td>4</td>
                                    <td className="court-col">Sân 1</td>
                                    <td>Cặp HANA 4</td>
                                    <td>-</td>
                                    <td>Cặp BẢO LÂM 4</td>
                                    <td>Đôi</td>
                                </tr>
                                <tr>
                                    <td>5</td>
                                    <td className="court-col">Sân 2</td>
                                    <td>Cặp HANA 5</td>
                                    <td>-</td>
                                    <td>Cặp BẢO LÂM 5</td>
                                    <td>Đôi</td>
                                </tr>

                                {/* Phase 2 */}
                                <tr>
                                    <td colSpan="7" className="phase-header">
                                        VÒNG 2: ĐỔI CẶP XOAY VÒNG<br />
                                        <span style={{ fontWeight: 'normal', fontSize: '0.85rem' }}>Bắt buộc đổi cặp - Đội THUA Vòng 1 chọn đối thủ - Set chạm 11</span>
                                    </td>
                                </tr>
                                <tr>
                                    <td rowSpan="3">17:50 - 18:10</td>
                                    <td>6</td>
                                    <td className="court-col">Sân 1</td>
                                    <td>Cặp HANA A</td>
                                    <td>-</td>
                                    <td>Cặp BẢO LÂM A</td>
                                    <td>Đôi</td>
                                </tr>
                                <tr>
                                    <td>7</td>
                                    <td className="court-col">Sân 2</td>
                                    <td>Cặp HANA B</td>
                                    <td>-</td>
                                    <td>Cặp BẢO LÂM B</td>
                                    <td>Đôi</td>
                                </tr>
                                <tr>
                                    <td>8</td>
                                    <td className="court-col">Sân 3</td>
                                    <td>Cặp HANA C</td>
                                    <td>-</td>
                                    <td>Cặp BẢO LÂM C</td>
                                    <td>Đôi</td>
                                </tr>
                                <tr>
                                    <td rowSpan="2">18:10 - 18:30</td>
                                    <td>9</td>
                                    <td className="court-col">Sân 1</td>
                                    <td>Cặp HANA D</td>
                                    <td>-</td>
                                    <td>Cặp BẢO LÂM D</td>
                                    <td>Đôi</td>
                                </tr>
                                <tr>
                                    <td>10</td>
                                    <td className="court-col">Sân 2</td>
                                    <td>Cặp HANA E</td>
                                    <td>-</td>
                                    <td>Cặp BẢO LÂM E</td>
                                    <td>Đôi</td>
                                </tr>

                                {/* Phase 3 */}
                                <tr>
                                    <td colSpan="7" className="phase-header">
                                        VÒNG 3: ĐỒNG ĐỘI<br />
                                        <span style={{ fontWeight: 'normal', fontSize: '0.85rem' }}>Cả đội ra sân - Chạm 31 - Thay cặp sau mỗi 4 điểm TỔNG (VD: 2-2, 3-1, 4-0)</span>
                                    </td>
                                </tr>
                                <tr>
                                    <td>18:40 - 19:40</td>
                                    <td>11</td>
                                    <td className="court-col">Sân 1</td>
                                    <td colSpan="3" style={{ textAlign: 'center', fontWeight: 'bold' }}>HANA vs BẢO LÂM</td>
                                    <td>Đồng Đội</td>
                                </tr>
                                <tr>
                                    <td colSpan="7" style={{ padding: '10px', fontSize: '0.85rem', background: 'rgba(139, 92, 246, 0.1)' }}>
                                        <strong>Luật Đồng Đội:</strong> Đội trưởng sắp xếp 5 cặp đôi theo thứ tự 1-2-3-4-5. Cặp 1 ra sân, cứ sau <strong>mỗi 4 điểm TỔNG (của cả 2 bên cộng lại)</strong> thì CẢ 2 ĐỘI cùng thay cặp tiếp theo (1→2→3→4→5→1...). Đội nào chạm 31 điểm trước thắng.
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
