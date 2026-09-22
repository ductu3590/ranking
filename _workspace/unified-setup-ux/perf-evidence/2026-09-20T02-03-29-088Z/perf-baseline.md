## Bảng baseline — đo thật

Commit đo: `d1355bf4b7785b65b14ac10a64915554e50657ea` · Thời điểm: 2026-09-20T02:06:11.353Z · Chromium 153.0.8010.52
Viewport 1440x900 · 5 lần đo sau 1 warm-up · 14 VĐV · group_id `44`

| Luồng | Request count | Thời gian (ms) | Route chính | Payload | Ghi chú |
|---|---:|---|---|---|---|
| Mở nháp | 5 | med 1634 / p95 1701 / min 1600 / max 1701 | GET /giai-dau/v2 → wizard render | 2506 B | n=5 |
| Lưu nháp | `BLOCKED` | `BLOCKED` | — | `BLOCKED` | wizard cũ KHÔNG có hành động lưu nháp riêng; bản nháp ghi vào browserStorage đồng bộ, không phát request |
| Preview lịch | 1 | med 1099 / p95 1245 / min 1083 / max 1245 | POST /api/tournament-v2/preview-schedule | 1027 B | n=5 |
| Chốt tạo giải | 35 | med 17268 / p95 17394 / min 17152 / max 17394 | chuỗi checkpoint qua /api/tournament-v2/* | 1763820 B | n=5 |

## Tải trùng

| Hạng mục | Tổng request | Bị lặp | Bytes |
|---|---:|---|---:|
| Roster (1 lần mở wizard) | 1 | không | 13 |
| Sân (1 lần mở wizard) | 0 | không | 0 |
| Danh sách giải (1 lần mở dashboard) | 2 | GET /api/tournament-v2/tournaments ×2 | 27372 |
| Toàn bộ API khi chốt | 31 | POST /api/tournament-v2/entries ×14<br>GET /api/tournament-v2/tournaments ×3<br>GET /api/groups/session ×2<br>GET /api/tournament-v2/divisions?tournamentId=162 ×2<br>GET /api/tournament-v2/stages?tournamentId=162 ×2<br>GET /api/tournament-v2/assignments?tournamentId=162 ×4 | 55660 |

## Phản hồi giao diện sau thêm/bỏ người

| Thao tác | Request count | Click → UI settled (ms) |
|---|---:|---:|
| Thêm một người | 0 | 595 |
| Bỏ một người | 0 | 586 |