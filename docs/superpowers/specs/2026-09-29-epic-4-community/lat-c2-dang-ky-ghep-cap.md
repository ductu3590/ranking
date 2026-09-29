# Lát C2 — Đăng ký giải, rủ ghép cặp, duyệt, phí, trang công khai

Trạng thái: spec · Phụ thuộc: C1 · Xem [README](README.md) · Quyết định D56–D60 · Migration **113**
Cần Stitch **PC + mobile** (PLC-01, 04–07, PLA-02, PLA-03) trước khi code UI; domain/API/migration làm được song song.

## 1. Mục tiêu

VĐV đã đăng nhập đăng ký một nội dung của giải cộng đồng (đơn hoặc đôi), rủ/ghép cặp an toàn, theo dõi đơn của mình;
admin hệ thống tạo giải cộng đồng + nội dung, duyệt/từ chối/ghép hộ, đánh dấu đã thu phí, quản lý danh sách chờ;
trang công khai chỉ hiện **tên cặp đã duyệt** và bộ đếm `X/Y` (D57).

## 2. Mô hình dữ liệu (migration 113, additive)

`tournament_registrations`:
- `player_account_id bigint references player_accounts(id)` (NULL với đơn BTC nhập hộ cũ).
- `origin` CHECK mở thành (`btc`,`public_self`,`player_account`); `tournament_registrations_public_club_chk` mở tương ứng
  (`tournament_club_id IS NOT NULL OR origin IN ('public_self','player_account')`). Đơn cộng đồng mới luôn `origin='player_account'`.
- `fee_confirmed_at timestamptz`, `fee_confirmed_by_platform_account_id bigint` (D56). Không có số tiền: phí lấy từ
  `tournament_divisions.entry_fee` lúc hiển thị.
- `partner_link_hash text` + `partner_link_expires_at timestamptz` (link rủ, chỉ lưu băm, hết hạn 7 ngày; tạo lại → link cũ vô hiệu).
- Ràng buộc duy nhất từng phần: `unique (division_id, player_account_id) where status in ('submitted','approved','awaiting_partner') and player_account_id is not null` → **một đơn hoạt động/tài khoản/nội dung**.

`tournament_registration_members`: thêm `player_account_id bigint` (ghế của VĐV có tài khoản; dùng cho luật "không nằm hai cặp").
`unique (registration_id, seat)` giữ nguyên; thêm chỉ mục `(player_account_id)`.

`tournament_pair_invites`: giữ nguyên bảng; thêm `invited_player_account_id bigint` (lời mời theo SĐT tới tài khoản, nhận ở
"Đơn của tôi" dù người nhận **chưa** có đơn) và cho phép `to_registration_id` NULL cho tới khi họ chấp nhận (đổi cột sang nullable — additive-safe).

Không đổi `athlete_accounts`, `club_*`, đơn giao hữu. `track_token` cũ giữ cho đơn `public_self` cũ (0 dòng) nhưng **không** dùng cho đơn cộng đồng mới.

### RPC (SECURITY DEFINER, `search_path` cố định, chỉ service role, khóa lạc quan bằng `version`, mã lỗi `PH409` như 078)

| RPC | Việc |
|---|---|
| `community_register(p_division, p_account, p_members jsonb, p_fields jsonb)` | Kiểm giải cộng đồng + đăng ký mở + hạn chót; đếm hạn mức; chống trùng tài khoản/nội dung; tạo đơn + ghế; `awaiting_partner` nếu đôi thiếu người. Hạn mức: nếu `approved >= capacity` đơn vào `submitted` nhưng hiển thị hàng chờ (quy ước `waitlistView` có sẵn) |
| `community_pair(p_primary, p_secondary, p_actor)` | Nguyên tử: hai đơn cùng nội dung, cùng `awaiting_partner`, không tài khoản nào đã ở cặp khác, luật Nam-Nữ (`buildPairFromSolos`); đơn phụ → `merged`, đơn chính có ghế 2, `submitted` |
| `community_join_by_link(p_token_hash, p_account)` | Người nhận link đăng nhập rồi vào: nếu chưa có đơn → tạo đơn lẻ rồi ghép; nếu đã có đơn lẻ → ghép; nếu đã có đơn đôi/đã ở cặp khác → từ chối `COMMUNITY_ALREADY_PAIRED` |
| `community_invite_action(p_invite, p_account, p_action)` | accept / decline / cancel; accept gọi cùng lõi `community_pair` |
| `community_admin_action(p_registration, p_platform_account, p_action, p_reason, p_version)` | admit / reject / restore / remove / withdraw / merge / fee_confirm / fee_unconfirm; `admit` từ chối khi `approved >= capacity` (`COMMUNITY_CAPACITY_FULL`) |

Mọi RPC ghi `operation_logs`/nhật ký như các RPC đăng ký hiện có (xem `lib/tournament/operationLog.js`), tên actor lấy từ `display_name`.

## 3. Domain (thuần CommonJS, deterministic)

| File | Việc |
|---|---|
| `lib/tournament/communityRegistration.js` (mới) | Bọc `openRegistration.js` (không sao chép luật): `validateCommunitySubmission` (dùng dữ liệu hồ sơ tài khoản làm ghế 1, không nhập lại SĐT), `communityRegistrationState` (trạng thái hiển thị cho VĐV: `Chờ bạn ghép`, `Chờ duyệt`, `Đã duyệt`, `Danh sách chờ #n`, `Bị từ chối`, `Đã rút`), `feeState` (`Chưa thu`/`Đã xác nhận thu`/`Không thu phí`) |
| `lib/tournament/communityPublic.js` (mới) | **Một hàm chiếu duy nhất** `projectPublicPairs(rows)` chỉ trả `{ pairLabel, seatNames }` của đơn `approved`; ném lỗi nếu đầu vào có khóa cấm (`phone`, `phone_norm`, `dob`, `contact_*`, `track_token`, `player_account_id`) — test khóa cấm |
| `lib/tournament/communityPartnerLink.js` (mới, dùng `node:crypto`) | phát token 32 byte base64url, băm SHA-256, hết hạn, `next` an toàn |
| `lib/tournament/communityMessages.js` | Thông điệp tiếng Việt cho mã lỗi (§6) |

## 4. API

Công khai (không phiên) — **chỉ đọc**:
- `GET /api/tournament-v2/public/community` (có sẵn): danh sách giải mở; chỉ giải `organizer_mode='community'`; trả kèm `capacity`, `approvedCount`.
- `GET /api/tournament-v2/public/community/[slug]/pairs`: tên cặp đã duyệt (qua `projectPublicPairs`), `X/Y`, `entry_fee`.

Cần phiên VĐV (`requirePlayerSession`), `group_id` **không** lấy từ client (suy ra từ giải):
- `POST /api/tournament-v2/community/registrations` (đăng ký; honeypot; 10 lần/giờ/tài khoản).
- `GET /api/tournament-v2/community/my` (đơn của tôi + lời mời đến/đi + trạng thái phí).
- `POST /api/tournament-v2/community/partner-link` (tạo/đổi link rủ của đơn lẻ mình), `POST …/join` (vào bằng link).
- `POST /api/tournament-v2/community/invites` (mời theo SĐT chính xác: kiểm 3 lần/giờ/tài khoản để chống dò danh sách SĐT; **phản hồi đồng nhất** dù SĐT có tài khoản hay không), `PATCH …/invites/[id]`.
- `GET /api/tournament-v2/community/partner-board?divisionId=` — bảng tìm bạn ghép cho VĐV **đã đăng nhập và có đơn lẻ trong nội dung đó**; chỉ `{ registrationId, displayName, gender(nếu nội dung Nam-Nữ), selfDeclaredPhr(nếu nội dung có cap) }`; không SĐT. **Thay thế** `public/pair-invite` GET cũ với giải cộng đồng.
- `POST …/registrations/[id]/withdraw`.

Cần phiên admin hệ thống (`requireTournamentAccess({ need:'write' })`, community_admin chỉ giải cộng đồng):
- `POST /api/tournament-v2/tournaments` (đã có; thêm cấu hình đăng ký cộng đồng vào `settings`: `open_registration`, hạn chót, `registration_capacity`, `entry_fee` ở `tournament_divisions`); giữ vá `PATCH` không ghi đè khóa `organizer_mode`/`settings` do server quản.
- `GET/PATCH /api/tournament-v2/registrations` + `registrations/board` (đã có): mở cho platform actor, trả thêm `playerAccountId`, `feeConfirmedAt`, SĐT (chỉ `canReadPrivate`).

Route công khai cũ `public/registration` POST và `public/pair-invite`: với giải `community` trả **401 `PLAYER_SESSION_REQUIRED`** (D58); giữ nguyên hành vi cho giải khác (hiện 0 dòng dùng).

## 5. Giao diện (Stitch PC + mobile)

| Mã | Màn | Người dùng | Ưu tiên bố cục |
|---|---|---|---|
| PLC-01 | Danh sách giải cộng đồng đang mở (thẻ giải + nội dung + `X/Y` + phí) | VĐV | mobile-first, PC lưới 2–3 cột |
| PLC-04 | Đăng ký nội dung (đơn / đôi: "Đã có bạn ghép" nhập SĐT, "Cần tìm bạn") | VĐV | mobile-first |
| PLC-05 | Rủ ghép cặp: link rủ (sao chép/chia sẻ), mời theo SĐT, bảng tìm bạn, lời mời đến | VĐV | mobile-first |
| PLC-06 | Đơn của tôi: trạng thái, hạng chờ, phí, rút | VĐV | mobile-first |
| PLC-07 | Trang giải công khai: thông tin + danh sách **tên cặp đã duyệt** + nút đăng ký | Mọi người | mobile-first, PC hai cột |
| PLA-02 | **Bảng duyệt đăng ký** (bảng nhiều cột: cặp, SĐT, PHR, trạng thái, phí, hạng chờ; lọc; duyệt/từ chối/ghép hộ/đánh dấu thu phí) | Admin | **PC-first**, mobile dạng thẻ |
| PLA-03 | Danh sách giải cộng đồng của admin + form tạo/sửa giải và nội dung (hạn mức, phí, hạn chót, mở/đóng đăng ký) | Admin | **PC-first** |

Trang Cài đặt trong bàn điều hành (Epic 2) thêm khối "Đăng ký" cho giải cộng đồng (đóng/mở, hạn chót) — tái dùng khối "Khoá đăng ký" của Epic 3.

## 6. Mã lỗi ổn định (thêm vào `communityMessages.js`)

`PLAYER_SESSION_REQUIRED`, `COMMUNITY_NOT_OPEN`, `COMMUNITY_DEADLINE_PASSED`, `COMMUNITY_ALREADY_REGISTERED`,
`COMMUNITY_ALREADY_PAIRED`, `COMMUNITY_CAPACITY_FULL`, `COMMUNITY_INVITE_SELF`, `COMMUNITY_LINK_INVALID`,
`COMMUNITY_GENDER_REQUIRED`, `COMMUNITY_MIXED_GENDER_REQUIRED`, `COMMUNITY_FEE_NOT_APPLICABLE`, `RATE_LIMITED`.

## 7. Test

- Node: `communityRegistration`, `communityPublic` (khóa cấm), `communityPartnerLink` (băm, hết hạn, `next`), ma trận quyền (VĐV vs admin vs CLB admin vs ẩn danh trên mọi route trên), contract shape API↔UI.
- Migration tĩnh: 113 additive; ràng buộc duy nhất từng phần; RPC `REVOKE`.
- SQL ROLLBACK (2 transaction): hai người cùng chiếm suất cuối → đúng một thành công; hai người cùng dùng một link → một thành công; cùng tài khoản hai đơn → vi phạm unique; ghép cặp khi một bên đã `merged` → từ chối; `admit` vượt hạn mức → `PH409`.
- Bảo mật: quét mọi payload công khai không có `phone`/`dob`/`token`.

## 8. Nghiệm thu lát C2

Ca G (README §6) phần đăng ký + duyệt, ở **390px và 1280px**: 9 tài khoản test tiền tố `TEST-CD`, 8 cặp duyệt + 1 chờ, link rủ thật giữa hai
tài khoản, rút một cặp → cặp chờ được duyệt; trang công khai đúng 8 tên, `read_network_requests` sạch SĐT. Dọn dữ liệu test sau khi
người dùng xác nhận (chỉ đơn/tài khoản `TEST-CD`, không đụng dữ liệu khác).
