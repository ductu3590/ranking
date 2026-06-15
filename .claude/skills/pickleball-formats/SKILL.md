---
name: pickleball-formats
description: Luật thi đấu và thuật toán cho 4 thể thức giải Pickleball phong trào — MLP team match, vòng tròn tính điểm (round-robin), loại trực tiếp (knockout), và mix đa giai đoạn (vòng bảng → playoff). Dùng khi thiết kế data model giải đấu, viết format engine (sinh lịch, bảng xếp hạng, seeding, bye, tie-break), hoặc cần hiểu một thể thức để lưu/hiển thị đúng. Đọc references/ tương ứng khi làm sâu một thể thức.
---

# Pickleball Tournament Formats

Nguồn chân lý về thể thức cho module giải đấu. Mục tiêu: một **mô hình stage tổng quát** phục vụ cả 4 thể thức, mỗi thể thức là một engine cài chung một interface.

## Mô hình tổng quát (quan trọng nhất)
- **Giải (tournament)** = một hoặc nhiều **stage** tuần tự. Mỗi stage có đúng một `format`.
- **Mix = nhiều stage**: vd Stage 1 vòng tròn (chia bảng) → Stage 2 knockout giữa các đội đứng đầu. Seeding stage sau lấy từ standings stage trước.
- **Entrant** = đơn vị tham gia, thống nhất cho mọi thể thức: có thể là cá nhân, **cặp đôi** (doubles), hay **đội** (MLP). Engine không quan tâm bên trong entrant là ai — chỉ cần id + (tùy chọn) seed/rating.
- **Match** = một lần đấu giữa 2 (hoặc nhiều, với MLP) entrant trong một stage, có tỉ số → kết quả.

## Interface engine chung (mọi thể thức cài đặt)
| Hàm | Vào | Ra |
|-----|-----|-----|
| `generateSchedule(stageConfig, entrants, seed)` | cấu hình stage + danh sách entrant | danh sách match (vòng, cặp đấu, sân/bye) |
| `computeStandings(stageConfig, entrants, matches)` | + tỉ số đã nhập | bảng xếp hạng đã sắp tie-break |
| `advance(stageConfig, standings)` | standings stage hiện tại | seeding cho stage kế (số suất đi tiếp) |

Hàm thuần, deterministic, nhận `seed` cho mọi random (bốc thăm) để tái lập.

## Chọn thể thức — bảng nhanh
| Thể thức | Khi dùng | Đặc trưng | Reference |
|----------|----------|-----------|-----------|
| Vòng tròn (round-robin) | ít đội, muốn ai cũng gặp ai, công bằng | mọi cặp gặp nhau, xếp theo điểm | `references/round-robin.md` |
| Knockout (loại trực tiếp) | nhiều đội, ít thời gian, cần nhà vô địch nhanh | thua là loại, có bye/seed | `references/knockout.md` |
| MLP team match | 2 đội lớn, nhiều trận con (đôi nam/nữ/mix) | điểm rally tích lũy, Dreambreaker | `references/mlp.md` |
| Mix (vòng bảng + playoff) | giải lớn, vừa công bằng vừa có cao trào | round-robin theo bảng → knockout | `references/mixed-stage.md` |

## Nguyên tắc chung khi cài engine
- **Xử lý số lẻ**: round-robin lẻ entrant → thêm "BYE" ảo; knockout không đủ lũy thừa 2 → bye ở vòng đầu cho hạt giống cao.
- **Tie-break** (mặc định, có thể cấu hình qua `format_config`): điểm/thắng-thua → hiệu số game (point diff) → đối đầu trực tiếp → bốc thăm theo seed.
- **format_config jsonb**: field chỉ phục vụ một thể thức (số bảng, điểm thắng, luật Dreambreaker...) để trong config, KHÔNG thành cột schema riêng.
- Đọc reference của thể thức đang làm trước khi code thuật toán — đừng dựa trí nhớ cho circle method / bracket seeding.
