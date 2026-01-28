# ✅ GIẢI PHÁP: Admin Toggle cho Round 1

## Vấn Đề
- Database JSONB với timestamp quá phức tạp và không hoạt động đúng
- Giá trị bị wrap trong dấu ngoặc kép, gây lỗi parsing

## Giải Pháp Mới: Boolean Toggle
Thay vì dùng timestamp, dùng **boolean flag đơn giản** để toggle visibility:

### 1. API Endpoint Mới
**`/api/tournament/admin/toggle-round1`**
- **POST**: Set reveal = true/false
- **GET**: Check current state

### 2. Database Setting
- Key: `round1_revealed` (thay vì `round1_reveal_time`)
- Value: `true` hoặc `false` (Boolean)

### 3. Cách Sử Dụng

#### Ẩn Round 1 (Mặc định):
```bash
curl -X POST http://localhost:3000/api/tournament/admin/toggle-round1 \
  -H "Content-Type: application/json" \
  -d '{"reveal": false}'
```

#### Hiện Round 1:
```bash
curl -X POST http://localhost:3000/api/tournament/admin/toggle-round1 \
  -H "Content-Type: application/json" \
  -d '{"reveal": true}'
```

#### Hoặc dùng Admin UI:
1. Vào `/admin/tournament`
2. Click nút "🔓 Công Bố Round 1"

### 4. Verification
```bash
# Check API
curl http://localhost:3000/api/tournament/live/pairings | jq '.canRevealRound1'

# Should return: false (hidden) or true (revealed)
```

### 5. Files Modified
- ✅ `app/api/tournament/admin/toggle-round1/route.js` - New API
- ✅ `app/api/tournament/live/pairings/route.js` - Changed to use boolean
- ✅ `app/admin/tournament/page.js` - Updated toggle button

## Kết Quả
- ✅ `canRevealRound1: false` - Blur effect hoạt động
- ✅ Admin có thể toggle manually bất cứ lúc nào
- ✅ Không phụ thuộc vào thời gian nữa
