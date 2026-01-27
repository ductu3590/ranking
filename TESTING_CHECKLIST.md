# 🧪 CHECKLIST TESTING - Tính năng Tournament Admin

## ✅ **TEST 1: Admin Tournament Panel**

### Chuẩn bị:
- [ ] Đảm bảo đã fix admin metadata (chạy SQL update role='admin')
- [ ] Đăng nhập bằng account admin
- [ ] Server đang chạy (`npm run dev`)

### Test Steps:
1. **Truy cập Admin Panel:**
   - [ ] Vào URL: `http://localhost:3000/admin/tournament`
   - [ ] Kiểm tra hiển thị 4 stat cards (Tổng người chơi, trận đấu, etc.)
   - [ ] Các số liệu có hợp lý không?

2. **Test Tournament Settings:**
   - [ ] Điền form settings:
     * Tên giải đấu: "PICKLEBALL YEAR-END CUP 2026"
     * Ngày: Chọn ngày hôm nay
     * Giờ bắt đầu: 17:00
     * Giờ kết thúc: 20:00
     * Số sân: 2
     * Thời gian mỗi trận: 15 phút
   - [ ] Click "💾 Lưu Cài Đặt"
   - [ ] Kiểm tra alert "Cài đặt đã được lưu!"
   - [ ] F5 refresh → Settings vẫn còn

3. **Test Quick Actions:**
   - [ ] Click "🔄 Refresh Dữ Liệu" → Stats update
   - [ ] Click "🔓 Công Bố Round 1"
     * Confirm dialog xuất hiện
     * Click OK → Alert "Đã công bố Round 1!"
   - [ ] ⚠️ **KHÔNG** test "Reset Giải Đấu" (sẽ xóa dữ liệu!)

4. **Test Teams Display:**
   - [ ] Kiểm tra hiển thị 2 teams (XANH và ĐỎ)
   - [ ] Mỗi team có số lượng người chơi đúng (8 người)

5. **Test Matches Progress:**
   - [ ] Check Round 1, 2, 3 progress bars
   - [ ] Số trận completed/total có đúng không?

**Expected Result:** ✅ Panel hiển thị đầy đủ, settings lưu được, actions hoạt động

---

## ✅ **TEST 2: Real-time Updates**

### Chuẩn bị:
- [ ] Mở 2 browser windows (Chrome + Edge, hoặc 2 Chrome profiles)
- [ ] Window 1: Admin login
- [ ] Window 2: Guest (không đăng nhập)

### Test Steps:
1. **Setup:**
   - [ ] Window 1: Login admin → `/tournament/live`
   - [ ] Window 2: Open `/tournament/live` (guest mode)
   - [ ] Đặt 2 windows cạnh nhau để dễ quan sát

2. **Test Score Update:**
   - [ ] Window 1 (Admin): Click vào 1 ô tỷ số
   - [ ] Nhập điểm: Blue=11, Red=9
   - [ ] Click ✓
   - [ ] **Quan sát Window 2:** Tỷ số tự động cập nhật (KHÔNG CẦN F5!)

3. **Test Multiple Updates:**
   - [ ] Window 1: Cập nhật 2-3 trận khác nhau
   - [ ] Mỗi lần update, check Window 2 có realtime update không

4. **Test Console:**
   - [ ] Window 2: Mở DevTools (F12) → Tab Console
   - [ ] Khi admin update score, console có log: `Match updated:` không?

**Expected Result:** ✅ Guest window tự động cập nhật khi admin thay đổi điểm

---

## ✅ **TEST 3: Drag & Drop Reordering**

### Chu ẩn bị:
- [ ] Đảm bảo đã thêm drag-drop UI từ `DRAG_DROP_PATCH.js`
- [ ] Đã thêm CSS từ `draggable-styles.css`
- [ ] Login admin

### Test Steps:
1. **Check UI:**
   - [ ] Vào `/tournament/live` với admin account
   - [ ] Scroll đến phần "Vòng 2 - Thách Đấu"
   - [ ] Tiêu đề có text "(Kéo thả để sắp xếp)" màu xanh lá không?
   - [ ] Hover vào pairing box → Cursor thành "grab hand"

2. **Test Drag & Drop Round 2:**
   - [ ] Kéo pairing box XANH #1
   - [ ] Thả vào vị trí XANH #3
   - [ ] Alert "Đã cập nhật thứ tự cặp đấu!" xuất hiện
   - [ ] Thứ tự hiển thị đã thay đổi

3. **Test Cross-Team Validation:**
   - [ ] Thử kéo XANH #1 thả vào ĐỎ #2
   - [ ] Alert "Chỉ có thể sắp xếp lại trong cùng round và team!" xuất hiện
   - [ ] Không có thay đổi

4. **Test Round 3:**
   - [ ] Scroll đến "Vòng 3 - Super Team"
   - [ ] Kéo thả order-item trong team ĐỎ
   - [ ] Kiểm tra thứ tự thay đổi

5. **Test Database Sync:**
   - [ ] Sau khi drag-drop, vào Supabase Dashboard
   - [ ] Check table `tournament_pairings` → `pair_order` đã thay đổi
   - [ ] Check table `tournament_matches` → `blue_pair_id`/`red_pair_id` đã sync

**Expected Result:** ✅ Drag-drop hoạt động, database cập nhật đúng

---

## ✅ **TEST 4: Direct Score Input**

### Test Steps:
1. **Admin Mode:**
   - [ ] Login admin → `/tournament/live`
   - [ ] Scroll đến table "Lịch thi đấu & Kết quả"
   - [ ] Click vào ô tỷ số bất kỳ
   - [ ] 2 input boxes xuất hiện (Blue score, Red score)
   - [ ] Nhập điểm → Click ✓
   - [ ] Alert thành công, tỷ số cập nhật

2. **Guest Mode:**
   - [ ] Logout → Vào `/tournament/live` as guest
   - [ ] Ô tỷ số chỉ hiển thị số, KHÔNG cho click
   - [ ] Không có input boxes

**Expected Result:** ✅ Chỉ admin mới edit được điểm

---

## ✅ **TEST 5: Integration Test**

### Scenario: Full admin workflow
1. **Setup Tournament:**
   - [ ] `/admin/tournament` → Lưu settings
   - [ ] Click "Công Bố Round 1"

2. **Manage Pairings:**
   - [ ] Captain login → Submit pairing Round 2
   - [ ] Admin `/tournament/live` → Drag-drop sắp xếp Round 2 XANH
   - [ ] Drag-drop sắp xếp Round 2 ĐỎ

3. **Update Scores:**
   - [ ] Admin click vào trận 1 → Nhập 11-9
   - [ ] Click trận 2 → Nhập 7-11
   - [ ] Scoreboard tự động cập nhật
   - [ ] Guest window realtime update

4. **Check Data Integrity:**
   - [ ] Supabase: `tournament_pairings` có đúng thứ tự
   - [ ] `tournament_matches` có điểm mới
   - [ ] Scoreboard tính điểm đúng theo round

**Expected Result:** ✅ Toàn bộ workflow hoạt động end-to-end

---

## ❌ **KNOWN ISSUES & NOTES**

### Security:
- ⚠️ API endpoints `/api/tournament/admin/*` CHƯA CÓ AUTH CHECK
- TODO: Uncomment auth validation trong API routes

### Performance:
- ✅ Realtime subscriptions hoạt động tốt với <200 concurrent users
- ⚠️ Nếu >200 users, cần upgrade Supabase plan

### Browser Compatibility:
- ✅ Chrome, Edge, Firefox: Drag-drop hoạt động
- ⚠️ Safari iOS: Có thể cần polyfill cho drag events

---

## 📋 **BUG REPORT TEMPLATE**

Nếu gặp lỗi, ghi lại theo format:

```
Bug Title: [Tên bug ngắn gọn]
Steps to Reproduce:
1. 
2. 
3. 

Expected Result: 
Actual Result: 
Screenshots: [Attach if any]
Console Errors: [F12 → Console tab]
```

---

## ✅ **COMPLETION CHECKLIST**

- [ ] Admin Panel: Settings save thành công
- [ ] Real-time: 2 windows đồng bộ
- [ ] Drag-Drop: Sắp xếp Round 2, 3 hoạt động
- [ ] Score Input: Admin edit được, guest không edit
- [ ] Database: Dữ liệu sync đúng
- [ ] No console errors

**Khi tất cả ✅ → Tính năng HOÀN THÀNH!**
