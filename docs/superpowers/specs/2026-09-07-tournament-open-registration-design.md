# Spec — Tournament Open Registration (Đăng ký mở giải cộng đồng)

- Ngày: 2026-09-07
- Trạng thái: Draft (chờ user duyệt để chuyển sang plan)
- Liên quan: module giải đấu v2 (Phase 3 interclub), `tournament-operations` (điều hành — spec riêng), `tournament-create-wizard-redesign`
- Mockup đã duyệt (phiên brainstorm, `.superpowers/brainstorm/`): `directory` · `reg-detail-v4` · `btc-board-v3` · `reg-status`

## 1. Mục tiêu

Cho phép **giải Cộng đồng** để chế độ **Công khai** nhận **VĐV tự đăng ký qua link**, có hạn đăng ký, một hàng chờ duyệt của BTC, sức chứa/waitlist, ghép cặp cho nội dung đôi, và chống trùng VĐV theo số điện thoại. VĐV **không cần tài khoản**.

## 2. Phạm vi & KHÔNG thuộc phạm vi

**Trong phạm vi**
- Trang **danh sách giải cộng đồng** đang mở đăng ký (public).
- Trang **đăng ký chi tiết** theo từng **nội dung** (đơn → form đơn; đôi → form đôi).
- **Bảng duyệt của BTC** (mặt admin trong console giải): một màn kiểm soát, tab = bộ lọc.
- **Trang theo dõi trạng thái** cho VĐV (mở bằng link gắn theo SĐT).
- Chống trùng theo SĐT; sức chứa + waitlist; ghép cặp (đôi).

**Ngoài phạm vi (thuộc spec/luồng khác)**
- Nội dung **Đội/MLP** cộng đồng: đăng ký bởi **admin CLB** (đăng nhập), chỉ CLB **có sẵn trên hệ thống**, không cho CLB ngoài, không cho cá nhân. → luồng authenticated riêng, **không** dùng link công khai này. Ghi nhận ở đây như một nhánh liền kề nhưng triển khai tách.
- Giải **nội bộ / giao hữu**: KHÔNG có đăng ký mở (đã có đăng ký VĐV khách trong luồng CLB tự tổ chức).
- Bốc thăm, sinh lịch, gán sân/giờ, nhập điểm, BXH, correction/audit → spec `tournament-operations`.
- Thu phí / nộp tiền: **NGOÀI phạm vi** spec này (kể cả đánh dấu nộp thủ công). Xem mục 11.
- OTP/xác thực SĐT bằng SMS: KHÔNG (đã chốt).

## 3. Vai trò

- **VĐV (khách, ẩn danh)**: xem danh sách giải công khai, đăng ký, theo dõi trạng thái qua link. Không đăng nhập.
- **BTC (admin CLB tổ chức giải)**: cấu hình mở đăng ký, duyệt/từ chối, quản sức chứa/waitlist, ghép cặp, đánh dấu nộp tiền. Đăng nhập bằng `group_session` (admin), mọi ghi đều qua guard.

## 4. Kiến trúc điều hướng & màn hình

1. **Danh sách giải cộng đồng** (`directory`) — công khai. Lọc/tìm; mỗi giải là 1 card: poster, tên, BTC tổ chức, địa điểm/ngày/hạn, nhãn "Đang mở". Dưới mỗi giải liệt kê **nội dung** (tên · nhãn thể thức · số suất còn) với nút **Đăng ký** (nội dung hết suất → **Vào waitlist**).
2. **Đăng ký chi tiết một nội dung** (`reg-detail-v4`) — công khai, responsive (PC 2 vùng: thông tin nội dung TRÊN, VĐV DƯỚI; nội dung đôi chia 2 cột VĐV; tablet/mobile xếp chồng). Trên cùng: thông tin nội dung (địa điểm, ngày, thể thức, **giới hạn điểm**, **vòng tròn tiến độ** đã đăng ký / sức chứa, **liên hệ BTC + Zalo**). Dưới: form VĐV. (Mockup có cột "nộp tiền" nhưng phần này đã bỏ khỏi phạm vi — xem mục 11.)
3. **Bảng duyệt của BTC** (`btc-board-v3`) — admin, một màn: **Đã vào giải** (trên) → **Chờ xử lý** (một hàng chờ; phần vượt sức chứa = waitlist) → **Hồ chờ ghép** → **Từ chối**. Thanh công cụ: chọn nội dung, sức chứa (stepper), đã vào giải x/cap, hạn, công tắc **Nhận muộn**. Tab trạng thái = **bộ lọc**, không đổi trang.
4. **Theo dõi trạng thái VĐV** (`reg-status`) — công khai qua link/SĐT: trạng thái + timeline (đã gửi → ghép cặp → BTC duyệt → vào giải), lời mời ghép cặp, thông tin nội dung, dải "các trạng thái khác".

Bản sắc giao diện: **theo PickHub** (tông tối/tím ở mặt công khai lẫn console). Học **bố cục** từ trang giải kiểu SportConnect nhưng không bê màu/nav của họ.

## 5. Mô hình dữ liệu

Ưu tiên **dùng lại** `tournament_registrations` (Phase 3). Bổ sung:

### 5.1 `tournament_divisions` — cấu hình mở đăng ký (thêm cột)
| Cột | Kiểu | Ý nghĩa |
|---|---|---|
| `registration_open` | bool (default false) | Nội dung có nhận đăng ký công khai không. |
| `registration_capacity` | int null | Số suất (đơn) / cặp (đôi) tối đa. null = không giới hạn. |
| `registration_deadline` | timestamptz null | Hạn đăng ký. |
| `allow_late_registration` | bool (default false) | Công tắc "nhận muộn" (BTC bật để nhận sau hạn). |
| `gender_mode` | text ('any'\|'male'\|'female'\|'mixed') | Điều kiện giới tính; 'mixed' = ép 1 nam + 1 nữ (đôi). |
| `age_min` / `age_max` | int null | Giới hạn tuổi (nếu có) → mới hỏi ngày sinh. |
| `entry_fee` | int null | Lệ phí (VND) để hiển thị. |

Ghi chú: **giới hạn điểm** dùng lại `rating_policy` + `rating_cap` sẵn có (`interclub.validateDivisionOptions`). Có `rating_cap` → form hỏi PHR.

### 5.2 `tournament_registrations` — đơn vị được cấp suất (thêm cột)
| Cột | Kiểu | Ý nghĩa |
|---|---|---|
| `origin` | text ('btc'\|'public_self') | Nguồn tạo đăng ký. |
| `contact_phone_norm` | text | SĐT liên hệ chính (đã chuẩn hoá) — khóa chống trùng. |
| `self_declared_club` | text null | CLB VĐV tự khai (không ràng buộc group). |
| `needs_partner` | bool (default false) | Đôi đăng ký một mình (đang ở hồ chờ ghép). |
| `track_token` | text unique | Token để VĐV mở trang theo dõi (không cần tài khoản). |
| `admitted_at` | timestamptz null | Thời điểm được nhận vào giải (thứ tự & audit). |
| `queue_seq` | bigserial / int | Thứ tự vào hàng chờ (theo giờ nộp) — dùng tính waitlist. |
| `merged_into` | fk null | Nếu solo bị gộp vào cặp khác khi ghép (trỏ registration còn lại). |

Giữ nguyên: `status`, `division_id`, `tournament_club_id` (nullable cho public self — xem 5.4), `entrant_type`, `version`, `private_note`, `submitted_by_actor`.

### 5.3 `tournament_registration_members` (bảng mới) — người trong một đăng ký
| Cột | Kiểu | Ý nghĩa |
|---|---|---|
| `id` | pk | |
| `group_id` | fk | scope tenant. |
| `registration_id` | fk | thuộc đăng ký nào. |
| `seat` | int (1\|2) | ghế trong cặp (đơn chỉ seat 1). |
| `full_name` | text | Họ tên. |
| `phone_norm` | text | SĐT (chuẩn hoá) — chống trùng theo nội dung. |
| `self_declared_phr` | numeric null | PHR tự khai (chỉ khi nội dung có giới hạn điểm). |
| `gender` | text null | Giới tính (chỉ khi 'mixed'/điều kiện giới). |
| `dob` | date null | Ngày sinh (chỉ khi có giới hạn tuổi). |

Đơn = 1 member; đôi hoàn chỉnh = 2; đôi solo = 1 (+ `needs_partner=true`).

### 5.4 CLB tham dự cho public self — CHỐT (a)
Public self-registration **không** neo vào một `tournament_club`. Cho `tournament_registrations.tournament_club_id` **nullable** khi `origin='public_self'`. Các truy vấn/tổng hợp theo club phải chấp nhận `null` cho nhánh public (không tạo CLB ảo). Constraint: `tournament_club_id` chỉ được null khi `origin='public_self'`.

### 5.5 Ghép cặp — đề xuất (đôi)
Dùng chính `tournament_registrations` làm cặp. Solo = registration `needs_partner=true`, `status='awaiting_partner'`, 1 member (seat 1). Khi ghép:
- **BTC ghép** hai solo A, B: gộp thành một cặp — chọn A làm entry, thêm member seat 2 = member của B; đóng B (`status='merged'`, trỏ `merged_into=A`); A → `needs_partner=false`, `status='submitted'` (vào hàng chờ).
- **VĐV tự rủ**: A gửi lời mời tới B (một dòng `tournament_pair_invites`: from_registration, to_registration, status pending/accepted/declined). B đồng ý → tạo cặp như trên nhưng đặt `status='submitted'` chỉ sau khi **BTC duyệt cặp** (theo yêu cầu: "VĐV tự rủ (BTC duyệt cặp)"). Tức mắt xích: invite accepted → cặp ở trạng thái chờ BTC duyệt cặp → BTC duyệt → vào hàng chờ.

`tournament_pair_invites` (bảng mới nhỏ): `id, group_id, division_id, from_registration_id, to_registration_id, status ('pending'|'accepted'|'declined'|'cancelled'), created_at`.

## 6. Vòng đời đăng ký (state machine)

Mở rộng nhẹ `interclub.transitionRegistration` (giữ tương thích chuỗi cũ):

```
[đôi solo]  awaiting_partner --(ghép xong / BTC duyệt cặp)--> submitted
            awaiting_partner --(bị gộp vào cặp khác)--> merged   (đóng, trỏ merged_into)
            awaiting_partner --withdraw--> withdrawn
submitted   --admit--> approved        (đủ điều kiện & còn suất; = "Nhận vào giải")
submitted   --reject--> rejected
submitted   --withdraw--> withdrawn
approved    --remove--> submitted       ("Đưa ra khỏi giải" → trả về hàng chờ, giải phóng suất)
approved    --withdraw--> withdrawn
rejected    --restore--> submitted      ("Khôi phục về chờ")
```

**Không có trạng thái `waitlisted` riêng.** Waitlist = các đăng ký `submitted` nằm **ngoài sức chứa** khi sắp theo `queue_seq`. Vị trí waitlist tính động = (số submitted xếp trước) − (sức chứa − số approved). "Kéo vào giải" chỉ là `admit`, và bị chặn khi `approved >= capacity` (trừ khi BTC tăng `registration_capacity` hoặc `remove` một cặp).

## 7. Sức chứa & waitlist

- `registration_capacity` theo **nội dung**. `approved` đếm số đã vào giải.
- Còn suất = `capacity − approved` (null capacity = luôn còn).
- BTC `admit` một `submitted` khi còn suất. Hết suất → nút "Nhận vào giải" mờ; phần `submitted` còn lại hiển thị waitlist #1, #2… theo `queue_seq`.
- Bật `allow_late_registration` để tiếp tục nhận đăng ký sau `registration_deadline`; tắt (mặc định) → hết hạn form công khai đóng ("đã đóng đăng ký").
- Promotion **thủ công** (đã chốt): không tự động kéo waitlist.

## 8. Ghép cặp (nội dung đôi)

- Form đôi luôn 2 ô. Điền cả 2 → cặp hoàn chỉnh, vào thẳng `submitted`. Điền 1 → `awaiting_partner` (hồ chờ ghép), chưa vào hàng chờ duyệt.
- Ghép: **VĐV tự rủ** (invite → accept → BTC duyệt cặp) **hoặc BTC ghép trực tiếp**. Sau ghép, cặp vào hàng chờ (`submitted`).
- Chống trùng vẫn áp cho từng member (mỗi SĐT 1 suất/nội dung); ghép hai người cùng SĐT là lỗi.
- Nội dung 'mixed' → cặp phải 1 nam + 1 nữ (cảnh báo/enforce khi ghép).

## 9. Trường form theo cấu hình nội dung

Mặc định mỗi member: **Họ tên + SĐT** (bắt buộc). Hiện thêm theo cấu hình nội dung:
- Có `rating_cap` (giới hạn điểm) → hỏi **Điểm trình (PHR) tự khai** (không chặn).
- `gender_mode='mixed'` (hoặc điều kiện giới) → hỏi **Giới tính**.
- Có `age_min/age_max` → hỏi **Ngày sinh**.
- **Bỏ Tỉnh thành**. Nội dung "Đơn Open" → chỉ Họ tên + SĐT.

Nhãn phụ trên field cho biết vì sao hỏi ("vì có giới hạn điểm" / "vì nội dung Nam-Nữ").

## 10. Chống trùng & chống lạm dụng (endpoint công khai)

- **Chống trùng**: chuẩn hoá SĐT (bỏ khoảng trắng, chuẩn `0xxxxxxxxx`). Unique một SĐT **đang hoạt động** (không tính rejected/withdrawn/merged) trong **một nội dung**. Trùng → chặn với thông báo "SĐT này đã đăng ký nội dung này". Một người **được** đăng ký nhiều nội dung khác nhau.
- **Cảnh báo (không chặn)**: nếu SĐT trùng một `club_members` đã có → gắn cờ cho BTC biết (VĐV có thể là thành viên CLB nào đó). Tổng PHR cặp vượt `rating_cap` → cảnh báo BTC, không chặn.
- **Bảo mật endpoint ghi công khai**:
  - Chỉ mở khi `tournaments.open_registration = true`, `organizer_mode='community'`, `division.registration_open = true`, và trong hạn (hoặc `allow_late_registration`).
  - Server **resolve tournament/group từ `public_slug`**; KHÔNG tin group_id từ client.
  - **Rate limit** (dùng hạ tầng rate-limit sẵn có — xem `tests/phase1/rate-limit`) theo IP + SĐT.
  - **Honeypot** field ẩn; từ chối nếu điền.
  - Không có bước ghi nào cần role; nhưng ghi luôn scope theo group của giải.

## 11. Nộp tiền — NGOÀI PHẠM VI spec này

Bỏ hoàn toàn khỏi spec này (không cột `payment_status`, không action đánh dấu nộp tiền, không "đã nộp tiền" trên vòng tròn tiến độ). Vòng tròn tiến độ chỉ hiển thị **đã đăng ký / sức chứa**. Thu phí sẽ do spec/luồng khác (`finance.js`) xử lý sau nếu cần.

## 12. API (đề xuất)

Công khai (không auth, gated theo slug + cờ mở):
- `GET /api/tournament-v2/public/community` — danh sách giải cộng đồng đang mở + nội dung + số suất.
- `GET /api/tournament-v2/public/registration?slug=&divisionId=` — chi tiết nội dung + cấu hình field + tiến độ + liên hệ/Zalo.
- `POST /api/tournament-v2/public/registration` — nộp đăng ký `{ slug, divisionId, members:[{full_name, phone, phr?, gender?, dob?}], honeypot? }`. Trả `track_token`. Rate-limited.
- `GET /api/tournament-v2/public/registration/status?token=` (hoặc `?slug=&phone=`) — trạng thái cho VĐV.
- `POST /api/tournament-v2/public/pair-invite` — VĐV rủ ghép `{ token, targetRegistrationId }`; `PATCH` để accept/decline (token của người được rủ).

Admin (mở rộng route sẵn có):
- `GET /api/tournament-v2/registrations?...` — dữ liệu bảng BTC (đã có; bổ sung field mới + phân nhóm theo status/queue).
- `PATCH /api/tournament-v2/registrations` — action: `admit` | `reject` | `withdraw` | `remove` | `restore` | `pair` (BTC ghép) | `approve_pair` (duyệt cặp do VĐV rủ). Kiểm tra sức chứa cho `admit`.
- `PATCH /api/tournament-v2/divisions` — cập nhật cấu hình mở đăng ký (các cột mục 5.1).

Mọi route admin qua `requireTournamentAccess`/`requireValidatedGroupAdmin`, scope `group_id`, ghi audit (`submitted_by_actor`, `version`, `updated_at`).

## 13. Quyền & bảo mật

- Đọc công khai: chỉ dữ liệu cần cho đăng ký/hiển thị (tên giải/nội dung, số suất, liên hệ BTC, Zalo). KHÔNG lộ SĐT/PHR của VĐV khác.
- Trang theo dõi: **CHỐT** cho hai lối vào — (1) link `track_token` opaque (hiện sau khi nộp), (2) **tra theo SĐT** trả về **thông tin tối thiểu** (chỉ trạng thái các đăng ký của chính SĐT đó trong giải). Không OTP → đây là quyền riêng tư mức thấp, chấp nhận theo quyết định "không OTP"; không trả PHR/thông tin người khác.
- Ghi công khai: rate limit + honeypot + resolve group từ slug (mục 10).

## 14. Kiểm thử (định hướng, theo phong cách node test dự án)

- **Domain (đỏ trước)**: chuẩn hoá & chống trùng SĐT theo nội dung; tính vị trí waitlist từ capacity + queue_seq; transition mới (`admit/remove/restore/awaiting_partner→submitted`); enforce mixed 1 nam+1 nữ; điều kiện hiện field theo cấu hình nội dung.
- **API contract**: endpoint công khai gated đúng (đóng khi chưa mở / quá hạn / không phải community); resolve group từ slug; admin actions + kiểm tra sức chứa; scope `group_id`.
- **Chống lạm dụng**: rate limit + honeypot chặn.
- **UI contract**: 4 màn tồn tại và có các mốc (danh sách nội dung + nút đăng ký; form field theo cấu hình; bảng BTC 4 khối + bộ lọc; trang theo dõi + timeline).

## 15. Edge cases

- Quá hạn + `allow_late=false` → form đóng; token theo dõi vẫn xem được.
- Rút (withdraw) một cặp `approved` → giải phóng suất; BTC chủ động kéo waitlist (không tự động).
- Ghép hai người trùng SĐT → lỗi.
- VĐV lẻ nhận nhiều lời mời → chỉ chấp nhận 1; các invite khác tự huỷ khi đã ghép.
- Đổi `registration_capacity` xuống dưới số `approved` → không tự loại ai; chỉ khoá nhận thêm.
- Nội dung Đội/MLP cộng đồng → link công khai này **không** hiển thị form cá nhân (chuyển hướng thông báo "đăng ký theo CLB").

## 16. Quyết định đã chốt (khép các câu hỏi mở)

- Neo CLB cho public self: **(a) nullable `tournament_club_id`** (không tạo CLB ảo). Xem 5.4.
- Trang theo dõi: **cho tra theo SĐT** (thông tin tối thiểu) bên cạnh link token. Xem mục 13.
- Nộp tiền: **bỏ khỏi phạm vi** spec này. Xem mục 11.

---

Tiếp theo: sau khi user duyệt spec → chuyển sang skill `writing-plans` để lập kế hoạch triển khai (chu trình spec → plan → thực thi riêng).
