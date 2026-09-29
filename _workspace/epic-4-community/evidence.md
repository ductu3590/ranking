# Epic 4 — Bằng chứng nghiệm thu

Nhánh `claude/epic-4-deployment-4eaece` (từ `origin/main` `0e3323f`). Spec: `docs/superpowers/specs/2026-09-29-epic-4-community/`.

## Lát C1 — Danh tính VĐV công khai (2026-09-29)

### Mã
| Lớp | File |
|---|---|
| Domain thuần | `lib/domain/identity/playerAccount.js`, `playerSession.js`, `playerRateLimits.js`, `safeNext.js`; `lib/tournament/communityMessages.js` |
| Lớp Next | `lib/playerSession.js`, `lib/publicRateLimit.js` |
| API | `app/api/player/accounts`, `session` (POST/GET/DELETE), `profile` (GET/PATCH); `app/api/platform/session` (thêm bộ đếm DB) |
| Trang | `app/cong-dong/layout.js`, `tai-khoan` (tạo/đăng nhập), `tai-khoan/ho-so`, `quan-tri` (đăng nhập admin hệ thống), `community.css` |
| Migration | `database/migrations/112_player_accounts.sql` |
| Test | `tests/stitch-setup/epic-4/c1-*.test.js` (7 file, 55 ca) |
| SQL tích hợp | `database/tests/epic4_c1_integration.sql` (sinh bởi `scripts/qa/epic4-c1-integration.js`) |

### Migration 112
- Kiểm ROLLBACK trước khi apply (Supabase MCP `execute_sql`, project `uhhlelemewilgsdijwja`): 16 ca + `zz.ALL = ok` — giới hạn +1, bucket độc lập, đặt lại sau cửa sổ, từ chối tham số sai, SĐT duy nhất, CHECK giới tính/tên/PHR/trạng thái, phiên duy nhất, CASCADE, quyền `service_role` only, RLS bật.
- Apply bằng `apply_migration` (tên `player_accounts`), additive: 3 bảng mới + 1 hàm, không đụng bảng có sẵn.
- `md5(prosrc)` của `consume_rate_limit` trên DB = `3d677612986ddebd225f2af3fdcab39c` = md5 thân hàm trong file (`node scripts/qa/epic4-c1-integration.js --md5`).
- Sau apply: 3 bảng bật RLS, `player_accounts` có đúng 1 dòng (tài khoản test bên dưới).
- `npm run migration:ledger`: chỉ báo trùng số `089` có từ trước (`089_group_bank_account_qr.sql` / `089_unified_setup_finalize.sql`), không liên quan 112.

### Kiểm trên browser (dev server, DB production, 2026-09-29)
| Kịch bản | Kết quả |
|---|---|
| Mobile 375px: tạo tài khoản (form đủ trường, thông tin thêm thu gọn) | 201, tự chuyển `/cong-dong/tai-khoan/ho-so`; phản hồi chỉ `{account:{id,displayName,gender,dob,selfDeclaredPhr}}` |
| DB sau tạo | băm `pbkdf2:120000…`, `athlete_id` NULL, `access_version` 1, đúng 1 phiên sống |
| Đăng xuất → `GET /api/player/session` | `account:null`; `GET /profile` → 401 `PLAYER_SESSION_REQUIRED` |
| Sai mật khẩu / SĐT không tồn tại / đầu vào hỏng | cùng 401 `PLAYER_LOGIN_FAILED` "Số điện thoại hoặc mật khẩu không đúng." |
| Trùng SĐT | 409 `PLAYER_PHONE_TAKEN` |
| Honeypot / mật khẩu yếu | 400 `PLAYER_HONEYPOT` / `PLAYER_PASSWORD_WEAK` |
| Đăng nhập đúng với SĐT `84900000901` (chuẩn hóa) | 201 |
| Giới hạn đăng nhập (8/5 phút/SĐT+IP) | lần 7 trở đi 429, `Retry-After` 282 s |
| Giới hạn tạo tài khoản (5/giờ/IP) | 429, `Retry-After` 3546 s; UI hiện "Bạn thử quá nhiều lần. Vui lòng thử lại sau 4 phút." |
| Mọi phản hồi | `Cache-Control: no-store` |
| PC 1280px: tab Đăng nhập + thông báo 429 | thẻ 440px căn giữa, chữ nút trắng trên tím |
| `/cong-dong/quan-tri` (admin hệ thống) | chỉ form đăng nhập (không đăng ký); API: 5 lần sai → 401, sau đó 429 |
| Console | không lỗi |

Lỗi giao diện tìm thấy và sửa khi kiểm: `.cd-shell button { color: inherit }` đè màu chữ nút chính (đen trên tím) và màu tab — bỏ `color: inherit` cho nút.

### Test
- `npm run test:stitch-setup`: mọi test Epic 4, Epic 2/3, lát 0/A/B/C **xanh**. Duy nhất `epic-1\ui-contract.test.js` đỏ **từ trước và do môi trường**: file `StepDraw.js` trong working tree là CRLF (Windows `autocrlf`) trong khi test so chuỗi chứa `\n`; không liên quan Epic 4 (không đụng `app/giai-dau`). Không sửa test cũ.
- `tests/phase3/platform-auth.test.js`, `tests/athlete-sessions.test.js`: xanh.
- `next lint`: chỉ cảnh báo cũ ở `lib/transaction-parser.js`.

### Dữ liệu test còn lại (giữ để dùng cho lát C2)
- `player_accounts` id 1 "TEST-CD Nguyễn Minh" (SĐT `0900000901`) — giữ lại để C2 dùng; dọn ở cuối Epic 4 sau khi người dùng xác nhận.
- `public_rate_limits`: các bucket `player:*` từ phiên kiểm (tự hết hạn trong ≤ 1 giờ).

### Còn phải làm bên ngoài mã
1. **Biến môi trường trên Vercel:** `PLATFORM_SESSION_SECRET` (đăng nhập admin hệ thống cần; `.env.local` không có) và xác nhận `PICKHUB_SYSTEM_GROUP_ID=8`. `PLAYER_SESSION_SECRET` không bắt buộc (dẫn xuất từ `GROUP_SESSION_SECRET`).
2. **Cấp tài khoản admin hệ thống đầu tiên:** người dùng tự chạy `scripts/seed-platform-account.js` với biến môi trường tự đặt (agent không nhìn mật khẩu).
3. Trang `/cong-dong/quan-tri` sau đăng nhập mới chỉ báo "đã đăng nhập"; danh sách giải cộng đồng thuộc lát C2.
4. Màn Stitch PLC-02/03, PLA-01 (PC + mobile) để đối chiếu — xem `canonical/community/`.
