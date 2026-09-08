# Spec — Nền tảng thiết kế PickHub và BXH đóng quỹ

- Ngày: `2026-09-08`
- Sửa đổi: `2026-09-08` rev 2 (rà soát CODEX) · rev 3 (BXH gộp về một bảng tổng
  đóng góp) · rev 4 (từ vựng “đóng góp”; chuông thông báo và gán giao dịch chưa rõ)
  · rev 5 (chuẩn hoá `Unknown`; thông báo chỉ cho giao dịch không gán được)
- Trạng thái: `approved`
- Quyết định nền: [`ADR-006`](../../pickhub-core/decisions/ADR-006-montserrat-va-hop-nhat-token-ui.md)
- Baseline thương hiệu: [`UI-BRAND-SYSTEM.md`](../../pickhub-core/UI-BRAND-SYSTEM.md)

## 1. Bối cảnh

PickHub đang vận hành thật. Giá trị giữ chân người dùng nằm ở cụm quản lý CLB:
sổ quỹ, thu chi tự động qua SePay, và BXH đóng quỹ. Giao diện cụm này được ghép
dần qua nhiều đợt nên vừa rời rạc vừa khó dùng.

Rà soát code ngày `2026-09-08`:

- **Hai design system chạy song song.** Baseline duyệt `2026-09-02` quy định bộ
  token `--ph-*` và có prototype tại `docs/pickhub-core/ui-preview/`. Nhưng
  `app/globals.css` khai `--ph-*` ở đầu file rồi ghi đè bằng bảng màu sân xanh
  (`--court-green #0D7565`, `--pickle-lime #CAFF28`) và font `Outfit`.
- **Không có lớp component dùng chung.** 25 file CSS (~8.6k dòng) chứa 5 họ nút,
  4 họ modal, 4 họ badge, và **không có skeleton nào**.
- **Test đóng đinh cả hai hệ.** `tests/court-energy-css.test.js` (trong
  `npm run test:regression`) bắt buộc `globals.css` khai `--court-green` và
  `--pickle-lime`, đồng thời bắt buộc HomeHeader/MobileBottomNav dùng `--ph-indigo`.
- **Mobile hỏng ở nơi dễ thấy.** `/quy/members` dùng `<table>` thuần; `/quy/admin`
  và `/quy/members` sửa dữ liệu bằng `window.prompt()` / `window.confirm()`.
- **BXH chưa đủ sức giữ người và tính sai phạm vi.** Chỉ tính `nop_phat`, chỉ 2 mốc Tuần/Tháng, không
  có gì để so sánh hay chia sẻ.

### 1.1 Dữ liệu thật (CLB `group_id = 1`, đo ngày 2026-09-08)

| Loại | Hướng | Số giao dịch | Tổng tiền |
|---|---|---:|---:|
| `nop_phat` | in | 605 | 14.341.000đ |
| `khac` | in | 48 | **42.824.000đ** |
| `khac` | out | 25 | −46.851.300đ |
| `nop_quy` | in | 8 | 16.900.000đ |

Tổng **686 giao dịch** từ `2026-01-15` đến `2026-09-07`, 38 giá trị `nguoi_nop`
khác nhau.

Ba điều rút ra:

1. **Phân loại `loai_giao_dich` không đáng tin để xếp hạng.** Bucket tiền lớn nhất
   là `khac` (42,8tr) chứ không phải `nop_phat` hay `nop_quy`, và bảng `nop_quy`
   chỉ có 8 giao dịch. Mỗi CLB có quy chế thu khác nhau nên việc bắt CLB cấu hình
   đúng nhãn cho từng khoản là không khả thi. Đây là lý do BXH chuyển sang **một
   bảng duy nhất tính tổng tiền đóng** — xem mục 6.1.
2. **`nguoi_nop` chứa rác, và rác đó trông như tên người.** Khi parser không khớp
   được, nó ghi nguyên nội dung ngân hàng vào `nguoi_nop` chứ **không** ghi
   `Unknown`: `BANKAPINOTIFY NOP TIEN QUY 3` (4 lượt, 6,24tr),
   `BANKAPINOTIFY BIDV 96247HANA246 NOP TIEN QUY 3` (2 lượt, 3,12tr), và 13 chuỗi
   tương tự. Nếu chỉ lọc theo tên `Unknown` như code hiện tại, những dòng này sẽ
   **xuất hiện trong BXH như thành viên thật**, đứng hạng 3 và hạng 8.
3. **`parsing_method` và `confidence_score` cũng không đáng tin.** Đo thực tế:
   `parsing_method='unknown'` lại có `confidence_score=100` và trỏ đúng thành viên
   thật; `parsing_method='reverse_lookup'` có `confidence_score=0` và đôi khi là
   thành viên thật, đôi khi là `Unknown`. Không thể dùng hai cột này làm bộ lọc.

Bộ lọc đáng tin duy nhất là **đối chiếu với roster** (mục 6.3). Kiểm chứng trên
dữ liệu thật: giữ lại **625/661 giao dịch chiều vào (94,6%)**, **52,5tr/74,1tr**,
**20 người**. Phần 21,6tr bị loại gồm đúng những thứ nên loại: rác
`BANKAPINOTIFY` (11,4tr), bút toán thủ công `THỦ QUỸ` (6,24tr), `Unknown` (2,4tr),
`TAI KHOAN GOC` (1,5tr). Không khoản nào trong đó là tiền đóng góp của một cá nhân.

## 2. Phạm vi

**Trong phạm vi**

1. Tầng token, primitive và font dùng chung.
2. App shell (header, side rail desktop, điều hướng tablet, bottom nav mobile) và
   quy tắc responsive.
3. Redesign toàn bộ màn hình BXH đóng quỹ: một bảng tổng đóng góp, 4 mốc thời gian, streak, huy
   hiệu, thẻ chia sẻ.
4. Chuông thông báo CLB và luồng gán thủ công giao dịch chưa rõ người nộp (mục 6.9).
5. Thay test `court-energy-css` bằng test chặn tái phát design system thứ hai.

**Từ vựng bắt buộc toàn sản phẩm:** “đóng góp” / “nộp tiền” / “đóng quỹ”. Không
dùng “nộp phạt” ở nhãn, tiêu đề, huy hiệu hay bất kỳ copy nào — nó chỉ đúng với
quy chế của một số CLB. Cột `loai_giao_dich` trong database giữ nguyên giá trị
`nop_phat` (đổi dữ liệu là việc khác, ngoài phạm vi); chỉ lớp hiển thị đổi chữ.

**Ngoài phạm vi** — mỗi hạng mục một spec riêng: dashboard Quỹ, onboarding và kết
nối SePay, Thành viên & PHR, Trung tâm quản trị, trang chủ/join, mọi màn hình
module giải đấu.

### 2.1 Ranh giới thay đổi

Bản trước ghi "không thay đổi business rule, API contract, schema" rồi lại thêm
quy tắc BXH, trường settings và route mới. Ranh giới đúng là:

**Không được phá vỡ (giữ tương thích ngược):**

- Hành vi và shape phản hồi của mọi endpoint hiện có. Chỉ được **thêm** trường,
  không đổi kiểu, không bỏ trường, không đổi mã lỗi.
- Quyết định quyền: ai đọc được gì, ai sửa được gì.
- Quy tắc nghiệp vụ của sổ quỹ: cách phân loại giao dịch và cách tính số dư.
  *(Cách parser ghi `nguoi_nop` khi **không** nhận diện được người nộp là ngoại lệ
  duy nhất, xem bảng dưới — khi khớp được thì vẫn giữ nguyên như cũ.)*

**Được phép mở rộng, đã liệt kê hết:**

| Mở rộng | Nơi |
|---|---|
| Quy tắc **hiển thị** BXH: xếp hạng theo tổng tiền đóng, 4 mốc, streak, huy hiệu | `lib/fundLeaderboard.js` — hàm thuần, không chạm dữ liệu |
| Thêm cột `groups.shame_badges_enabled boolean NOT NULL DEFAULT true` | migration cộng thêm, idempotent, có mặc định |
| Thêm trường `shameBadgesEnabled` vào phản hồi `/api/club/branding` | cộng thêm, không đổi trường cũ |
| Nhận `shameBadgesEnabled` trong `PATCH /api/club/settings` | cộng thêm vào danh sách trường được cập nhật |
| Route mới `GET /api/club/bxh/share-image` | route mới, không đụng route cũ |
| Endpoint đọc giao dịch đủ dữ liệu cho BXH | xem mục 6.6 |
| Bảng mới `club_notifications` | bảng mới cấp CLB, không đụng bảng nào đang có |
| Webhook chèn thêm một dòng thông báo khi không khớp roster | cộng thêm; không đổi phản hồi webhook |
| **Ghi `nguoi_nop = 'Unknown'` khi parser không khớp**, thay cho việc ghi nguyên nội dung ngân hàng | **sửa đổi có chủ ý** theo chỉ đạo sản phẩm (mục 6.9.1). Đường khớp được giữ nguyên; `noi_dung_goc` vẫn lưu đủ nội dung gốc |
| Dọn tồn đọng: đặt `Unknown` cho các dòng rác cũ không khớp roster | bước dữ liệu chạy một lần, có đếm trước/sau (mục 6.9.1) |
| Route mới `GET/PATCH /api/club/notifications` | route mới |
| Gán thủ công dùng lại `PATCH /api/club/transactions` | **không** mở rộng gì — `nguoi_nop` đã nằm trong `ALLOWED_UPDATE_FIELDS` |

Streak và huy hiệu là **quy tắc trình bày**, không phải quy tắc nghiệp vụ: chúng
không ghi gì xuống database và không ảnh hưởng số dư quỹ. `ADR-006` được bổ sung
một dòng ghi rõ phân biệt này.

## 3. Kiến trúc token và font

### 3.1 File

| File | Vai trò |
|---|---|
| `app/styles/tokens.css` | Nguồn duy nhất. Chỉ khai `--ph-*`. |
| `app/styles/primitives.css` | Lớp component dùng chung, tiền tố `ph-`. |
| `app/styles/legacy-aliases.css` | Tầng khai tử. Trỏ token cũ về `--ph-*`. |
| `app/globals.css` | Còn lại: 3 import + reset tối thiểu. |

### 3.2 Nguồn chuẩn của token

`UI-BRAND-SYSTEM.md` và prototype `ui-preview/styles.css` **không khớp nhau**:

| Token | Tài liệu duyệt | Prototype | Chọn |
|---|---|---|---|
| `--ph-line` | `#E4E9F2` | `#E5E8EF` | **`#E4E9F2`** |
| `--ph-muted` | `#667085` | `#72788F` | **`#667085`** |
| radius card lớn | `20px` | `18px` | **`20px`** |

**Nguồn chuẩn là `UI-BRAND-SYSTEM.md`** — đó là tài liệu được duyệt, prototype chỉ
là hiện thực tham chiếu và đã trôi khỏi tài liệu. Prototype không phải sửa (nó là
reference artifact đã đóng băng), nhưng khi chuyển sang production lấy theo tài liệu.

Bản trước của spec này ghi các giá trị prototype rồi nói là "lấy nguyên từ
UI-BRAND-SYSTEM.md" — sai, đã sửa.

### 3.3 Token

Màu thương hiệu, đúng bảng mục 2 của `UI-BRAND-SYSTEM.md`:
`--ph-ink #28243D`, `--ph-indigo #6F48C9`, `--ph-lavender #EEE9FF`,
`--ph-gold #FFC95E`, `--ph-cyan #A8DFE9`, `--ph-coral #FF8B83`,
`--ph-surface #F5F6FB`, `--ph-card #FFFFFF`, `--ph-line #E4E9F2`,
`--ph-muted #667085`, `--ph-text #20213A`. Thêm `--ph-ink-2 #514A72` từ prototype
cho chữ cấp hai (tài liệu không quy định, ghi nhận là bổ sung).

**Mở rộng baseline — hai token, có lý do đo được:**

| Token | Giá trị | Trên `#FFFFFF` | Trên `--ph-surface` | Lý do |
|---|---|---:|---:|---|
| `--ph-positive` | `#1F7A52` | 5.30:1 | 4.91:1 | Bảng duyệt không có màu dương đủ tương phản cho chữ. `--ph-cyan` chỉ ~1.3:1, không thể viết `+620.000đ`. |
| `--ph-negative` | `#C2453A` | 5.08:1 | 4.71:1 | `--ph-coral` chỉ ~2.5:1, không đạt AA cho chữ. |

`--ph-cyan` và `--ph-coral` giữ vai trò **nền và accent**, không dùng cho chữ.

> **Đã bỏ `--ph-muted-strong`.** Bản trước thêm token này vì cho rằng
> `--ph-muted` chỉ đạt 4.38:1. Con số đó tính trên giá trị **prototype**
> (`#72788F`). Giá trị **tài liệu** (`#667085`) đạt **4.93:1** trên nền trắng và
> **4.57:1** trên `--ph-surface` — vượt ngưỡng AA 4.5:1 ở cả hai nền. Chọn đúng
> nguồn chuẩn thì token phụ trở nên thừa.

> **Sửa lỗi ngưỡng WCAG.** Bản trước viết "chữ ≥ 18px hoặc ≥ 14px bold" là ngưỡng
> chữ lớn — sai, đó là **18pt / 14pt bold**, tức **24px / 18.66px bold**. Với
> `--ph-muted` mới thì không còn phải dựa vào ngưỡng này nữa; quy tắc áp dụng là:
> **mọi chữ mang nghĩa đạt ≥ 4.5:1**, không viện dẫn ngoại lệ chữ lớn.

Ngoài màu: nhịp `4/8/12/16/24/32`; radius `--ph-radius-sm 12px` (control),
`--ph-radius-md 20px` (card lớn), `--ph-radius-lg 28px` (hero) theo mục 2 tài liệu;
shadow nhẹ; focus ring rõ không chỉ dựa vào màu; `--ph-font`.

Sau khi chốt token, chạy lại kiểm tra tương phản trên đủ bốn nền thực tế:
`#FFFFFF`, `--ph-surface`, `--ph-lavender`, và nền gradient indigo của thẻ chia sẻ.

### 3.4 Font

`Montserrat` qua `next/font/google` trong `app/layout.js`:
`subsets: ['latin', 'vietnamese']`, `weight: ['400','500','600','700','800']`,
`display: 'swap'`, xuất biến `--ph-font`. Tự host qua Next. Bỏ `@import` Outfit.

Số liệu dùng `font-variant-numeric: tabular-nums`.

Kiểm tra bắt buộc khi thực thi: dấu tiếng Việt đầy đủ (ơ, ư, ỹ, ặ, ề), tên người
dài nhất trong roster không tràn, và cột tiền thẳng hàng ở màn hình hẹp nhất (320px).

### 3.5 Tầng alias và điều kiện gỡ

`legacy-aliases.css` chia thành **ba nhóm có tên**, mỗi nhóm gỡ độc lập:

| Nhóm | Nội dung | Điều kiện gỡ |
|---|---|---|
| `A · Alias ngữ nghĩa` | `--primary`, `--bg-*`, `--text-*`, `--border-*`, `--success`, `--danger`, `--warning`, `--shadow-*`, `--border-radius-*`, `--focus-ring`, `--font-family` | Khi không còn file CSS nào ngoài `app/giai-dau/` tham chiếu |
| `B · Màu sân xanh` | `--court-*`, `--pickle-*`, `--surface-court*`, `--live-cyan*`, `--rally-coral*` | Khi không còn file nào tham chiếu, kể cả `app/giai-dau/` |
| `C · Gradient cũ` | `--gradient-court-*`, `--gradient-live`, `--gradient-primary`, `--gradient-team-*`, `--gradient-badge` | Cùng điều kiện nhóm B |

**Mốc rà soát:** mỗi spec tiếp theo của chương trình (Quỹ, SePay, Thành viên,
Quản trị, trang chủ) phải kết thúc bằng một bước đo lại số tham chiếu còn lại của
từng nhóm và ghi vào evidence. `legacy-aliases.css` bị xoá trong spec cuối cùng —
spec đó chịu trách nhiệm xoá, không được đẩy tiếp.

Test `ph-design-system` in ra số tham chiếu còn lại mỗi lần chạy, để con số này
luôn nhìn thấy được thay vì bị quên.

### 3.6 Thu gọn `globals.css` — đã kiểm chứng

`globals.css` hiện có 5 rule class ngoài reset: `.app-background`,
`.card-container`, `.card-header`, `.mobile-hidden`, `.desktop-hidden`.

**Đã kiểm: không file `.js` nào trong `app/` hay `components/` tham chiếu bất kỳ
class nào trong số đó** (grep cả dạng chuỗi rời). Chúng là rule chết, xoá không
làm mất giao diện của màn hình nào.

Quy trình bắt buộc khi thực thi, để kết luận này không thành giả định mù: chạy lại
phép đếm tham chiếu ngay trước khi xoá; **bất kỳ rule nào còn được dùng thì
chuyển sang `legacy-aliases.css` nhóm mới `D · Rule legacy`, không xoá.**

## 4. Primitive

### 4.1 Danh mục CSS

| Class | Biến thể | Thay thế |
|---|---|---|
| `ph-btn` | `--primary` `--outline` `--ghost` `--danger`, `--sm` `--block` | `btn-*`, `dk-btn`, `v2-btn-*`, `w3-btn`, `v2share-btn`, `teamfund-submit/cancel` |
| `ph-card`, `ph-panel` | `--flat` `--raised` | `card`, `dk-card`, `v2-card`, `panel`, `filter-card`, `table-card` |
| `ph-metric` | `--indigo` `--gold` `--cyan` `--coral` | `stat-card`, `v2-stat`, `summary-card` |
| `ph-badge`, `ph-chip` | theo trạng thái | `badge-*`, `v2-chip`, `w3-tag`, `status-badge`, `membership-chip` |
| `ph-seg` | segmented control | `tabs`, `tab-btn`, `filter-btn`, `v2-stage-seg`, `ranking-toggle` |
| `ph-table` | desktop dày; **< 768px mỗi hàng thành card** | `members-table`, `table-container`, `v2-standings-table` |
| `ph-modal`, `ph-confirm` | | 4 họ modal |
| `ph-field` | label luôn hiện, lỗi cạnh trường | form rải rác |
| `ph-state` | `loading` `empty` `error` `forbidden` | `roster-state`, `leaderboard-state`, `fund-access-state`, `admin-access-state`, `v2-state`, `w3-state` |
| `ph-skeleton` | `text` `line` `card` `row` | *(chưa tồn tại)* |
| `PhNotificationBell` | chỉ admin | *(chưa tồn tại)* — xem mục 6.9.4 |

### 4.2 Contract component React

CSS không đủ để hiện thực hành vi. Ba primitive sau là **component React** trong
`components/pickhub/`, không phải class suông:

**`<PhModal>`** — `components/pickhub/PhModal.js`
- Mở: chuyển focus vào phần tử focus được đầu tiên trong dialog; nhớ phần tử đang
  focus trước đó.
- Đóng: trả focus về đúng phần tử đã nhớ.
- `Escape` đóng. Click backdrop đóng. Click bên trong không đóng.
- Bẫy focus: `Tab`/`Shift+Tab` quẩn trong dialog.
- `role="dialog"`, `aria-modal="true"`, `aria-labelledby` trỏ tiêu đề.
- Khoá cuộn nền khi mở, khôi phục khi đóng.

**`<PhConfirm>`** — dựng trên `PhModal`
- Nhận `title`, `message`, `confirmLabel`, `tone` (`default` | `danger`), trả Promise.
- Nút huỷ nhận focus mặc định khi `tone="danger"`.
- Là thứ thay `window.confirm()`; xem mục 4.3 về phạm vi áp dụng.

**`<PhSeg>`** — segmented control
- `role="tablist"`, mỗi mục `role="tab"` + `aria-selected`.
- Roving tabindex: chỉ mục đang chọn có `tabIndex=0`.
- Mũi tên trái/phải chuyển mục, `Home`/`End` về đầu/cuối.
- Có `aria-label` mô tả nhóm ("Chọn bảng xếp hạng", "Chọn kỳ").

### 4.3 Phạm vi thay `prompt()` / `confirm()`

Bản trước ghi "thay mọi `confirm()` và `prompt()`" — **vượt phạm vi**, vì các lời
gọi đó nằm ở `/quy/admin` và `/quy/members`, hai màn hình đã được tuyên bố ngoài
phạm vi ở mục 2.

Spec này **xây** `PhModal` / `PhConfirm` và chỉ áp dụng trong màn hình thuộc phạm
vi. BXH không có lời gọi `confirm()` nào, nên trong đợt này component được xây và
kiểm thử nhưng chưa thay chỗ nào. Việc thay ở Quỹ admin, Thành viên và các màn
hình còn lại là **hạng mục tiếp nối**, thuộc spec của từng màn hình.

Quy tắc bắt buộc: mọi màn hình được redesign từ nay không được thêm lời gọi
`window.confirm()` / `window.prompt()` mới.

## 5. App shell và responsive

`components/pickhub/AppShell.js` gom phần shell đang bị lặp ở 4 nơi
(`app/quy/layout.js`, `app/admin/page.js`, `app/thong-tin/page.js`,
`app/giai-dau/layout.js`).

- **Header:** thương hiệu + club switcher + **chuông thông báo (chỉ admin)** + tài khoản.
- **Side rail** (`≥ 1120px`): 5 mục theo vai trò, lấy từ `lib/globalNavigation.js`
  hiện có, không đổi logic vai trò.
- **Bottom nav** (`< 1120px`): giữ nguyên hành vi và thứ tự hiện tại, BXH ở giữa.

### 5.1 Breakpoint và điều hướng

| Dải | Bố cục | Điều hướng chính |
|---|---|---|
| `< 768px` | 1 cột | Bottom nav |
| `768–1119px` | 2 cột | **Bottom nav** (giữ, không có rail) |
| `≥ 1120px` | 3 cột + rail | Side rail |

Bản trước để bottom nav dừng ở `768px` trong khi rail chỉ bắt đầu từ `1120px`, và
header thì đã bỏ link — dải `768–1119px` **không còn đường điều hướng nào**. Sửa
bằng cách kéo bottom nav lên tới `< 1120px`. Biến
`--mobile-bottom-nav-height` và padding-bottom của `body` phải đổi theo cùng mốc.

### 5.2 Chống lặp shell

`app/admin/page.js` và `app/thong-tin/page.js` hiện **tự render** `HomeHeader` và
`MobileBottomNav` bên trong page, trong khi `app/quy` và `app/giai-dau` render ở
`layout.js`. Khi chuyển sang `AppShell`, phải chọn đúng một tầng cho mỗi route và
kiểm không có route nào render hai header. Test điều hướng phải khẳng định điều này.

Hỗ trợ `prefers-reduced-motion`. Focus ring rõ ở mọi control. Touch target ≥ 44px.

## 6. BXH đóng quỹ

### 6.1 Một bảng duy nhất

**BXH đóng góp** — xếp hạng theo **tổng số tiền thành viên đã đóng vào tài khoản
quỹ**, không phân biệt loại khoản.

Lý do bỏ ba bảng: tài khoản này là **tài khoản quỹ chung**, thu mọi loại khoản —
quỹ định kỳ, phí sự kiện, tiền phạt. Quỹ thì ai cũng đóng như nhau và đã có sự
kiện đóng quỹ riêng để theo dõi. Quan trọng hơn, **mỗi CLB một quy chế**, nên bắt
mọi CLB cấu hình đúng nhãn `nop_phat` / `nop_quy` cho từng khoản là không khả thi.
Dữ liệu thật xác nhận điều đó: 42,8tr nằm ở nhãn `khac`, còn `nop_quy` chỉ có 8
giao dịch. Xếp hạng theo tổng tiền là quy tắc **duy nhất chạy đúng cho mọi CLB mà
không cần cấu hình gì**.

| Điều kiện | Giá trị |
|---|---|
| Hướng | `huong_giao_dich = 'in'` |
| Loại khoản | **Mọi `loai_giao_dich`** — không lọc |
| Số tiền | `> 0` |
| Người nộp | **Phải khớp một thành viên trong roster CLB** (mục 6.3) |

Ba metric tóm tắt: **Tổng đóng góp · Số người góp · Số lượt góp**.

`loai_giao_dich` vẫn được giữ nguyên trong database và vẫn hiển thị ở sổ quỹ và
trang quản trị — spec này chỉ thôi dùng nó làm tiêu chí xếp hạng.

**Quy tắc hoà giữ nguyên như code hiện tại:** tiền giảm dần → số giao dịch giảm
dần → tên tăng dần theo `localeCompare(…, 'vi')`.

#### 6.1.1 Khoản lớn bất thường

Trên dữ liệu thật, hạng 1 hiện là một thành viên với **14,2tr**, trong đó có **một
giao dịch 10tr duy nhất** (khớp đúng người, không phải lỗi parser). Hạng 2 chỉ có
4,7tr. Một khoản như vậy làm bảng bị dẹt: mọi người còn lại trông như không đóng gì.

Đây là hệ quả tất yếu của quy tắc "tổng tiền", không phải lỗi. Spec **không tự ý
cắt ngọn hay áp trần** — làm vậy là bịa số. Thay vào đó:

- Thanh tỉ lệ trong danh sách dùng thang **theo hạng 2 trở xuống**, hạng 1 hiển thị
  tràn thang và ghi rõ bội số ("gấp 3,0 lần hạng 2"). Người đọc thấy được chênh
  lệch mà bảng vẫn đọc được.
- Bên cạnh **Tổng đóng góp**, hiển thị thêm **Số lượt góp** ngang hàng về mặt thị
  giác. Đây là chỉ số phản ánh "đều đặn" và không bị một khoản lớn bóp méo.

Việc có nên tách riêng "BXH số lượt" thành một bảng thứ hai hay không để dành cho
spec sau, khi đã có phản hồi thật từ CLB.

### 6.2 Mốc thời gian và múi giờ

Bốn mốc: `week` (từ thứ Hai), `month` (từ ngày 1), `year` (từ 01/01 năm hiện tại),
`all`.

Nhãn hiển thị của `year` là **"Năm nay"**, không phải "Mùa" — vì nó luôn bắt đầu
01/01, gọi là mùa sẽ gây hiểu nhầm là mùa giải.

**Múi giờ chốt là `Asia/Ho_Chi_Minh` (UTC+7, không có DST).** Đây là lỗi tiềm ẩn
thật: `getPenaltyPeriodBounds` hiện dùng `new Date()` theo múi giờ môi trường chạy.
Trình duyệt của thành viên ở UTC+7, còn server sinh ảnh trên Vercel chạy UTC — hai
bên sẽ cắt biên tuần lệch nhau 7 giờ và ra hai bảng khác nhau cho cùng một kỳ.

Quy định:
- Mọi phép cắt kỳ tính theo giờ Việt Nam, bất kể chạy ở client hay server.
- Biên kỳ là `[đầu kỳ 00:00:00.000+07, thời điểm hiện tại]`, đầu kỳ tính theo lịch
  Việt Nam.
- Thời điểm chốt dữ liệu là thời điểm gọi API, hiển thị kèm ("cập nhật lúc …").
- Hàm nhận tham số `now` để test được, mặc định là thời điểm hiện tại.

Giao diện luôn hiện khoảng ngày cụ thể của kỳ đang xem.

### 6.3 Đối chiếu giao dịch với roster

Cơ chế đã có sẵn và spec dựa vào nó: `lib/transaction-parser.js` đối chiếu nội dung
chuyển khoản với `club_members.full_name` và `club_members.aliases` (chuẩn hoá bỏ
dấu, ưu tiên keyword dài hơn), rồi ghi **`full_name` đã phân giải** vào
`quy_pickleball.nguoi_nop`. Không phải ghi chuỗi thô.

**Đối chiếu roster là bộ lọc chính của BXH, không phải một chi tiết phụ.**

Quy tắc: một giao dịch chỉ vào BXH khi `nguoi_nop` **khớp `club_members.full_name`
của cùng CLB** (so sánh không phân biệt hoa/thường, sau chuẩn hoá khoảng trắng).
Không khớp thì không lên bảng.

Bản trước định bộ lọc theo danh sách tên xấu (`Unknown`, `TAI KHOAN GOC`). **Cách
đó không đủ** — dữ liệu thật có 15 chuỗi rác khác nhau dạng `BANKAPINOTIFY …` mà
danh sách đen không bao giờ liệt kê hết. Lọc theo roster là danh sách trắng: chỉ
người có thật trong CLB mới được xếp hạng.

Cũng **không** dùng `parsing_method` hay `confidence_score` làm bộ lọc — đo trên
dữ liệu thật, hai cột này mâu thuẫn với chính chúng (`unknown` + conf 100 là thành
viên thật; `reverse_lookup` + conf 0 khi thì thành viên thật, khi thì `Unknown`).

| Trường hợp | Xử lý |
|---|---|
| `nguoi_nop` là `Unknown` (hoặc chuỗi rác cũ `BANKAPINOTIFY …`, `TAI KHOAN GOC`) | Không khớp roster → không lên bảng, và **vào hàng đợi chờ admin gán** (mục 6.9). Tự động đúng, không cần danh sách đen. |
| `nguoi_nop = 'THỦ QUỸ'` (bút toán thủ công) | Không nằm trong roster → không lên bảng, và **không vào hàng đợi thông báo** (mục 6.9.1). |
| Thành viên **đổi tên** sau khi đã có giao dịch | Giao dịch cũ giữ tên cũ nên không còn khớp roster và **rơi khỏi bảng**. Không truy hồi. Ghi rõ giới hạn này trong ghi chú của trang. |
| Thành viên đã `is_active = false` | Vẫn tính vào bảng nếu có giao dịch trong kỳ — họ đã đóng tiền thật. Chỉ huy hiệu `Trắng tay` mới yêu cầu `is_active`. |

**Ghi chú phải hiển thị trên trang:** một dòng nêu tổng số tiền chiều vào **chưa
vào được bảng** trong kỳ, kèm lối đi tới hàng đợi gán thủ công ở mục 6.9. Hai con
số — tổng trên BXH và số dư ở sổ quỹ — sẽ chênh nhau, và người đọc phải hiểu vì sao.

Bút toán gộp nhiều người vào một dòng (dữ liệu thật có đúng một ca 6,24tr ghi
"Thành + Hưng + Hảo + Long") là **ca hy hữu, không lặp lại**: đó là lần chuyển nhầm
vào tài khoản riêng của admin nên admin chuyển bù lại. Spec vì vậy **không** xây
tính năng chia một giao dịch cho nhiều người. Nếu về sau phát sinh lại thì xử lý
bằng cách tách bút toán ở sổ quỹ.

### 6.4 Streak

Số **kỳ liên tiếp gần nhất** mà thành viên có ít nhất một giao dịch hợp lệ theo
mục 6.1, đếm ngược từ kỳ hiện tại. Đơn vị kỳ theo mốc đang chọn: `week` đếm theo
tuần, `month` đếm theo tháng.

- Mốc `year` và `all` **không hiện streak** — không có đơn vị lặp.
- **Ngưỡng hiển thị: ≥ 2 kỳ.** Dưới ngưỡng không hiện gì.
- **Ngưỡng huy hiệu: ≥ 3 kỳ** (mục 6.5). Hai ngưỡng khác nhau là cố ý: hiện sớm để
  người dùng thấy chuỗi đang hình thành, trao huy hiệu muộn hơn để nó có giá trị.
- Nhãn dùng số động và đúng đơn vị: `Chuỗi 5 tuần` ở mốc tuần, `Chuỗi 3 tháng` ở
  mốc tháng.
- Hiển thị là badge phụ cạnh tên, không thay thế số tiền.

### 6.5 Huy hiệu

Tính lúc hiển thị, không lưu database. Luôn có chữ và nêu kỳ áp dụng.

| Huy hiệu | Điều kiện | Nguồn dữ liệu |
|---|---|---|
| `Quán quân tháng 8` | Hạng 1 của **kỳ hoàn tất gần nhất** (kỳ liền trước kỳ đang xem) | Giao dịch |
| `Chuỗi 5 tuần` | Streak ≥ 3, đơn vị theo mốc đang chọn | Giao dịch |
| `Lần đầu góp quỹ` | Giao dịch **đầu tiên từ trước tới nay** của người đó, và giao dịch đó **nằm trong kỳ đang xem** | Giao dịch |
| `Trắng tay 3 tuần` | Xem 6.5.1 | Giao dịch **+ roster** |

Chi tiết bị bỏ ngỏ ở bản trước, nay chốt:

- **`Quán quân`** hiển thị trên hàng của người đó ở kỳ hiện tại, có tooltip ghi rõ
  kỳ. Chỉ huy hiệu này mới có điều kiện "kỳ đã đóng"; ba huy hiệu còn lại tính trên
  kỳ đang xem. Không thêm bộ chọn kỳ quá khứ trong đợt này.
  Nhãn dùng chữ trung tính "Quán quân" chứ không phải "Vua nộp phạt" — vì bảng
  không còn phân biệt loại khoản, gọi là nộp phạt sẽ sai với đa số CLB.
- **`Lần đầu góp quỹ`** xét trên mọi giao dịch hợp lệ theo mục 6.1 — nghĩa là lần
  đầu người đó có mặt trong sổ quỹ. Chỉ hiện khi giao dịch đầu tiên đó rơi vào kỳ
  đang xem, nên nó tự biến mất ở kỳ sau. Ở mốc `all` không hiện (mọi người đều có
  "lần đầu" trong kỳ này).

#### 6.5.1 `Trắng tay` — quyết định sản phẩm, giữ nguyên

Huy hiệu này đi ngược nguyên tắc trải nghiệm số 5 trong `UI-BRAND-SYSTEM.md`
("cộng đồng trước thành tích, không tạo cảm giác phán xét"). Vấn đề đã được nêu
với người phụ trách sản phẩm và **quyết định giữ đã được tái khẳng định**: tinh
thần "cay cú" là thứ tạo tương tác trong CLB phong trào. Ghi nhận là **ngoại lệ có
chủ ý**, không phải sơ suất.

Quy tắc kỹ thuật:

- Chỉ đếm **kỳ đã hoàn tất**. Kỳ hiện tại chưa kết thúc, không được tính là trắng tay.
- Chỉ xét thành viên có `is_active = true` **và** có ít nhất một giao dịch trong
  lịch sử — người mới vào CLB chưa từng đóng lần nào không bị gắn nhãn. Mốc bắt đầu
  đếm là giao dịch đầu tiên của người đó.
- Chỉ gắn cho thành viên khớp chắc chắn với roster (mục 6.3).
- Ở mốc `year` và `all` không hiện — không có đơn vị kỳ lặp.
- Người bị gắn nhãn nhưng không có giao dịch trong kỳ **không xuất hiện trong bảng
  xếp hạng** (họ không có số tiền để xếp hạng). Họ nằm ở **một khu riêng bên dưới
  bảng**, tiêu đề trung tính: "Chưa góp quỹ kỳ này".
- Nhãn hiển thị giữ chữ `Trắng tay 3 tuần` theo ý người phụ trách sản phẩm.
  Mô tả cho trình đọc màn hình (`aria-label`) dùng câu trung tính:
  "Chưa đóng quỹ trong 3 tuần". Không dùng chữ "phạt" trong bất kỳ biến thể nào.
- Trưởng nhóm có công tắc tắt. Mặc định bật.

**Về đề xuất đổi hẳn nhãn thành "Chưa đóng quỹ trong 3 tuần":** không đổi. Câu đó
đúng về mặt mô tả nhưng làm mất chính thứ mà người phụ trách sản phẩm muốn. Giải
pháp đã chọn — nhãn vui ở phần nhìn, câu trung tính ở phần trợ năng, cộng công tắc
tắt — giữ được cả hai mà không phải chọn một.

#### 6.5.2 Công tắc và cách đọc

Lưu ở `groups.shame_badges_enabled`.

- **Ghi:** `PATCH /api/club/settings`, giữ nguyên yêu cầu quyền admin.
- **Đọc:** **không** qua `GET /api/club/settings` — endpoint đó yêu cầu admin
  (`requireValidatedGroupAdmin`), nên thành viên thường sẽ không đọc được và BXH
  của họ sẽ luôn rơi về mặc định.
  Cờ được trả kèm trong `GET /api/club/branding`, endpoint đã có, đã group-scoped,
  và đã dành cho mọi phiên hợp lệ. Chỉ thêm đúng trường boolean này — không mở
  thêm trường nhạy cảm nào khác.

### 6.6 Đọc đủ dữ liệu

`GET /api/club/transactions` hiện gọi `.select('*')` không phân trang. **Đây không
phải bằng chứng dữ liệu về đủ:** PostgREST/Supabase áp trần số hàng trả về (mặc
định 1.000) và cắt âm thầm, không báo lỗi.

Đo trên dữ liệu thật: CLB `group_id=1` đang có **686 giao dịch**, tích luỹ từ
`2026-01-15`, tức khoảng **86 giao dịch/tháng**. Với nhịp đó, trần 1.000 hàng sẽ bị
chạm trong khoảng **4 tháng tới**. Khi đó "Tổng đóng góp", streak và "Lần đầu góp
quỹ" sẽ **sai âm thầm**, không có thông báo lỗi nào.

Bắt buộc trong đợt này, không hoãn:

1. Xác minh trần thực tế của project bằng một truy vấn đếm so với số hàng nhận được.
2. Bảo đảm đọc đủ theo một trong hai cách, chọn khi thực thi và ghi lý do:
   - phân trang bằng `.range()` cho tới hết, hoặc
   - endpoint tổng hợp phía server trả sẵn số liệu BXH.
3. Thêm test dựng > 1.000 hàng giả và khẳng định kết quả không bị cắt.
4. Route sinh ảnh dùng **cùng một đường đọc dữ liệu** với giao diện, để ảnh và
   trang không bao giờ lệch nhau.

### 6.7 Bố cục và trạng thái

Thứ tự mobile-first: tiêu đề kỳ → `PhSeg` bốn mốc thời gian (mặc định "Tuần này")
→ **ba** `ph-metric` (Tổng đóng góp · Số người góp · Số lượt góp) → podium ba hạng
đầu → danh sách hạng 4 trở đi → ghi chú tiền không vào được bảng (mục 6.3) → khu
"Chưa góp quỹ kỳ này" (nếu bật) → nút chia sẻ.

Không còn bộ chọn bảng — chỉ còn một bảng duy nhất, nên `PhSeg` dùng cho **mốc
thời gian**. Đây là control duy nhất trên trang, không có chip riêng nữa.

**Podium khi thiếu người:** 2 người → hiện 2 bục, không dựng bục rỗng. 1 người →
không dùng podium, hiện một thẻ "Người duy nhất góp quỹ kỳ này". 0 người → trạng
thái rỗng, không hiện podium.

**Bảng dữ liệu đọc được:** toàn bộ thứ hạng — gồm cả top 3 đang nằm trên podium —
phải có mặt trong một bảng tuyến tính đọc được bằng trình đọc màn hình. Podium là
lớp trang trí chồng lên, không được là nơi duy nhất chứa top 3.

| Trạng thái | Thể hiện |
|---|---|
| Đang tải | `ph-skeleton`: khối podium + 3 hàng, đúng hình khối nội dung thật |
| Rỗng theo kỳ | "Kỳ này chưa ai đóng góp" + gợi ý đổi mốc |
| Rỗng toàn cục | "CLB chưa có giao dịch nào" + lối đi tới hướng dẫn thu quỹ |
| Lỗi tải | `ph-state error` + nút thử lại |
| Hết phiên | `ph-state forbidden` + lối về nhập Mã CLB |
| Đang sinh ảnh | Nút chia sẻ ở trạng thái chờ, không khoá cả trang |

Màu và icon không bao giờ là tín hiệu duy nhất.

### 6.8 Thẻ chia sẻ

`GET /api/club/bxh/share-image` — contract đầy đủ:

| Mục | Quy định |
|---|---|
| Quyền | Bắt buộc phiên CLB hợp lệ. Không có phiên → `403`. |
| Scope dữ liệu | **Server tự lấy `group_id` từ phiên**, không nhận `group_id` từ tham số. Client không thể trỏ sang CLB khác. |
| Tham số | `period` ∈ {`week`,`month`,`year`,`all`}. Giá trị ngoài danh sách → `400`, không rơi về mặc định im lặng. Không có tham số `board` — chỉ còn một bảng. |
| Tính toán | Server tự tính lại từ dữ liệu, dùng chung đường đọc ở mục 6.6. Không nhận số liệu do client gửi lên. |
| Múi giờ | `Asia/Ho_Chi_Minh`, giống hệt giao diện. |
| Cache | `Cache-Control: private, no-store`. Tuyệt đối không cache dùng chung — ảnh chứa tên thật và số tiền của một CLB cụ thể. |
| Phản hồi | `image/png`, kèm `Content-Disposition: attachment` với tên file chứa mã CLB và kỳ. |

Thiết kế thẻ theo quy tắc *Share card* trong brand doc: nền gradient `--ph-indigo`,
huy hiệu `--ph-gold`, chữ trắng. Nội dung: tên CLB, kỳ đang xem, top 1, hai hạng
kế tiếp, một chỉ số tổng, dấu hiệu PickHub. Phương án nền `--ph-ink` đã bị loại.

**Không tạo link công khai.** Lý do cụ thể: khi rà soát phát hiện
`app/api/club/events/[id]/route.js` GET không kiểm phiên và dùng `supabaseAdmin`
trực tiếp — ai có UUID sự kiện đọc được tên thật và tình trạng đóng tiền của mọi
thành viên ở bất kỳ CLB nào. Lỗ hổng có sẵn, đang xử lý ở nhánh riêng, và là lý do
rõ ràng để không nhân bản mô hình "link công khai đọc dữ liệu quỹ".

### 6.9 Giao dịch chưa rõ người nộp — thông báo và gán thủ công

Bộ lọc roster ở mục 6.3 làm BXH đúng, nhưng nó **đẩy tiền ra khỏi bảng chứ không
giải quyết**. Mục này là cơ chế đóng vòng lặp đó.

#### 6.9.1 Chuẩn hoá về một giá trị `Unknown`

**Đổi cách ghi khi không nhận diện được người nộp.** Hiện tại parser ghi nguyên
nội dung ngân hàng vào `nguoi_nop` (`BANKAPINOTIFY NOP TIEN QUY 3`, và 14 chuỗi
khác nhau), khiến rác trông như tên người. Từ nay **mọi ca không khớp đều ghi đúng
một giá trị `Unknown`**, rồi admin gán lại thủ công.

Đây là **sửa đổi có chủ ý** đối với ràng buộc "không đổi cách parser gán
`nguoi_nop`" ở mục 2.1 — theo chỉ đạo sản phẩm, và đã ghi bổ sung vào bảng mở rộng
của mục đó.

- **Giá trị lưu trong database giữ nguyên chuỗi `Unknown`**, không đổi sang tiếng
  Việt. Lý do: 7 dòng hiện có đã dùng `Unknown`, và code lọc hiện tại đã nhận biết
  `Unknown`/`UNKNOWN`. Đổi chuỗi sentinel chỉ để đẹp sẽ phá cả hai.
- **Giao diện hiển thị “Không rõ”.** Việc dịch nằm ở lớp hiển thị.
- **Không mất thông tin.** Nội dung chuyển khoản gốc vẫn nằm nguyên vẹn ở
  `noi_dung_goc`, và đó mới là thứ admin cần để đoán ra người nộp. Đã đối chiếu:
  `noi_dung_goc` luôn đầy đủ hơn chuỗi rác trong `nguoi_nop` (chuỗi đó còn bị cắt
  ở 50 ký tự).

**Điều kiện “chưa gán”** để đưa vào hàng đợi: `huong_giao_dich = 'in'`,
`so_tien > 0`, và `nguoi_nop` **không khớp** thành viên nào trong roster CLB.

Vẫn giữ bộ lọc theo roster chứ không chỉ so với chuỗi `Unknown`, vì 15 chuỗi rác
cũ đang tồn tại trong database sẽ không tự biến mất. Sau khi chuẩn hoá và dọn tồn
đọng, hai điều kiện này hội tụ về cùng một tập.

Không dùng `parsing_method` hay `confidence_score` làm điều kiện — đã chứng minh ở
mục 1.1 là không đáng tin.

**Bút toán thủ công của trưởng nhóm (`nguoi_nop = 'THỦ QUỸ'`) không vào hàng đợi.**
Admin tự tạo những dòng đó và biết rõ chúng là gì; báo lại cho chính họ là nhiễu.
Chúng vẫn nằm ngoài BXH như mục 6.3.

**Dọn tồn đọng — chạy một lần, có kiểm chứng.** Migration `043` kèm một bước dữ
liệu: đặt `nguoi_nop = 'Unknown'` cho các giao dịch chiều vào **không khớp roster**
và hiện đang mang chuỗi rác. Bắt buộc: đếm trước và đếm sau, ghi cả hai vào
evidence; chỉ đụng đúng `group_id` liên quan; **không** đụng dòng nào đã khớp
roster. Bước này chạy tách khỏi phần DDL để có thể dừng lại mà không mất schema.

#### 6.9.2 Bảng `club_notifications`

`tournament_notifications` **không dùng lại được**: cột `tournament_id` là
`NOT NULL` và tham chiếu `tournaments`, nên không chứa được thông báo cấp CLB.
Tạo bảng riêng, cấp CLB, cố ý thiết kế tổng quát để các loại việc cần xử lý sau này
dùng chung — không đẻ thêm bảng cho mỗi loại thông báo.

```sql
-- 043_club_notifications_and_bxh_flag.sql  (additive, idempotent)
CREATE TABLE IF NOT EXISTS public.club_notifications (
  id           bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  group_id     bigint NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  kind         text   NOT NULL,                    -- 'unassigned_transaction' là kind đầu tiên
  subject_type text,                               -- 'quy_pickleball'
  subject_id   bigint,                             -- id giao dịch
  payload      jsonb  NOT NULL DEFAULT '{}'::jsonb,
  status       text   NOT NULL DEFAULT 'open',     -- 'open' | 'resolved' | 'dismissed'
  resolved_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_club_notifications_open
  ON public.club_notifications(group_id, status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_club_notifications_subject
  ON public.club_notifications(group_id, kind, subject_type, subject_id)
  WHERE subject_id IS NOT NULL;
```

Unique index theo `subject` là bắt buộc: webhook SePay có thể gửi lại cùng một giao
dịch, và bảng giao dịch đã chống trùng bằng `ma_giao_dich` — thông báo phải chống
trùng tương ứng, nếu không chuông sẽ đếm sai.

Cùng migration thêm cột công tắc huy hiệu ở mục 6.5.2:
`ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS shame_badges_enabled boolean NOT NULL DEFAULT true;`

Bước dữ liệu dọn tồn đọng ở mục 6.9.1 chạy **sau** và **tách khỏi** khối DDL trên,
để nếu phải dừng thì schema vẫn nguyên vẹn.

**Số hiệu migration là `043`.** Các số `038`–`042` đã bị chiếm bởi công việc chưa
commit của session khác (`038_phase3_atomic_entries_pair_confirm` …
`042_open_registration`). Kiểm lại số trống ngay trước khi tạo file.

#### 6.9.3 Sinh thông báo

**Thông báo chỉ sinh cho một việc duy nhất: giao dịch không gán được thành viên.**
Không có thông báo cho giao dịch bình thường, không có thông báo “đã nhận tiền”,
không tóm tắt định kỳ. Chuông là hàng đợi việc cần xử lý, không phải dòng thời gian.
Mỗi loại thông báo mới sau này phải qua một quyết định riêng, không tự thêm.

Hai đường sinh, cả hai đều cần vì một mình đường nào cũng không đủ:

1. **Lúc webhook ghi giao dịch** (`app/api/webhook/route.js`, ngay sau khi insert
   thành công): nếu không khớp roster — tức `nguoi_nop` vừa được ghi là `Unknown`
   theo mục 6.9.1 — thì chèn một `club_notifications` kind `unassigned_transaction`.
   Không đổi phản hồi webhook.
   Lỗi khi ghi thông báo **không được làm hỏng việc ghi giao dịch**: bọc try/catch,
   ghi log, trả `200` như cũ. Tiền vào sổ quan trọng hơn cái chuông.
2. **Đối soát bù** khi admin mở hàng đợi: quét các giao dịch chiều vào chưa khớp
   roster mà chưa có thông báo `open`, tạo bổ sung. Đường này bắt được **28 giao
   dịch tồn đọng có sẵn** trong dữ liệu hiện tại và mọi ca webhook lỗi.

Thông báo tự chuyển `resolved` khi giao dịch đã khớp roster — kiểm lại lúc đọc, để
không phụ thuộc vào việc màn hình gán nhớ đóng thông báo.

#### 6.9.4 Chuông trên header

`<PhNotificationBell>` trong `AppShell`, **chỉ hiển thị cho `role = 'admin'`** —
đây là việc của trưởng nhóm, không phải của thành viên.

- Badge đếm thông báo `status = 'open'`. Không có thì không hiện badge.
- Bấm mở panel thả xuống; mỗi dòng nêu **việc cần làm**, không phải tin tức:
  số tiền, ngày, nội dung chuyển khoản gốc, và nút **“Gán cho thành viên”**.
- Panel dùng contract bàn phím của `PhModal` (Escape đóng, trả focus, bẫy focus).
- Không polling liên tục: tải khi mở không gian quản trị và khi mở panel. Nếu cần
  làm mới định kỳ thì dùng `lib/pollingBackoff.js` đã có, không tự viết vòng lặp.
- Đã xem **không** đồng nghĩa đã xử lý. Badge chỉ giảm khi giao dịch được gán hoặc
  thông báo bị bỏ qua có chủ ý.

#### 6.9.5 Màn hình gán thủ công

Mở từ chuông, dựng trên `PhModal`:

- Hiện nguyên văn `noi_dung_goc`, số tiền, ngày, mã giao dịch — admin cần đủ dữ
  kiện để đoán đúng người.
- Chọn thành viên từ roster đang sinh hoạt, có ô tìm kiếm.
- Hai lựa chọn phụ: **“Bỏ qua”** (thông báo `dismissed`, giao dịch vẫn nằm ngoài
  BXH — dùng cho tiền không phải đóng góp cá nhân, ví dụ tài trợ hay hoàn tiền), và
  **“Chia cho nhiều người”** → *ngoài phạm vi đợt này*, hiển thị hướng dẫn tách bút
  toán ở sổ quỹ.
- Ghi bằng `PATCH /api/club/transactions` **đã có sẵn**: `nguoi_nop` nằm trong
  `ALLOWED_UPDATE_FIELDS`, route đã có admin guard và `.eq('group_id', …)`.
  Không tạo route ghi mới.
- Giá trị ghi vào `nguoi_nop` là **`club_members.full_name` đúng nguyên văn**, để
  khớp bộ lọc mục 6.3. Không ghi id, không ghi biệt danh.
- Gán xong: đóng thông báo, BXH tính lại ở lần tải sau. Không cần cập nhật tại chỗ.

**Gợi ý cải thiện lâu dài, không làm ở đợt này:** khi admin gán một giao dịch cho
người X, nội dung chuyển khoản đó là ứng viên tốt cho `club_members.aliases` của X,
giúp parser tự khớp lần sau. Ghi lại làm hạng mục tiếp nối chứ không tự động thêm
alias — thêm sai sẽ gán nhầm tiền của người khác về sau.

## 7. Thứ tự thi công

**Bước 1 — Nền tảng.** Tạo `tokens.css`, `primitives.css`, `legacy-aliases.css`
(3 nhóm có tên); nạp Montserrat; đếm tham chiếu rồi thu gọn `globals.css`; thay
`tests/court-energy-css.test.js` bằng `tests/ph-design-system.test.js`; cập nhật
`UI-BRAND-SYSTEM.md` (2 token mở rộng, `--ph-ink-2`, ghi rõ chênh lệch với prototype).
Kết quả: toàn app đổi màu và font, cấu trúc chưa đổi.

**Bước 2 — Primitive và app shell.** `PhModal`, `PhConfirm`, `PhSeg` kèm test bàn
phím và trợ năng; `AppShell` + `SideRail`; sửa breakpoint bottom nav lên `1120px`;
gỡ shell lặp ở `app/admin/page.js` và `app/thong-tin/page.js`.

> Ràng buộc phối hợp: `app/giai-dau/layout.js` là file duy nhất của module giải đấu
> được phép chạm, chỉ đổi import/JSX của shell. **Không** sửa `v2.css`,
> `wizard.css`, `console.css` hay file nào khác trong `app/giai-dau/` — một session
> khác đang phát triển ở đó.

**Bước 3 — Đường đọc dữ liệu.** Xác minh trần số hàng; hiện thực đọc đủ; test
> 1.000 hàng. Làm trước BXH vì BXH phụ thuộc vào nó.

**Bước 4 — Migration và BXH.** Migration `043` (bảng `club_notifications` + cột
`groups.shame_badges_enabled`), chạy **trước** code dùng đến chúng, cập nhật ledger
bằng `npm run migration:ledger`; mở rộng `lib/fundLeaderboard.js`; thêm cờ vào
`/api/club/branding` và `/api/club/settings`; viết lại `app/quy/bxh/` với từ vựng
“đóng góp”; route sinh ảnh.

**Bước 5 — Thông báo và gán thủ công.** `GET/PATCH /api/club/notifications`; móc
sinh thông báo vào webhook (bọc try/catch, không làm hỏng việc ghi giao dịch); đối
soát bù cho 28 giao dịch tồn đọng; `PhNotificationBell` trong header; màn hình gán
thủ công dựng trên `PhModal`, ghi qua `PATCH /api/club/transactions` đã có.

**Bước 6 — Dọn alias** trong đúng các file đã đụng; ghi số tham chiếu còn lại của
từng nhóm vào evidence.

## 8. Kiểm chứng

### 8.1 Test tự động

| Test | Nội dung |
|---|---|
| `tests/ph-design-system.test.js` *(mới)* | Token đầy đủ đúng giá trị tài liệu; ngoài `legacy-aliases.css` không file nào định nghĩa màu court/pickle; `globals.css` sạch `Outfit`; không có họ class nút/modal mới ngoài `ph-`; **in ra số tham chiếu còn lại của từng nhóm alias**; **không còn chuỗi “nộp phạt” trong copy giao diện thuộc phạm vi spec** |
| `tests/fund-leaderboard.test.js` *(mở rộng)* | Xếp hạng gồm **mọi `loai_giao_dich`** chiều vào; **chỉ tính giao dịch khớp roster** — rác `BANKAPINOTIFY …` bị loại mà không cần danh sách đen; **không** dùng `parsing_method`/`confidence_score` làm bộ lọc; 4 mốc cắt đúng biên theo `Asia/Ho_Chi_Minh`; ngày không hợp lệ bị loại; quy tắc hoà tiền → số lượt → tên `vi`; streak đứt khi thiếu kỳ, tắt ở `year`/`all`, nhãn đúng đơn vị; `Quán quân` chỉ lấy kỳ hoàn tất gần nhất; `Lần đầu góp quỹ` chỉ hiện khi giao dịch đầu tiên thuộc kỳ đang xem và không hiện ở `all`; `Trắng tay` chỉ tính kỳ hoàn tất, chỉ `is_active`, bỏ qua người mới chưa từng đóng, bỏ qua khi không khớp roster; ghi chú tiền không vào được bảng tính đúng tổng bị loại; loại `Unknown` / `TAI KHOAN GOC` / `THỦ QUỸ` / tiền ≤ 0; công tắc tắt có hiệu lực |
| `tests/ph-components.test.js` *(mới)* | `PhModal`: focus vào khi mở, trả focus khi đóng, `Escape`, bẫy `Tab`, `aria-modal`. `PhSeg`: roving tabindex, mũi tên, `Home`/`End`, `aria-selected`. `PhNotificationBell`: chỉ render cho `admin`, badge đếm đúng số `open`, không badge khi rỗng |
| `tests/club-notifications.test.js` *(mới)* | Parser không khớp → ghi đúng `Unknown`, **không** ghi nội dung ngân hàng; `noi_dung_goc` vẫn đủ; điều kiện “chưa gán” trùng khớp bộ lọc BXH; unique index chặn thông báo trùng khi webhook gửi lại; lỗi ghi thông báo **không** làm webhook trả khác `200`; đối soát bù tạo đúng số thông báo cho giao dịch tồn đọng; gán `nguoi_nop` xong thì thông báo chuyển `resolved`; **`THỦ QUỸ` không vào hàng đợi**; **không sinh thông báo cho giao dịch khớp được**; member không đọc/không sửa được thông báo của CLB; phiên CLB A không thấy thông báo CLB B |
| `tests/transactions-completeness.test.js` *(mới)* | Dựng > 1.000 hàng, khẳng định đường đọc trả đủ và không cắt âm thầm |
| `tests/global-navigation.test.js`, `tests/mobile-bottom-tabs.test.js` *(cập nhật)* | Side rail đúng 5 mục theo vai trò; bottom nav hiển thị tới `< 1120px`; **không route nào render hai header** |
| `tests/bxh-share-image.contract.test.js` *(mới)* | Không phiên → 403; `period` sai → 400; **phiên CLB A không lấy được dữ liệu CLB B**; phiên hết hạn → 403; header `no-store`; PNG hợp lệ với tiếng Việt có dấu; trường hợp < 3 người |
| `npm run migration:ledger` | Ledger khớp checksum sau migration mới |
| `package.json` | Gỡ `test:court-energy-css` khỏi `test:regression`; thêm `test:ph-ui` |

Quyền cần test riêng: member **không** sửa được `shame_badges_enabled`; admin chỉ
sửa được CLB của mình; member **đọc** được cờ qua `/api/club/branding`.

### 8.2 Smoke thủ công

Đổi CSS và font chạm mọi màn hình, nên không thể chỉ kiểm BXH.

- **Màn hình phải mở lại sau bước 1:** `/`, `/quy`, `/quy/bxh`, `/quy/members`,
  `/quy/admin`, `/quy/su-kien/[id]`, `/admin` (cả 3 section), `/thong-tin`, `/dk`,
  `/giai-dau` và một trang giải công khai. Kiểm không vỡ bố cục, không mất chữ,
  không mất tương phản.
- **Biên breakpoint:** `767 / 768 / 1119 / 1120px` — đặc biệt kiểm dải
  `768–1119px` có đúng một đường điều hướng.
- **Bàn phím:** đi hết BXH bằng `Tab`, mở/đóng modal, chuyển `PhSeg` bằng mũi tên,
  focus ring luôn nhìn thấy.
- **Vai trò:** `member` và `admin`, mỗi vai trò một lượt. Kiểm chuông **không** hiện với `member`.
- **Dữ liệu:** một lần tải ảnh chia sẻ thật; một kỳ rỗng (tuần chưa ai đóng); một
  lần ở mốc `all` sau khi hiện thực đọc đủ; đối chiếu tổng trên trang với truy vấn
  SQL trực tiếp để chắc bộ lọc roster không cắt nhầm.

Evidence ghi vào `docs/pickhub-core/evidence/` theo `DELIVERY-GOVERNANCE.md`.

## 9. Rủi ro và giả định

| Mục | Nội dung |
|---|---|
| Rủi ro | Đổi màu chủ đạo sang indigo là thay đổi **nhìn thấy được** với CLB đang dùng thật. Báo trước cho trưởng nhóm, không deploy im lặng. |
| Rủi ro | Trần 1.000 hàng sẽ bị chạm trong ~4 tháng. Giảm thiểu ở bước 3, không hoãn. |
| Rủi ro | Session khác đang sửa `app/giai-dau/`. Giảm thiểu bằng ràng buộc chỉ chạm 1 file layout. |
| Rủi ro | Tầng alias có thể bị coi là vĩnh viễn. Giảm thiểu bằng 3 nhóm có điều kiện gỡ riêng, số tham chiếu in ra mỗi lần chạy test, và spec cuối chịu trách nhiệm xoá. |
| Rủi ro | Huy hiệu `Trắng tay` có thể gây khó chịu trong một số CLB. Giảm thiểu bằng công tắc tắt của trưởng nhóm và ràng buộc chỉ gắn khi khớp roster chắc chắn. |
| Rủi ro | Bộ lọc roster làm ~29% tiền chiều vào không lên BXH (rác parser, bút toán gộp). Con số tổng trên BXH sẽ **nhỏ hơn** số dư ở sổ quỹ. Giảm thiểu bằng ghi chú tường minh ở mục 6.3 — tuyệt đối không để hai con số chênh nhau mà không giải thích. |
| Giả định | Vai trò và điều hướng lấy nguyên từ `lib/globalNavigation.js`, không thiết kế lại quyền. |
| Giả định | `club_members.aliases` đủ phủ các biến thể tên mà thành viên dùng khi chuyển khoản. Nếu không, người đó rơi vào `Unknown` và đã bị loại sẵn — không sinh huy hiệu sai. |

## 10. Tiêu chí hoàn thành

1. **Không file nào ngoài `legacy-aliases.css` *định nghĩa* màu sân xanh hoặc font
   `Outfit`.** Phân biệt rõ: *định nghĩa* token bị cấm hoàn toàn; *tham chiếu*
   `var(--court-*)` từ các màn hình chưa redesign (gồm toàn bộ `app/giai-dau/`)
   được tạm giữ và có điều kiện gỡ ở mục 3.5. Bản trước viết "không còn màu sân
   xanh ở bất kỳ file nào" — mâu thuẫn với chính việc giữ alias và cấm sửa CSS giải
   đấu; đã sửa.
2. Không còn màu hardcode dạng `#rrggbb` trong các file CSS thuộc phạm vi spec này
   (`app/styles/*`, `app/quy/bxh/*`, `components/pickhub/*`); mọi màu đi qua token.
3. `/quy/bxh` chạy đúng một bảng tổng đóng góp lọc theo roster, 4 mốc, streak, huy
   hiệu, ghi chú tiền không vào bảng, khu "Chưa góp quỹ kỳ này", và tải được ảnh
   chia sẻ. Không còn chữ “nộp phạt” trong copy giao diện.
4. Chuông thông báo hiện cho admin, đếm đúng việc cần xử lý; gán thủ công một giao
   dịch tồn đọng thật xong thì nó lên BXH đúng người ở lần tải sau.
5. App shell mới áp cho cả 4 nơi; rail ở `≥ 1120px`; bottom nav tới `< 1120px`;
   không route nào có hai header.
6. Đường đọc giao dịch chứng minh được là đủ ở > 1.000 hàng.
7. `npm run test:regression` xanh với bộ test đã cập nhật; smoke thủ công mục 8.2
   có evidence.
8. `UI-BRAND-SYSTEM.md` đã ghi 2 token mở rộng, chênh lệch với prototype, từ vựng
   “đóng góp” và quy tắc chuông; tài liệu và code không còn mâu thuẫn.
