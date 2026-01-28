# 🐛 FIX: Danh sách chia team không hiển thị trên Live Page

## Vấn đề
Sau khi nộp danh sách chia team của đội XANH ở trang Captain, danh sách không hiển thị trên trang Live.

## Nguyên nhân
Vấn đề nằm ở **API `/api/tournament/live/pairings/route.js`** - Syntax join với bảng `tournament_players` bị sai, khiến Supabase không trả về dữ liệu.

### Cụ thể:
```javascript
// ❌ SAI - Sử dụng foreign key constraint name (không tồn tại hoặc sai tên)
player1:tournament_players!tournament_pairings_player1_id_fkey(*)
player2:tournament_players!tournament_pairings_player2_id_fkey(*)
```

Supabase không nhận dạng được tên foreign key constraint này, dẫn đến query trả về 0 kết quả.

## Giải pháp
Đổi sang syntax đơn giản hơn, chỉ cần tên cột:

```javascript
// ✅ ĐÚNG - Chỉ cần tên cột foreign key
player1:tournament_players!player1_id(*)
player2:tournament_players!player2_id(*)
```

## Kết quả
- ✅ API giờ trả về đầy đủ 12 pairings của team XANH (4 cặp × 3 vòng)
- ✅ Trang Live sẽ hiển thị danh sách đội XANH đầy đủ
- ⏳ Team ĐỎ chưa có dữ liệu vì captain team đỏ chưa nộp danh sách

## File đã sửa
- `app/api/tournament/live/pairings/route.js` (line 24-25)

## Cách test
1. Truy cập: http://localhost:3000/tournament/live
2. Kiểm tra phần "📋 Cặp đôi các vòng"
3. Sẽ thấy danh sách đội XANH hiển thị đầy đủ ở các vòng

## Debug APIs đã tạo (có thể xóa sau)
- `/api/debug/pairings-status`
- `/api/debug/live-pairings-test`
- `/api/debug/supabase-test`
- `/api/debug/player-join-test`
