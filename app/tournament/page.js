'use client';

export default function Tournament() {
    return (
        <div dangerouslySetInnerHTML={{
            __html: `
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Điều Lệ Giải Đấu Pickleball Tất Niên (1 Ngày)</title>
    <style>
        :root {
            --primary: #667eea; /* Purple */
            --secondary: #764ba2; /* Dark Purple */
            --dark: #1a1a2e;
            --light: #f8f9ff;
            --accent: #fbbf24; /* Yellow */
            --success: #10b981;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: var(--dark);
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            margin: 0;
            padding: 20px;
        }
        .container {
            max-width: 900px;
            margin: 0 auto;
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
            overflow: hidden;
        }
        header {
            background: linear-gradient(135deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.1) 100%);
            backdrop-filter: blur(10px);
            border-bottom: 2px solid rgba(255,255,255,0.2);
            color: white;
            padding: 30px 20px;
            text-align: center;
        }
        h1 {
            margin: 0;
            font-size: 2.2rem;
            text-transform: uppercase;
            letter-spacing: 1px;
            color: #1a1a2e;
            text-shadow: 2px 2px 4px rgba(255,255,255,0.5);
        }
        .subtitle {
            font-size: 1.1rem;
            color: #334155;
            margin-top: 5px;
            font-style: italic;
        }
        .badge {
            display: inline-block;
            background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
            border: 2px solid rgba(255,255,255,0.5);
            box-shadow: 0 4px 15px rgba(245,158,11,0.4);
            color: white;
            padding: 5px 15px;
            border-radius: 20px;
            font-weight: bold;
            font-size: 0.85rem;
            margin-top: 15px;
            text-transform: uppercase;
        }
        .content {
            padding: 25px;
        }
        h2 {
            border-left: 5px solid #667eea;
            padding-left: 15px;
            margin-top: 30px;
            color: var(--dark);
            background: rgba(102, 126, 234, 0.05);
            padding-top: 10px;
            padding-bottom: 10px;
        }
        
        /* Team Styles */
        .team-section {
            display: flex;
            gap: 20px;
            margin-bottom: 30px;
            align-items: center;
        }
        .team-card {
            flex: 1;
            padding: 20px;
            border-radius: 12px;
            text-align: center;
            color: white;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        .team-blue { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
        .team-red { background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%); }
        .team-card h3 { margin: 0; font-size: 1.8rem; }
        .vs-circle {
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--dark);
            color: white;
            width: 50px;
            height: 50px;
            border-radius: 50%;
            font-weight: bold;
            flex-shrink: 0; /* Prevent shrinking */
        }

        /* Rules List */
        .rules-box {
            background: rgba(102, 126, 234, 0.1);
            border: 2px solid rgba(102, 126, 234, 0.3);
            padding: 15px 20px;
            border-radius: 12px;
        }
        .rules-box ul { padding-left: 20px; margin: 0; }
        .rules-box li { margin-bottom: 10px; }
        .rules-box strong { color: #667eea; }

        /* Schedule Table */
        .schedule-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 0.9rem;
            margin-top: 15px;
        }
        .schedule-table th, .schedule-table td {
            border: 1px solid #cbd5e1;
            padding: 8px; /* Slightly reduced padding */
            text-align: center;
        }
        .schedule-table th {
            background: rgba(102, 126, 234, 0.15);
            color: #1a1a2e;
            font-weight: 700;
        }
        .phase-header {
            background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%) !important;
            color: #fff;
            font-weight: bold;
            text-align: left !important;
            padding-left: 15px !important;
        }
        .court-col { font-weight: bold; color: #667eea; }
        
        /* Prize Section */
        .prize-section {
            background: #fff1f2;
            border: 2px dashed var(--secondary);
            border-radius: 12px;
            padding: 20px;
            margin-top: 30px;
            text-align: center;
        }
        .cost-split {
            display: flex;
            justify-content: center;
            gap: 20px;
            margin-top: 15px;
        }
        .split-box {
            background: white;
            padding: 15px;
            border-radius: 8px;
            border: 1px solid #fda4af;
            min-width: 120px;
        }
        .split-box strong { display: block; font-size: 1.5rem; color: var(--secondary); }

        .footer {
            text-align: center;
            padding: 20px;
            color: rgba(255,255,255,0.9);
            font-size: 0.85rem;
            border-top: 1px solid rgba(255,255,255,0.2);
            background: rgba(255,255,255,0.1);
        }

        /* Mobile Optimization */
        @media (max-width: 600px) {
            h1 { font-size: 1.6rem; }
            body { padding: 10px; }
            .content { padding: 15px; }
            
            /* Team section adjustments for mobile row layout */
            .team-section { 
                gap: 5px; 
            }
            .team-card {
                padding: 10px 5px;
            }
            .team-card h3 {
                font-size: 1.1rem;
            }
            .team-card p {
                font-size: 0.8rem;
                margin: 5px 0 0 0;
            }
            .vs-circle {
                width: 30px;
                height: 30px;
                font-size: 0.7rem;
            }

            .cost-split { flex-direction: column; }
            
            /* Compact table for mobile */
            .schedule-table th, .schedule-table td {
                padding: 5px;
                font-size: 0.8rem;
            }
        }
    </style>
</head>
<body>

<div class="container">
    <header>
        <h1>PICKLEBALL YEAR-END CUP</h1>
        <div class="subtitle">16 Chiến binh - 1 Ngày duy nhất - Quyết đấu vì bữa nhậu</div>
        <div class="badge">THỂ THỨC RYDER CUP: TEAM A vs TEAM B</div>
    </header>

    <div class="content">
        <!-- Teams -->
        <div class="team-section">
            <div class="team-card team-blue">
                <h3>TEAM XANH</h3>
                <p>Đội trưởng: [Tên A]</p>
            </div>
            <div class="vs-circle">VS</div>
            <div class="team-card team-red">
                <h3>TEAM ĐỎ</h3>
                <p>Đội trưởng: [Tên B]</p>
            </div>
        </div>

        <!-- Rules Summary -->
        <h2>1. THỂ THỨC & TÍNH ĐIỂM</h2>
        <div class="rules-box">
            <ul>
                <li><strong>Thời gian & Địa điểm:</strong> 17:30 - 19:30 (Dự kiến 02 tiếng) tại 02 sân nhà của CLB.</li>
                
                <!-- Added: Cách chia đội -->
                <li><strong>Cách chia đội ("Draft Day"):</strong> Chọn ra 2 đội trưởng (có uy tín hoặc hay "kháy" nhau nhất). Hai người này sẽ lần lượt "đi chợ" (draft) để chọn thành viên về đội mình cho đến khi đủ 8 người/đội.</li>

                <!-- Added: Thể thức thi đấu chi tiết -->
                <li><strong>Thể thức thi đấu chi tiết:</strong>
                    <ul>
                        <li>📌 <strong>Vòng 1 (4 trận đôi ngẫu nhiên):</strong> Đội trưởng sắp xếp cặp đôi bí mật, nộp danh sách cho Ban Tổ Chức (BTC). Mở bài ra cặp nào đấu cặp đó.</li>
                        <li>📌 <strong>Vòng 2 (4 trận đôi chiến thuật):</strong> Bên thua vòng 1 được quyền chọn cặp đấu (ví dụ: "Cặp mạnh nhất của tôi thách đấu cặp mạnh nhất của ông").</li>
                        <li>📌 <strong>Vòng 3 (8 trận đơn):</strong> Nếu anh em đủ sức khỏe sẽ đánh đơn, hoặc tiếp tục đánh đôi nhưng đổi người đánh cặp. (Quyết định cụ thể vào ngày thi đấu).</li>
                    </ul>
                </li>

                <li><strong>Cách tính điểm đồng đội:</strong> 
                    <ul>
                        <li>Tổng giải có <strong>16 trận đấu</strong> (8 trận Đôi + 8 trận Đơn).</li>
                        <li>Mỗi trận thắng mang về <strong>1 điểm</strong> cho Team.</li>
                        <li>Đội nào chạm mốc <strong>8.5 điểm</strong> trước là VÔ ĐỊCH.</li>
                        <li>Nếu hòa 8-8: Mỗi đội cử 1 cặp mạnh nhất đánh Tie-break "bàn thắng vàng" (Golden Point).</li>
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

        <!-- Schedule -->
        <h2>2. LỊCH THI ĐẤU CHI TIẾT</h2>
        <table class="schedule-table">
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
                <!-- Phase 1 -->
                <tr>
                    <td colspan="6" class="phase-header">VÒNG 1: ĐÁNH ĐÔI BÍ MẬT<br><span style="font-weight:normal; font-size:0.85rem">Đội trưởng nộp danh sách kín - Set 15 (Chạm 17)</span></td>
                </tr>
                <tr>
                    <td rowspan="2">17:45 - 18:10</td>
                    <td class="court-col">Sân 1</td>
                    <td>Cặp Xanh 1</td>
                    <td>-</td>
                    <td>Cặp Đỏ 1</td>
                    <td>Đôi</td>
                </tr>
                <tr>
                    <td class="court-col">Sân 2</td>
                    <td>Cặp Xanh 2</td>
                    <td>-</td>
                    <td>Cặp Đỏ 2</td>
                    <td>Đôi</td>
                </tr>
                <tr>
                    <td rowspan="2">18:10 - 18:35</td>
                    <td class="court-col">Sân 1</td>
                    <td>Cặp Xanh 3</td>
                    <td>-</td>
                    <td>Cặp Đỏ 3</td>
                    <td>Đôi</td>
                </tr>
                <tr>
                    <td class="court-col">Sân 2</td>
                    <td>Cặp Xanh 4</td>
                    <td>-</td>
                    <td>Cặp Đỏ 4</td>
                    <td>Đôi</td>
                </tr>

                <!-- Phase 2 -->
                <tr>
                    <td colspan="6" class="phase-header">VÒNG 2: ĐÁNH ĐÔI THÁCH ĐẤU<br><span style="font-weight:normal; font-size:0.85rem">Đội THUA Vòng 1 được quyền chọn cặp đấu - Set 15 (Chạm 17)</span></td>
                </tr>
                <tr>
                    <td rowspan="2">18:40 - 19:05</td>
                    <td class="court-col">Sân 1</td>
                    <td>Cặp Xanh A</td>
                    <td>-</td>
                    <td>Cặp Đỏ A</td>
                    <td>Đôi</td>
                </tr>
                <tr>
                    <td class="court-col">Sân 2</td>
                    <td>Cặp Xanh B</td>
                    <td>-</td>
                    <td>Cặp Đỏ B</td>
                    <td>Đôi</td>
                </tr>
                <tr>
                    <td rowspan="2">19:05 - 19:30</td>
                    <td class="court-col">Sân 1</td>
                    <td>Cặp Xanh C</td>
                    <td>-</td>
                    <td>Cặp Đỏ C</td>
                    <td>Đôi</td>
                </tr>
                <tr>
                    <td class="court-col">Sân 2</td>
                    <td>Cặp Xanh D</td>
                    <td>-</td>
                    <td>Cặp Đỏ D</td>
                    <td>Đôi</td>
                </tr>

                <!-- Phase 3 -->
                <tr>
                    <td colspan="6" class="phase-header">VÒNG 3: SOLO 1vs1 QUYẾT ĐỊNH<br><span style="font-weight:normal; font-size:0.85rem">Khớp cặp theo trình độ tương đương - Set 11 (Chạm 13)</span></td>
                </tr>
                <tr>
                    <td rowspan="2">19:35 - 19:50</td>
                    <td class="court-col">Sân 1</td>
                    <td>Đơn Nam 8</td>
                    <td>-</td>
                    <td>Đơn Nam 8</td>
                    <td>Đơn</td>
                </tr>
                <tr>
                    <td class="court-col">Sân 2</td>
                    <td>Đơn Nam 7</td>
                    <td>-</td>
                    <td>Đơn Nam 7</td>
                    <td>Đơn</td>
                </tr>
                <tr>
                    <td rowspan="2">19:50 - 20:05</td>
                    <td class="court-col">Sân 1</td>
                    <td>Đơn Nam 6</td>
                    <td>-</td>
                    <td>Đơn Nam 6</td>
                    <td>Đơn</td>
                </tr>
                <tr>
                    <td class="court-col">Sân 2</td>
                    <td>Đơn Nam 5</td>
                    <td>-</td>
                    <td>Đơn Nam 5</td>
                    <td>Đơn</td>
                </tr>
                <tr>
                    <td rowspan="2">20:05 - 20:20</td>
                    <td class="court-col">Sân 1</td>
                    <td>Đơn Nam 4</td>
                    <td>-</td>
                    <td>Đơn Nam 4</td>
                    <td>Đơn</td>
                </tr>
                <tr>
                    <td class="court-col">Sân 2</td>
                    <td>Đơn Nam 3</td>
                    <td>-</td>
                    <td>Đơn Nam 3</td>
                    <td>Đơn</td>
                </tr>
                <tr>
                    <td rowspan="2">20:20 - 20:35</td>
                    <td class="court-col">Sân 1</td>
                    <td>Đơn Nam 2 (Ace)</td>
                    <td>-</td>
                    <td>Đơn Nam 2 (Ace)</td>
                    <td>Đơn</td>
                </tr>
                <tr>
                    <td class="court-col">Sân 2</td>
                    <td>Đơn Nam 1 (Super Ace)</td>
                    <td>-</td>
                    <td>Đơn Nam 1 (Super Ace)</td>
                    <td>Đơn</td>
                </tr>
            </tbody>
        </table>

        <!-- Prizes & Finance -->
        <div class="prize-section">
            <h3 style="margin-top:0; color: var(--secondary);">💰 CƠ CẤU GIẢI THƯỞNG & TÀI CHÍNH</h3>
            <p>Toàn bộ thành viên tham gia Gala Dinner tổng kết ngay sau trận đấu.</p>
            <p><strong>QUY TẮC THANH TOÁN BILL:</strong></p>
            <ul style="list-style: none; padding: 0;">
                <li>✅ <strong>Bước 1:</strong> Dùng 100% tiền Quỹ CLB hiện có để thanh toán.</li>
                <li>✅ <strong>Bước 2:</strong> Nếu thiếu, số tiền còn lại sẽ chia theo tỷ lệ:</li>
            </ul>
            
            <div class="cost-split">
                <div class="split-box" style="border-color: var(--success);">
                    <span style="color: #64748b; font-size: 0.9rem;">Đội Vô Địch</span>
                    <strong style="color: var(--success);">Đóng 40%</strong>
                    <small>Phần bill còn thiếu</small>
                </div>
                <div class="split-box">
                    <span style="color: #64748b; font-size: 0.9rem;">Đội Thua Cuộc</span>
                    <strong style="color: var(--secondary);">Đóng 60%</strong>
                    <small>Phần bill còn thiếu</small>
                </div>
            </div>
            <p style="margin-top: 15px; font-style: italic; font-size: 0.9rem;">(Ví dụ: Quỹ có 2tr, Bill hết 4tr. Còn thiếu 2tr. Đội thắng đóng 800k, Đội thua đóng 1tr2).</p>
        </div>

    </div>
    <div class="footer">
        Kế hoạch được lập tự động ngày 22/01/2026 cho CLB Pickleball.
    </div>
</div>

</body>
</html>
            `
        }} />
    );
}
