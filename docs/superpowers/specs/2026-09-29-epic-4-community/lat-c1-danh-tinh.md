# Lát C1 — Danh tính: tài khoản VĐV công khai, đăng nhập admin hệ thống, chống spam

Trạng thái: spec · Xem [README](README.md) · Quyết định D54, D55, D58, D60 · Migration **112**
Ngoài phạm vi lát: đăng ký giải (C2), setup (C3). Lát này giao **domain + API + migration + hai trang đăng nhập nhỏ**.

## 1. Mục tiêu

1. Người chơi bất kỳ tự tạo tài khoản VĐV PickHub bằng **SĐT + mật khẩu + tên hiển thị**, đăng nhập/đăng xuất, xem/sửa hồ sơ cơ bản.
2. Admin hệ thống có **trang đăng nhập** (API đã có, UI chưa) và có quy trình cấp tài khoản đầu tiên.
3. Có **bộ đếm giới hạn tần suất lưu DB** dùng chung cho C1/C2 (bộ nhớ tiến trình không đủ trên serverless).

## 2. Mô hình dữ liệu (migration 112, additive, forward-only)

```sql
player_accounts (
  id bigint identity pk,
  phone_norm text not null unique,          -- openRegistration.normalizePhone
  password_hash text not null,              -- cùng thuật toán identity/password.js (scrypt) — KHÔNG tự viết mới
  display_name text not null check (btrim(display_name) <> '' and char_length(display_name) <= 60),
  gender text check (gender in ('male','female')),           -- tùy chọn, dùng nội dung Nam-Nữ
  dob date,                                                   -- tùy chọn
  self_declared_phr numeric check (self_declared_phr is null or self_declared_phr >= 0),
  athlete_id bigint references athletes(id),                  -- NULL cho tới khi chốt giải (C3)
  status text not null default 'active' check (status in ('active','disabled')),
  access_version bigint not null default 1,                   -- đổi mật khẩu/khóa → vô hiệu phiên cũ
  created_at, updated_at timestamptz not null default now()
);
player_sessions (
  id bigint identity pk, account_id bigint not null references player_accounts(id),
  session_key_hash text not null, expires_at timestamptz not null, revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (account_id, session_key_hash)
);
public_rate_limits ( bucket text primary key, count int not null, reset_at timestamptz not null );
-- RPC: consume_rate_limit(p_bucket text, p_limit int, p_window_seconds int) returns table(allowed bool, retry_after int)
--      một câu lệnh INSERT … ON CONFLICT DO UPDATE có điều kiện → nguyên tử; SECURITY DEFINER, search_path cố định,
--      REVOKE EXECUTE khỏi public/anon/authenticated (chỉ service role gọi).
```

RLS bật, **không policy** cho anon/authenticated (mọi truy cập qua service role trong route), như `platform_accounts`.
Không đụng `athlete_accounts`, `platform_*`, dữ liệu CLB đang chạy. Không DROP/TRUNCATE.

`athlete_id` để NULL là chủ ý: hồ sơ `athletes` chỉ tạo khi **chốt giải** (C3) để tài khoản spam không sinh bản ghi `athletes`.

## 3. Domain (thuần CommonJS, `lib/domain/identity/` hoặc `lib/tournament/`, deterministic)

| File | Việc |
|---|---|
| `lib/domain/identity/playerAccount.js` | `parseRegisterInput` (SĐT, tên, mật khẩu ≥ 8 ký tự, honeypot), mã lỗi ổn định `PLAYER_PHONE_INVALID`, `PLAYER_PASSWORD_WEAK`, `PLAYER_NAME_INVALID`, `PLAYER_PHONE_TAKEN`, `PLAYER_LOGIN_FAILED` (một thông điệp cho sai SĐT/sai mật khẩu — không lộ SĐT nào tồn tại) |
| `lib/domain/identity/playerSession.js` | ký/xác minh vé, nhãn khóa riêng (`pickhub:player-session:v1`, dẫn xuất từ `GROUP_SESSION_SECRET` như `athleteSession.js`), hạn 30 ngày |
| `lib/playerSession.js` (Next) | cookie `player_session` (httpOnly, sameSite lax, secure prod), `readSignedPlayerSession`, `requirePlayerSession()` đối chiếu DB (`access_version`, `status`, `revoked_at`) |
| `lib/publicRateLimit.js` (Next) | gọi RPC `consume_rate_limit`; hạn mức + khóa bucket gom một chỗ (§4) |

Tái dùng `verifyPassword/hashPassword` hiện có; **không** đọc hay ghi cookie `athlete_session`/`group_session`/`platform_session`.
Không để vé VĐV mở được bất kỳ route admin nào: route admin chỉ đọc cookie của mình (test ma trận §7).

## 4. API

| Route | Phương thức | Việc | Giới hạn (bucket) |
|---|---|---|---|
| `/api/player/accounts` | POST | Tạo tài khoản + đăng nhập luôn | 5 lần/giờ/IP; 3/giờ/SĐT |
| `/api/player/session` | POST / GET / DELETE | Đăng nhập / phiên hiện tại / đăng xuất | 8 lần/5 phút/(SĐT+IP); 30/phút/IP cho GET |
| `/api/player/profile` | GET / PATCH | Xem/sửa tên, giới tính, ngày sinh, PHR tự khai; đổi mật khẩu (yêu cầu mật khẩu cũ, tăng `access_version`) | 20/phút/tài khoản |

Lỗi 429 kèm `Retry-After`. Mọi phản hồi **chỉ trả** `{ id, displayName, gender, dob, selfDeclaredPhr }` của **chính** tài khoản
đang đăng nhập — không có route tra cứu tài khoản khác. `Set-Cookie` dùng đúng hàm chung, `Cache-Control: no-store`.
Đăng nhập admin hệ thống dùng lại `POST /api/platform/session` (sửa nhỏ: chuyển bộ đếm sang `consume_rate_limit`
vì `PlatformLoginRateLimiter` cũng là bộ nhớ).

## 5. Giao diện (Stitch: PLC-02/03, PLA-01 — cả PC và mobile)

| Trang | Route đề xuất | Ghi chú |
|---|---|---|
| Đăng ký/Đăng nhập VĐV (2 tab) | `/cong-dong/tai-khoan` | Trả về `?next=` an toàn (chỉ đường dẫn nội bộ `/cong-dong/...`, kiểm như `friendlyInviteLink` kiểm `next`) |
| Hồ sơ VĐV | `/cong-dong/tai-khoan/ho-so` | Sửa thông tin, đổi mật khẩu, đăng xuất |
| Đăng nhập admin hệ thống | `/cong-dong/quan-tri` | Sau đăng nhập → danh sách giải cộng đồng (C2). Không có nút đăng ký |

Bố cục: mobile một cột, PC thẻ căn giữa 440px trên nền `slate-50`. Chữ tiếng Việt; lỗi hiển thị theo mã (`setupMessages`
tương đương, file `lib/tournament/communityMessages.js`).

## 6. Cấp tài khoản admin hệ thống (D55)

Dùng `scripts/seed-platform-account.js` (đã có; insert-or-update, băm mật khẩu bằng `platformSessionCore.hashPassword`).
Quy trình: người dùng tự đặt biến môi trường **trong terminal của họ** (`PICKHUB_PLATFORM_ADMIN_EMAIL/PASSWORD/ROLE`,
`SUPABASE_SERVICE_ROLE_KEY`), agent **không nhìn, không ghi mật khẩu** vào chat/repo/log. Vai trò mặc định `community_admin`
(chỉ giải cộng đồng — đúng ranh giới D19). Thêm `README` ngắn trong `scripts/` + kiểm `PICKHUB_SYSTEM_GROUP_ID=8` trên Vercel.
Quên mật khẩu: nợ (§README 8).

## 7. Test (node script thuần, `tests/stitch-setup/epic-4/c1-*.test.js`)

- `c1-account-domain`: chuẩn hóa SĐT (`+84…`, `84…`, `0…`), mật khẩu yếu, tên rỗng/quá dài, honeypot, thông điệp đăng nhập đồng nhất.
- `c1-session`: ký/xác minh, vé hết hạn, vé nhãn khác (athlete/group/platform) **bị từ chối**, `access_version` lệch → từ chối.
- `c1-route-contract`: shape phản hồi không có `password_hash`, `phone_norm`, `athlete_id` của người khác; 401/429/409 đúng mã.
- `c1-permission-matrix`: cookie `player_session` gọi route admin (`setup`, `registrations`, `tournaments` POST) → 401/403; cookie `platform_session` không tạo được `player` route.
- `c1-migration-static`: 112 additive, có RLS, không `DROP/TRUNCATE`, RPC `REVOKE`, `search_path` cố định.
- SQL tích hợp ROLLBACK: `consume_rate_limit` chạm ngưỡng ở lần `limit+1`; hai tài khoản cùng SĐT → vi phạm unique; **hai lời gọi song song** không vượt hạn mức (dùng hai transaction).

## 8. Nghiệm thu lát C1

1. Test xanh + SQL ROLLBACK xanh; apply 112 (md5 khớp).
2. Browser 390px **và** 1280px: tạo tài khoản → đăng xuất → đăng nhập sai (thông điệp đồng nhất) → đăng nhập đúng; đăng ký 6 lần liên tiếp cùng IP → lần 6 bị 429.
3. Người dùng chạy script cấp admin, đăng nhập `/cong-dong/quan-tri`, thấy trang trống "Chưa có giải cộng đồng" (C2 điền nội dung).
4. Ghi `_workspace/epic-4-community/evidence.md`; commit; push nhánh (chưa merge vào `main`).
