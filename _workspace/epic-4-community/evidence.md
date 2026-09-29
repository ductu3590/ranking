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

---

## Lát C2 — đăng ký, ghép cặp, duyệt, phí, công khai

### Cơ sở dữ liệu
- Migration `113_community_registrations.sql` **đã apply** lên project hiện hữu; 38 ca SQL (`database/tests/epic4_c2_integration.sql`, sinh bởi `scripts/qa/epic4-c2-integration.js`) chạy trong `BEGIN … ROLLBACK`, xanh; `md5(prosrc)` của 13 hàm khớp file migration (sau khi bỏ chú thích trong thân hàm).
- Migration thuần additive; không đổi CHECK của `origin`, đơn cộng đồng phân biệt bằng `player_account_id IS NOT NULL`.

### Kiểm qua API + trình duyệt (dữ liệu `TEST-CD`, giải 262, nhóm 8)
| Thao tác | Kết quả |
|---|---|
| A đăng ký "đã có bạn" nhập SĐT B → B thấy lời mời → nhận | Cặp A+B gộp, trạng thái "Chờ duyệt" |
| C, D đăng ký "cần tìm bạn" | 2 đơn "Chờ bạn ghép", hiện trong bảng tìm bạn (chỉ tên hiển thị) |
| Admin: **Duyệt** cặp A+B | Đã duyệt 1/2, bộ đếm cập nhật |
| Admin: chọn C + D → **Ghép hộ** | "Đã ghép cặp", 1 đơn "Chờ duyệt" (nút bị vô hiệu đến khi chọn đúng hai người ở khung "VĐV lẻ") |
| Admin: **Đánh dấu đã thu** / Bỏ đánh dấu | Nhãn "Đã xác nhận thu" |
| Admin: **Duyệt** cặp C+D | Đã duyệt 2/2, "Chưa thu phí" giảm còn 1 |
| Công khai `GET /public/community/{slug}/pairs` | `approved 2/2`, 2 tên cặp; không chứa SĐT/ngày sinh (8/8 lần gọi nhất quán; header `no-store`) |
| Mobile 375px: trang công khai, "Đơn của tôi", trang đăng ký | không tràn ngang; nút ≥ 44 px; giải đầy → "Đăng ký vào danh sách chờ" |
| PC 1280px: bảng duyệt admin | bảng đủ cột, thanh thao tác hàng loạt |

Ghi chú: một lần gọi đầu tiên vào `/pairs` ngay sau khi duyệt trả `approved 0`; không tái hiện trong 8+ lần gọi sau và khi tải trang. Truy vấn đọc thẳng bảng (không có cache, `force-dynamic`, `no-store`). Sẽ kiểm lại ở lượt chạy C3.

### Lỗi tìm thấy và sửa
1. **Có từ trước:** `lib/platformSession.js` chỉ `select('session_key_hash, revoked_at, expires_at')`, trong khi lõi xác thực so `account_id` → phiên admin hệ thống luôn bị coi không hợp lệ (chưa lộ vì chưa có tài khoản admin). Đã thêm `account_id`; test hồi quy `c2-platform-session.test.js`.
2. `loadMyCommunity` thoát sớm khi VĐV chưa có đơn → mất lời mời gửi theo SĐT. Thêm `loadInvitesIn` dùng ở mọi nhánh.
3. `POST/PATCH /tournaments` chỉ nhận phiên CLB → thêm route riêng `community/admin/tournaments` cho admin hệ thống.

### Test
- `npm run test:stitch-setup`: xanh, trừ `epic-1\ui-contract.test.js` (lỗi CRLF có từ trước, đã ghi ở C1).
- Test C2: `c2-registration-domain`, `c2-migration-static`, `c2-route-contract`, `c2-permission-matrix`, `c2-platform-session`, `c2-ui-contract`.
- `npm run test:open-registration`: xanh. `next lint`: chỉ cảnh báo cũ.

### Dữ liệu test còn lại (dọn cuối Epic 4 sau khi người dùng xác nhận)
- `player_accounts` TEST-CD (4 tài khoản 0900000901–904), giải 262 `ZZ TEST-CD Giải Thu 2026` nhóm 8, đăng ký/cặp tương ứng.
- Tài khoản admin hệ thống **thử** (id 2) trong `platform_accounts`: phải xoá/vô hiệu trước khi bàn giao.
- `.env.local` cục bộ có `PLATFORM_SESSION_SECRET` ngẫu nhiên (file gitignore).

---

## Lát C3 — dựng giải cộng đồng bằng workspace setup, chốt, điều hành tới hết giải

### Cơ sở dữ liệu
- Migration `114_finalize_v4_community.sql` **đã apply**. Trước đó chạy `database/tests/epic4_c3_integration.sql` (sinh bởi `scripts/qa/epic4-c3-integration.js`, nạp cả thân migration) trong `BEGIN … ROLLBACK`: **34/34 ca xanh**, kiểm sau đó 0 dòng tạm còn lại. Lần chạy đầu dừng ở ca "phát lại" do lỗi của chính test (dùng revision mới) → đã sửa test, chạy lại đủ.
- `md5(prosrc)` của `finalize_internal_setup_v4` sau apply = `38a93a4b9284c5b41c46342b161f9ba2` = md5 thân hàm trong file. Trước apply DB đang chạy đúng bản 111 (`c1ab7d4d…`). `EXECUTE`: chỉ `service_role`.
- `tournament_athletes_source_ck` nay gồm `community` (chỉ nới).
- Test khoá `c3-migration-lock.test.js`: 114 = 111 + 5 khối `community:begin/end` + 3 dòng `community:decl` + lệnh mở CHECK; phần còn lại byte-giống.

### Lệch so với spec (có chủ đích)
1. Khóa cặp `r<đơn>.<tk1>.<tk2>` thay vì `r<đơn>.<version>`: `version` tăng cả khi admin đổi cờ phí (đã kiểm ở ca B10) → sẽ làm bốc thăm hết hạn oan. Ghép hộ / đổi thành viên vẫn đổi khóa → `DRAW_STALE` / `COMMUNITY_ROSTER_CHANGED`.
2. Bản nháp cộng đồng giữ `organizerMode 'internal'`; nhánh cộng đồng nhận diện bằng `tournaments.organizer_type` (không tin bản nháp của client). Không đụng `ORGANIZER_MODES` và hàm lưu nháp.
3. `athletes.status = 'linked'` (spec ghi `'active'` nhưng CHECK không có).
4. Chặn "chọn người" là `COMMUNITY_MEMBER_PICK_NOT_ALLOWED` ở Bước 2 (không phải blocker riêng Bước 3).

### Ca G chạy thật (giải 276 `TEST-CD Ca G`, nhóm 8, 1280px)
| Bước | Kết quả |
|---|---|
| Dựng 16 tài khoản → 8 cặp qua API thật (mời theo SĐT, nhận lời), admin duyệt 8 cặp, xác nhận thu 6/8 | `approved 8` |
| Studio Bước 1 | điền sẵn tên/ngày/giờ/địa điểm từ bản ghi giải |
| Bước 2 | 8 cặp đã duyệt (tên + PHR + chip phí), "8 cặp · 0 chờ duyệt · 0 đang tìm bạn", cảnh báo "2 cặp chưa xác nhận thu phí"; không có SĐT |
| Bước 3 | chọn Vòng bảng → Loại trực tiếp, 2 sân |
| Bước 4 | bốc thăm 2 bảng × 4 cặp, **15 trận** (12 vòng bảng + 2 bán kết + chung kết), không cảnh báo cùng CLB |
| Chốt | 8 entry, 16 `tournament_athletes` `source='community'`, 16 `player_accounts.athlete_id` khác NULL, 2 stage, 15 trận; giải → `scheduled`; 8 đơn vẫn `approved` |
| Điều hành (platform_session) | nhập tỉ số 15 trận, BXH, "Chốt Vòng bảng" điền bán kết, kết thúc giải → `completed`, vô địch `Ca G 09 / 10` |
| Trang công khai (`/public?slug=`, `/public/community/.../pairs`, trang `/cong-dong/giai/…`) | không lộ SĐT / mã tài khoản / `player:` |
| Mobile 375px: studio Bước 2 | không tràn ngang (sau khi sửa lưới `.cd-main`) |

### Lỗ hổng platform actor tìm thấy khi chạy thật và đã vá
`GET /tournaments` (danh sách) chỉ có đường phiên CLB → bàn điều hành báo "Unauthorized"; `/api/groups/session` trả phiên mặc định `member` nên nút quản trị bị ẩn; `standings` và `PATCH /tournaments` (kết thúc giải) cũng chỉ nhận phiên CLB. Vá: `?id=` cho GET (chỉ platform actor có quyền đọc giải đó), `communityReadScope` cho standings, fallback `communitySetupAdmin` cho PATCH, `GET /api/platform/session`, và console nhận admin hệ thống khi không có phiên CLB admin. Phiên CLB giữ nguyên.

### Test
- `npm run test:stitch-setup`: xanh trừ `epic-1\ui-contract` (CRLF có từ trước). Đã sửa đúng một assertion cũ: `epic-3/f2-api-contract` ("111 là migration mới nhất" → cho phép 114 kế nhiệm, có test khoá riêng). Test mới: `c3-community-setup-domain`, `c3-migration-lock`, `c3-route-contract`.
- `tests/phase2/validated-mutation-guard` (stages route) và `tests/unified-setup/legacy-wizard-retired` đỏ từ trước, không liên quan.

### Dữ liệu test cần dọn (chờ người dùng xác nhận — DB thật, nhóm 8)
- Giải 262 `ZZ TEST-CD Giải Thu 2026` và 276 `TEST-CD Ca G` (+ giải 275?/rác từ lần seed lỗi: kiểm `name like 'TEST-CD%'`), đơn đăng ký, cặp/entry/trận/`tournament_athletes` của 276.
- `player_accounts` TEST-CD (0900000901–904, 0900001001–1016) và các `athletes` `TEST-CD Ca G %` tạo lúc chốt.
- Tài khoản admin hệ thống **thử** id 2 (`platform_accounts`).
- `public_rate_limits` `player:*` của localhost (tự hết hạn).
