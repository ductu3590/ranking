# Thiết kế: Onboarding admin CLB lần đầu + Cấu hình SePay cho người không rành CNTT

- **Ngày:** 2026-09-14
- **Trạng thái:** Thiết kế — chưa thực thi, chưa apply migration
- **Sửa đổi 2026-09-14 (lần 2):** việt hoá 100% giao diện (§3.17), **đổi cơ chế xác minh sang "Gửi thử" của SePay** thay cho chuyển tiền thật (§3.5) — bỏ được bảng phiên ghép nối, RPC và cột `is_pairing_probe`
- **Sửa đổi 2026-09-14 (lần 3):** tách màn giới thiệu (thuyết phục, không ô nhập) khỏi màn thiết lập (§3.3–3.4, §3.15); lợi ích viết thành danh sách tích xanh; bốn bước chuẩn bị dùng icon tượng hình; **gỡ thông tin ưu đãi VPBank vì không kiểm chứng được** và rút gọn copy tư vấn gói (§3.1)
- **Mockup:** `_workspace/mockup-onboarding-sepay-2026-09-14.html`
- **Liên quan:** `app/admin/ClubSettings.js`, `app/api/webhook/route.js`, `app/api/club/settings/route.js`, `app/api/club/bank-accounts/route.js`

---

## 1. Bối cảnh

### 1.1 Hôm nay chuyện gì xảy ra khi một CLB mới được tạo

`POST /api/groups` (`app/api/groups/route.js:99-110`) chèn **đúng một dòng** vào bảng `groups` rồi cấp phiên admin. Không tạo danh sách thành viên, không tài khoản ngân hàng, không logo, không QR quỹ, không cấu hình gì khác.

Admin bấm "Vào trang quản trị" (`app/page.js:518-530`) → rơi vào `/admin`, là một trang **cấu hình 7 section** (`set-brand`, `set-code`, `set-qr`, `set-pw-admin`, `set-pw-member`, `set-sepay`, `set-bank`) với toàn bộ ô nhập trống rỗng. Không có một dòng hướng dẫn nào nói nên làm gì trước.

Với đối tượng người dùng thật của PickHub — trưởng nhóm CLB pickleball phong trào, phần lớn không làm CNTT — đây là một bức tường.

### 1.2 Điểm đau nặng nhất: SePay

Section `#set-sepay` hiện tại (`app/admin/ClubSettings.js:339`) yêu cầu admin tự làm ba việc khó:

1. **Tự nghĩ ra một chuỗi ≥ 16 ký tự làm webhook secret.** Không có nút sinh tự động. Người dùng phổ thông sẽ gõ `12345678901234567890` hoặc tên CLB lặp lại.
2. **Tự sang SePay cấu hình HMAC-SHA256.** Hướng dẫn hiện tại là 4 gạch đầu dòng chữ, không ảnh, không biết màn hình SePay trông thế nào.
3. **Tự gõ đúng số tài khoản** ở section `#set-bank` bên cạnh — một ô `<input>` trống, không validate, không đối chiếu.

**Hỏng thì im lặng hoàn toàn.** Nếu gõ sai số tài khoản, `/api/webhook` trả `422 Unknown bank account` cho SePay. Admin không thấy gì cả: không lỗi, không cảnh báo, không log. Quỹ đơn giản là không bao giờ tự cập nhật. Không có nút "Kiểm tra kết nối" nào để biết mình sai ở đâu.

**Và nếu bỏ trống secret thì bảo mật tắt hẳn.** `verifySePaySignature()` (`app/api/webhook/route.js:99-102`):

```js
function verifySePaySignature(req, rawBody, sepayWebhookSecret) {
    if (!sepayWebhookSecret) return null;   // <-- bỏ qua TOÀN BỘ xác thực
    ...
}
```

Vì `/api/webhook` là endpoint công khai, bất kỳ ai biết số tài khoản CLB đều `curl` được một giao dịch giả vào quỹ. Thiết kế hiện tại khiến "không cấu hình gì" là con đường ít trở lực nhất, và con đường đó lại chính là con đường không an toàn.

### 1.3 Kết quả mong muốn

Trưởng nhóm mở PickHub lần đầu:

- Biết ngay **5 việc** cần làm, làm xong từng việc thấy tick xanh, tiến độ hiện rõ.
- Riêng SePay: **không phải tự nghĩ khoá bảo mật**, **không phải chuyển tiền thật để thử**. Chỉ copy/dán hai dòng chữ sang SePay rồi bấm **Gửi thử**.
- Mọi CLB đi qua luồng mới đều **có secret** — thoát khỏi trạng thái webhook không xác thực.

---

## 2. Phần A — Onboarding lần đầu

### 2.1 Hình thái: wizard chào mừng một lần + checklist thường trực

| | Wizard chào mừng | Checklist thường trực |
|---|---|---|
| **Khi nào hiện** | Lần đầu admin vào `/admin` hoặc `/quy`, khi `onboarding_seen_at IS NULL` | Mọi lần vào `/admin` và `/quy`, cho tới khi hoàn tất hoặc admin bấm ẩn |
| **Hình thức** | Modal 3 bước trên nền `PhModal` | Thẻ `ph-card` đặt đầu trang |
| **Bỏ qua được?** | Có — nút "Để sau", đóng bằng Esc/backdrop; đóng kiểu nào cũng ghi `mark_welcome_seen` | Có — nút "Ẩn checklist", bật lại từ `/admin` |
| **Ép buộc?** | Không | Không |

Lý do không ép: admin thường tạo CLB để **xem thử** trước khi mời người thật. Chặn đường vào hệ thống bằng một wizard bắt buộc là cách nhanh nhất để mất người dùng.

### 2.2 Nguyên tắc trạng thái: suy ra, đừng lưu

Năm trong sáu bước **suy ra được từ dữ liệu thật** — không cần lưu trạng thái, không bao giờ lệch:

| Bước | `key` | Nguồn sự thật |
|---|---|---|
| Nhận diện CLB (logo, tên) | `identity` | `groups.logo_url IS NOT NULL` |
| Thành viên đầu tiên | `roster` | `count(club_members WHERE group_id AND is_active) > 0` |
| QR nhận quỹ | `fund_qr` | `groups.fund_qr_url IS NOT NULL` |
| Kết nối SePay | `sepay` | `EXISTS(group_bank_accounts is_active)` **và** `groups.sepay_webhook_secret IS NOT NULL` |
| Giải đấu đầu tiên | `tournament` | `count(tournaments WHERE group_id) > 0` |

**"Chia sẻ mã CLB" không phải bước có trạng thái.** Đó là hành động bấm một phát, không để lại dấu vết; nếu track bằng cờ riêng thì nó "xong" ngay khi admin mở modal — vô nghĩa. Render nó thành **nút hành động ở header checklist**, không đếm vào tiến độ.

Chỉ còn **hai thứ** không suy ra được, đều là mốc thời gian:

- `onboarding_seen_at` — admin đã xem wizard chào mừng chưa.
- `onboarding_dismissed_at` — admin đã bấm ẩn checklist chưa.

### 2.3 Ba trạng thái của một bước

| `state` | Ý nghĩa | Ví dụ |
|---|---|---|
| `todo` | Chưa làm | Chưa có logo |
| `done` | Xong | Đã có logo |
| `warning` | Gần xong nhưng còn rủi ro thật | Đã có tài khoản ngân hàng **nhưng** `sepay_webhook_secret IS NULL` → webhook đang chạy không xác thực |

Trạng thái `warning` tồn tại chính vì lỗ hổng mô tả ở §1.2. Nó biến một lỗ hổng im lặng thành một việc admin nhìn thấy.

### 2.4 Nơi lưu: hai cột phẳng trên `groups`

**Chốt: `ALTER TABLE groups`, không tạo bảng `group_settings`, không dùng `jsonb`.**

Bác bỏ bảng key-value: quy ước hiện tại của dự án rất rõ — mọi cấu hình cấp CLB đều là cột phẳng (`logo_url`, `fund_qr_url`, `shame_badges_enabled`, `sepay_webhook_secret`, `venue`). `tournament_settings` là key-value vì cấu hình **biến thiên theo từng giải** (N hàng mỗi CLB); cấp CLB chỉ có đúng một hàng, nên bảng key-value chỉ thêm một round-trip, mất kiểu dữ liệu và mất `CHECK`.

Bác bỏ `jsonb`: chỉ có hai sự kiện, cả hai đều là `timestamptz`. `jsonb` mở cửa cho rác không schema và phải validate thủ công bằng JS.

Không thêm `onboarding_completed_at`: "hoàn thành" là hàm thuần của năm bước suy ra được. Lưu lại là tạo nguồn sự thật thứ hai có thể lệch.

```sql
-- database/migrations/053_group_onboarding_state.sql
-- Trạng thái "thiết lập CLB lần đầu" cấp CLB.
--
-- Nguyên tắc: KHÔNG lưu trạng thái của những bước suy ra được từ dữ liệu thật
-- (logo, danh sach thanh vien, QR quy, tai khoan ngan hang, giai dau) — suy ra tại thời điểm đọc
-- trong app/api/club/onboarding/route.js. Chỉ lưu 2 sự kiện thuần UI không suy ra được.
--
-- Additive & idempotent: chỉ ADD COLUMN IF NOT EXISTS, không DROP/TRUNCATE.
-- groups.id là bigint (xem 007); ở đây không tạo bảng con nên không cần FK.

BEGIN;

ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS onboarding_seen_at timestamptz;

ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS onboarding_dismissed_at timestamptz;

COMMENT ON COLUMN public.groups.onboarding_seen_at IS
  'Lan dau truong nhom xem wizard chao mung. NULL = chua xem, app se tu mo wizard.';
COMMENT ON COLUMN public.groups.onboarding_dismissed_at IS
  'Thoi diem truong nhom bam an checklist. NULL = checklist van hien khi chua hoan tat.';

-- CLB đã vận hành trước tính năng này coi như đã xem wizard: không làm phiền họ.
-- Điều kiện "đã có dữ liệu thật" = đã có thành viên, tránh đánh dấu nhầm CLB vừa tạo.
UPDATE public.groups g
   SET onboarding_seen_at = COALESCE(g.onboarding_seen_at, now())
 WHERE g.onboarding_seen_at IS NULL
   AND EXISTS (SELECT 1 FROM public.club_members cm WHERE cm.group_id = g.id);

COMMIT;
```

Sau khi apply: chạy `npm run migration:ledger` như quy trình hiện có.

> **Ghi chú về hai file trùng số 045.** `lib/migrationLedger.js` khoá theo **filename** (`ON CONFLICT (filename) DO NOTHING`) và chỉ *báo cáo* `duplicateVersions` chứ không fail. **Không đổi tên 045 cũ** — chúng đã apply, đổi tên sẽ sinh hàng ledger trùng. Chỉ cần 053 là số mới duy nhất.

### 2.5 API: route mới `app/api/club/onboarding/route.js`

**Không nhét vào `/api/club/settings`** vì ba lý do:

1. `GET /api/club/settings` gọi `QRCode.toDataURL()` **mỗi lần** (ảnh 320px + payload data-URL lớn). Checklist được fetch ở nhiều trang — không được kéo theo chi phí đó.
2. `GET onboarding` là truy vấn **aggregate 4 bảng**, bản chất khác `settings` (1 bảng).
3. `PATCH settings` là allowlist cột cấu hình nghiệp vụ; trộn cờ UI-state vào sẽ làm `safeGroupForClient` và phần validate phình ra.

Guard: `requireValidatedGroupAdmin()` cho **cả** GET lẫn PATCH — checklist là màn hình quản trị.

#### `GET /api/club/onboarding` → 200

```json
{
  "onboarding": {
    "visible": true,
    "hasSeenWelcome": false,
    "dismissedAt": null,
    "completedCount": 2,
    "totalCount": 5,
    "isComplete": false,
    "steps": [
      {
        "key": "identity",
        "title": "Thêm logo và kiểm tra tên CLB",
        "description": "Logo hiển thị trên trang chủ và ảnh chia sẻ.",
        "done": true,
        "state": "done",
        "href": "/admin#set-brand",
        "cta": "Xem lại"
      },
      {
        "key": "roster",
        "title": "Thêm thành viên đầu tiên",
        "description": "Có danh sách thành viên thì quỹ mới tự nhận ra ai vừa chuyển tiền.",
        "done": true,
        "state": "done",
        "meta": { "memberCount": 12 },
        "href": "/thanh-vien",
        "cta": "Quản lý thành viên"
      },
      {
        "key": "fund_qr",
        "title": "Tải ảnh QR nhận quỹ",
        "description": "Thành viên quét QR này để chuyển tiền vào quỹ CLB.",
        "done": false,
        "state": "todo",
        "href": "/admin#set-qr",
        "cta": "Tải ảnh QR"
      },
      {
        "key": "sepay",
        "title": "Bật thu quỹ tự động qua SePay",
        "description": "Mỗi chuyển khoản vào tài khoản CLB được ghi nhận tự động.",
        "done": false,
        "state": "warning",
        "warning": "Đã có tài khoản ngân hàng nhưng chưa bật bảo mật webhook.",
        "meta": { "hasActiveBankAccount": true, "hasWebhookSecret": false },
        "href": "/admin?huong-dan=sepay",
        "cta": "Ghép nối SePay"
      },
      {
        "key": "tournament",
        "title": "Tạo giải đấu đầu tiên",
        "description": "Sinh lịch, bảng xếp hạng và sơ đồ loại trực tiếp tự động.",
        "done": false,
        "state": "todo",
        "meta": { "tournamentCount": 0 },
        "href": "/giai-dau/v2",
        "cta": "Tạo giải"
      }
    ],
    "shareAction": {
      "clubCode": "P246CLUB",
      "joinUrl": "https://pickhub.vn/join?group=P246CLUB"
    }
  }
}
```

Ghi chú shape:

- `state ∈ "todo" | "done" | "warning"`. `done === true` luôn đồng nghĩa `state === "done"`.
- `visible = !dismissedAt && !isComplete` — server tính sẵn để client không phải suy luận.
- `shareAction` **không** kèm data-URL QR (tránh lặp chi phí của `settings`). Client mở modal thì gọi `/api/club/settings` như hiện tại.

#### `PATCH /api/club/onboarding` → 200

Allowlist đúng ba action, **không nhận timestamp từ client**:

```json
{ "action": "mark_welcome_seen" }
{ "action": "dismiss" }
{ "action": "restore" }
```

| Action | Tác dụng |
|---|---|
| `mark_welcome_seen` | `onboarding_seen_at = now()` — chỉ ghi nếu đang NULL (idempotent) |
| `dismiss` | `onboarding_dismissed_at = now()` |
| `restore` | `onboarding_dismissed_at = NULL` — cho admin bật lại checklist từ trang Cấu hình |

Action lạ → `400 { "error": "Hành động không hợp lệ." }`.

Response trả lại **nguyên khối `onboarding`** như GET để client không phải fetch lại.

#### Logic thuần tách sang `lib/clubOnboarding.js`

Theo quy ước "thuật toán gọi từ `lib/`, không nhúng vào route":

```
buildOnboardingState(facts) -> { steps, completedCount, totalCount, isComplete, visible, ... }

facts = { logoUrl, fundQrUrl, memberCount, tournamentCount,
          hasActiveBankAccount, hasWebhookSecret,
          seenAt, dismissedAt, clubCode, joinUrl }
```

Hàm thuần → test runtime thật được (`tests/club-onboarding.test.js`), đúng loại test mà `pickhub-engineering` ưu tiên.

### 2.6 Điểm cắm UI

| Việc | File |
|---|---|
| Wizard chào mừng | `components/pickhub/OnboardingWelcome.js` — bọc `PhModal` (đã có focus trap, Esc, khoá scroll, trả focus) |
| Checklist | `components/pickhub/SetupChecklist.js` — đặt đầu `/admin` và `/quy` |
| Stepper dùng chung | Port `.w3-stepchip` / `.w3-stepline` từ `app/giai-dau/v2/wizard.css` sang `.ph-step*` trong `app/styles/primitives.css` (hiện đang khoá trong namespace giải đấu) |
| Điểm rơi thứ hai | Card thành công sau khi tạo CLB (`app/page.js:518-530`) — đổi nút thành "Bắt đầu thiết lập CLB" |

---

## 3. Phần B — SePay: mời gọi, hướng dẫn từng bước, xác minh bằng "Gửi thử"

### 3.1 Tư vấn gói miễn phí — ngắn, đúng, không suy diễn

> **Đính chính hai lần.** Gói miễn phí của SePay là **50 giao dịch/tháng** ([bảng giá](https://sepay.vn/bang-gia.html), tra cứu 2026-09-14) — không phải "khá nhiều". Vượt hạn mức **vẫn chạy**, chỉ phát sinh phí theo giao dịch.
>
> Bản thiết kế trước còn nhắc **ưu đãi VPBank 500 giao dịch/tháng**; thông tin đó **đã gỡ bỏ** vì người dùng kiểm chứng trực tiếp trên trang khuyến mãi và không thấy. Bài học: **không viết cứng ưu đãi cụ thể của một ngân hàng vào code** — chúng thay đổi và hết hạn, còn PickHub thì không ai đi cập nhật.

**Ba nguyên tắc cho copy phần này:**

1. **Chỉ nêu con số thật.** "50 giao dịch mỗi tháng" — không quy đổi thành "tương đương CLB 40–50 người". Quy đổi là một phép suy diễn: có CLB thu theo buổi, có CLB thu theo quý, số giao dịch khác nhau hoàn toàn. Nói sai một lần là mất tin.
2. **Không nhắc ưu đãi cụ thể.** Mọi thứ đổi liên tục → đẩy sang link khuyến mãi để admin tự xem tại thời điểm họ đăng ký.
3. **Nêu lợi ích, không giải thích cơ chế.** Admin cần biết *được gì*, không cần biết webhook là gì.

**Copy chốt** (dạng danh sách tích xanh, không phải đoạn văn):

> ### Chưa có tài khoản SePay?
> - ✓ Gói miễn phí: **50 giao dịch mỗi tháng**.
> - ✓ Tiền vào quỹ **tự động lên sổ**, không phải gõ tay.
> - ✓ Vượt 50 vẫn chạy bình thường, chỉ phát sinh phí theo giao dịch.
>
> SePay hay đổi chính sách và có đợt khuyến mãi — ngó qua trước khi đăng ký.
>
> `[ Đăng ký SePay miễn phí ↗ ]` `[ 🎁 Xem khuyến mãi ↗ ]` [Xem bảng giá](https://sepay.vn/bang-gia.html)

**Vị trí link affiliate** `https://my.sepay.vn/register?gcid=1008` — **đúng hai chỗ**, cả hai đều là nơi admin thực sự cần bấm:

1. Bước 2 của màn giới thiệu (§3.4) — "Đăng ký SePay".
2. Bước 1 của luồng thiết lập (§3.15, trạng thái `idle`) — khối "Chưa có tài khoản SePay?".

**Bỏ khỏi checklist onboarding.** Bước SePay trong checklist giờ chỉ có một nút hành động duy nhất là *"Thiết lập Auto Quỹ với SePay"* — nhồi thêm link đăng ký và link khuyến mãi vào đó làm loãng một dòng vốn chỉ cần nói một việc.

**Vị trí link khuyến mãi** `https://sepay.vn/khuyen-mai` — **ba chỗ**, luôn đi kèm chỗ nào nhắc hạn mức: bước 3 màn giới thiệu, khối "Chưa có tài khoản SePay?", và thẻ hạn mức khi sắp chạm trần (§4.1).

Giữ nguyên (không affiliate): `https://sepay.vn/bang-gia.html`, `https://sepay.vn/khuyen-mai`, `https://developer.sepay.vn/...`. **Không** đặt trên landing page `/`.

### 3.2 Wizard SePay — bỏ mọi thứ admin phải tự nghĩ ra

| Trước | Sau |
|---|---|
| Admin tự nghĩ secret ≥ 16 ký tự | App sinh `crypto.randomBytes(32).toString('hex')` (256 bit), hiện kèm nút Copy |
| Ô nhập số tài khoản nằm ở section khác, không ai nối hai việc lại | Đưa vào **bước 1 của luồng thiết lập**, ngay trước phần khai báo — admin copy số từ app ngân hàng |
| 4 gạch đầu dòng chữ | 5 bước có ảnh chụp màn hình SePay (`public/images/sepay/01-them-webhook.png` …) |
| Không biết đúng/sai | Bấm **Gửi thử** bên SePay → PickHub báo ngay, kèm gợi ý phân biệt "sai địa chỉ" với "sai khoá bảo mật" |

**Giữ nguyên form nhập tay** ở `#set-bank` làm đường lùi cho admin đã quen, hạ xuống thành link nhỏ "Tôi muốn nhập số tài khoản thủ công".

### 3.3 Màn giới thiệu — chỉ để thuyết phục, chưa nhập gì cả

Màn **đầu tiên** khi admin bấm "Thiết lập Auto Quỹ với SePay". Ở đây **không có ô nhập nào** — trộn thuyết phục với thu thập dữ liệu làm hỏng cả hai việc. Nhiệm vụ duy nhất: cho thấy *được gì* và *mất bao nhiêu công*.

**Lợi ích viết thành danh sách tích xanh, không phải đoạn văn.** Đoạn văn bắt người ta đọc hết mới rút ra kết luận; danh sách tích xanh cho quét mắt trong hai giây và mỗi dòng là một lời hứa kiểm chứng được.

> ### Để PickHub tự ghi sổ quỹ giúp bạn
> - ✓ **Tiền vào là tự lên sổ.** Không phải gõ tay dòng nào.
> - ✓ **Tự gán đúng tên người nộp.** PickHub đọc nội dung chuyển khoản và khớp với danh sách thành viên.
> - ✓ **Thủ quỹ hết phải đối chiếu.** Không cần mở app ngân hàng dò từng khoản nữa.
> - ✓ **Cả CLB tự xem được.** Ai đã nộp, ai chưa, quỹ còn bao nhiêu — công khai, không ai phải hỏi.
> - ✓ **Miễn phí.** Gói miễn phí của SePay được 50 giao dịch mỗi tháng.
>
> `⏱️ Khoảng 10 phút` `🙂 Không cần biết kỹ thuật` `↩️ Sai thì làm lại được`

Ba chip cuối mỗi cái phản bác đúng một lý do bỏ cuộc. Chip *"Sai thì làm lại được"* quan trọng nhất: nỗi sợ lớn nhất của người không rành CNTT là làm hỏng thứ gì đó không sửa được.

**CTA:** `Bạn đã có tài khoản ngân hàng? Bắt đầu kết nối →`

Nút này cố ý là một **câu hỏi** chứ không phải mệnh lệnh. Nó vừa mời đi tiếp vừa nói rõ điều kiện vào — admin chưa có tài khoản ngân hàng sẽ tự biết mình phải quay lại làm bước 1 trước, không phải đi vào rồi mới bị chặn. Dòng dưới nút: *"Chưa có cũng không sao — đóng lại lúc nào cũng được, PickHub nhớ bạn đang làm tới đâu."*

### 3.4 Bốn bước chuẩn bị — tượng hình, hiện hết một lượt

Liệt kê **toàn bộ** những gì cần có, không giấu bước nào để bung ra giữa chừng. Mỗi bước có **một icon lớn trong ô bo góc** (56px) với số thứ tự nhỏ ở góc trên trái — icon để nhận ra bằng mắt, số để biết trình tự. Số trần không nói được bước đó là *loại việc gì*.

| # | Icon | Bước | Ai làm | Nội dung |
|---|---|---|---|---|
| 1 | 🏦 | **Tài khoản ngân hàng riêng của quỹ** | `Làm ở app ngân hàng` | Tài khoản mới, đứng tên thủ quỹ, chỉ dùng cho quỹ CLB. Mở trên app ~5 phút, miễn phí. Lý do đầy đủ ở §3.16 |
| 2 | 📱 | **Tài khoản SePay** | nút `Đăng ký SePay ↗` | Dịch vụ báo cho PickHub biết khi có tiền vào. Đăng ký bằng số điện thoại — **link affiliate đặt ở đây** |
| 3 | 🎁 | **Chọn gói dịch vụ** | nút `Xem khuyến mãi ↗` | "Cứ chọn gói miễn phí trước — 50 giao dịch mỗi tháng." |
| 4 | 🔗 | **Kết nối SePay với PickHub** | badge `PickHub lo phần này` | Copy hai dòng chữ dán sang SePay rồi bấm một nút. Có ảnh từng bước |

Bước 4 mang **badge trấn an** chứ không phải nút — để admin thấy phần nghe có vẻ khó nhất đã có người lo.

**Khuyến cáo tài khoản riêng chỉ xuất hiện ở đây và trong checklist**, không lặp lại ở màn thiết lập (§3.15): tới lúc đó admin đã có tài khoản rồi, nhắc lại chỉ làm dài màn hình và trì hoãn việc họ đang muốn làm.

### 3.5 Đổi cơ chế xác minh: dùng "Gửi thử" của SePay, bỏ chuyển tiền thật

**Phát hiện làm thay đổi thiết kế.** SePay có sẵn chức năng **Gửi thử** (menu `⋮` trên dòng webhook → `Gửi thử`). Tài liệu SePay mô tả nó *"gửi một payload mẫu tới URL của bạn mà không cần phát sinh giao dịch thật"*, và ví dụ trong tài liệu dùng số tài khoản mẫu `1017588888`.

Hai hệ quả, ngược chiều nhau:

1. **Tốt:** không ai phải chuyển tiền thật nữa. Bỏ được toàn bộ nghi thức "chuyển 2.000đ với nội dung PICKHUB xxx".
2. **Xấu:** vì payload là **mẫu**, `accountNumber` trong đó **không đảm bảo là số tài khoản thật** → **không thể dùng "Gửi thử" để tự phát hiện số tài khoản.**

Nên thiết kế đảo lại, và hoá ra đơn giản hơn hẳn:

| | Bản trước (chuyển 2.000đ) | Bản này (Gửi thử) |
|---|---|---|
| Số tài khoản | Hệ thống tự đọc từ giao dịch | **Admin xác nhận** — họ biết số này, copy từ app ngân hàng |
| Xác minh đường ống | Giao dịch thật 2.000đ | **Bấm "Gửi thử"** — miễn phí, không tạo giao dịch |
| Mã ghép nối trong nội dung CK | Bắt buộc | **Bỏ hẳn** |
| Bảng `sepay_pairing_sessions` | Cần | **Bỏ hẳn** |
| RPC `complete_sepay_pairing` | Cần | **Bỏ hẳn** |
| Cột `is_pairing_probe` + lọc BXH | Cần | **Bỏ hẳn** |
| Lỗ hổng T6 (tự ký payload chiếm TK người khác) | Có, chỉ giảm thiểu được | **Biến mất** — xem §3.7 |

Việc "admin phải tự gõ số tài khoản" nghe như bước lùi, nhưng không phải: admin **biết** số tài khoản (vừa mở nó ở bước 1), còn cái họ **không** biết là webhook có chạy không. Bản trước giải bài toán dễ và để bài toán khó lại; bản này làm ngược.

### 3.6 Luồng mới

```
1. Admin xác nhận số tài khoản riêng của quỹ    -> luu vao group_bank_accounts
2. PickHub sinh khoá bảo mật, hiện URL + khoá, kèm nút Copy
3. Admin khai báo webhook bên SePay (5 bước có ảnh),
   chọn đúng tài khoản quỹ + "Có tiền vào", bấm Lưu
4. Admin bấm "Gửi thử" trong SePay   <- mien phi, khong tao giao dich
5. PickHub nhận request, xác thực HMAC -> ghi sepay_last_signal_at
6. UI đang poll -> "Đã kết nối!"
```

### 3.7 Cơ chế nhận tín hiệu và phân tích bảo mật

Trong cửa sổ kiểm tra 10 phút, PickHub chấp nhận **bất kỳ** request nào tới `/api/webhook` có **chữ ký HMAC khớp `groups.sepay_webhook_secret` của CLB đó** — kể cả khi payload mang số tài khoản mẫu không khớp `group_bank_accounts`.

Điều này an toàn vì **ta không suy ra gì từ payload**. Chữ ký chỉ dùng để trả lời đúng một câu: *"CLB nào vừa bấm Gửi thử?"* Số tài khoản đã do admin xác nhận ở bước 1 và chịu ràng buộc `UNIQUE (account_number)` sẵn có.

| # | Mối đe doạ | Xử lý |
|---|---|---|
| T1 | Giả mạo không chữ ký | Nhánh xác minh **bắt buộc** chữ ký; không có lối thoát `if (!secret) return null` như nhánh thường |
| T2 | Đoán khoá | `randomBytes(32)` = 256 bit |
| T3 | Chữ ký sai làm hỏng cửa sổ kiểm tra (DoS) | Chữ ký sai → 401 và ghi `hint` "sai khoá bảo mật", cửa sổ **giữ nguyên** |
| T4 | CLB chưa có khoá lúc tín hiệu tới | Khoá được sinh và lưu **trước** khi mở cửa sổ. Vẫn NULL → 401, không ghi gì |
| T5 | Rò rỉ khoá qua response | Plaintext chỉ trả lúc sinh ra và khi cửa sổ còn mở; ngoài ra `secretMasked`; `Cache-Control: no-store`; không log khoá |
| T6 | **Chiếm số tài khoản của CLB khác** | **Không còn nằm trong phạm vi tính năng này.** Số tài khoản do admin nhập qua `POST /api/club/bank-accounts` như hiện tại, chịu đúng ràng buộc và đúng rủi ro đã tồn tại — tín hiệu "Gửi thử" không đụng tới nó |
| T7 | Xoay khoá làm chết kết nối đang chạy | Không tự xoay nếu đã có khoá; chỉ xoay khi admin chủ động, kèm cảnh báo phải khai báo lại bên SePay |

So với bản trước, đây là điểm được nhiều nhất: **bề mặt tấn công mới gần như bằng không**, vì tín hiệu thử không còn quyền ghi vào `group_bank_accounts` hay `quy_pickleball`.

### 3.8 Va chạm `UNIQUE (account_number)`

Xảy ra ở bước 1 (admin nhập số tài khoản), tức trước khi có tín hiệu nào — dùng lại nguyên logic 409 của `POST /api/club/bank-accounts` hiện có, chỉ đổi thông điệp cho dễ hiểu và **không tiết lộ CLB nào** đang giữ:

> "Số tài khoản **1907••••7890** đã được một CLB khác đăng ký. Mỗi số tài khoản chỉ thuộc về một CLB trong PickHub. Nếu đây đúng là tài khoản của CLB bạn, vui lòng liên hệ hỗ trợ để chuyển quyền."

### 3.9 Hết giờ / huỷ / kiểm tra lại

- **TTL 10 phút**, đánh giá **lười** khi đọc — dự án không có job runner.
- **Hết giờ**: khoá bảo mật **giữ nguyên** → admin **không phải khai báo lại bên SePay**, chỉ bấm "Kiểm tra lại" rồi "Gửi thử" lần nữa. Đây là khác biệt lớn về cảm giác so với bản trước (phải chuyển tiền lại).
- **Kiểm tra lại bất cứ lúc nào**: nút "Kiểm tra lại kết nối" ở trạng thái *Đã kết nối* mở lại cửa sổ 10 phút. Dùng khi nghi webhook hỏng (§4.1 ý tưởng #2).
- **Huỷ**: đóng cửa sổ, không ảnh hưởng gì tới kết nối đang chạy.

### 3.10 Migration `054_sepay_connection_state.sql`

Thay cho bảng `sepay_pairing_sessions` phức tạp ở bản trước — giờ chỉ cần ba cột trên `groups`.

```sql
-- 054_sepay_connection_state.sql
-- Trang thai ket noi SePay cap CLB.
--
-- Thay cho ban thiet ke truoc (bang sepay_pairing_sessions + RPC): vi da dung
-- chuc nang "Gui thu" cua SePay thay cho giao dich that, khong con phien ghep noi,
-- khong con ma ghep noi, khong con giao dich thu phai ghi so.
--
-- Additive & idempotent. groups.id la bigint (xem 007).

BEGIN;

ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS sepay_verify_until timestamptz;

ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS sepay_last_signal_at timestamptz;

ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS sepay_verify_hint text;

COMMENT ON COLUMN public.groups.sepay_verify_until IS
  'Han cua so kiem tra ket noi (~10 phut). NULL hoac da qua = khong trong che do kiem tra.';
COMMENT ON COLUMN public.groups.sepay_last_signal_at IS
  'Lan cuoi /api/webhook nhan request co chu ky HMAC hop le cua CLB nay. Dung cho the "suc khoe ket noi".';
COMMENT ON COLUMN public.groups.sepay_verify_hint IS
  'Goi y chan doan hien cho admin, vd nhan duoc tin hieu nhung chu ky khong khop.';

-- Tra nhanh cac CLB dang mo cua so kiem tra (N rat nho).
CREATE INDEX IF NOT EXISTS idx_groups_sepay_verifying
  ON public.groups (sepay_verify_until)
  WHERE sepay_verify_until IS NOT NULL;

COMMIT;
```

**Không còn** `055_complete_sepay_pairing_rpc.sql`, **không còn** `quy_pickleball.is_pairing_probe`, **không còn** việc phải lọc `is_pairing_probe` trong `lib/fundContributions.js` / `lib/fundLeaderboard.js`.

### 3.11 API `app/api/club/sepay/verify/route.js`

Guard `requireValidatedGroupAdmin()` cả ba method. Mọi response `Cache-Control: no-store`.

#### `POST` — mở cửa sổ kiểm tra

Request: `{ "rotateSecret": false }`

Response `200`:
```json
{
  "verify": {
    "status": "waiting",
    "expiresAt": "2026-09-14T08:40:00.000Z",
    "secondsRemaining": 600,
    "hint": null
  },
  "webhook": {
    "url": "https://pickhub.vn/api/webhook",
    "algorithm": "HMAC-SHA256",
    "secret": "9f2c...<64 hex>...a1",
    "secretIsNew": true,
    "secretMasked": "9f2c********a1"
  },
  "bankAccounts": [
    { "id": 7, "accountNumberMasked": "1907****7890", "bankName": "BIDV" }
  ]
}
```

#### `GET` — poll

```json
{
  "verify": {
    "status": "connected",
    "expiresAt": "2026-09-14T08:40:00.000Z",
    "secondsRemaining": 0,
    "lastSignalAt": "2026-09-14T08:33:12.000Z",
    "hint": null,
    "error": null
  },
  "connection": {
    "hasSecret": true,
    "activeAccountCount": 1,
    "lastTransactionAt": "2026-09-14T06:12:00.000Z",
    "monthlyCount": 28
  }
}
```

`status ∈ "idle" | "waiting" | "connected" | "expired"`. Biến thể `waiting` kèm `hint` khi server nhận được request nhưng chữ ký sai:

> "Đã nhận được tín hiệu nhưng chữ ký không khớp. Nghĩa là địa chỉ đúng rồi, chỉ sai khoá bảo mật. Quay lại SePay, sửa webhook, dán lại Khoá bảo mật rồi bấm Gửi thử lần nữa."

Đây là chẩn đoán **rất có giá trị**: nó tách bạch "sai địa chỉ" với "sai khoá" — hai lỗi mà admin không tự phân biệt được.

Client poll bằng `lib/pollingBackoff.js`, dừng khi `status !== 'waiting'`.

#### `DELETE` — đóng cửa sổ

`{ "verify": { "status": "idle" } }` — idempotent.

### 3.12 Sửa `app/api/webhook/route.js`

Nhánh mới vẫn chỉ chen vào **đúng chỗ hôm nay đang `return 422`**, nhưng giờ ngắn hơn nhiều — không RPC, không insert, chỉ một `UPDATE` cờ.

```js
export async function POST(req) {
  const rawBody = await req.text();
  const data = JSON.parse(rawBody);

  const groupRouting = await resolveGroupFromBankAccount(data);

  // --------- NHANH THUONG: giu nguyen 100% ---------
  if (groupRouting) {
    const authError = verifySePaySignature(req, rawBody, groupRouting.sepayWebhookSecret);
    if (authError) return authError;
    // ... logic parse + insert + club_notifications hien tai, khong doi ...
    // Bo sung: touchSepaySignal(groupRouting.groupId)  (best-effort, try/catch)
    return NextResponse.json({ /* ... */ }, { status: 200 });
  }

  // --------- NHANH MOI: tin hieu "Gui thu" ---------
  // Payload mau khong khop tai khoan nao -> tra loi cau hoi "CLB nao vua bam Gui thu?"
  // bang chu ky, KHONG suy ra gi tu payload.
  const verified = await tryMatchVerifyingGroup({ req, rawBody });
  if (verified.handled) {
    return NextResponse.json({ message: verified.message }, { status: verified.status });
  }

  return NextResponse.json({ message: 'Unknown bank account' }, { status: 422 });
}
```

```js
// lib/sepayVerify.js
async function tryMatchVerifyingGroup({ req, rawBody }) {
  const nowIso = new Date().toISOString();

  // Chi cac CLB dang mo cua so kiem tra. N rat nho (thuong 0-2).
  const candidates = await db.from('groups')
    .select('id, sepay_webhook_secret')
    .gt('sepay_verify_until', nowIso)
    .not('sepay_webhook_secret', 'is', null)
    .limit(20);

  if (!candidates.length) return { handled: false };   // -> 422 nhu cu

  for (const g of candidates) {
    // Tai dung NGUYEN ham hien co, khong viet ban sao.
    if (verifySePaySignature(req, rawBody, g.sepay_webhook_secret) === null) {
      await db.from('groups').update({
        sepay_last_signal_at: new Date().toISOString(),
        sepay_verify_hint: null,
      }).eq('id', g.id);
      return { handled: true, status: 200, message: 'Verify signal accepted' };
    }
  }

  // Co CLB dang cho nhung khong chu ky nao khop: ghi hint chan doan.
  if (candidates.length === 1) {
    await db.from('groups').update({
      sepay_verify_hint: 'signature_mismatch',
    }).eq('id', candidates[0].id);
  }
  return { handled: true, status: 401, message: 'Invalid signature' };
}
```

**Bốn điểm phải giữ đúng khi implement:**

1. `verifySePaySignature(req, rawBody, secret)` **dùng lại nguyên xi**, không viết bản sao.
2. `limit(20)` chặn vòng lặp HMAC thành bề mặt DoS; quá ngưỡng thì bỏ qua và log cảnh báo.
3. `console.log` payload thô hiện in **toàn bộ body** — nhánh này **không** được log khoá bảo mật.
4. Ghi `hint` chỉ khi đúng **một** CLB đang chờ; nhiều CLB chờ cùng lúc thì không biết gán cho ai, bỏ qua.

### 3.13 Ghi chú: bốn kiểu xác thực của SePay

SePay hỗ trợ **HMAC-SHA256**, **API Key** (`Authorization: Apikey <key>`), **OAuth 2.0**, và **không xác thực**. Code PickHub hiện tại (`verifySePaySignature`) dùng **HMAC-SHA256** — vẫn hợp lệ, giữ nguyên.

Hướng dẫn phải nói rõ chọn **HMAC-SHA256**, vì mặc định của SePay khi thêm webhook là **không xác thực** — đúng cái trạng thái ta đang muốn thoát khỏi.

### 3.14 Ghi chú: chọn đúng tài khoản khi khai báo webhook

Ở form thêm webhook, SePay cho chọn **Tài khoản** (một tài khoản cụ thể hoặc *Tất cả tài khoản*) và **Giao dịch** (*Có tiền vào* / *Có tiền ra* / *Cả hai*).

Hướng dẫn phải bảo admin chọn **đúng tài khoản riêng của quỹ** và **Có tiền vào** — không để *Tất cả tài khoản*. Lý do giống §3.16: nếu để *Tất cả*, mọi tài khoản khác mà thủ quỹ liên kết với SePay cũng bắn giao dịch sang PickHub và lọt vào sổ quỹ CLB.
### 3.15 UI section `#set-sepay`

Năm trạng thái:

| Trạng thái | Hiển thị |
|---|---|
| **Chưa kết nối** (`idle`) — màn giới thiệu | Khối lợi ích tích xanh (§3.3) + 4 bước chuẩn bị tượng hình (§3.4) · **không có ô nhập nào** · CTA *"Bạn đã có tài khoản ngân hàng? Bắt đầu kết nối"* |
| **Bước 1** — vào việc | Ô nhập **số tài khoản quỹ** · khối *"Chưa có tài khoản SePay?"* (§3.1) với nút affiliate + nút khuyến mãi · **không lặp lại khuyến cáo tài khoản riêng** — admin tới đây là đã có rồi · nút *"Lưu và khai báo với SePay"* · link nhỏ *"Tôi muốn nhập số tài khoản thủ công"* |
| **Đang kiểm tra** (`waiting`) | Ô số tài khoản đã xác nhận · URL + Copy · Khoá bảo mật + Copy (kèm cảnh báo "chỉ hiện một lần") · 5 bước có ảnh · khối nổi bật **"Bấm Gửi thử trong SePay"** + nút mở SePay ở tab mới · đồng hồ đếm ngược · ô `hint` nếu chữ ký sai · nút *"Huỷ"* |
| **Đã kết nối** (`connected`) | *"Đã kết nối! Tài khoản 1907••••7890 (BIDV)"* · đồng hồ hạn mức gói miễn phí · sức khoẻ kết nối · nút *"Kiểm tra lại kết nối"* |
| **Hết giờ** (`expired`) | *"Chưa nhận được tín hiệu nào từ SePay"* + trấn an "khoá bảo mật vẫn giữ nguyên, không cần khai báo lại" + nút *"Kiểm tra lại"* |

Ca **trùng số tài khoản** không còn là một trạng thái của luồng kiểm tra — nó xảy ra sớm hơn, ở bước 1 khi admin nhập số tài khoản (§3.8), và dùng lại lỗi 409 sẵn có.

Ảnh hướng dẫn: `public/images/sepay/01-them-webhook.png` … `04-gui-thu.png`, lazy-load, mobile-first ~380px.

### 3.16 Khuyến cáo: mở tài khoản ngân hàng riêng cho quỹ CLB

Hiện tại không có chỗ nào trong PickHub nói điều này, và đó là một thiếu sót thật — vì nó **vừa là chuyện minh bạch tài chính, vừa là chuyện kỹ thuật**.

Lý do kỹ thuật mới là lý do nặng nhất, và nó suy ra trực tiếp từ code hiện có: `app/api/webhook/route.js` ghi **mọi** giao dịch `transferType = 'in'` vào tài khoản đã đăng ký thành một dòng trong `quy_pickleball`. Không có bộ lọc nào theo nội dung chuyển khoản. Nghĩa là nếu thủ quỹ khai số tài khoản cá nhân đang dùng hằng ngày, thì lương, tiền bạn bè trả nợ, tiền bán đồ cũ… **đều chảy vào sổ quỹ CLB** và hiện lên trang Quỹ cho cả CLB xem. Thủ quỹ sẽ phải đi xoá tay từng dòng, hoặc lộ chi tiêu riêng.

**Xuất hiện ở đúng hai nơi**, đều là lúc admin *chưa* có tài khoản: bước 1 của màn giới thiệu (§3.4) và dòng bôi vàng của bước SePay trong checklist onboarding. **Không** lặp ở màn thiết lập — tới đó admin đã có tài khoản, nhắc lại chỉ trì hoãn việc họ đang muốn làm.

**Copy chốt:**

> 🏦 **Nên mở một tài khoản ngân hàng riêng đứng tên thủ quỹ, chỉ dùng cho quỹ CLB**
>
> Đừng dùng tài khoản cá nhân đang xài hằng ngày. Ba lý do:
>
> - **Minh bạch với cả CLB.** Sao kê tài khoản đó chỉ có tiền quỹ ra vào, thủ quỹ đưa cho ai xem cũng được, không lộ chi tiêu riêng.
> - **Sổ quỹ sạch.** PickHub ghi nhận **mọi** khoản tiền vào tài khoản này. Dùng tài khoản cá nhân thì lương, tiền bạn bè trả nợ… cũng chui vào sổ quỹ CLB, rất mất công dọn.
> - **Đổi thủ quỹ nhẹ nhàng.** Sang nhiệm kỳ sau chỉ cần bàn giao tài khoản, không phải khai báo lại từ đầu.
>
> Mở tài khoản mới ở hầu hết ngân hàng giờ làm ngay trên app, khoảng 5 phút và miễn phí.

**Không chặn cứng.** Đây là khuyến cáo, không phải điều kiện bắt buộc — PickHub không có cách nào biết một số tài khoản là cá nhân hay chuyên dụng, và CLB nhỏ có thể cố ý dùng chung lúc đầu. Chặn ở đây chỉ tạo ra một bức tường không thể vượt qua đúng kiểu.

**Ghi nhận cho phase sau:** nếu về sau muốn hỗ trợ thủ quỹ đã lỡ dùng tài khoản cá nhân, cách nhẹ nhất là lọc theo nội dung chuyển khoản (chỉ ghi nhận giao dịch có tiền tố quy ước) — nhưng nó đánh đổi bằng việc thành viên phải ghi đúng nội dung, tức là mất chính cái tiện lợi mà thu quỹ tự động mang lại. Mở tài khoản riêng vẫn là lời khuyên đúng.

### 3.17 Ngôn ngữ giao diện: Việt hoá 100%

**Nguyên tắc:** mọi chữ người dùng đọc đều là tiếng Việt có dấu. Không dùng thuật ngữ kỹ thuật tiếng Anh khi đã có từ tiếng Việt dễ hiểu.

| Không dùng | Dùng |
|---|---|
| roster | danh sách thành viên |
| "bảo mật webhook", "HMAC bật" | "khoá bảo mật", "đã bật khoá bảo mật" |
| "Webhook và API có ở mọi gói" | "Tính năng tự động báo giao dịch có ở mọi gói" |
| "Địa chỉ webhook của CLB bạn" | "Địa chỉ nhận giao dịch của CLB bạn" |
| "Giao dịch gần nhất nhận qua webhook" | "Giao dịch gần nhất nhận được từ SePay" |
| "Webhook có thể đã bị xoá" | "Khai báo bên SePay có thể đã bị xoá" |

**Hai ngoại lệ có chủ ý — giữ nguyên tiếng Anh:**

1. **Nhãn nằm trong màn hình của SePay**: menu `Webhooks`, nút `Thêm webhook`, ô `URL`, ô `Secret`, kiểu xác thực `HMAC-SHA256`. Dịch những chữ này sẽ khiến admin **không tìm thấy chúng** khi sang SePay — hướng dẫn mất tác dụng.
2. **Định danh trong code**: `key: "roster"`, `status: "pending"`, tên bảng, tên cột. Đây là code, không phải giao diện; lập trình viên đọc, người dùng không bao giờ thấy.

Từ **"checklist"** được giữ — đã quen thuộc, và các phương án tiếng Việt ("danh sách việc cần làm") dài và cứng hơn.


### 3.18 Bẫy bố cục: `.setup__item` ở màn hình hẹp

Ghi lại vì đã dính khi dựng mockup, và code thật sẽ dính y hệt nếu quên.

`.setup__item` là một hàng flex ba phần: dấu tick (26px) · phần chữ (`.setup__body`) · nút (`.setup__cta`). Ở màn hình hẹp, nút phải giãn hết chiều rộng để bấm bằng ngón cái, nên `.setup__cta` nhận `width: 100%`.

**Chỉ đặt `width: 100%` mà quên `flex-wrap: wrap` trên hàng cha là hỏng:** trong một hàng `nowrap`, nút đòi 100% chiều rộng container sẽ **bóp `.setup__body` về 0px** — tên bước và mô tả biến mất hoàn toàn — rồi **tràn ra ngoài thẻ**. Đo được ở mockup: `bodyW: 0`, nút tràn 37px.

Hai rule phải đi cùng nhau, không tách rời:

```css
@media (max-width: 640px) {
  .setup__item { flex-wrap: wrap; }          /* bat buoc di kem */
  .setup__cta  { align-self: stretch; width: 100%; }
  .setup__cta .ph-btn { width: 100%; }
}
```

**Trong mockup còn một lớp bẫy nữa** (không có trong sản phẩm thật): khung điện thoại 380px là một **container** hẹp nằm trong trang desktop rộng, mà `@media` đo theo **viewport** chứ không theo container — nên mọi rule mobile đều không áp dụng bên trong khung. Mockup phải nhắc lại chúng dưới dạng `.mk-phone .setup__item { … }`. Đây là lý do bản xem trước mobile trông đúng khi thu hẹp cửa sổ nhưng vỡ khi xem ở màn hình rộng.

Khi implement, nếu muốn component tự đúng theo container thay vì theo viewport, dùng container query (`container-type: inline-size` + `@container`) — nhưng **không bắt buộc**: trong sản phẩm thật `.setup__item` luôn chiếm gần hết chiều rộng trang, nên media query là đủ.
---

## 4. Ý tưởng bổ sung

### 4.1 Đưa vào phạm vi này (có trong mockup)

**1. Đồng hồ hạn mức gói miễn phí.** Đếm giao dịch SePay của tháng hiện tại từ `quy_pickleball` (đã có `created_at` + `group_id` + `parsing_method`, **không cần bảng mới**) → hiện `28 / 50 giao dịch tháng này · Gói miễn phí vẫn đủ`. Vượt 40 → chip vàng gợi ý ba cách: gộp kỳ thu (thu theo quý thay vì theo tháng), xem [trang khuyến mãi](https://sepay.vn/khuyen-mai) vì SePay hay tặng gói nhiều lượt hơn, hoặc nâng gói.

Đây là **chỗ đặt link affiliate tự nhiên và thuyết phục nhất** — nó trả lời đúng câu hỏi đang có trong đầu admin ("tôi có phải trả tiền không?") bằng số liệu của chính CLB họ.

**2. Sức khoẻ kết nối.** `max(created_at)` của giao dịch đến từ webhook → *"Nhận giao dịch gần nhất: 2 giờ trước"* hoặc *"21 ngày chưa nhận giao dịch nào — kiểm tra lại webhook"*. Rẻ, không cần bảng log. Đây là thứ biến "hỏng im lặng" thành "hỏng nhìn thấy được".

**3. Cảnh báo bảo mật webhook.** CLB đang ở trạng thái `sepay_webhook_secret IS NULL` (webhook không xác thực) thấy chip đỏ trong checklist + nút "Bật bảo mật ngay" chạy thẳng vào wizard ghép nối.

**4. Thẻ mời CLB.** Nút "Chia sẻ mã CLB" xuất một ảnh PNG (QR + mã + tên CLB) để post thẳng lên group Zalo/Facebook. `buildJoin()` đã sinh QR data-URL — chỉ cần compose thêm nền bằng canvas, giống cách `handlePickFundQr` đang làm.

**5. Deep-link trợ giúp.** `/admin?huong-dan=sepay` mở thẳng wizard SePay → admin gửi được link cho nhau khi nhờ hỗ trợ, thay vì mô tả bằng lời "vào Cấu hình, kéo xuống dưới…".

### 4.2 Ghi nhận cho phase sau (không mockup)

**6. Nhắc qua chuông thay vì modal.** Thêm `kind='onboarding_step'` vào `club_notifications` (043) — đúng nguyên tắc `UI-BRAND-SYSTEM.md` §5: việc cần xử lý lâu dài nằm trong inbox thông báo, không phải toast.

**7. Dữ liệu mẫu xoá được.** Nút "Nạp 5 thành viên mẫu + vài giao dịch" để admin thấy hệ thống sống trước khi mời người thật, kèm nút xoá sạch. **Rủi ro dữ liệu bẩn** — phải gắn cờ rõ trên từng bản ghi, cân nhắc kỹ trước khi làm.

**8. Allowlist IP SePay** (`SEPAY_ALLOWED_IPS`) — thứ duy nhất đóng được T6 (§3.7). Mặc định tắt.

**9. Siết `sepay_webhook_secret NOT NULL`** sau khi các CLB cũ đã ghép nối lại. Thay đổi phá vỡ, cần lịch riêng và backfill.

---

## 5. Thứ tự triển khai đề xuất

| # | Việc | Ghi chú |
|---|---|---|
| 1 | `053` + `lib/clubOnboarding.js` + `app/api/club/onboarding/route.js` + test | **Độc lập hoàn toàn, ship trước được** |
| 2 | UI onboarding: `OnboardingWelcome.js`, `SetupChecklist.js`, `.ph-step*` | |
| 3 | Apply `054_sepay_connection_state.sql` | Ba cột trên `groups`, additive → an toàn với code cũ đang chạy |
| 4 | `lib/sepayVerify.js` + `app/api/club/sepay/verify/route.js` | |
| 5 | Sửa `app/api/webhook/route.js`: chèn nhánh `tryMatchVerifyingGroup` sau chỗ đang `return 422`, cộng `touchSepaySignal` ở nhánh thường | Đường đi hiện tại **không đổi một dòng** |
| 6 | UI `ClubSettings.js`: màn mời gọi + 4 bước + wizard + 4 trạng thái · ảnh hướng dẫn `public/images/sepay/` | Phần nhiều việc nhất |
| 7 | Test: mở rộng `tests/multitenant-phase5.test.js` + `tests/sepay-verify.test.js` mới | Khoá bất biến: nhánh xác minh **bắt buộc** chữ ký, chữ ký sai **không** đóng cửa sổ, không ghi gì vào `group_bank_accounts` hay `quy_pickleball` |
| 7b | Test ngôn ngữ giao diện (§3.17) | Contract test quét `components/pickhub/SetupChecklist.js`, `OnboardingWelcome.js`, `ClubSettings.js`: chuỗi hiển thị không được chứa `roster`, `HMAC bật`, `bảo mật webhook`. Rẻ, chặn được hồi quy khi sửa copy sau này |
| 8 | `npm run migration:ledger` | Sau khi apply 053/054 |

**So với bản thiết kế trước, mục 3–5 nhẹ đi đáng kể**: không còn migration RPC, không còn bảng phiên ghép nối, không còn cột `is_pairing_probe` và không phải sửa `lib/fundContributions.js` / `lib/fundLeaderboard.js`.

---

## 6. Nguồn tham khảo

- [Bảng giá SePay](https://sepay.vn/bang-gia.html) — tra cứu 2026-09-14: gói miễn phí 50 giao dịch/tháng, 11 ngân hàng, tính năng báo giao dịch có ở mọi gói.
- [Tài liệu webhook SePay](https://developer.sepay.vn/vi/sepay-webhooks/bat-dau-nhanh) — mô tả chức năng **Gửi thử**: "gửi một payload mẫu tới URL của bạn mà không cần phát sinh giao dịch thật".
- [Hướng dẫn tích hợp WebHooks](https://docs.sepay.vn/tich-hop-webhooks.html) — tra cứu 2026-09-14: SePay hỗ trợ 4 kiểu xác thực (HMAC-SHA256, API Key, OAuth 2.0, không xác thực); ví dụ payload dùng số tài khoản mẫu `1017588888`.
- [Trang khuyến mãi SePay](https://sepay.vn/khuyen-mai) — nguồn duy nhất cho ưu đãi; chính sách đổi liên tục nên link này luôn hiện cạnh mọi chỗ nhắc hạn mức. Ưu đãi cụ thể **không được viết cứng** vào code PickHub (§3.1).
- Link đăng ký (affiliate PickHub): `https://my.sepay.vn/register?gcid=1008`
