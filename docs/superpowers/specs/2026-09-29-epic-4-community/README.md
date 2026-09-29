# Spec — Epic 4: Giải cộng đồng

Ngày: 2026-09-29 · Nhánh `claude/epic-4-deployment-4eaece` (từ `origin/main` `0e3323f`, đã có Epic 1 + 2 + 3)
Roadmap: `docs/superpowers/plans/2026-09-24-tournament-roadmap.md` (Epic 4) · Quyết định: `_workspace/unified-setup-ux/ADR-007-roadmap-decisions.md`
— **D19** (nền), **D54–D64** (chốt với người dùng 2026-09-29). Giữ D8, D12, D17 (cặp cùng nguồn), D25–D37, D48–D53.
Bất biến: skill `tournament-setup-invariants`. Brief Stitch: `_workspace/epic-4-community/01_stitch_brief.md`.

## 1. Mục tiêu

Admin hệ thống (`platform_accounts`) tạo giải **cộng đồng** mở cho mọi người chơi pickleball, không cần thuộc CLB nào.
VĐV **bắt buộc có tài khoản VĐV PickHub** (D19), tự đăng ký (đơn hoặc đôi), **rủ bạn ghép cặp**, admin duyệt; giải chốt qua
**cùng pipeline plan → finalize** với giải nội bộ/giao hữu, rồi điều hành và công khai bằng đúng bàn điều hành Epic 2.

## 2. Hiện trạng (kiểm 2026-09-29, đọc DB thật bằng Supabase MCP)

| Có sẵn | Ghi chú / khoảng trống |
|---|---|
| `tournaments.organizer_type='community'`, `POST /tournaments` với `organizer_mode:'community'` bắt `requirePlatformAdmin`, `group_id` = CLB hệ thống (`PICKHUB_SYSTEM_GROUP_ID`; **group 8** "PickHub Cộng đồng (system)" đã tồn tại) | Chưa có giải cộng đồng nào (0 dòng) |
| `access.js` `resolveTournamentWrite`: platform actor ghi được giải cộng đồng; `community_admin` chỉ giải cộng đồng | **`setup` + `setup/finalize` chỉ dùng `requireValidatedGroupAdmin`** → admin hệ thống chưa dùng được workspace setup (§C3) |
| `platform_accounts` / `platform_sessions`, `POST /api/platform/session` (đăng nhập), `scripts/seed-platform-account.js` | **0 tài khoản; app không có trang đăng nhập admin hệ thống** (chỉ API) |
| `athlete_accounts` (1 dòng) + `athlete_session` cookie | **Gắn cứng CLB**: `club_id`, `club_membership_id` NOT NULL; tạo qua phiên CLB → người ngoài CLB không có đường tự đăng ký |
| `tournament_registrations` / `_members` / `tournament_pair_invites`, `openRegistration.js` (máy trạng thái, danh sách chờ, `buildPairFromSolos`), `public/registration`, `public/pair-invite`, `public/community`, `registrations/board` | Đăng ký hiện **ẩn danh bằng SĐT + `track_token`**, không tài khoản (trái D19); `pair-invite` GET liệt kê VĐV lẻ kèm giới tính/PHR cho bất kỳ ai có token; 0 đăng ký |
| `tournament_athletes.source` CHECK ∈ (`club_member`,`guest`) | Cần thêm `community` (§C3) |
| Cờ `origin` CHECK ∈ (`btc`,`public_self`) và `tournament_registrations_public_club_chk` | Cần mở rộng (§C2) |
| `lib/rateLimit.js` | **Bộ nhớ tiến trình** — không bền trên serverless (§7) |

## 3. Quyết định áp dụng (ADR-007 D54–D64)

Xem bảng đầy đủ ở `_workspace/unified-setup-ux/ADR-007-roadmap-decisions.md` (mục "Bổ sung — Epic 4"). Tóm tắt:

- **D54** Tài khoản VĐV công khai là **bảng mới `player_accounts`** (SĐT chuẩn hóa + mật khẩu, không cần CLB); `athlete_accounts` của CLB giữ nguyên.
- **D55** Cấp admin hệ thống bằng **script CLI** (`seed-platform-account.js` có sẵn); thêm **trang đăng nhập admin hệ thống** (còn thiếu).
- **D56** Lệ phí: **thu ngoài hệ thống**; hiển thị `entry_fee`; admin đánh dấu "Đã xác nhận thu" thủ công; không chặn duyệt/chốt (chỉ cảnh báo).
- **D57** Công khai: **chỉ tên cặp đã duyệt** + bộ đếm `X/Y`; không SĐT, không đơn chờ.
- **D58** Giải cộng đồng **cấm đăng ký ẩn danh**: route công khai trả 401 khi không có phiên VĐV.
- **D59** Rủ ghép cặp qua **link rủ** hoặc **lời mời tới tài khoản** (nhập SĐT chính xác); "bảng tìm bạn ghép" chỉ hiện **tên hiển thị + (nếu nội dung cần) giới tính/PHR tự khai** cho VĐV đã đăng nhập; không lộ SĐT.
- **D60** Chống spam: bộ đếm **lưu DB**, honeypot, SĐT duy nhất/tài khoản, một đơn hoạt động mỗi nội dung/tài khoản; **không OTP SĐT** ở epic này.
- **D61** Cặp cộng đồng vào setup như giao hữu: **cặp hiệu lực = đơn đã duyệt** (đọc ngoài bản nháp), participantRef mới `player:<accountId>`; `tournament_athletes.source='community'`.
- **D62** Setup/finalize/registrations chấp nhận **platform actor** qua `requireTournamentAccess` (giải cộng đồng).
- **D64** Mọi màn Stitch thiết kế cả PC (1280px) lẫn mobile (390px); màn admin ưu tiên PC.
- **D63** Deploy như D24/D27/D45; dữ liệu test = giải + tài khoản VĐV tiền tố `TEST-CD`, trong group 8; **không đụng group 1**.

## 4. Chia lát

| Lát | File | Nội dung | Migration | Stitch |
|---|---|---|---|---|
| C1 | [lat-c1-danh-tinh.md](lat-c1-danh-tinh.md) | Tài khoản VĐV công khai (`player_accounts`, `player_sessions`), đăng ký/đăng nhập/đăng xuất, trang đăng nhập admin hệ thống, bộ đếm chống spam lưu DB | 112 | PLC-02/03, PLA-01 |
| C2 | [lat-c2-dang-ky-ghep-cap.md](lat-c2-dang-ky-ghep-cap.md) | Đăng ký bắt buộc tài khoản, rủ ghép cặp (link + lời mời), duyệt, danh sách chờ, đánh dấu thu phí, trang công khai tên cặp | 113 | PLC-01, 04–07, PLA-02, 03 |
| C3 | [lat-c3-tao-giai-va-chot.md](lat-c3-tao-giai-va-chot.md) | Admin hệ thống dùng workspace setup; nhánh `community` của `finalize_internal_setup_v4`; chạy thật tới cuối giải | 114 | PLA-04 |

Thứ tự: **Stitch (PC + mobile) → C1 → C2 → C3**. C1 không cần Stitch để bắt đầu (màn đăng nhập rất nhỏ, làm theo token
DESIGN.md) nhưng phải khớp PLC-02/03 khi Stitch xong. Không hai lát cùng sửa `finalize_internal_setup_v4` (chỉ C3).

## 5. Luồng đầu-cuối

```
[Admin hệ thống] đăng nhập (PLA-01) → tạo giải cộng đồng + nội dung (hạn mức, phí, hạn chót) → mở đăng ký
[VĐV] mở trang công khai → tạo tài khoản / đăng nhập → đăng ký (đơn | đôi: có bạn / cần tìm bạn)
      ↳ đôi lẻ: link rủ | mời theo SĐT | bảng tìm bạn → ghép cặp (nguyên tử)
[Admin] bảng duyệt: duyệt / từ chối / ghép hộ hai VĐV lẻ / đánh dấu đã thu phí / danh sách chờ
[Admin] workspace setup (Bước 1–4): Bước 2 = danh sách cặp đã duyệt → thể thức → bốc thăm → chốt
[Bàn điều hành + trang công khai] như Epic 2 (Điều hành · Trận đấu · Sơ đồ & xếp hạng · Cài đặt)
```

## 6. Ca nghiệm thu chuẩn

**Ca G:** giải cộng đồng "TEST-CD" nội dung Đôi, hạn mức 8 cặp, phí hiển thị 100.000đ. 9 tài khoản VĐV nhóm A (4 cặp đăng ký sẵn
đôi + 1 VĐV lẻ) và 8 nhóm B: tổng **8 cặp** hợp lệ (2 VĐV lẻ ghép nhau qua link) + **1 cặp thứ 9 vào danh sách chờ**.
Kết quả mong đợi: duyệt 8, cặp 9 chờ, cặp thứ 9 chỉ được duyệt khi có một cặp bị rút; chốt → 8 cặp → thể thức vòng bảng +
loại trực tiếp (2 bảng 4/4: 12 trận vòng bảng + 2 BK + 1 CK = 15); nhập hết tỉ số tới hết giải; trang công khai hiện đúng 8 tên cặp
và **không** có SĐT ở bất kỳ payload nào (kiểm bằng `read_network_requests`).
**Ca chặn:** đăng ký không phiên → 401; cùng tài khoản đăng ký nội dung hai lần → 409; cùng SĐT tạo tài khoản lần hai → 409;
tài khoản nằm hai cặp cùng nội dung → chặn; cặp Nam-Nữ thiếu giới tính → chặn.

## 7. Rủi ro

| Rủi ro | Cách chặn |
|---|---|
| Spam đăng ký tài khoản/đơn | Bộ đếm lưu DB (`public_rate_limits`, RPC atomic), honeypot, SĐT duy nhất; không OTP nên **admin duyệt là chốt chặn** cuối |
| Trùng danh tính (một người nhiều tài khoản) | SĐT chuẩn hóa duy nhất; hiển thị trùng tên cho admin trong bảng duyệt; **không tự gộp** với `athletes` của CLB (đã có luồng duyệt trùng `identity/duplicates`) |
| Lộ dữ liệu cá nhân | Payload công khai qua một hàm chiếu duy nhất chỉ trả tên hiển thị; SĐT/ngày sinh chỉ admin giải; test dò khóa cấm trên mọi route công khai |
| Phiên tài khoản chéo (VĐV dùng API admin) | Cookie `player_session` ký nhãn riêng; mọi route admin không đọc cookie này; test ma trận quyền |
| Tranh chấp ghi (hai người cùng ghép, cùng chiếm suất cuối) | RPC nguyên tử có khóa hàng + `version`; đếm hạn mức trong cùng transaction |
| `finalize_internal_setup_v4` bị sửa song song | Chỉ C3; migration 114 dựng từ **bản mới nhất** (111) + test khóa "chỉ khác 111 ở các điểm X" |

## 8. Ngoài phạm vi

OTP/xác minh SĐT; thu phí tự động (SePay); email/Zalo thông báo (chỉ hiển thị trong app); quên mật khẩu (C1 chỉ ghi nhận
là nợ — admin đặt lại thủ công); xếp hạng cá nhân toàn hệ thống; gộp `player_accounts` với `athlete_accounts`; MLP (Epic 5);
**bổ sung bản PC cho các màn Epic 1–3** (nợ riêng, đã ghi ở mục 9).

## 9. Yêu cầu giao diện: PC **và** mobile (người dùng, 2026-09-29)

Mọi màn mới của Epic 4 thiết kế trên Stitch ở **cả Desktop lẫn Mobile 390px**; màn admin ưu tiên bố cục PC (bảng, nhiều
cột, sidebar), màn VĐV công khai vẫn mobile-first nhưng có PC. Code + nghiệm thu browser ở **cả hai kích thước**
(390px và 1280px). Các giải trước (setup, điều hành, giao hữu) mới chỉ mobile — người dùng sẽ bổ sung PC sau; **không** nằm
trong Epic 4 nhưng nên tái dùng chung component để việc đó rẻ.

## 10. Nghiệm thu tổng

- `npm run test:stitch-setup` (thêm `tests/stitch-setup/epic-4/`) xanh; test cũ không bị sửa (nếu buộc sửa: ghi
  ADR-006 mục Epic 4).
- Kiểm thử tích hợp SQL dạng ROLLBACK cho 112/113/114; `md5(prosrc)` khớp file sau apply.
- Chạy thật trên browser (Chrome extension hoặc người dùng tự đăng nhập admin): Ca G ở 390px và 1280px, tới cuối giải.
- Bằng chứng: `_workspace/epic-4-community/evidence.md`; PR nháp; người dùng tự merge (D63).
