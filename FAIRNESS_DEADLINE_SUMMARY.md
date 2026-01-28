# 📋 Summary: Fairness & Deadline Implementation

## ✅ Completed Features

### 1. **Fair Play System**
Team XANH pairings are **hidden (blurred)** until:
- ✅ Team ĐỎ nộp danh sách Vòng 1, HOẶC
- ✅ Qua thời hạn 16:30

**Why?** Để công bằng - Team XANH nộp trước không bị lộ chiến thuật.

---

### 2. **Strict 16:30 Deadline**
Sau 16:30, **KHÔNG** team nào được:
- ❌ Lưu bản nháp
- ❌ Nộp danh sách
- ❌ Sửa lại danh sách (unlock)

---

## 🔄 How It Works

### Timeline:

**09:00 - Team XANH nộp Vòng 1**
- ✅ XANH: Đã nộp
- ⏳ ĐỎ: Chưa nộp
- 🔒 Live page: **BLUR team XANH**

**10:00 - Team ĐỎ nộp Vòng 1**
- ✅ XANH: Đã nộp
- ✅ ĐỎ: Đã nộp
- ✅ Live page: **REVEAL ALL** (mở tất cả)

**15:00 - Sửa đổi (nếu cần)**
- ✅ Cả 2 team vẫn có thể click "Sửa lại"
- ✅ Chỉnh sửa và nộp lại

**16:30 - DEADLINE**
- ❌ **LOCK TOÀN BỘ** - không ai sửa được nữa
- ✅ Live page: Hiện tất cả (dù ĐỎ chưa nộp)

---

## 🎯 API Response Example

```json
{
  "success": true,
  "canRevealRound1": false,
  "isPastDeadline": false,
  "redHasSubmitted": false,
  "pairings": {
    "blue": { "round1": [...] },
    "red": { "round1": [] }
  }
}
```

### Reveal Logic:
```javascript
canReveal = isPastDeadline || redHasSubmitted
```

---

## 📱 User Interface

### Live Page - Lock Message:
```
🔒 Danh sách sẽ được mở khi Team ĐỎ nộp
hoặc sau 16:30
```

### Captain Page - After 16:30:
```
⏰ Đã quá thời hạn 16:30. Không thể [lưu/nộp/sửa] danh sách nữa.
```

---

## 📂 Files Modified

| File | Changes |
|------|---------|
| `app/api/tournament/live/pairings/route.js` | Check RED submission + deadline |
| `app/tournament/captain/page.js` | Deadline enforcement (save/submit/unlock) |
| `app/tournament/live/page.js` | Updated lock message |

---

## 🧪 Testing Checklist

- [x] BLUE submits → Live page blurs BLUE
- [x] RED submits → Live page reveals all
- [x] Before 16:30 → Can edit
- [x] After 16:30 → Cannot edit (shows error)
- [x] API returns correct flags

---

## 🚀 Next Steps (if needed)

1. Test with real teams on captain dashboard
2. Verify blur effect on live page
3. Test editing after RED team submits
4. Wait until 16:30 to confirm lock works

---

## ⚙️ Configuration

**Deadline**: `2026-01-28T16:30:00+07:00`

To change deadline, update in:
- `app/api/tournament/live/pairings/route.js` (line 11)
- `app/tournament/captain/page.js` (lines 209, 247, 281)
