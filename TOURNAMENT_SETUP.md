# Tournament System Setup Guide

## Bước 1: Chạy Migration Database

1. Truy cập [Supabase Dashboard](https://supabase.com/dashboard)
2. Chọn project của bạn
3. Vào **SQL Editor**
4. Copy toàn bộ nội dung file `database/migrations/004_tournament_tables.sql`
5. Paste vào SQL Editor và click **Run**
6. Verify kết quả:
   - ✅ 5 bảng mới được tạo: `tournament_teams`, `tournament_players`, `tournament_pairings`, `tournament_matches`, `tournament_settings`
   - ✅ 2 teams đã insert: TEAM XANH, TEAM ĐỎ
   - ✅ 16 players đã insert (8/team)
   - ✅ 9 matches template đã tạo

---

## Bước 2: Tạo Tài Khoản Đội Trưởng

### Cách 1: Sử dụng Supabase Dashboard (Khuyến nghị)

1. Vào **Authentication** → **Users**
2. Click **Add user** → **Create new user**

**Đội trưởng Team XANH:**
- Email: `captain_blue@pkl.com`
- Password: `pkl2026!` (hoặc password khác)
- Auto Confirm User: ✅ Bật

3. Click **Create user**

**Đội trưởng Team ĐỎ:**
- Email: `captain_red@pkl.com`
- Password: `pkl2026!` (hoặc password khác)
- Auto Confirm User: ✅ Bật

4. Click **Create user**

### Cách 2: Cập nhật User Metadata qua SQL

Sau khi tạo 2 users, cần set metadata cho họ:

```sql
-- Update metadata for Blue Team Captain
UPDATE auth.users 
SET raw_user_meta_data = '{"role": "captain", "team": "blue"}'::jsonb
WHERE email = 'captain_blue@pkl.com';

-- Update metadata for Red Team Captain
UPDATE auth.users 
SET raw_user_meta_data = '{"role": "captain", "team": "red"}'::jsonb
WHERE email = 'captain_red@pkl.com';
```

**Chạy 2 lệnh SQL này trong SQL Editor**

---

## Bước 3: Cập Nhật Captain User ID (Optional)

Nếu muốn link captain với team trong database:

```sql
-- Get captain user IDs
SELECT id, email FROM auth.users WHERE email LIKE 'captain%';

-- Update team captain_user_id
UPDATE tournament_teams 
SET captain_user_id = (SELECT id FROM auth.users WHERE email = 'captain_blue@pkl.com' LIMIT 1)
WHERE team_code = 'blue';

UPDATE tournament_teams 
SET captain_user_id = (SELECT id FROM auth.users WHERE email = 'captain_red@pkl.com' LIMIT 1)
WHERE team_code = 'red';
```

---

## Bước 4: Test Hệ Thống

### Test Captain Login

1. Mở `http://localhost:3000/login`
2. Login với `captain_blue@pkl.com`
3. Verify redirect đến `/tournament/captain`
4. Verify thấy "TEAM XANH" và danh sách 8 người
5. Test sắp xếp cặp đôi cho Vòng 1
6. Click "Lưu bản nháp"
7. Click "Nộp danh sách"
8. Logout và test với `captain_red@pkl.com`

### Test Live Page

1. Mở `http://localhost:3000/tournament/live` (không cần login)
2. Verify thấy:
   - Scoreboard (0-0)
   - Team rosters (2 đội)
   - Vòng 1 bị ẩn (🔒 Bí mật)
   - Match schedule

---

## Bước 5: Cấu Hình Thời Gian Mở Bí Mật

Mặc định Vòng 1 sẽ mở lúc **16:30**.

Để thay đổi:

```sql
UPDATE tournament_settings
SET setting_value = '"2026-01-27T16:30:00+07:00"'::jsonb
WHERE setting_key = 'round1_reveal_time';
```

Thay đổi timestamp theo múi giờ của bạn.

---

## Cấu Trúc URL

| Route | Mô tả | Auth Required |
|-------|-------|---------------|
| `/tournament` | Điều lệ giải đấu | No |
| `/tournament/captain` | Dashboard đội trưởng | Yes (captain) |
| `/tournament/live` | Trang live công khai | No |
| `/login` | Đăng nhập | No |

---

## API Endpoints

| Endpoint | Method | Mô tả |
|----------|--------|-------|
| `/api/tournament/teams` | GET | Lấy teams & players |
| `/api/tournament/captain/pairings` | GET | Lấy pairings của 1 team |
| `/api/tournament/captain/pairings` | POST | Lưu/update pairings |
| `/api/tournament/captain/pairings` | PUT | Submit pairings |
| `/api/tournament/live/pairings` | GET | Pairings công khai |
| `/api/tournament/live/matches` | GET | Lịch thi đấu + điểm |
| `/api/tournament/live/matches` | POST | Update điểm (admin) |
| `/api/tournament/live/scoreboard` | GET | Bảng tổng điểm |

---

## Workflow Sử Dụng

### Pre-Match (Trước 17:00)

1. **Captain Team XANH** login → Sắp xếp 4 cặp Vòng 1 → Nộp
2. **Captain Team ĐỎ** login → Sắp xếp 4 cặp Vòng 1 → Nộp
3. Vòng 1 vẫn ẩn cho đến 16:30
4. **16:30**: Vòng 1 tự động mở trên trang `/tournament/live`

### Match Day (17:00 - 20:05)

1. Admin/Trọng tài nhập điểm từng trận vào database hoặc qua API
2. Trang `/tournament/live` tự động cập nhật mỗi 10 giây
3. Scoreboard tự động tính điểm

### Round 2 Setup

1. Admin xác định team thắng Vòng 1, update:
```sql
UPDATE tournament_settings
SET setting_value = '"blue"'::jsonb  -- hoặc "red"
WHERE setting_key = 'round1_winner';
```

2. **Captain Team THẮNG** nộp danh sách Vòng 2 trước
3. **Captain Team THUA** thấy danh sách team kia, sắp xếp để chọn matchup

### Round 3 Setup

1. Cả 2 captains sắp xếp thứ tự 4 cặp (1-2-3-4)
2. Nộp danh sách
3. Trận team battle diễn ra (thay người mỗi 4 điểm tổng)

---

## Admin: Cách Nhập Điểm Số

### Option 1: Trực tiếp Database (Nhanh nhất)

```sql
-- Update điểm trận số 1
UPDATE tournament_matches
SET 
  blue_score = 15,
  red_score = 10,
  match_status = 'completed',
  winner_team = 'blue'
WHERE match_number = 1;
```

### Option 2: Qua API (Dành cho app mobile sau này)

```bash
POST /api/tournament/live/matches
{
  "matchId": 1,
  "blueScore": 15,
  "redScore": 10,
  "status": "completed"
}
```

---

## Troubleshooting

### Lỗi: "Team not found"
- Check trong `tournament_teams` có 2 teams chưa
- Verify `team_code` là 'blue' và 'red'

### Lỗi: "Invalid pairings"
- Vòng 2 phải khác Vòng 1 (không giữ nguyên cặp)
- Mỗi người chỉ được chọn 1 lần

### Lỗi: Captain không redirect đến dashboard
- Check `user_metadata` có `role: 'captain'` chưa
- Check `team` field có giá trị 'blue' hoặc 'red'

### Vòng 1 không mở dù đã qua 16:30
- Check setting `round1_reveal_time` trong `tournament_settings`
- Verify timestamp đúng múi giờ

---

## Production Deployment (Vercel)

Khi deploy:

1. ✅ Các API routes tự động hoạt động
2. ✅ Environment variables từ `.env.local` đã set trên Vercel
3. ⚠️ Update Supabase Redirect URLs:
   - Site URL: `https://your-domain.vercel.app`
   - Redirect URLs: `https://your-domain.vercel.app/**`

---

## Liên Hệ

Nếu có vấn đề, hãy liên hệ admin system hoặc check logs trong:
- Vercel Logs (nếu production)
- Browser Console (frontend errors)
- Supabase Logs (database errors)
