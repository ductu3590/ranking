# Điều hướng và giao diện không gian CLB — thiết kế

**Ngày:** 2026-09-09
**Trạng thái:** đã chốt với chủ sở hữu sản phẩm, chờ viết plan
**Mockup đã duyệt:** `_workspace/mockup-ui-2026-09-09.html`
**Nguồn thiết kế:** `C:\Users\ductu\Downloads\stitch_pickleball_tournament_management_dashboard`

---

## 1. Mục tiêu

Gỡ bỏ hai màn hình quản trị trung gian (`/admin?section=roster`, `/admin?section=fund`)
bằng cách đưa thao tác quản trị về đúng trang nội dung của nó, phân quyền bằng vai trò
thay vì bằng URL riêng. Đồng thời áp bố cục desktop có sidebar theo bộ thiết kế Stitch,
giữ nguyên hệ màu và font đã duyệt.

Nguyên tắc xuyên suốt: **một trang, hai diện mạo theo vai trò** — không tách URL cho admin.

## 2. Quyết định đã chốt

| # | Vấn đề | Quyết định |
|---|--------|-----------|
| 1 | URL trang Thành viên | `/thanh-vien` + trang con `/thanh-vien/[membershipId]` |
| 2 | URL trang BXH | `/bxh` (ngang cấp `/quy`) |
| 3 | Phạm vi giao diện | Dựng shell sidebar desktop đầy đủ |
| 4 | Trang `/admin` | Chỉ còn Cấu hình CLB, bỏ hết tab |
| 5 | Font chữ | **Giữ Montserrat** — tôn trọng ADR-006 (07/09/2026), không đổi sang Plus Jakarta Sans |
| 6 | Màu & hình khối | **Giữ nguyên bảng màu đã duyệt**, chỉ thêm token radius nhỏ |
| 7 | Khối chưa có dữ liệu | Bỏ hẳn, không dựng khung rỗng |
| 8 | CTA liên kết hồ sơ | Dựng sẵn giao diện, nút vô hiệu hoá, luồng thật để bước sau |
| 9 | Mã CLB | Cố định, bỏ chức năng tạo lại |
| 10 | Tài khoản nhận quỹ | Đổi thành upload ảnh QR; bỏ tên ngân hàng và chủ tài khoản |

## 3. Bản đồ route

| Hiện tại | Sau khi đổi | Cách làm |
|---|---|---|
| `/quy` | `/quy` | Giữ URL, **thêm** lớp thao tác cho admin |
| `/quy/members` | `/thanh-vien` | Chuyển thư mục + redirect 308 |
| `/quy/bxh` | `/bxh` | Chuyển thư mục + redirect 308 |
| — | `/thanh-vien/[membershipId]` | Route mới |
| `/thong-tin` | `/thong-tin` | Giữ nguyên, dùng chung component với route trên |
| `/admin?section=roster` | → `/thanh-vien` | Redirect trong `app/admin/page.js` |
| `/admin?section=fund` | → `/quy` | Redirect trong `app/admin/page.js` |
| `/admin?section=settings` | `/admin` | Bỏ tab, render thẳng `ClubSettings` |
| `/quy/admin` | **xoá** | Xoá `app/quy/admin/` sau khi chuyển hết chức năng |

### 3.1 Bẫy redirect phải xử lý

`next.config.js` hiện có `/members` → `/quy/members`. Nếu chỉ thêm
`/quy/members` → `/thanh-vien` thì `/members` sẽ đi qua hai chặng.
**Sửa `/members` trỏ thẳng `/thanh-vien`**, rồi mới thêm chặng mới.

Redirect cuối cùng trong `next.config.js`:

```
/members      → /thanh-vien   (permanent)
/quy/members  → /thanh-vien   (permanent)
/quy/bxh      → /bxh          (permanent)
```

`?section=` không đi qua `next.config.js` được vì Next không match query string
trong `redirects()` một cách tự nhiên cho trường hợp này — xử lý bằng
`router.replace()` trong `app/admin/page.js` khi đọc được `section=roster|fund`.

Redirect `/admin/tournament` → `/admin?section=tournament` đang trỏ tới một section
không còn tồn tại. Ghi nhận là nợ kỹ thuật, **không sửa trong đợt này**.

## 4. Shell điều hướng

### 4.1 Ba mốc responsive

| Bề rộng | Bố cục |
|---|---|
| ≥ 1120px | Sidebar trái 256px cố định + top bar 64px dính. Không có bottom nav. |
| 768–1119px | `HomeHeader` + `MobileBottomNav` như hiện tại. Không sidebar. |
| < 768px | Như hiện tại, không đổi. |

### 4.2 Thành phần

- **`components/pickhub/SideRail.js`** — viết lại: khối brand CLB (logo + tên +
  nhãn "CÂU LẠC BỘ"), danh sách nav có badge đếm và pill "HOT", thẻ user ở chân.
- **`components/pickhub/AppTopBar.js`** — mới: breadcrumb + chip không gian CLB
  đẩy sang phải. **Không có badge vai trò, không có chuông.**
- **`components/pickhub/AppShell.js`** — ghép hai thứ trên, giữ nguyên logic
  đọc `/api/groups/session` hiện có.

### 4.3 Vị trí chuông thông báo

Chuông (`PhNotificationBell`) nằm **trong thẻ user ở chân sidebar**, không ở top bar.
Thẻ user có một ô trạng thái duy nhất, đổi theo vai trò:

- admin → chuông thông báo (có chấm đỏ khi chưa đọc)
- thành viên → chấm xanh trạng thái

### 4.4 Breadcrumb

Suy ra từ `pathname` qua bảng tra trong `lib/globalNavigation.js`, **không** truyền
prop từ từng page. Bảng tra:

```
/quy            → Tổng quan quỹ
/bxh            → BXH đóng góp
/thanh-vien     → Thành viên CLB
/thanh-vien/*   → Hồ sơ vận động viên
/giai-dau       → Giải đấu
/admin          → Cấu hình CLB
/thong-tin      → Hồ sơ cá nhân
```

### 4.5 Nav theo vai trò

`getGlobalNavLinksForRole()` cập nhật href mới. Danh sách giữ nguyên cấu trúc hiện tại:

- **admin:** Tổng quan quỹ · BXH đóng góp · Thành viên CLB · Giải đấu · Cấu hình CLB
- **thành viên:** Tổng quan quỹ · BXH đóng góp · Thành viên CLB · Giải đấu · Hồ sơ cá nhân

## 5. Design token

Chỉ **thêm** hai biến vào `app/styles/tokens.css`, không sửa giá trị nào đang có:

```css
--ph-radius-xs: 8px;    /* control, input, nút trong bảng */
--ph-radius-card: 16px; /* thẻ SaaS, thay chỗ đang dùng 20px cho thẻ số và bảng */
```

`--ph-radius-sm: 12px` và `--ph-radius-lg: 28px` giữ nguyên. Font, màu, shadow
giữ nguyên hoàn toàn. **Không cần sửa `UI-BRAND-SYSTEM.md`, không cần ADR mới.**

## 6. Trang `/quy` — Tổng quan quỹ

### 6.1 Thẻ số

Bốn thẻ, tất cả tính từ dữ liệu thật trong `quy_pickleball`:

| Thẻ | Nguồn |
|---|---|
| Số dư quỹ | `totalIn - totalOut` |
| Tổng thu | `huong_giao_dich === 'in'` |
| Tổng chi | `huong_giao_dich === 'out'` |
| Quỹ phạt | `loai_giao_dich === 'nop_phat'` |

Thẻ "Quỹ phạt" thay cho tab Thống kê của `/quy/admin` cũ.

### 6.2 Danh sách giao dịch — dòng-thẻ, không phải bảng

**Không dùng `<table>`.** Mỗi giao dịch là một dòng-thẻ:

```
[chọn] [icon] TÊN NGƯỜI NỘP          +20.000đ   [Gán][Sửa]
              nội dung giao dịch      Nộp quỹ
              giờ · ngày · nguồn
```

Lý do: ở 1280px cột nội dung chỉ còn ~630px, bảng cần ~850px nên phải cuộn ngang
và che mất cột thao tác. Quyết định này cũng khớp quy tắc trong `UI-BRAND-SYSTEM.md`
mục 5: *"Table: desktop ưu tiên mật độ; mobile chuyển thành card"*.

Cột số tiền và cột thao tác có bề rộng cố định (118px / 116px) để các dòng thẳng cột.

### 6.3 Lớp thao tác cho admin

Gate bằng `permissions.canManageFund`. Member không thấy gì trong nhóm này:

- Nút `＋ Ghi thu` / `＋ Ghi chi` → modal → `POST /api/club/transactions`
- Ô lọc "Thành viên"
- Cột chọn + thanh gán loại hàng loạt → `PATCH` với nhiều `ids`
- Nút `Sửa` mỗi dòng → modal sửa
- Nút `Gán người nộp` cho dòng chưa gán

### 6.4 Cột phải

- Sự kiện đóng quỹ (giữ nguyên logic `buildFundEventPanel` hiện có)
- **QR nhận quỹ** — ảnh do admin upload. Chưa có ảnh thì **ẩn cả khối**, không hiện ô trống.

### 6.5 Component mới

`components/pickhub/fund/`: `FundTransactionList.js`, `FundTransactionEditor.js`,
`FundEntryForm.js`.

`AssignTransactionDialog.js` sửa để nhận **thẳng một transaction**, không chỉ nhận
`notification` như hiện tại — dùng lại cho cả chuông thông báo và trang quỹ.

## 7. Trang `/thanh-vien` — Danh bạ

Một trang, hai diện mạo theo `permissions.canManageRoster`:

**Admin:** bảng Mã TV · VĐV · Biệt danh · **PHR** · Trạng thái · Quản lý
(Chỉnh sửa / Kết thúc). Chọn nhiều + kết thúc hàng loạt. Nút `＋ Thêm VĐV`.

**Thành viên:** hero, chip lọc trình độ, mỗi dòng có nút `Xem hồ sơ` →
`/thanh-vien/[membershipId]`.

### 7.1 Cột PHR — không được N+1

Gọi **một lần** `GET /api/identity/assessments` **không truyền `membershipId`** —
route đã hỗ trợ trả về toàn bộ assessment của CLB, sắp xếp `effective_from` giảm dần
([route.js:15](../../../app/api/identity/assessments/route.js)). Lấy bản ghi đầu tiên
theo mỗi `membershipId`. **Không đổi API, không gọi mỗi thành viên một lần.**

### 7.2 Giữ nguyên

Modal chỉnh sửa hiện có (họ tên, biệt danh, PHR, từ khoá nhận diện chuyển khoản)
và toàn bộ logic mutation giữ nguyên. Chỉ đổi vị trí file và lớp trình bày.

## 8. `/thanh-vien/[membershipId]` và `/thong-tin`

Component chung **`components/pickhub/MemberProfileView.js`**, nâng cấp từ
`MemberInfoPanel.js`: thẻ danh tính, thẻ PHR có thang đo 1,0–5,0 với mốc hiện tại,
timeline lịch sử đánh giá.

- `/thanh-vien/[id]` — hồ sơ của đúng membership đó. Admin thấy thêm nút Chỉnh sửa.
- `/thong-tin` — dropdown chọn hồ sơ + cùng component đó. Giữ nguyên vai trò hiện tại.

**CTA liên kết hồ sơ:** chỉ hiện với vai trò thành viên. Banner gradient
"Bạn chính là ...?" + nút *Tạo tài khoản & liên kết VĐV này*, **`disabled`**, kèm nhãn
"Chưa hoạt động". Xem mục 12.

**Bỏ:** DUPR, số trận giao lưu, tỷ lệ thắng, điểm năng nổ — chưa có dữ liệu.

## 9. Trang `/bxh`

Logic giữ nguyên hoàn toàn. Chỉ chuyển thư mục và sửa lớp trình bày cho khớp Stitch:

- Thanh tiến độ **rộng cố định 128px**, đặt **dưới số tiền ở cột phải** — không kéo
  hết chiều rộng dòng.
- Thêm dòng phụ `Lượt góp: N` dưới tên.
- Số hạng `#N` là phần tử riêng ở mép phải, rộng cố định 26px.
- Avatar vuông bo 12px cỡ 40px; tag chữ nhật bo 5px cỡ 10px.
- Đầu panel thêm ô tìm tên và dropdown sắp xếp.

Link "Mở sổ quỹ để xử lý" đổi từ `/admin?section=fund` sang `/quy`.

## 10. Trang `/admin` — Cấu hình CLB

Bỏ hết tab, render thẳng `ClubSettings`. Trang chia **7 mục có `id`**, kèm
**sub-menu neo dính** ở đầu trang: bấm chip là cuộn mượt tới mục, chip tự tô sáng
theo mục đang xem.

| # | Mục | `id` | Nội dung |
|---|---|---|---|
| 1 | Nhận diện CLB | `set-brand` | Tên, tên rút gọn, logo |
| 2 | Mã CLB | `set-code` | **Chỉ đọc**, không có nút tạo lại |
| 3 | Mật khẩu quản trị | `set-pw-admin` | Mật khẩu mới + nhập lại, ≥6 ký tự |
| 4 | Mật khẩu thành viên | `set-pw-member` | Mật khẩu mới + nhập lại, ≥4 ký tự |
| 5 | QR nhận quỹ | `set-qr` | Upload ảnh, preview, xoá |
| 6 | Thu quỹ tự động qua SePay | `set-sepay` | 4 bước, URL webhook, secret |
| 7 | Kết nối ngân hàng | `set-bank` | **Chỉ số tài khoản** |

### 10.1 Sub-menu neo — hai bẫy đã gặp khi dựng mockup

1. **Không dùng `IntersectionObserver`** để tô sáng mục đang xem. Nhiều section cùng
   cắt vùng quan sát thì entry ghi sau đè entry trước, gây tô sai mục. Dùng cách xác định:
   trong handler `scroll`, chọn section **cuối cùng** có `getBoundingClientRect().top - 200 <= 0`.

2. **Phải có vùng đệm cuối trang** (`min(62vh, 540px)`), nếu không hai mục cuối
   không bao giờ cuộn lên tới vạch được và luôn tô sai. Đây là cách chữa đúng gốc;
   đừng chắp vá bằng điều kiện "chạm đáy trang thì sáng mục cuối" — điều kiện đó
   làm mục áp chót sáng nhầm.

`scroll-margin-top: 178px` trên mỗi `.set-group` để tiêu đề không bị sub-menu che.

### 10.2 Tách mật khẩu quản trị và mật khẩu thành viên

`PATCH /api/club/settings` **đã nhận sẵn cả `adminPassword` và `memberPassword`**
([route.js:57–67](../../../app/api/club/settings/route.js)), chỉ là `ClubSettings.js`
chưa bao giờ gửi `memberPassword`. **Đây là việc thuần UI, không đụng backend.**

Mỗi mục có ô nhập + ô nhập lại + nút riêng. Mục quản trị cảnh báo rõ: đổi xong sẽ
đăng xuất mọi phiên admin kể cả phiên đang mở (do `access_version` bị nâng).

### 10.3 Mã CLB cố định

Ô `readonly`, `tabindex="-1"`, nền xám, badge "🔒 Không thể thay đổi".

**Phải xoá endpoint `app/api/club/settings/regenerate-code/route.js`**, không chỉ
giấu nút. Để lại thì vẫn gọi được bằng `POST` trực tiếp.

Lý do bỏ **không phải** vì rủi ro trùng mã — `createUniqueGroupCode()` đã loop 8 lần
kiểm `groups.code` trước khi ghi nên không thể trùng. Lý do thật: hàm này nâng
`access_version`, **đá toàn bộ thành viên đang đăng nhập ra ngoài**. Với CLB đang
vận hành thật thì đó là nút bấm nhầm một lần là hỏng cả ngày.

Đổi mã CLB từ nay là việc của superadmin, làm trực tiếp trong Supabase.

### 10.4 QR nhận quỹ

Upload ảnh PNG/JPG ≤200KB. Nén phía client theo đúng pattern của logo hiện có
(canvas resize → dataURL), **nhưng xuất PNG chứ không phải WebP lossy** — QR nén
mất dữ liệu bị rỗ cạnh, máy quét đọc lỗi.

**Cần migration:** thêm cột `groups.fund_qr_url TEXT` (cùng kiểu `logo_url`).
Migration tiếp theo là `042_`. Nhớ chạy `npm run migration:ledger`.

**Ghi (admin):** `PATCH /api/club/settings` nhận thêm `fundQrUrl` — chuỗi dataURL,
hoặc `null` để xoá. `GET` của route đó trả thêm trường này cho trang cấu hình.

**Đọc (member):** thêm route mới **`GET /api/club/fund-qr`**, guard bằng
`getValidatedGroupSessionFromCookies()`. `/quy` gọi route này.

Lý do phải tách route đọc riêng thay vì dùng lại hai route sẵn có:

- `/api/club/settings` guard bằng `requireValidatedGroupAdmin()` → **member không đọc được**.
- `/api/club/branding` tự khai trong comment là đường đọc **công khai**, phục vụ cả
  khách chưa đăng nhập, và chỉ phơi bày trường không nhạy cảm. QR nhận tiền của CLB
  không thuộc nhóm đó — **không nhét vào branding**.

Route mới nằm đúng giữa: cần phiên CLB hợp lệ, không cần quyền admin.

QR chỉ là ảnh để hiển thị cho thành viên quét, **không có logic gì kèm theo** — không
sinh mã động, không gắn số tiền, không đối chiếu. Việc ghi nhận tiền vào vẫn hoàn toàn
do webhook SePay đảm nhiệm (mục 10.5). Ai vào được `/quy` thì xem được QR, mà vào được
`/quy` thì đã phải có mã CLB và mật khẩu rồi.

### 10.5 Kết nối ngân hàng — chỉ giữ số tài khoản

Bỏ **tên ngân hàng** và **nhãn** khỏi giao diện. Giữ **số tài khoản**.

> **Không được xoá số tài khoản.** `group_bank_accounts.account_number` là khoá định
> tuyến của webhook SePay: [webhook/route.js:130–150](../../../app/api/webhook/route.js)
> tra số tài khoản để biết tiền vào thuộc CLB nào, không khớp thì từ chối giao dịch.
> Bỏ ô này đi là **toàn bộ đồng bộ giao dịch tự động ngừng hoạt động**.

Mục này ghi rõ đây là cấu hình kỹ thuật, không hiển thị cho thành viên, kèm cảnh báo.
Cột `bank_name` và `label` trong bảng giữ nguyên (nullable), chỉ bỏ khỏi UI.

## 11. Thay đổi backend

| Việc | File |
|---|---|
| Thêm cột `groups.fund_qr_url` | `database/migrations/042_*.sql` (mới) |
| Nhận/trả `fundQrUrl` (admin) | `app/api/club/settings/route.js` |
| Route đọc QR cho member | `app/api/club/fund-qr/route.js` (mới, xem 10.4) |
| **Xoá** endpoint tạo lại mã | `app/api/club/settings/regenerate-code/route.js` |

Ngoài bốn việc trên, **không có thay đổi backend nào khác**. Mọi thao tác quỹ và
danh bạ đã có API đầy đủ — đã kiểm chứng: `POST`/`PATCH /api/club/transactions`,
`GET/POST/PATCH/DELETE /api/identity/roster`, `GET/POST /api/identity/assessments`,
và `PATCH /api/club/settings` (đã nhận sẵn `memberPassword`).

## 12. Ngoài phạm vi

- **Luồng tạo tài khoản & liên kết VĐV thật.** Chỉ dựng giao diện CTA, nút vô hiệu.
  Luồng thật đụng tới auth, mà dự án hiện **không dùng Supabase Auth** (chỉ có cookie
  `group_session` code + password). Đó là một quyết định kiến trúc riêng, cần spec riêng.
- Khối DUPR, trận giao lưu, tỷ lệ thắng, điểm năng nổ, phân bổ chi tiêu tháng.
- Redirect chết `/admin/tournament` → `/admin?section=tournament`.
- Mọi thứ trong `/giai-dau`.

## 13. Test phải cập nhật

Bảy file test tham chiếu đường dẫn cũ, **sẽ đỏ nếu không sửa**:

| File | Nội dung phải đổi |
|---|---|
| `tests/global-navigation.test.js` | href `/quy/members`, `/quy/bxh` |
| `tests/pickhub-ui-phase2.test.js` | hai danh sách nav + đọc `app/quy/members/page.js` |
| `tests/pickhub-ui-phase2.browser.test.js` | điều hướng `/quy/members`, `/admin?section=roster` |
| `tests/multitenant-phase2.test.js` | đọc `app/quy/members/page.js` |
| `tests/mobile-bottom-tabs.test.js` | đọc `app/quy/members/page.js` |
| `tests/phase1/navigation-role.test.js` | mảng `['/quy','/quy/members','/quy/bxh',...]` |
| `tests/ph-design-system.test.js` | `NEW_CSS_FILES` chứa `app/quy/bxh/page.css` |

Test mới cần thêm:

- `getGlobalNavLinksForRole` trả đúng href mới cho cả hai vai trò.
- Bảng tra breadcrumb khớp mọi route trong mục 4.4.
- `/quy` ẩn toàn bộ thao tác khi `canManageFund` là `false`.
- `/thanh-vien` ẩn cột Quản lý khi `canManageRoster` là `false`.
- `app/quy/admin/` và `regenerate-code/route.js` không còn tồn tại.
- `next.config.js` không tạo chuỗi redirect nhiều chặng.
- `GET /api/club/fund-qr` trả 401/403 khi không có phiên CLB hợp lệ, trả ảnh khi có.
- `/api/club/branding` **không** chứa `fundQrUrl` (chống rò rỉ ra khách chưa đăng nhập).

## 14. Tiêu chí hoàn thành

1. `npm run test:regression` xanh.
2. `npm run build` không thêm cảnh báo mới.
3. Mở được và đúng vai trò: `/quy`, `/bxh`, `/thanh-vien`, `/thanh-vien/[id]`,
   `/thong-tin`, `/admin`, `/giai-dau` — thử cả hai vai trò admin và thành viên.
4. `/quy/members`, `/quy/bxh`, `/members`, `/admin?section=roster`,
   `/admin?section=fund` đều chuyển đúng đích trong **một** chặng.
5. `app/quy/admin/` và `app/api/club/settings/regenerate-code/` đã bị xoá.
6. Ba mốc responsive ở mục 4.1 đều đúng.
7. Sub-menu `/admin`: cả 7 mục cuộn tới đúng vị trí và tô sáng đúng chip.
8. Upload QR ở `/admin` rồi mở `/quy` thấy đúng ảnh đó; xoá QR thì khối tự ẩn.
9. Đồng bộ giao dịch SePay vẫn chạy — số tài khoản vẫn khai được ở mục Kết nối ngân hàng.
