# Kế hoạch triển khai — Nền tảng thiết kế PickHub, BXH đóng góp và chuông thông báo

> **Cho agent thực thi:** SUB-SKILL BẮT BUỘC — dùng `superpowers:subagent-driven-development`
> (khuyến nghị) hoặc `superpowers:executing-plans` để chạy từng task. Các bước dùng
> checkbox (`- [ ]`) để theo dõi.

**Mục tiêu:** Đưa design baseline `--ph-*` đã duyệt vào production với font Montserrat,
dựng lớp primitive dùng chung, viết lại BXH thành một bảng tổng đóng góp lọc theo roster,
và thêm chuông thông báo để trưởng nhóm gán thủ công các giao dịch không nhận diện được.

**Kiến trúc:** Ba file CSS phân tầng (`tokens` → `primitives` → `legacy-aliases`) nạp một
lần trong `globals.css`; một tầng alias khai tử giữ 301 tham chiếu token cũ sống sót trong
lúc chuyển đổi. Logic BXH là hàm thuần trong `lib/fundLeaderboard.js`, không I/O. Thông báo
là bảng `club_notifications` cấp CLB, sinh từ webhook và từ đối soát bù.

**Tech stack:** Next.js 14 App Router (JavaScript thuần), Supabase (`supabaseAdmin`),
CSS thuần với custom properties, `next/font/google`, test bằng `node:assert` chạy trực tiếp
bằng `node`.

**Spec nguồn:** [`docs/superpowers/specs/2026-09-08-pickhub-design-system-va-bxh-design.md`](../specs/2026-09-08-pickhub-design-system-va-bxh-design.md)

---

## Ràng buộc xuyên suốt

Vi phạm bất kỳ điểm nào là lệch hướng, phải sửa chứ không biện minh:

1. **Không đụng `app/giai-dau/`** ngoài đúng một file `app/giai-dau/layout.js` (Task 8).
   Session khác đang phát triển ở đó. Không sửa `v2.css`, `wizard.css`, `console.css`,
   `bracket.css`, `public.css`, `share.css`, hay bất kỳ file nào khác trong thư mục đó.
2. **Không `DROP`, `TRUNCATE`, `DELETE` không điều kiện, reset database.** Database đang
   phục vụ CLB thật với 686 giao dịch.
3. **Mọi truy vấn Supabase phải scope theo `group_id`.** Không có ngoại lệ.
4. **Không tạo họ class mới ngoài tiền tố `ph-`.** Dự án đã có 5 họ nút; không đẻ họ thứ sáu.
5. **Không dùng `window.confirm()` / `window.prompt()`** trong code mới.
6. **Không dùng chữ "nộp phạt"** trong copy giao diện. Từ vựng là "đóng góp" / "nộp tiền".
   Giá trị `nop_phat` trong database giữ nguyên — chỉ lớp hiển thị đổi chữ.
7. **TDD:** viết test, chạy thấy fail thật, rồi mới viết implementation. Dán output fail
   vào báo cáo.
8. **Mỗi task một commit.** Message tiếng Việt.
9. Khi kế hoạch và spec mâu thuẫn ở điểm ảnh hưởng code: **dừng, báo cáo, hỏi.** Không tự phân xử.

---

## Bản đồ file

**Tạo mới**

| File | Trách nhiệm |
|---|---|
| `app/styles/tokens.css` | Khai báo toàn bộ `--ph-*`. Không chứa selector nào khác. |
| `app/styles/primitives.css` | Class `ph-*` dùng chung. Không chứa layout của trang cụ thể. |
| `app/styles/legacy-aliases.css` | Alias khai tử, 3 nhóm có tên. Chỉ chứa custom property. |
| `components/pickhub/PhModal.js` | Dialog + bẫy focus + Escape. |
| `components/pickhub/PhConfirm.js` | Hộp xác nhận dựng trên PhModal, trả Promise. |
| `components/pickhub/PhSeg.js` | Segmented control có roving tabindex. |
| `components/pickhub/PhNotificationBell.js` | Chuông + panel, chỉ admin. |
| `components/pickhub/AssignTransactionDialog.js` | Gán giao dịch cho thành viên. |
| `components/pickhub/AppShell.js` | Header + SideRail + BottomNav, dùng chung 4 nơi. |
| `components/pickhub/SideRail.js` | Điều hướng dọc desktop `≥1120px`. |
| `lib/fundContributions.js` | Đọc đủ giao dịch (phân trang), dùng chung UI và route ảnh. |
| `app/api/club/notifications/route.js` | GET danh sách + PATCH đổi trạng thái. |
| `app/api/club/bxh/share-image/route.js` | Sinh PNG thẻ chia sẻ. |
| `database/migrations/043_club_notifications_and_bxh_flag.sql` | Bảng thông báo + cột công tắc. |
| `scripts/backfill-unknown-nguoi-nop.js` | Dọn tồn đọng, có đếm trước/sau. |
| `tests/ph-design-system.test.js` | Chặn tái phát design system thứ hai. |
| `tests/ph-components.test.js` | Contract bàn phím và trợ năng của primitive. |
| `tests/club-notifications.test.js` | Phát hiện, chống trùng, quyền. |
| `tests/bxh-share-image.contract.test.js` | Quyền, tham số, cache của route ảnh. |
| `tests/transactions-completeness.test.js` | Đọc đủ ở > 1.000 hàng. |

**Sửa**

| File | Thay đổi |
|---|---|
| `app/layout.js` | Nạp Montserrat, xuất biến `--ph-font`. |
| `app/globals.css` | Còn 3 import + reset. Bỏ bảng màu sân xanh và `@import` Outfit. |
| `lib/transaction-parser.js` | Hai nhánh fallback ghi `'Unknown'` thay vì nội dung ngân hàng. |
| `app/api/webhook/route.js` | Sau khi insert thành công, sinh thông báo khi không khớp roster. |
| `app/api/club/branding/route.js` | Trả thêm `shameBadgesEnabled`. |
| `app/api/club/settings/route.js` | Nhận `shameBadgesEnabled` trong PATCH. |
| `lib/fundLeaderboard.js` | Viết lại: một bảng, 4 mốc, múi giờ VN, lọc roster, streak, huy hiệu. |
| `app/quy/bxh/page.js`, `page.css` | Viết lại bằng primitive. |
| `app/quy/layout.js`, `app/admin/page.js`, `app/thong-tin/page.js`, `app/giai-dau/layout.js` | Dùng `AppShell`. |
| `components/MobileBottomNav.css` | Breakpoint lên `< 1120px`. |
| `tests/fund-leaderboard.test.js` | Mở rộng theo logic mới. |
| `tests/global-navigation.test.js`, `tests/mobile-bottom-tabs.test.js` | Side rail, không lặp header. |
| `package.json` | Bỏ `test:court-energy-css`, thêm `test:ph-ui`. |
| `docs/pickhub-core/UI-BRAND-SYSTEM.md` | Ghi 2 token mở rộng và `--ph-ink-2`. |

**Xoá**

| File | Khi nào |
|---|---|
| `tests/court-energy-css.test.js` | Task 2, sau khi `tests/ph-design-system.test.js` xanh. |

---

## Task 1: Preflight — chốt số liệu trước khi sửa gì

**Files:** không sửa file nào. Chỉ đo và ghi.

- [ ] **Bước 1: Đếm tham chiếu token cũ**

```bash
grep -rho "var(--\(court\|pickle\|live-cyan\|rally\|surface-court\|gradient-court\|gradient-live\)[a-z-]*)" app components --include=*.css --include=*.js | sort | uniq -c | sort -rn
```

Ghi tổng số vào báo cáo. Con số kỳ vọng là **301** (đo ngày 2026-09-08):
`app/quy` 196 · `app/admin` 36 · `components` 26 · `app/page.css` 24 · `app/globals.css` 16
· `app/giai-dau` 3. Lệch vài đơn vị là bình thường nếu session khác vừa sửa CSS;
lệch hàng chục thì dừng và báo cáo.

- [ ] **Bước 2: Xác nhận 5 rule class trong globals.css là rule chết**

```bash
grep -rn "app-background\|card-container\|card-header\|mobile-hidden\|desktop-hidden" app components --include=*.js
```

Kỳ vọng: **không có kết quả**. Nếu có kết quả, **dừng lại và báo cáo** — spec mục 3.6 yêu cầu
chuyển rule đó sang nhóm `D · Rule legacy` chứ không xoá.

- [ ] **Bước 3: Xác minh trần số hàng của Supabase**

Chạy qua Supabase MCP trên project `uhhlelemewilgsdijwja`:

```sql
select count(*) from quy_pickleball where group_id = 1;
```

Rồi gọi `GET /api/club/transactions` với phiên CLB hợp lệ và đếm số phần tử trả về.
Ghi cả hai con số vào báo cáo. Nếu số API < số SQL thì trần đã bị chạm ngay bây giờ và
**Task 9 phải làm trước Task 11**.

- [ ] **Bước 4: Chốt số hiệu migration còn trống**

```bash
ls database/migrations/ | grep -E "^[0-9]{3}_" | sort | tail -5
```

Kỳ vọng `042_open_registration.sql` là cao nhất, nên migration mới là `043`. Nếu đã có `043`
thì dùng số kế tiếp và ghi lại.

- [ ] **Bước 5: Chạy regression để có mốc so sánh**

```bash
npm run test:regression
```

Ghi kết quả. Nếu đã đỏ từ trước khi sửa gì, **báo cáo và hỏi** trước khi đi tiếp — không
được nhận nhầm lỗi có sẵn thành lỗi do mình gây ra.

- [ ] **Bước 6: Commit báo cáo preflight**

```bash
git add docs/pickhub-core/evidence/
git commit -m "chore(ui): ghi so lieu preflight truoc khi hop nhat design system"
```

---

## Task 2: Tầng token và font Montserrat

**Files:**
- Tạo: `app/styles/tokens.css`, `app/styles/legacy-aliases.css`
- Sửa: `app/globals.css`, `app/layout.js`
- Tạo test: `tests/ph-design-system.test.js`
- Xoá: `tests/court-energy-css.test.js`

- [ ] **Bước 1: Viết test thất bại**

Tạo `tests/ph-design-system.test.js`:

```js
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const tokens = read('app/styles/tokens.css');
const globals = read('app/globals.css');
const layout = read('app/layout.js');

const REQUIRED_TOKENS = [
    ['--ph-ink', '#28243D'],
    ['--ph-ink-2', '#514A72'],
    ['--ph-indigo', '#6F48C9'],
    ['--ph-lavender', '#EEE9FF'],
    ['--ph-gold', '#FFC95E'],
    ['--ph-cyan', '#A8DFE9'],
    ['--ph-coral', '#FF8B83'],
    ['--ph-surface', '#F5F6FB'],
    ['--ph-card', '#FFFFFF'],
    ['--ph-line', '#E4E9F2'],
    ['--ph-muted', '#667085'],
    ['--ph-text', '#20213A'],
    ['--ph-positive', '#1F7A52'],
    ['--ph-negative', '#C2453A'],
    ['--ph-radius-sm', '12px'],
    ['--ph-radius-md', '20px'],
    ['--ph-radius-lg', '28px'],
];

for (const [name, value] of REQUIRED_TOKENS) {
    assert(
        new RegExp(`${name}\\s*:\\s*${value}`, 'i').test(tokens),
        `tokens.css phải khai ${name}: ${value}`
    );
}

assert(!/Outfit/i.test(globals), 'globals.css không được còn font Outfit');
assert(!/@import\s+url\(/i.test(globals), 'globals.css không được @import font từ Google');
assert(/Montserrat/.test(layout), 'app/layout.js phải nạp Montserrat qua next/font');
assert(/--ph-font/.test(layout), 'app/layout.js phải xuất biến --ph-font');

// Chỉ legacy-aliases.css được phép ĐỊNH NGHĨA màu cũ.
const OLD_TOKEN_DEF = /^\s*--(court|pickle|surface-court|live-cyan|rally-coral)[a-z-]*\s*:/gm;
function collectCss(dir, acc = []) {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) collectCss(rel, acc);
        else if (entry.name.endsWith('.css')) acc.push(rel);
    }
    return acc;
}
const cssFiles = [...collectCss('app'), ...collectCss('components')];
for (const file of cssFiles) {
    if (file.endsWith('legacy-aliases.css')) continue;
    assert(
        !OLD_TOKEN_DEF.test(read(file)),
        `${file} không được định nghĩa token màu cũ; chỉ legacy-aliases.css được phép`
    );
    OLD_TOKEN_DEF.lastIndex = 0;
}

// In ra số tham chiếu còn lại để con số luôn nhìn thấy được.
let remaining = 0;
for (const file of cssFiles) {
    remaining += (read(file).match(/var\(--(court|pickle|surface-court|live-cyan|rally-coral|gradient-court|gradient-live)[a-z-]*\)/g) || []).length;
}
console.log(`[ph-design-system] tham chiếu token khai tử còn lại: ${remaining}`);

console.log('ph-design-system: PASS');
```

- [ ] **Bước 2: Chạy test, xác nhận fail**

```bash
node tests/ph-design-system.test.js
```

Kỳ vọng: FAIL với `ENOENT ... app/styles/tokens.css`.

- [ ] **Bước 3: Tạo `app/styles/tokens.css`**

```css
/* Nguồn token duy nhất của PickHub. Giá trị lấy theo UI-BRAND-SYSTEM.md mục 2.
   Không thêm selector nào khác vào file này. */
:root {
  color-scheme: light;

  /* Màu thương hiệu — baseline đã duyệt 2026-09-02 */
  --ph-ink: #28243D;
  --ph-ink-2: #514A72;
  --ph-indigo: #6F48C9;
  --ph-indigo-hover: #5A37AD;
  --ph-lavender: #EEE9FF;
  --ph-gold: #FFC95E;
  --ph-cyan: #A8DFE9;
  --ph-coral: #FF8B83;
  --ph-surface: #F5F6FB;
  --ph-card: #FFFFFF;
  --ph-line: #E4E9F2;
  --ph-muted: #667085;
  --ph-text: #20213A;

  /* Mở rộng baseline: màu chữ cho số dương/âm. Xem spec mục 3.3.
     --ph-cyan và --ph-coral chỉ dùng làm nền/accent, không dùng cho chữ. */
  --ph-positive: #1F7A52; /* 5.30:1 trên trắng, 4.91:1 trên --ph-surface */
  --ph-negative: #C2453A; /* 5.08:1 trên trắng, 4.71:1 trên --ph-surface */

  /* Nhịp */
  --ph-space-1: 4px;
  --ph-space-2: 8px;
  --ph-space-3: 12px;
  --ph-space-4: 16px;
  --ph-space-6: 24px;
  --ph-space-8: 32px;

  /* Hình khối */
  --ph-radius-sm: 12px;
  --ph-radius-md: 20px;
  --ph-radius-lg: 28px;
  --ph-shadow-soft: 0 8px 24px rgba(40, 36, 61, .06);
  --ph-shadow: 0 16px 40px rgba(40, 36, 61, .08);
  --ph-focus-ring: 0 0 0 3px rgba(111, 72, 201, .35);

  /* Chữ */
  --ph-font: 'Montserrat', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;

  /* Bố cục */
  --ph-bottom-nav-height: 78px;
  --ph-rail-width: 232px;
}
```

- [ ] **Bước 4: Tạo `app/styles/legacy-aliases.css`**

```css
/* TẦNG KHAI TỬ — không thêm gì mới vào đây.
   Giữ cho các màn hình chưa redesign chạy được trong lúc chuyển đổi.
   Điều kiện gỡ từng nhóm: spec mục 3.5. Xoá hẳn ở spec cuối của chương trình. */
:root {
  /* A · Alias ngữ nghĩa */
  --primary: var(--ph-indigo);
  --primary-hover: var(--ph-indigo-hover);
  --primary-dim: rgba(111, 72, 201, .10);
  --primary-light: var(--ph-lavender);
  --bg-primary: var(--ph-surface);
  --bg-secondary: var(--ph-surface);
  --bg-card: var(--ph-card);
  --bg-card-hover: #FBFBFE;
  --border-color: var(--ph-line);
  --border-strong: #CFD6E4;
  --text-primary: var(--ph-text);
  --text-secondary: var(--ph-ink-2);
  --text-muted: var(--ph-muted);
  --success: var(--ph-positive);
  --success-dim: rgba(31, 122, 82, .12);
  --success-light: #E8F5EE;
  --danger: var(--ph-negative);
  --danger-dim: rgba(194, 69, 58, .12);
  --danger-light: #FDECEA;
  --warning: #B8860B;
  --warning-dim: rgba(184, 134, 11, .14);
  --dark: var(--ph-ink);
  --light: #FFFFFF;
  --secondary: var(--ph-indigo);
  --accent: var(--ph-gold);
  --font-family: var(--ph-font);
  --border-radius-sm: var(--ph-radius-sm);
  --border-radius-md: var(--ph-radius-sm);
  --border-radius-lg: var(--ph-radius-md);
  --border-radius-xl: var(--ph-radius-lg);
  --shadow-sm: var(--ph-shadow-soft);
  --shadow-md: var(--ph-shadow);
  --shadow-lg: var(--ph-shadow);
  --focus-ring: var(--ph-focus-ring);
  --mobile-bottom-nav-height: var(--ph-bottom-nav-height);

  /* B · Màu sân xanh */
  --court-midnight: var(--ph-ink);
  --court-green: var(--ph-indigo);
  --court-green-strong: var(--ph-indigo-hover);
  --court-green-soft: var(--ph-lavender);
  --pickle-lime: var(--ph-gold);
  --pickle-lime-soft: #FFF4DC;
  --live-cyan: var(--ph-cyan);
  --live-cyan-soft: #EFFAFD;
  --rally-coral: var(--ph-coral);
  --rally-coral-soft: #FFF0EE;
  --surface-court: var(--ph-surface);
  --surface-court-soft: #EFF0F7;

  /* C · Gradient cũ */
  --gradient-court-hero: linear-gradient(135deg, #6F48C9 0%, #8A63E0 60%, #A8DFE9 140%);
  --gradient-court-action: linear-gradient(135deg, #FFC95E 0%, #FFB627 100%);
  --gradient-court-green: linear-gradient(135deg, #6F48C9 0%, #8A63E0 100%);
  --gradient-live: linear-gradient(135deg, #A8DFE9 0%, #6F48C9 100%);
  --gradient-danger: linear-gradient(135deg, #C2453A 0%, #A5372E 100%);
  --gradient-primary: var(--gradient-court-green);
  --gradient-success: var(--gradient-court-green);
  --gradient-team-blue: linear-gradient(135deg, #6F48C9 0%, #A8DFE9 100%);
  --gradient-team-red: linear-gradient(135deg, #FF8B83 0%, #C2453A 100%);
  --gradient-badge: var(--gradient-court-action);
}
```

- [ ] **Bước 5: Thay `app/globals.css`**

Thay **toàn bộ** nội dung file bằng:

```css
@import './styles/tokens.css';
@import './styles/primitives.css';
@import './styles/legacy-aliases.css';

html {
  -webkit-text-size-adjust: 100%;
  scroll-behavior: smooth;
}

body {
  margin: 0;
  padding: 0;
  font-family: var(--ph-font);
  background: var(--ph-surface);
  color: var(--ph-text);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

* { box-sizing: border-box; }

a:focus-visible,
button:focus-visible,
input:focus-visible,
select:focus-visible,
textarea:focus-visible {
  outline: 2px solid var(--ph-indigo);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .001ms !important;
    transition-duration: .001ms !important;
    scroll-behavior: auto !important;
  }
}

@media (max-width: 1119px) {
  body {
    padding-bottom: calc(var(--ph-bottom-nav-height) + env(safe-area-inset-bottom));
  }
}
```

Tạo `app/styles/primitives.css` rỗng tạm thời với một dòng bình luận, để `@import` không lỗi:

```css
/* Primitive dùng chung — nội dung ở Task 3. */
```

- [ ] **Bước 6: Nạp Montserrat trong `app/layout.js`**

```js
import { Montserrat } from 'next/font/google'
import './globals.css'

const montserrat = Montserrat({
    subsets: ['latin', 'vietnamese'],
    weight: ['400', '500', '600', '700', '800'],
    display: 'swap',
    variable: '--ph-font-loaded',
})

export const metadata = {
    title: 'Pickhub',
    description: 'Cùng xây dựng cộng đồng Pickleball phát triển.',
}

export const viewport = {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 5,
}

export default function RootLayout({ children }) {
    return (
        <html lang="vi" className={montserrat.variable}>
            <body style={{ fontFamily: 'var(--ph-font-loaded), var(--ph-font)' }}>{children}</body>
        </html>
    )
}
```

- [ ] **Bước 7: Chạy test, xác nhận pass**

```bash
node tests/ph-design-system.test.js
```

Kỳ vọng: `ph-design-system: PASS` kèm dòng đếm tham chiếu còn lại.

- [ ] **Bước 8: Xoá test cũ và cập nhật package.json**

```bash
git rm tests/court-energy-css.test.js
```

Trong `package.json`: xoá dòng `"test:court-energy-css"`, thêm
`"test:ph-ui": "node tests/ph-design-system.test.js"`, và trong `test:regression` thay
`npm run test:court-energy-css` bằng `npm run test:ph-ui`.

- [ ] **Bước 9: Chạy build và regression**

```bash
npm run build && npm run test:regression
```

Kỳ vọng: build xanh, regression xanh.

- [ ] **Bước 10: Commit**

```bash
git add app/styles app/globals.css app/layout.js tests/ph-design-system.test.js package.json
git commit -m "feat(ui): hop nhat token ve --ph-*, nap font Montserrat, thay test court-energy"
```

---

## Task 3: Primitive CSS

**Files:**
- Sửa: `app/styles/tokens.css` (mở rộng thêm token tint)
- Sửa: `app/styles/primitives.css`
- Sửa test: `tests/ph-design-system.test.js`

> **Vì sao có bước mở rộng token ở đây:** primitive cần vài sắc nền nhạt (tint) cho
> metric card, badge và hiệu ứng skeleton — những màu này **không có sẵn** trong
> bảng token của `UI-BRAND-SYSTEM.md`. Ràng buộc tuyệt đối cấm hardcode `#rrggbb`
> trong CSS mới, nên các sắc đó phải trở thành token trước, đúng cách "mở rộng
> baseline" mà `--ph-positive`/`--ph-negative` đã làm ở Task 2 — không phải ngoại lệ,
> không phải hardcode lách luật.

- [ ] **Bước 1: Mở rộng test token, xác nhận fail**

Thêm vào mảng `REQUIRED_TOKENS` trong `tests/ph-design-system.test.js`, ngay sau dòng
`['--ph-radius-lg', '28px'],`:

```js
    ['--ph-tint-indigo', '#F4F2FE'],
    ['--ph-tint-indigo-line', '#DED6FA'],
    ['--ph-tint-gold', '#FFF4DC'],
    ['--ph-tint-gold-line', '#F5E2B8'],
    ['--ph-tint-gold-text', '#8A5B00'],
    ['--ph-tint-cyan', '#EFFAFD'],
    ['--ph-tint-cyan-line', '#C9EDF6'],
    ['--ph-tint-coral', '#FFF1EF'],
    ['--ph-tint-coral-line', '#FBD8D3'],
    ['--ph-tint-positive', '#E8F5EE'],
    ['--ph-tint-negative', '#FDECEA'],
    ['--ph-tint-neutral', '#EEF0F5'],
    ['--ph-tint-neutral-strong', '#F7F8FB'],
```

Và thêm một assert riêng cho `--ph-backdrop` (giá trị là `rgba(...)`, không khớp
regex hex nên kiểm bằng chuỗi):

```js
assert(/--ph-backdrop\s*:\s*rgba\(40,\s*36,\s*61,\s*\.45\)/.test(tokens),
    'tokens.css phải khai --ph-backdrop: rgba(40, 36, 61, .45)');
```

Chạy:

```bash
node tests/ph-design-system.test.js
```

Kỳ vọng: FAIL — `tokens.css phải khai --ph-tint-indigo: #F4F2FE`.

- [ ] **Bước 2: Thêm token tint vào `app/styles/tokens.css`**

Thêm khối này vào cuối `:root` trong `app/styles/tokens.css`, trước dấu `}` đóng:

```css

  /* Mở rộng: nền nhạt (tint) cho metric, badge, skeleton, backdrop modal.
     Không có trong bảng màu baseline — phái sinh từ 4 màu accent đã duyệt. */
  --ph-tint-indigo: #F4F2FE;
  --ph-tint-indigo-line: #DED6FA;
  --ph-tint-gold: #FFF4DC;
  --ph-tint-gold-line: #F5E2B8;
  --ph-tint-gold-text: #8A5B00;
  --ph-tint-cyan: #EFFAFD;
  --ph-tint-cyan-line: #C9EDF6;
  --ph-tint-coral: #FFF1EF;
  --ph-tint-coral-line: #FBD8D3;
  --ph-tint-positive: #E8F5EE;
  --ph-tint-negative: #FDECEA;
  --ph-tint-neutral: #EEF0F5;
  --ph-tint-neutral-strong: #F7F8FB;
  --ph-backdrop: rgba(40, 36, 61, .45); /* --ph-ink ở 45% alpha, dùng cho nền modal */
```

- [ ] **Bước 3: Chạy lại test, xác nhận phần token đã pass**

```bash
node tests/ph-design-system.test.js
```

Kỳ vọng: PASS (primitives.css vẫn còn là placeholder nên chưa có gì để kiểm hardcode,
nhưng toàn bộ assertion token phải xanh).

- [ ] **Bước 4: Viết nội dung `primitives.css`**

Toàn bộ class dùng token, **không hardcode màu dưới bất kỳ hình thức nào** — kể cả
`#fff` tiện tay. Bắt buộc có đủ các họ sau; mỗi họ chỉ một hiện thực:

```css
/* ─── Nút ─── */
.ph-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  min-height: 44px; padding: 0 16px; border: 0; border-radius: var(--ph-radius-sm);
  font: inherit; font-size: 13px; font-weight: 700; cursor: pointer;
  text-decoration: none; transition: background .16s ease, border-color .16s ease;
}
.ph-btn:disabled { opacity: .55; cursor: not-allowed; }
.ph-btn--primary { background: var(--ph-indigo); color: var(--ph-card); }
.ph-btn--primary:hover:not(:disabled) { background: var(--ph-indigo-hover); }
.ph-btn--outline { background: var(--ph-card); color: var(--ph-ink); border: 1px solid var(--ph-line); }
.ph-btn--outline:hover:not(:disabled) { border-color: var(--ph-ink-2); }
.ph-btn--ghost { background: transparent; color: var(--ph-indigo); }
.ph-btn--ghost:hover:not(:disabled) { background: var(--ph-lavender); }
.ph-btn--danger { background: var(--ph-negative); color: var(--ph-card); }
.ph-btn--sm { min-height: 36px; padding: 0 12px; font-size: 12px; }
.ph-btn--block { width: 100%; }

/* ─── Bề mặt ─── */
.ph-card, .ph-panel {
  background: var(--ph-card); border: 1px solid var(--ph-line);
  border-radius: var(--ph-radius-md); box-shadow: var(--ph-shadow-soft);
}
.ph-panel { padding: var(--ph-space-6); }
.ph-card--flat { box-shadow: none; }
.ph-card--raised { box-shadow: var(--ph-shadow); }

/* ─── Metric ─── */
.ph-metric { padding: var(--ph-space-4); border-radius: var(--ph-radius-sm); border: 1px solid var(--ph-line); background: var(--ph-card); }
.ph-metric__label { display: block; font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--ph-muted); }
.ph-metric__value { display: block; margin-top: 6px; font-size: 20px; font-weight: 800; letter-spacing: -.03em; color: var(--ph-ink); font-variant-numeric: tabular-nums; }
.ph-metric--indigo { background: var(--ph-tint-indigo); border-color: var(--ph-tint-indigo-line); }
.ph-metric--gold { background: var(--ph-tint-gold); border-color: var(--ph-tint-gold-line); }
.ph-metric--cyan { background: var(--ph-tint-cyan); border-color: var(--ph-tint-cyan-line); }
.ph-metric--coral { background: var(--ph-tint-coral); border-color: var(--ph-tint-coral-line); }

/* ─── Badge / chip ─── */
.ph-badge, .ph-chip {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 3px 9px; border-radius: 999px;
  font-size: 11px; font-weight: 700; line-height: 1.5;
}
.ph-badge { background: var(--ph-lavender); color: var(--ph-indigo); }
.ph-badge--gold { background: var(--ph-tint-gold); color: var(--ph-tint-gold-text); }
.ph-badge--positive { background: var(--ph-tint-positive); color: var(--ph-positive); }
.ph-badge--negative { background: var(--ph-tint-negative); color: var(--ph-negative); }
.ph-badge--muted { background: var(--ph-tint-neutral); color: var(--ph-muted); }

/* ─── Segmented control ─── */
.ph-seg { display: flex; gap: 3px; padding: 3px; background: var(--ph-card); border: 1px solid var(--ph-line); border-radius: var(--ph-radius-sm); }
.ph-seg__item { flex: 1; min-height: 38px; border: 0; border-radius: 9px; background: transparent; color: var(--ph-muted); font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; }
.ph-seg__item[aria-selected="true"] { background: var(--ph-indigo); color: var(--ph-card); }

/* ─── Bảng: desktop dày, mobile thành card ─── */
.ph-table { width: 100%; border-collapse: collapse; }
.ph-table th { text-align: left; font-size: 10px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: var(--ph-muted); padding: 10px 12px; border-bottom: 1px solid var(--ph-line); }
.ph-table td { padding: 12px; border-bottom: 1px solid var(--ph-line); font-size: 13px; color: var(--ph-text); }
@media (max-width: 767px) {
  .ph-table thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .ph-table tr { display: block; margin-bottom: 10px; padding: 12px; border: 1px solid var(--ph-line); border-radius: var(--ph-radius-sm); background: var(--ph-card); }
  .ph-table td { display: flex; justify-content: space-between; gap: 12px; padding: 6px 0; border: 0; }
  .ph-table td::before { content: attr(data-label); font-size: 11px; font-weight: 700; color: var(--ph-muted); }
}

/* ─── Modal ─── */
.ph-modal__backdrop { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; padding: 16px; background: var(--ph-backdrop); }
.ph-modal { width: min(520px, 100%); max-height: 85vh; overflow: auto; padding: var(--ph-space-6); background: var(--ph-card); border-radius: var(--ph-radius-md); box-shadow: var(--ph-shadow); }
.ph-modal__title { margin: 0 0 8px; font-size: 17px; font-weight: 800; letter-spacing: -.02em; color: var(--ph-ink); }
.ph-modal__actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: var(--ph-space-6); }

/* ─── Trường nhập ─── */
.ph-field { display: grid; gap: 6px; margin-bottom: var(--ph-space-4); }
.ph-field__label { font-size: 12px; font-weight: 700; color: var(--ph-ink); }
.ph-field__control { min-height: 44px; padding: 0 12px; border: 1px solid var(--ph-line); border-radius: var(--ph-radius-sm); background: var(--ph-card); font: inherit; font-size: 14px; color: var(--ph-text); }
.ph-field__error { font-size: 12px; font-weight: 600; color: var(--ph-negative); }

/* ─── Trạng thái ─── */
.ph-state { display: grid; justify-items: center; gap: 8px; padding: 40px 20px; text-align: center; color: var(--ph-muted); }
.ph-state__title { margin: 0; font-size: 15px; font-weight: 800; color: var(--ph-ink); }
.ph-state__text { margin: 0; font-size: 13px; max-width: 42ch; }

/* ─── Skeleton ─── */
@keyframes ph-shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
.ph-skeleton { border-radius: var(--ph-radius-sm); background: linear-gradient(90deg, var(--ph-tint-neutral) 25%, var(--ph-tint-neutral-strong) 37%, var(--ph-tint-neutral) 63%); background-size: 200% 100%; animation: ph-shimmer 1.4s ease infinite; }
.ph-skeleton--text { height: 12px; }
.ph-skeleton--line { height: 16px; }
.ph-skeleton--row { height: 46px; margin-bottom: 8px; }
.ph-skeleton--card { height: 140px; }
@media (prefers-reduced-motion: reduce) { .ph-skeleton { animation: none; } }
```

- [ ] **Bước 5: Mở rộng test chặn hardcode hex trong CSS mới**

Thêm vào cuối `tests/ph-design-system.test.js`, trước dòng `console.log('ph-design-system: PASS');`:

```js
// Không hardcode #rrggbb trong CSS mới — mọi màu phải đi qua token.
// tokens.css và legacy-aliases.css là hai file DUY NHẤT được phép chứa giá trị hex thô,
// vì đó chính là tầng định nghĩa token.
const HEX_COLOR = /#[0-9a-fA-F]{3,8}\b/g;
const NEW_CSS_FILES = ['app/styles/primitives.css', 'components/pickhub/AppShell.css'];
for (const file of NEW_CSS_FILES) {
    const fullPath = path.join(root, file);
    if (!fs.existsSync(fullPath)) continue; // AppShell.css chưa tồn tại trước Task 5
    const hits = read(file).match(HEX_COLOR) || [];
    assert.strictEqual(hits.length, 0, `${file} không được hardcode màu (thấy: ${hits.join(', ')}); dùng var(--ph-*)`);
}
```

- [ ] **Bước 6: Chạy test, xác nhận toàn bộ pass**

```bash
node tests/ph-design-system.test.js
```

Kỳ vọng: PASS, không còn dòng nào trong `primitives.css` bị bắt lỗi hardcode.

- [ ] **Bước 7: Build và commit**

```bash
npm run build
git add app/styles/tokens.css app/styles/primitives.css tests/ph-design-system.test.js
git commit -m "feat(ui): mo rong token tint, them lop primitive ph-* khong hardcode mau"
```

---

## Task 4: Component React — PhModal, PhConfirm, PhSeg

**Files:**
- Tạo: `components/pickhub/PhModal.js`, `PhConfirm.js`, `PhSeg.js`
- Tạo test: `tests/ph-components.test.js`

- [ ] **Bước 1: Viết test thất bại**

Test này kiểm **contract tĩnh** — có mặt các hành vi bắt buộc trong source — vì dự án không
có DOM test runner. Tạo `tests/ph-components.test.js`:

```js
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

const modal = read('components/pickhub/PhModal.js');
assert(/role="dialog"/.test(modal), 'PhModal phải có role="dialog"');
assert(/aria-modal="true"/.test(modal), 'PhModal phải có aria-modal');
assert(/aria-labelledby/.test(modal), 'PhModal phải trỏ aria-labelledby tới tiêu đề');
assert(/Escape/.test(modal), 'PhModal phải đóng bằng phím Escape');
assert(/previouslyFocused|previousFocus/.test(modal), 'PhModal phải nhớ và trả lại focus');
assert(/Tab/.test(modal), 'PhModal phải bẫy focus bằng Tab');

const seg = read('components/pickhub/PhSeg.js');
assert(/role="tablist"/.test(seg), 'PhSeg phải có role="tablist"');
assert(/role="tab"/.test(seg), 'PhSeg mỗi mục phải có role="tab"');
assert(/aria-selected/.test(seg), 'PhSeg phải có aria-selected');
assert(/tabIndex/.test(seg), 'PhSeg phải dùng roving tabindex');
assert(/ArrowRight/.test(seg) && /ArrowLeft/.test(seg), 'PhSeg phải hỗ trợ mũi tên trái/phải');
assert(/\bHome\b/.test(seg) && /\bEnd\b/.test(seg), 'PhSeg phải hỗ trợ Home/End');

const confirmSrc = read('components/pickhub/PhConfirm.js');
assert(/PhModal/.test(confirmSrc), 'PhConfirm phải dựng trên PhModal');

// Không được dùng confirm()/prompt() trong code mới.
for (const f of ['components/pickhub/PhConfirm.js', 'components/pickhub/PhModal.js']) {
    assert(!/window\.(confirm|prompt)\s*\(/.test(read(f)), `${f} không được dùng window.confirm/prompt`);
}

console.log('ph-components: PASS');
```

- [ ] **Bước 2: Chạy test, xác nhận fail**

```bash
node tests/ph-components.test.js
```

Kỳ vọng: FAIL với `ENOENT ... components/pickhub/PhModal.js`.

- [ ] **Bước 3: Viết `components/pickhub/PhModal.js`**

```js
'use client';

import { useEffect, useId, useRef } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function PhModal({ open, title, onClose, children, footer }) {
    const dialogRef = useRef(null);
    const previouslyFocused = useRef(null);
    const titleId = useId();

    useEffect(() => {
        if (!open) return undefined;

        previouslyFocused.current = document.activeElement;
        const node = dialogRef.current;
        const first = node?.querySelector(FOCUSABLE);
        (first || node)?.focus();

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        function onKeyDown(event) {
            if (event.key === 'Escape') {
                event.stopPropagation();
                onClose();
                return;
            }
            if (event.key !== 'Tab') return;
            const items = Array.from(node?.querySelectorAll(FOCUSABLE) || []);
            if (items.length === 0) return;
            const firstItem = items[0];
            const lastItem = items[items.length - 1];
            if (event.shiftKey && document.activeElement === firstItem) {
                event.preventDefault();
                lastItem.focus();
            } else if (!event.shiftKey && document.activeElement === lastItem) {
                event.preventDefault();
                firstItem.focus();
            }
        }

        document.addEventListener('keydown', onKeyDown, true);
        return () => {
            document.removeEventListener('keydown', onKeyDown, true);
            document.body.style.overflow = previousOverflow;
            if (previouslyFocused.current instanceof HTMLElement) previouslyFocused.current.focus();
        };
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div className="ph-modal__backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
            <div
                className="ph-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                tabIndex={-1}
                ref={dialogRef}
            >
                <h2 className="ph-modal__title" id={titleId}>{title}</h2>
                {children}
                {footer && <div className="ph-modal__actions">{footer}</div>}
            </div>
        </div>
    );
}
```

- [ ] **Bước 4: Viết `components/pickhub/PhConfirm.js`**

```js
'use client';

import { useEffect, useRef } from 'react';
import PhModal from './PhModal';

export default function PhConfirm({ open, title, message, confirmLabel = 'Xác nhận', cancelLabel = 'Hủy', tone = 'default', onConfirm, onCancel }) {
    const cancelRef = useRef(null);

    useEffect(() => {
        if (open && tone === 'danger') cancelRef.current?.focus();
    }, [open, tone]);

    return (
        <PhModal
            open={open}
            title={title}
            onClose={onCancel}
            footer={
                <>
                    <button type="button" className="ph-btn ph-btn--outline" ref={cancelRef} onClick={onCancel}>{cancelLabel}</button>
                    <button
                        type="button"
                        className={`ph-btn ${tone === 'danger' ? 'ph-btn--danger' : 'ph-btn--primary'}`}
                        onClick={onConfirm}
                    >
                        {confirmLabel}
                    </button>
                </>
            }
        >
            <p className="ph-state__text" style={{ margin: 0, maxWidth: 'none' }}>{message}</p>
        </PhModal>
    );
}
```

- [ ] **Bước 5: Viết `components/pickhub/PhSeg.js`**

```js
'use client';

import { useRef } from 'react';

export default function PhSeg({ items, value, onChange, label }) {
    const refs = useRef([]);

    function focusIndex(index) {
        const next = (index + items.length) % items.length;
        onChange(items[next].value);
        refs.current[next]?.focus();
    }

    function onKeyDown(event, index) {
        if (event.key === 'ArrowRight') { event.preventDefault(); focusIndex(index + 1); }
        else if (event.key === 'ArrowLeft') { event.preventDefault(); focusIndex(index - 1); }
        else if (event.key === 'Home') { event.preventDefault(); focusIndex(0); }
        else if (event.key === 'End') { event.preventDefault(); focusIndex(items.length - 1); }
    }

    return (
        <div className="ph-seg" role="tablist" aria-label={label}>
            {items.map((item, index) => {
                const selected = item.value === value;
                return (
                    <button
                        key={item.value}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        tabIndex={selected ? 0 : -1}
                        className="ph-seg__item"
                        ref={(node) => { refs.current[index] = node; }}
                        onKeyDown={(event) => onKeyDown(event, index)}
                        onClick={() => onChange(item.value)}
                    >
                        {item.label}
                    </button>
                );
            })}
        </div>
    );
}
```

- [ ] **Bước 6: Chạy test, xác nhận pass**

```bash
node tests/ph-components.test.js && npm run build
```

- [ ] **Bước 7: Commit**

```bash
git add components/pickhub tests/ph-components.test.js
git commit -m "feat(ui): them PhModal, PhConfirm, PhSeg co bay focus va dieu huong ban phim"
```

---

## Task 5: App shell và breakpoint điều hướng

**Files:**
- Tạo: `components/pickhub/AppShell.js`, `components/pickhub/SideRail.js`, `components/pickhub/AppShell.css`
- Sửa: `app/quy/layout.js`, `app/admin/page.js`, `app/thong-tin/page.js`, `app/giai-dau/layout.js`, `components/MobileBottomNav.css`
- Sửa test: `tests/global-navigation.test.js`, `tests/mobile-bottom-tabs.test.js`

- [ ] **Bước 1: Mở rộng test điều hướng, xác nhận fail**

Thêm vào cuối `tests/mobile-bottom-tabs.test.js`:

```js
const bottomNavCss = fs.readFileSync(path.join(root, 'components/MobileBottomNav.css'), 'utf8');
assert(
    /max-width:\s*1119px/.test(bottomNavCss),
    'Bottom nav phải hiển thị tới < 1120px vì side rail chỉ bắt đầu từ 1120px'
);
assert(
    !/max-width:\s*768px/.test(bottomNavCss),
    'Không được để bottom nav dừng ở 768px — dải 768-1119px sẽ mất điều hướng'
);
```

Thêm vào cuối `tests/global-navigation.test.js`:

```js
const fs2 = require('fs');
const path2 = require('path');
const root2 = path2.resolve(__dirname, '..');
const shell = fs2.readFileSync(path2.join(root2, 'components/pickhub/AppShell.js'), 'utf8');
assert(/SideRail/.test(shell), 'AppShell phải render SideRail');
assert(/MobileBottomNav/.test(shell), 'AppShell phải render MobileBottomNav');

// Không route nào được render header hai lần.
for (const page of ['app/admin/page.js', 'app/thong-tin/page.js']) {
    const src = fs2.readFileSync(path2.join(root2, page), 'utf8');
    assert(!/HomeHeader/.test(src), `${page} không được tự render HomeHeader nữa — shell nằm ở AppShell`);
}
```

```bash
node tests/mobile-bottom-tabs.test.js
```

Kỳ vọng: FAIL.

- [ ] **Bước 2: Sửa breakpoint bottom nav**

Trong `components/MobileBottomNav.css`, đổi mọi `@media (max-width: 768px)` thành
`@media (max-width: 1119px)` và mọi `@media (min-width: 769px)` thành
`@media (min-width: 1120px)`.

- [ ] **Bước 3: Viết `components/pickhub/SideRail.js`**

```js
'use client';

import { usePathname } from 'next/navigation';
import navigation from '@/lib/globalNavigation';

const { getGlobalNavLinksForRole, isGlobalNavActive } = navigation;

export default function SideRail({ role }) {
    const pathname = usePathname();
    const links = getGlobalNavLinksForRole(role);

    return (
        <nav className="ph-rail" aria-label="Điều hướng chính">
            <span className="ph-rail__label">CLB của tôi</span>
            {links.map((link) => {
                const active = isGlobalNavActive(pathname, link.href);
                return (
                    <a
                        key={link.href}
                        href={link.href}
                        className={`ph-rail__link${active ? ' is-active' : ''}`}
                        aria-current={active ? 'page' : undefined}
                    >
                        <span aria-hidden="true">{link.icon}</span>
                        <span>{link.label}</span>
                    </a>
                );
            })}
        </nav>
    );
}
```

- [ ] **Bước 4: Viết `components/pickhub/AppShell.css`**

```css
.ph-shell { min-height: 100vh; background: var(--ph-surface); }
.ph-shell__body { display: block; }

.ph-rail { display: none; }
.ph-rail__label { display: block; padding: 0 12px 10px; font-size: 10px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; color: var(--ph-muted); }
.ph-rail__link { display: flex; align-items: center; gap: 11px; min-height: 44px; padding: 0 12px; border-radius: var(--ph-radius-sm); color: var(--ph-ink-2); font-size: 13px; font-weight: 700; text-decoration: none; }
.ph-rail__link:hover, .ph-rail__link.is-active { background: var(--ph-lavender); color: var(--ph-indigo); }

.ph-shell__main { width: min(1160px, 100%); margin: 0 auto; padding: 24px 16px 48px; }

@media (min-width: 768px) {
  .ph-shell__main { padding: 32px 24px 56px; }
}

@media (min-width: 1120px) {
  .ph-shell__body { display: grid; grid-template-columns: var(--ph-rail-width) minmax(0, 1fr); }
  .ph-rail { display: flex; flex-direction: column; gap: 4px; padding: 28px 16px; background: var(--ph-card); border-right: 1px solid var(--ph-line); }
  .ph-shell__main { padding: 40px 40px 64px; }
}
```

- [ ] **Bước 5: Viết `components/pickhub/AppShell.js`**

```js
'use client';

import { useEffect, useState } from 'react';
import HomeHeader from '@/components/HomeHeader';
import MobileBottomNav from '@/components/MobileBottomNav';
import SideRail from './SideRail';
import PhNotificationBell from './PhNotificationBell';
import './AppShell.css';

export default function AppShell({ children }) {
    const [role, setRole] = useState('member');

    useEffect(() => {
        let active = true;
        fetch('/api/groups/session', { cache: 'no-store' })
            .then((response) => (response.ok ? response.json() : null))
            .then((payload) => {
                const sessionRole = payload?.session?.role;
                if (active && payload?.permissions?.canViewClub && ['admin', 'member'].includes(sessionRole)) {
                    setRole(sessionRole);
                }
            })
            .catch(() => {});
        return () => { active = false; };
    }, []);

    return (
        <div className="ph-shell">
            <HomeHeader trailing={role === 'admin' ? <PhNotificationBell /> : null} />
            <div className="ph-shell__body">
                <SideRail role={role} />
                <main className="ph-shell__main">{children}</main>
            </div>
            <MobileBottomNav />
        </div>
    );
}
```

> `PhNotificationBell` được tạo ở Task 12. Cho tới lúc đó, tạo file tạm
> `components/pickhub/PhNotificationBell.js` với nội dung
> `'use client'; export default function PhNotificationBell() { return null; }`
> để build không gãy, và Task 12 sẽ viết đè.

- [ ] **Bước 6: Cho `HomeHeader` nhận prop `trailing`**

Trong `components/HomeHeader.js`: đổi chữ ký thành
`export default function HomeHeader({ trailing = null })`, xoá khối `<nav className="header-nav">`
(điều hướng đã chuyển sang side rail và bottom nav), và trong `<div className="header-right">`
chèn `{trailing}` **trước** `<UserStatusBadge …/>`.

- [ ] **Bước 7: Áp AppShell vào 4 nơi**

`app/quy/layout.js`:

```js
import AppShell from '@/components/pickhub/AppShell';

export default function QuyLayout({ children }) {
    return <AppShell>{children}</AppShell>;
}
```

`app/giai-dau/layout.js`: **chỉ đổi import và JSX**, giữ nguyên mọi thứ khác:

```js
import AppShell from '@/components/pickhub/AppShell';

export default function GiaiDauLayout({ children }) {
    return <AppShell>{children}</AppShell>;
}
```

`app/admin/page.js` và `app/thong-tin/page.js`: xoá `import HomeHeader`, `import MobileBottomNav`
và hai thẻ tương ứng trong JSX; bọc nội dung bằng `<AppShell>`.

- [ ] **Bước 8: Chạy test và build**

```bash
node tests/mobile-bottom-tabs.test.js && node tests/global-navigation.test.js && npm run build
```

- [ ] **Bước 9: Commit**

```bash
git add components/pickhub app/quy/layout.js app/giai-dau/layout.js app/admin/page.js app/thong-tin/page.js components/HomeHeader.js components/MobileBottomNav.css tests/
git commit -m "feat(ui): AppShell dung chung, side rail desktop, bottom nav toi 1119px"
```

---

## Task 6: Migration 043

**Files:** Tạo `database/migrations/043_club_notifications_and_bxh_flag.sql`

- [ ] **Bước 1: Viết file migration**

```sql
-- 043: Thông báo cấp CLB và công tắc huy hiệu BXH. Additive, idempotent.
BEGIN;

CREATE TABLE IF NOT EXISTS public.club_notifications (
  id           bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  group_id     bigint NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  kind         text   NOT NULL,
  subject_type text,
  subject_id   bigint,
  payload      jsonb  NOT NULL DEFAULT '{}'::jsonb,
  status       text   NOT NULL DEFAULT 'open',
  resolved_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT club_notifications_status_check CHECK (status IN ('open', 'resolved', 'dismissed'))
);

CREATE INDEX IF NOT EXISTS idx_club_notifications_open
  ON public.club_notifications(group_id, status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_club_notifications_subject
  ON public.club_notifications(group_id, kind, subject_type, subject_id)
  WHERE subject_id IS NOT NULL;

ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS shame_badges_enabled boolean NOT NULL DEFAULT true;

COMMENT ON TABLE public.club_notifications IS
  'Hàng đợi việc cần trưởng nhóm xử lý ở cấp CLB. Không dùng làm dòng thời gian tin tức.';

COMMIT;
```

- [ ] **Bước 2: Chạy preflight**

```sql
select to_regclass('public.club_notifications') as bang_da_ton_tai,
       (select count(*) from information_schema.columns
        where table_name='groups' and column_name='shame_badges_enabled') as cot_da_ton_tai;
```

Kỳ vọng: `null` và `0` trước khi apply.

- [ ] **Bước 3: Apply qua Supabase MCP**

Dùng `apply_migration` trên project `uhhlelemewilgsdijwja`.

- [ ] **Bước 4: Verification**

```sql
select to_regclass('public.club_notifications') as bang,
       (select count(*) from information_schema.columns
        where table_name='groups' and column_name='shame_badges_enabled') as cot,
       (select count(*) from public.groups where shame_badges_enabled is null) as null_con_lai;
```

Kỳ vọng: `public.club_notifications`, `1`, `0`. **Dán kết quả thật vào báo cáo.**

- [ ] **Bước 5: Cập nhật ledger**

```bash
npm run migration:ledger
```

- [ ] **Bước 6: Commit**

```bash
git add database/migrations/043_club_notifications_and_bxh_flag.sql
git commit -m "feat(db): bang club_notifications va cot shame_badges_enabled"
```

---

## Task 7: Chuẩn hoá `Unknown` trong parser

**Files:**
- Sửa: `lib/transaction-parser.js`
- Tạo: `scripts/backfill-unknown-nguoi-nop.js`
- Tạo test: `tests/club-notifications.test.js` (phần parser)

- [ ] **Bước 1: Viết test thất bại**

Tạo `tests/club-notifications.test.js`:

```js
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const parserSrc = fs.readFileSync(path.join(root, 'lib/transaction-parser.js'), 'utf8');

assert(
    !/memberName\s*=\s*normalizeText\(accountName\.substring/.test(parserSrc),
    'Parser không được ghi nội dung ngân hàng vào nguoi_nop; phải ghi "Unknown"'
);
assert(
    (parserSrc.match(/memberName\s*=\s*'Unknown'/g) || []).length >= 2,
    'Cả hai nhánh fallback (fallback_raw và no_match) phải ghi "Unknown"'
);
assert(
    /parsingMethod\s*=\s*'no_match'/.test(parserSrc),
    'Vẫn giữ parsingMethod để chẩn đoán'
);

console.log('club-notifications (parser): PASS');
```

- [ ] **Bước 2: Chạy test, xác nhận fail**

```bash
node tests/club-notifications.test.js
```

Kỳ vọng: FAIL ở assert đầu tiên.

- [ ] **Bước 3: Sửa `lib/transaction-parser.js`**

Trong nhánh nội dung rỗng (`if (!content || content.trim().length === 0)`), đổi:

```js
      } else {
        result.memberName = normalizeText(accountName.substring(0, 50));
        result.confidence = 20;
        result.parsingMethod = 'fallback_raw';
      }
```

thành:

```js
      } else {
        // Không nhận diện được: luôn ghi sentinel 'Unknown'.
        // Nội dung gốc vẫn được lưu đầy đủ ở cột noi_dung_goc.
        result.memberName = 'Unknown';
        result.confidence = 20;
        result.parsingMethod = 'fallback_raw';
      }
```

Trong nhánh chính, đổi:

```js
      } else {
        result.memberName = normalizeText(accountName.substring(0, 50));
        result.confidence = 15;
        result.parsingMethod = 'no_match';
      }
```

thành:

```js
      } else {
        // Không nhận diện được: luôn ghi sentinel 'Unknown'.
        result.memberName = 'Unknown';
        result.confidence = 15;
        result.parsingMethod = 'no_match';
      }
```

- [ ] **Bước 4: Chạy test, xác nhận pass**

```bash
node tests/club-notifications.test.js
```

- [ ] **Bước 5: Viết script dọn tồn đọng**

Tạo `scripts/backfill-unknown-nguoi-nop.js`. Script **chỉ in ra SQL và số đếm**, không tự
chạy UPDATE — người thực thi chạy qua Supabase MCP sau khi đọc số liệu:

```js
// Dọn tồn đọng: đặt nguoi_nop = 'Unknown' cho giao dịch chiều vào KHÔNG khớp roster.
// Chạy: node scripts/backfill-unknown-nguoi-nop.js <groupId>
// Script không tự ghi database. Nó in ra 3 câu SQL để chạy theo thứ tự.
const groupId = Number(process.argv[2]);
if (!Number.isInteger(groupId) || groupId <= 0) {
    console.error('Thiếu groupId hợp lệ. Ví dụ: node scripts/backfill-unknown-nguoi-nop.js 1');
    process.exit(1);
}

console.log(`-- BƯỚC 1: đếm trước (ghi kết quả vào evidence)
select count(*) as se_doi, count(distinct nguoi_nop) as so_chuoi_rac
from quy_pickleball q
where q.group_id = ${groupId}
  and q.huong_giao_dich = 'in'
  and q.nguoi_nop <> 'Unknown'
  and not exists (
    select 1 from club_members m
    where m.group_id = q.group_id and upper(m.full_name) = upper(q.nguoi_nop)
  );

-- BƯỚC 2: cập nhật (chỉ chạy sau khi đã ghi số ở bước 1)
update quy_pickleball q
set nguoi_nop = 'Unknown'
where q.group_id = ${groupId}
  and q.huong_giao_dich = 'in'
  and q.nguoi_nop <> 'Unknown'
  and not exists (
    select 1 from club_members m
    where m.group_id = q.group_id and upper(m.full_name) = upper(q.nguoi_nop)
  );

-- BƯỚC 3: đếm sau (phải bằng 0)
select count(*) as con_lai
from quy_pickleball q
where q.group_id = ${groupId}
  and q.huong_giao_dich = 'in'
  and q.nguoi_nop <> 'Unknown'
  and not exists (
    select 1 from club_members m
    where m.group_id = q.group_id and upper(m.full_name) = upper(q.nguoi_nop)
  );`);
```

- [ ] **Bước 6: Chạy dọn tồn đọng và ghi evidence**

```bash
node scripts/backfill-unknown-nguoi-nop.js 1
```

Chạy 3 câu SQL theo thứ tự qua Supabase MCP. **Dán cả 3 kết quả vào
`docs/pickhub-core/evidence/`.** Kỳ vọng bước 1 trả khoảng 28–36 dòng, bước 3 trả `0`.

Nếu bước 1 trả con số lớn bất thường (> 100), **dừng lại và báo cáo** — có thể roster
đang thiếu người và ta sắp xoá tên thật.

- [ ] **Bước 7: Commit**

```bash
git add lib/transaction-parser.js scripts/backfill-unknown-nguoi-nop.js tests/club-notifications.test.js docs/pickhub-core/evidence/
git commit -m "fix(quy): ghi Unknown khi khong nhan dien duoc nguoi nop, don ton dong"
```

---

## Task 8: Đọc đủ giao dịch

**Files:**
- Tạo: `lib/fundContributions.js`
- Tạo test: `tests/transactions-completeness.test.js`

- [ ] **Bước 1: Viết test thất bại**

```js
const assert = require('assert');
const { fetchAllRows } = require('../lib/fundContributions.js');

// Giả lập một client Supabase trả về theo trang, mỗi trang tối đa 1000 hàng.
function fakeClient(total) {
    return {
        from() { return this; },
        select() { return this; },
        eq() { return this; },
        order() { return this; },
        range(from, to) {
            const rows = [];
            for (let i = from; i <= Math.min(to, total - 1); i += 1) rows.push({ id: i + 1 });
            return Promise.resolve({ data: rows, error: null });
        },
    };
}

(async () => {
    const rows = await fetchAllRows(fakeClient(2500), { table: 'quy_pickleball', groupId: 1 });
    assert.strictEqual(rows.length, 2500, 'Phải đọc đủ 2500 hàng, không bị cắt ở 1000');

    const small = await fetchAllRows(fakeClient(12), { table: 'quy_pickleball', groupId: 1 });
    assert.strictEqual(small.length, 12, 'Bộ nhỏ vẫn phải đúng');

    const empty = await fetchAllRows(fakeClient(0), { table: 'quy_pickleball', groupId: 1 });
    assert.deepStrictEqual(empty, [], 'Bộ rỗng trả mảng rỗng');

    console.log('transactions-completeness: PASS');
})();
```

- [ ] **Bước 2: Chạy test, xác nhận fail**

```bash
node tests/transactions-completeness.test.js
```

Kỳ vọng: FAIL vì chưa có module.

- [ ] **Bước 3: Viết `lib/fundContributions.js`**

```js
// Đọc đủ dữ liệu bất kể trần số hàng của PostgREST (mặc định 1000).
// Dùng chung cho trang BXH và route sinh ảnh, để hai nơi không bao giờ lệch nhau.
const PAGE_SIZE = 1000;

async function fetchAllRows(client, { table, groupId, orderColumn = 'created_at' }) {
    const rows = [];
    for (let page = 0; ; page += 1) {
        const from = page * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;
        const { data, error } = await client
            .from(table)
            .select('*')
            .eq('group_id', groupId)
            .order(orderColumn, { ascending: false })
            .range(from, to);
        if (error) throw new Error(error.message);
        const batch = data || [];
        rows.push(...batch);
        if (batch.length < PAGE_SIZE) return rows;
    }
}

async function loadContributionInputs(client, groupId) {
    const [transactions, members] = await Promise.all([
        fetchAllRows(client, { table: 'quy_pickleball', groupId }),
        fetchAllRows(client, { table: 'club_members', groupId, orderColumn: 'full_name' }),
    ]);
    return { transactions, members };
}

module.exports = { fetchAllRows, loadContributionInputs, PAGE_SIZE };
```

- [ ] **Bước 4: Chạy test, xác nhận pass**

```bash
node tests/transactions-completeness.test.js
```

- [ ] **Bước 5: Dùng trong `app/api/club/transactions/route.js`**

Thay thân hàm `GET`:

```js
import { loadContributionInputs } from '@/lib/fundContributions';

export async function GET() {
    const groupId = getGroupIdForDatabase();
    try {
        const { transactions } = await loadContributionInputs(supabaseAdmin, groupId);
        return NextResponse.json({ transactions });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
```

- [ ] **Bước 6: Chạy build và commit**

```bash
npm run build
git add lib/fundContributions.js app/api/club/transactions/route.js tests/transactions-completeness.test.js
git commit -m "fix(quy): doc du giao dich bang phan trang, khong bi cat o 1000 hang"
```

---

## Task 9: Logic BXH đóng góp

**Files:**
- Sửa: `lib/fundLeaderboard.js` (viết lại)
- Sửa test: `tests/fund-leaderboard.test.js`

- [ ] **Bước 1: Viết test thất bại**

Thay toàn bộ `tests/fund-leaderboard.test.js`:

```js
const assert = require('assert');
const {
    getPeriodBounds,
    buildContributionLeaderboard,
    normalizeName,
} = require('../lib/fundLeaderboard.js');

const members = [
    { full_name: 'NGUYỄN VĂN A', is_active: true },
    { full_name: 'TRẦN THỊ B', is_active: true },
    { full_name: 'LÊ VĂN C', is_active: false },
];

function tx(name, amount, iso, loai = 'nop_phat') {
    return { nguoi_nop: name, so_tien: amount, created_at: iso, huong_giao_dich: 'in', loai_giao_dich: loai };
}

// Mốc 2026-09-08 là thứ Ba. Tuần bắt đầu thứ Hai 2026-09-07 00:00 giờ VN.
const now = new Date('2026-09-08T05:00:00.000Z'); // 12:00 giờ VN

// ─── Múi giờ ───
const week = getPeriodBounds('week', now);
assert.strictEqual(week.start.toISOString(), '2026-09-06T17:00:00.000Z',
    'Đầu tuần phải là thứ Hai 00:00 giờ VN = 17:00 UTC chủ nhật trước đó');

const month = getPeriodBounds('month', now);
assert.strictEqual(month.start.toISOString(), '2026-08-31T17:00:00.000Z',
    'Đầu tháng phải là ngày 1 lúc 00:00 giờ VN');

const year = getPeriodBounds('year', now);
assert.strictEqual(year.start.toISOString(), '2025-12-31T17:00:00.000Z',
    'Đầu năm phải là 01/01 lúc 00:00 giờ VN');

assert.strictEqual(getPeriodBounds('all', now).start, null, 'Mốc all không có đầu kỳ');

// ─── Gộp mọi loại khoản ───
const board = buildContributionLeaderboard({
    transactions: [
        tx('NGUYỄN VĂN A', 100000, '2026-09-08T02:00:00.000Z', 'nop_phat'),
        tx('NGUYỄN VĂN A', 500000, '2026-09-08T03:00:00.000Z', 'khac'),
        tx('TRẦN THỊ B', 200000, '2026-09-08T02:00:00.000Z', 'nop_quy'),
    ],
    members, period: 'week', now,
});
assert.strictEqual(board.rows[0].name, 'NGUYỄN VĂN A');
assert.strictEqual(board.rows[0].amount, 600000, 'Phải cộng cả khoản loại khac');
assert.strictEqual(board.summary.totalAmount, 800000);

// ─── Lọc theo roster, không cần danh sách đen ───
const withJunk = buildContributionLeaderboard({
    transactions: [
        tx('NGUYỄN VĂN A', 100000, '2026-09-08T02:00:00.000Z'),
        tx('BANKAPINOTIFY NOP TIEN QUY 3', 1560000, '2026-09-08T02:00:00.000Z'),
        tx('Unknown', 50000, '2026-09-08T02:00:00.000Z'),
        tx('THỦ QUỸ', 6240000, '2026-09-08T02:00:00.000Z'),
        tx('TAI KHOAN GOC', 1544000, '2026-09-08T02:00:00.000Z'),
    ],
    members, period: 'week', now,
});
assert.strictEqual(withJunk.rows.length, 1, 'Chỉ người trong roster mới lên bảng');
assert.strictEqual(withJunk.unassigned.amount, 9394000, 'Tiền không vào bảng phải được cộng riêng');
assert.strictEqual(withJunk.unassigned.count, 4);

// ─── Quy tắc hoà: tiền → số lượt → tên ───
const tie = buildContributionLeaderboard({
    transactions: [
        tx('TRẦN THỊ B', 100000, '2026-09-08T02:00:00.000Z'),
        tx('NGUYỄN VĂN A', 50000, '2026-09-08T02:00:00.000Z'),
        tx('NGUYỄN VĂN A', 50000, '2026-09-08T03:00:00.000Z'),
    ],
    members, period: 'week', now,
});
assert.strictEqual(tie.rows[0].name, 'NGUYỄN VĂN A', 'Hoà tiền thì nhiều lượt hơn xếp trên');

// ─── Số tiền không hợp lệ và ngày sai ───
const invalid = buildContributionLeaderboard({
    transactions: [
        tx('NGUYỄN VĂN A', 0, '2026-09-08T02:00:00.000Z'),
        tx('NGUYỄN VĂN A', -5000, '2026-09-08T02:00:00.000Z'),
        tx('NGUYỄN VĂN A', 10000, 'ngay-khong-hop-le'),
    ],
    members, period: 'week', now,
});
assert.strictEqual(invalid.rows.length, 0, 'Tiền ≤ 0 và ngày sai đều bị loại');

// ─── Streak ───
const streak = buildContributionLeaderboard({
    transactions: [
        tx('NGUYỄN VĂN A', 10000, '2026-09-08T02:00:00.000Z'),
        tx('NGUYỄN VĂN A', 10000, '2026-09-01T02:00:00.000Z'),
        tx('NGUYỄN VĂN A', 10000, '2026-08-25T02:00:00.000Z'),
    ],
    members, period: 'week', now,
});
assert.strictEqual(streak.rows[0].streak, 3, 'Ba tuần liên tiếp = streak 3');

const broken = buildContributionLeaderboard({
    transactions: [
        tx('NGUYỄN VĂN A', 10000, '2026-09-08T02:00:00.000Z'),
        tx('NGUYỄN VĂN A', 10000, '2026-08-25T02:00:00.000Z'),
    ],
    members, period: 'week', now,
});
assert.strictEqual(broken.rows[0].streak, 1, 'Thiếu một tuần thì streak đứt');

const noStreak = buildContributionLeaderboard({
    transactions: [tx('NGUYỄN VĂN A', 10000, '2026-09-08T02:00:00.000Z')],
    members, period: 'all', now,
});
assert.strictEqual(noStreak.rows[0].streak, 0, 'Mốc all không tính streak');

// ─── Huy hiệu ───
const badges = buildContributionLeaderboard({
    transactions: [
        tx('NGUYỄN VĂN A', 10000, '2026-09-08T02:00:00.000Z'),
        tx('NGUYỄN VĂN A', 10000, '2026-09-01T02:00:00.000Z'),
        tx('NGUYỄN VĂN A', 10000, '2026-08-25T02:00:00.000Z'),
        tx('TRẦN THỊ B', 90000, '2026-09-01T02:00:00.000Z'),
    ],
    members, period: 'week', now,
});
const kinds = badges.rows.find((r) => r.name === 'NGUYỄN VĂN A').badges.map((b) => b.kind);
assert(kinds.includes('streak'), 'Streak ≥ 3 phải sinh huy hiệu');
const champion = badges.rows.find((r) => r.badges.some((b) => b.kind === 'champion'));
assert.strictEqual(champion.name, 'TRẦN THỊ B', 'Quán quân lấy hạng 1 của kỳ hoàn tất gần nhất');

const first = buildContributionLeaderboard({
    transactions: [tx('TRẦN THỊ B', 20000, '2026-09-08T02:00:00.000Z')],
    members, period: 'week', now,
});
assert(first.rows[0].badges.some((b) => b.kind === 'first_time'),
    'Giao dịch đầu tiên nằm trong kỳ đang xem thì có huy hiệu lần đầu');

// ─── Trắng tay ───
const idle = buildContributionLeaderboard({
    transactions: [
        tx('NGUYỄN VĂN A', 10000, '2026-09-08T02:00:00.000Z'),
        tx('TRẦN THỊ B', 10000, '2026-08-04T02:00:00.000Z'),
    ],
    members, period: 'week', now, shameBadgesEnabled: true,
});
assert(idle.idle.some((p) => p.name === 'TRẦN THỊ B'), 'B vắng ≥3 tuần hoàn tất');
assert(!idle.idle.some((p) => p.name === 'LÊ VĂN C'), 'Người is_active=false không bị gắn nhãn');

const idleOff = buildContributionLeaderboard({
    transactions: [
        tx('NGUYỄN VĂN A', 10000, '2026-09-08T02:00:00.000Z'),
        tx('TRẦN THỊ B', 10000, '2026-08-04T02:00:00.000Z'),
    ],
    members, period: 'week', now, shameBadgesEnabled: false,
});
assert.deepStrictEqual(idleOff.idle, [], 'Công tắc tắt thì không ai bị gắn nhãn');

const newcomer = buildContributionLeaderboard({
    transactions: [tx('NGUYỄN VĂN A', 10000, '2026-09-08T02:00:00.000Z')],
    members, period: 'week', now, shameBadgesEnabled: true,
});
assert(!newcomer.idle.some((p) => p.name === 'TRẦN THỊ B'),
    'Người chưa từng đóng lần nào không bị gắn nhãn trắng tay');

assert.strictEqual(normalizeName('  nguyễn   văn a '), 'NGUYỄN VĂN A');

console.log('fund-leaderboard: PASS');
```

- [ ] **Bước 2: Chạy test, xác nhận fail**

```bash
node tests/fund-leaderboard.test.js
```

Kỳ vọng: FAIL vì `getPeriodBounds` chưa tồn tại.

- [ ] **Bước 3: Viết lại `lib/fundLeaderboard.js`**

```js
// BXH đóng góp — hàm thuần, không I/O.
// Múi giờ chốt là Asia/Ho_Chi_Minh (UTC+7, không có DST) để client và server
// sinh ảnh luôn cắt cùng một biên kỳ.
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const EXCLUDED_SENTINELS = new Set(['', 'UNKNOWN', 'TAI KHOAN GOC', 'THỦ QUỸ']);
const STREAK_DISPLAY_MIN = 2;
const STREAK_BADGE_MIN = 3;
const IDLE_MIN_PERIODS = 3;

function normalizeName(value) {
    return String(value || '').trim().replace(/\s+/g, ' ').toLocaleUpperCase('vi-VN');
}

// Dịch sang "đồng hồ treo tường VN" để dùng getUTC* như giờ địa phương.
function toVnWall(date) { return new Date(date.getTime() + VN_OFFSET_MS); }
function fromVnWall(wall) { return new Date(wall.getTime() - VN_OFFSET_MS); }

function startOfPeriodWall(period, wall) {
    const start = new Date(wall.getTime());
    if (period === 'year') { start.setUTCMonth(0, 1); }
    else if (period === 'month') { start.setUTCDate(1); }
    else if (period === 'week') {
        const dayFromMonday = (start.getUTCDay() + 6) % 7;
        start.setUTCDate(start.getUTCDate() - dayFromMonday);
    }
    start.setUTCHours(0, 0, 0, 0);
    return start;
}

function getPeriodBounds(period, now = new Date()) {
    if (period === 'all') return { start: null, end: now };
    return { start: fromVnWall(startOfPeriodWall(period, toVnWall(now))), end: now };
}

// Lùi n kỳ so với kỳ chứa `now`. Trả { start, end } của kỳ đó.
function shiftPeriod(period, now, back) {
    const wall = startOfPeriodWall(period, toVnWall(now));
    if (period === 'week') wall.setUTCDate(wall.getUTCDate() - 7 * back);
    else if (period === 'month') wall.setUTCMonth(wall.getUTCMonth() - back);
    else if (period === 'year') wall.setUTCFullYear(wall.getUTCFullYear() - back);
    const start = fromVnWall(wall);
    const nextWall = new Date(wall.getTime());
    if (period === 'week') nextWall.setUTCDate(nextWall.getUTCDate() + 7);
    else if (period === 'month') nextWall.setUTCMonth(nextWall.getUTCMonth() + 1);
    else if (period === 'year') nextWall.setUTCFullYear(nextWall.getUTCFullYear() + 1);
    return { start, end: fromVnWall(nextWall) };
}

function buildRosterIndex(members) {
    const index = new Map();
    for (const member of members || []) {
        const key = normalizeName(member.full_name);
        if (key) index.set(key, member);
    }
    return index;
}

// Giao dịch hợp lệ: chiều vào, tiền > 0, ngày hợp lệ, và khớp roster.
function classify(transaction, roster) {
    const amount = Number(transaction?.so_tien || 0);
    const at = new Date(transaction?.created_at);
    if (transaction?.huong_giao_dich !== 'in') return null;
    if (!Number.isFinite(amount) || amount <= 0) return null;
    if (Number.isNaN(at.getTime())) return null;
    const key = normalizeName(transaction?.nguoi_nop);
    if (!key || EXCLUDED_SENTINELS.has(key)) return { at, amount, member: null };
    const member = roster.get(key);
    return { at, amount, member: member || null, key };
}

function inRange(at, start, end) {
    if (start && at < start) return false;
    return at <= end;
}

function computeStreak(datesDesc, period, now) {
    if (period === 'all' || period === 'year') return 0;
    let streak = 0;
    for (let back = 0; back < 520; back += 1) {
        const { start, end } = shiftPeriod(period, now, back);
        const hit = datesDesc.some((at) => at >= start && at < end);
        if (hit) streak += 1;
        else break;
    }
    return streak;
}

function periodLabelUnit(period) { return period === 'month' ? 'tháng' : 'tuần'; }

function buildContributionLeaderboard({ transactions, members, period, now = new Date(), shameBadgesEnabled = true }) {
    const roster = buildRosterIndex(members);
    const { start, end } = getPeriodBounds(period, now);

    const byMember = new Map();     // key -> { name, amount, transactionCount }
    const allDatesByMember = new Map(); // key -> [Date] toàn lịch sử
    const firstEverByMember = new Map();
    let unassignedAmount = 0;
    let unassignedCount = 0;

    for (const transaction of transactions || []) {
        const item = classify(transaction, roster);
        if (!item) continue;

        if (!item.member) {
            if (inRange(item.at, start, end)) { unassignedAmount += item.amount; unassignedCount += 1; }
            continue;
        }

        const key = item.key;
        const dates = allDatesByMember.get(key) || [];
        dates.push(item.at);
        allDatesByMember.set(key, dates);

        const firstEver = firstEverByMember.get(key);
        if (!firstEver || item.at < firstEver) firstEverByMember.set(key, item.at);

        if (!inRange(item.at, start, end)) continue;
        const current = byMember.get(key) || { name: item.member.full_name, amount: 0, transactionCount: 0 };
        current.amount += item.amount;
        current.transactionCount += 1;
        byMember.set(key, current);
    }

    // Quán quân của kỳ hoàn tất gần nhất.
    let championKey = null;
    if (period !== 'all') {
        const previous = shiftPeriod(period, now, 1);
        const previousTotals = new Map();
        for (const [key, dates] of allDatesByMember) {
            void dates;
            previousTotals.set(key, 0);
        }
        for (const transaction of transactions || []) {
            const item = classify(transaction, roster);
            if (!item || !item.member) continue;
            if (item.at >= previous.start && item.at < previous.end) {
                previousTotals.set(item.key, (previousTotals.get(item.key) || 0) + item.amount);
            }
        }
        let best = 0;
        for (const [key, total] of previousTotals) {
            if (total > best) { best = total; championKey = key; }
        }
        if (best === 0) championKey = null;
    }

    const rows = Array.from(byMember, ([key, value]) => {
        const dates = (allDatesByMember.get(key) || []).slice().sort((a, b) => b - a);
        const streak = computeStreak(dates, period, now);
        const badges = [];
        if (championKey === key) {
            badges.push({ kind: 'champion', label: `Quán quân ${periodLabelUnit(period)} trước` });
        }
        if (streak >= STREAK_BADGE_MIN) {
            badges.push({ kind: 'streak', label: `Chuỗi ${streak} ${periodLabelUnit(period)}` });
        }
        const firstEver = firstEverByMember.get(key);
        if (period !== 'all' && firstEver && inRange(firstEver, start, end)) {
            badges.push({ kind: 'first_time', label: 'Lần đầu góp quỹ' });
        }
        return { key, name: value.name, amount: value.amount, transactionCount: value.transactionCount, streak: streak >= STREAK_DISPLAY_MIN ? streak : (period === 'all' || period === 'year' ? 0 : streak), badges };
    })
        .sort((a, b) => b.amount - a.amount
            || b.transactionCount - a.transactionCount
            || a.name.localeCompare(b.name, 'vi'))
        .map((row, index) => ({ rank: index + 1, ...row }));

    // Trắng tay: thành viên đang sinh hoạt, đã từng đóng, vắng ≥ 3 kỳ hoàn tất.
    const idle = [];
    if (shameBadgesEnabled && (period === 'week' || period === 'month')) {
        for (const member of members || []) {
            if (member.is_active !== true) continue;
            const key = normalizeName(member.full_name);
            const dates = allDatesByMember.get(key);
            if (!dates || dates.length === 0) continue;
            let missed = 0;
            for (let back = 1; back <= IDLE_MIN_PERIODS; back += 1) {
                const window = shiftPeriod(period, now, back);
                const hit = dates.some((at) => at >= window.start && at < window.end);
                if (hit) break;
                missed += 1;
            }
            if (missed >= IDLE_MIN_PERIODS) {
                idle.push({
                    name: member.full_name,
                    periods: missed,
                    label: `Trắng tay ${missed} ${periodLabelUnit(period)}`,
                    description: `Chưa đóng quỹ trong ${missed} ${periodLabelUnit(period)}`,
                });
            }
        }
    }

    return {
        period: { key: period, start, end },
        rows,
        summary: {
            totalAmount: rows.reduce((sum, row) => sum + row.amount, 0),
            memberCount: rows.length,
            transactionCount: rows.reduce((sum, row) => sum + row.transactionCount, 0),
        },
        unassigned: { amount: unassignedAmount, count: unassignedCount },
        idle,
    };
}

module.exports = {
    normalizeName,
    getPeriodBounds,
    shiftPeriod,
    buildContributionLeaderboard,
};
```

- [ ] **Bước 4: Chạy test, xác nhận pass**

```bash
node tests/fund-leaderboard.test.js
```

Nếu có assert đỏ, sửa implementation cho khớp test — **không sửa test cho khớp code**.

- [ ] **Bước 5: Commit**

```bash
git add lib/fundLeaderboard.js tests/fund-leaderboard.test.js
git commit -m "feat(bxh): mot bang tong dong gop, loc theo roster, mui gio VN, streak va huy hieu"
```

---

## Task 10: Công tắc huy hiệu qua API

**Files:** Sửa `app/api/club/branding/route.js`, `app/api/club/settings/route.js`, `app/admin/ClubSettings.js`

- [ ] **Bước 1: Trả cờ trong branding**

Trong `app/api/club/branding/route.js`, đổi `select` thành
`'id, name, logo_url, shame_badges_enabled'`, và trả thêm trường:

```js
    return NextResponse.json({
        name: group.name,
        logoUrl: group.logo_url || null,
        shameBadgesEnabled: group.shame_badges_enabled !== false,
    });
```

Nhánh `is_default` và nhánh lỗi trả `shameBadgesEnabled: true`.

- [ ] **Bước 2: Nhận cờ trong settings PATCH**

Trong `app/api/club/settings/route.js`, thêm vào khối dựng `updates`:

```js
    if (typeof body?.shameBadgesEnabled === 'boolean') {
        updates.shame_badges_enabled = body.shameBadgesEnabled;
    }
```

Và thêm `shame_badges_enabled` vào danh sách `select` của `GET`.

- [ ] **Bước 3: Thêm công tắc vào ClubSettings**

Trong `app/admin/ClubSettings.js`, thêm một khối trong form chính:

```jsx
                <label className="ph-field">
                    <span className="ph-field__label">Huy hiệu &quot;Trắng tay&quot; trên BXH</span>
                    <select
                        className="ph-field__control"
                        value={form.shameBadgesEnabled ? 'on' : 'off'}
                        onChange={(e) => setForm((p) => ({ ...p, shameBadgesEnabled: e.target.value === 'on' }))}
                    >
                        <option value="on">Bật — nêu tên người chưa đóng nhiều kỳ liền</option>
                        <option value="off">Tắt — không nêu tên ai</option>
                    </select>
                </label>
```

Nạp giá trị ban đầu từ `data.group.shame_badges_enabled` trong `loadSettings`, và gửi
`shameBadgesEnabled: form.shameBadgesEnabled` trong `handleSave`.

- [ ] **Bước 4: Build và commit**

```bash
npm run build
git add app/api/club/branding/route.js app/api/club/settings/route.js app/admin/ClubSettings.js
git commit -m "feat(bxh): cong tac huy hieu Trang tay, member doc duoc qua branding"
```

---

## Task 11: Trang BXH

**Files:** Sửa `app/quy/bxh/page.js`, `app/quy/bxh/page.css` (viết lại cả hai)

- [ ] **Bước 1: Viết lại `app/quy/bxh/page.js`**

Yêu cầu bắt buộc, kiểm bằng smoke thủ công ở Task 14:

- Tiêu đề trang là **“BXH đóng góp”**. Không có chữ “nộp phạt” ở bất kỳ đâu.
- `PhSeg` với 4 mốc: `week` “Tuần này”, `month` “Tháng này”, `year` “Năm nay”, `all` “Tất cả”.
  `label="Chọn kỳ xem"`. Mặc định `week`.
- Hiện khoảng ngày cụ thể của kỳ, định dạng `dd/mm/yyyy`, lấy từ `result.period`.
- Ba `ph-metric`: “Tổng đóng góp”, “Số người góp”, “Số lượt góp”.
- Podium 3 hạng đầu; 2 người thì 2 bục; 1 người thì một thẻ “Người duy nhất góp quỹ kỳ này”;
  0 người thì `ph-state` rỗng.
- **Bảng đầy đủ mọi thứ hạng gồm cả top 3** dùng `ph-table` với `data-label` trên mỗi `td`.
  Podium là lớp trang trí chồng lên, không phải nơi duy nhất chứa top 3.
- Thanh tỉ lệ lấy thang theo hạng 2 trở xuống; hạng 1 tràn thang và ghi bội số
  (`gấp X,Y lần hạng 2`) khi `rows[0].amount > rows[1].amount * 1.5`.
- Badge streak khi `row.streak >= 2`, badge huy hiệu từ `row.badges`.
- Dòng ghi chú khi `result.unassigned.count > 0`: nêu số tiền chưa vào bảng và link
  `/admin?section=fund`.
- Khu “Chưa góp quỹ kỳ này” liệt kê `result.idle` khi mảng không rỗng.
- Trạng thái: `ph-skeleton` khi tải, `ph-state` cho rỗng / lỗi / hết phiên.
- Nút “Chia sẻ BXH” gọi Task 13.

Dữ liệu lấy song song:

```js
const [sessionRes, txRes, memberRes, brandRes] = await Promise.all([
    fetch('/api/groups/session', { cache: 'no-store' }),
    fetch('/api/club/transactions'),
    fetch('/api/club/members'),
    fetch('/api/club/branding'),
]);
```

rồi gọi `buildContributionLeaderboard({ transactions, members, period, shameBadgesEnabled })`.

- [ ] **Bước 2: Viết lại `app/quy/bxh/page.css`**

Chỉ chứa layout riêng của trang. Mọi màu qua token `--ph-*`. Không hardcode `#rrggbb`.

- [ ] **Bước 3: Đưa file vào danh sách kiểm hardcode tự động**

Trong `tests/ph-design-system.test.js`, thêm `'app/quy/bxh/page.css'` vào mảng
`NEW_CSS_FILES` (mảng đã tạo ở Task 3 bước 5) thay vì chỉ kiểm thủ công một lần —
từ nay mọi lần chạy `ph-design-system` đều tự chặn nếu file này hồi quy về hardcode.

```bash
node tests/ph-design-system.test.js
```

Kỳ vọng: PASS.

- [ ] **Bước 4: Build và commit**

```bash
npm run build && node tests/ph-design-system.test.js
git add app/quy/bxh
git commit -m "feat(bxh): viet lai trang BXH dong gop bang primitive"
```

---

## Task 12: Thông báo và gán thủ công

**Files:**
- Tạo: `app/api/club/notifications/route.js`, `components/pickhub/PhNotificationBell.js`,
  `components/pickhub/AssignTransactionDialog.js`
- Sửa: `app/api/webhook/route.js`, `tests/club-notifications.test.js`

- [ ] **Bước 1: Mở rộng test, xác nhận fail**

Thêm vào `tests/club-notifications.test.js`:

```js
const webhook = fs.readFileSync(path.join(root, 'app/api/webhook/route.js'), 'utf8');
assert(/club_notifications/.test(webhook), 'Webhook phải sinh thông báo khi không khớp roster');
assert(/try\s*{[\s\S]*club_notifications[\s\S]*catch/.test(webhook),
    'Việc ghi thông báo phải nằm trong try/catch để không làm hỏng việc ghi giao dịch');

const route = fs.readFileSync(path.join(root, 'app/api/club/notifications/route.js'), 'utf8');
assert(/requireValidatedGroupAdmin/.test(route), 'Route thông báo phải yêu cầu quyền admin');
assert(/\.eq\('group_id'/.test(route), 'Route thông báo phải scope theo group_id');

const bell = fs.readFileSync(path.join(root, 'components/pickhub/PhNotificationBell.js'), 'utf8');
assert(/aria-label/.test(bell), 'Chuông phải có aria-label');
assert(/PhModal/.test(bell) || /role="dialog"/.test(bell), 'Panel chuông phải dùng contract dialog');
```

- [ ] **Bước 2: Viết `app/api/club/notifications/route.js`**

```js
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireValidatedGroupAdmin } from '@/lib/groupSession';
import { normalizeName } from '@/lib/fundLeaderboard';
import { loadContributionInputs } from '@/lib/fundContributions';

// GET: danh sách việc cần xử lý + đối soát bù cho giao dịch tồn đọng.
export async function GET() {
    const adminCheck = await requireValidatedGroupAdmin();
    if (!adminCheck.ok) return adminCheck.response;
    const groupId = adminCheck.groupId;

    const { transactions, members } = await loadContributionInputs(supabaseAdmin, groupId);
    const roster = new Set(members.map((m) => normalizeName(m.full_name)));
    const EXCLUDED = new Set(['THỦ QUỸ']);

    const unassigned = transactions.filter((t) => {
        if (t.huong_giao_dich !== 'in') return false;
        if (!(Number(t.so_tien) > 0)) return false;
        const key = normalizeName(t.nguoi_nop);
        if (EXCLUDED.has(key)) return false;
        return !roster.has(key);
    });

    const { data: existing } = await supabaseAdmin
        .from('club_notifications')
        .select('*')
        .eq('group_id', groupId)
        .eq('kind', 'unassigned_transaction');

    const known = new Map((existing || []).map((row) => [Number(row.subject_id), row]));

    // Đối soát bù: tạo thông báo cho giao dịch tồn đọng chưa có.
    const missing = unassigned
        .filter((t) => !known.has(Number(t.id)))
        .map((t) => ({
            group_id: groupId,
            kind: 'unassigned_transaction',
            subject_type: 'quy_pickleball',
            subject_id: t.id,
            payload: { so_tien: t.so_tien, noi_dung_goc: t.noi_dung_goc, ma_giao_dich: t.ma_giao_dich, created_at: t.created_at },
        }));
    if (missing.length > 0) {
        await supabaseAdmin.from('club_notifications').upsert(missing, {
            onConflict: 'group_id,kind,subject_type,subject_id',
            ignoreDuplicates: true,
        });
    }

    // Tự đóng thông báo cho giao dịch đã được gán.
    const unassignedIds = new Set(unassigned.map((t) => Number(t.id)));
    const toResolve = (existing || [])
        .filter((row) => row.status === 'open' && !unassignedIds.has(Number(row.subject_id)))
        .map((row) => row.id);
    if (toResolve.length > 0) {
        await supabaseAdmin
            .from('club_notifications')
            .update({ status: 'resolved', resolved_at: new Date().toISOString() })
            .eq('group_id', groupId)
            .in('id', toResolve);
    }

    const { data: fresh, error } = await supabaseAdmin
        .from('club_notifications')
        .select('*')
        .eq('group_id', groupId)
        .eq('status', 'open')
        .order('created_at', { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ notifications: fresh || [], openCount: (fresh || []).length });
}

// PATCH: bỏ qua một thông báo.
export async function PATCH(request) {
    const adminCheck = await requireValidatedGroupAdmin();
    if (!adminCheck.ok) return adminCheck.response;

    const body = await request.json();
    const id = Number(body?.id);
    const status = body?.status;
    if (!Number.isInteger(id) || !['dismissed', 'resolved'].includes(status)) {
        return NextResponse.json({ error: 'Tham số không hợp lệ.' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
        .from('club_notifications')
        .update({ status, resolved_at: new Date().toISOString() })
        .eq('id', id)
        .eq('group_id', adminCheck.groupId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
```

- [ ] **Bước 3: Móc sinh thông báo vào webhook**

Trong `app/api/webhook/route.js`, đổi lệnh insert để lấy lại id:

```js
        const { data: insertedData, error } = await supabaseServer
            .from('quy_pickleball')
            .insert({ /* … giữ nguyên các trường … */ })
            .select('id, nguoi_nop, so_tien, noi_dung_goc, ma_giao_dich, created_at')
            .single();
```

Ngay sau khối xử lý `error`, thêm:

```js
        // Sinh thông báo khi không nhận diện được người nộp.
        // Lỗi ở đây tuyệt đối không được làm hỏng việc ghi giao dịch.
        try {
            if (huongGiaoDich === 'in' && amount > 0 && parseResult.memberName === 'Unknown') {
                await supabaseServer.from('club_notifications').upsert({
                    group_id: groupRouting.groupId,
                    kind: 'unassigned_transaction',
                    subject_type: 'quy_pickleball',
                    subject_id: insertedData.id,
                    payload: {
                        so_tien: insertedData.so_tien,
                        noi_dung_goc: insertedData.noi_dung_goc,
                        ma_giao_dich: insertedData.ma_giao_dich,
                        created_at: insertedData.created_at,
                    },
                }, { onConflict: 'group_id,kind,subject_type,subject_id', ignoreDuplicates: true });
            }
        } catch (notifyError) {
            console.error('Không tạo được thông báo giao dịch chưa gán:', notifyError);
        }
```

- [ ] **Bước 4: Viết `components/pickhub/AssignTransactionDialog.js`**

```js
'use client';

import { useEffect, useState } from 'react';
import PhModal from './PhModal';

export default function AssignTransactionDialog({ open, notification, onClose, onAssigned }) {
    const [members, setMembers] = useState([]);
    const [query, setQuery] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!open) return;
        fetch('/api/club/members')
            .then((r) => r.json())
            .then((d) => setMembers((d.members || []).filter((m) => m.is_active !== false)))
            .catch(() => setMembers([]));
    }, [open]);

    async function assign(member) {
        setSaving(true);
        setError('');
        const res = await fetch('/api/club/transactions', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: [notification.subject_id], updates: { nguoi_nop: member.full_name } }),
        });
        setSaving(false);
        if (!res.ok) { setError('Không gán được, thử lại.'); return; }
        onAssigned(notification);
    }

    if (!notification) return null;
    const payload = notification.payload || {};
    const filtered = members.filter((m) => m.full_name.toLowerCase().includes(query.toLowerCase()));

    return (
        <PhModal open={open} title="Gán giao dịch cho thành viên" onClose={onClose}>
            <div className="ph-card ph-card--flat" style={{ padding: 12, marginBottom: 16 }}>
                <p style={{ margin: 0, fontWeight: 800 }}>{Number(payload.so_tien || 0).toLocaleString('vi-VN')}đ</p>
                <p style={{ margin: '4px 0 0', fontSize: 13 }}>{payload.noi_dung_goc || '(không có nội dung)'}</p>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--ph-muted)' }}>
                    {payload.created_at ? new Date(payload.created_at).toLocaleDateString('vi-VN') : ''} · {payload.ma_giao_dich}
                </p>
            </div>
            <label className="ph-field">
                <span className="ph-field__label">Tìm thành viên</span>
                <input className="ph-field__control" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nhập tên" />
            </label>
            {error && <p className="ph-field__error">{error}</p>}
            <div style={{ maxHeight: 240, overflow: 'auto', display: 'grid', gap: 6 }}>
                {filtered.map((member) => (
                    <button
                        key={member.id}
                        type="button"
                        className="ph-btn ph-btn--outline ph-btn--block"
                        disabled={saving}
                        onClick={() => assign(member)}
                    >
                        {member.full_name}
                    </button>
                ))}
                {filtered.length === 0 && <p className="ph-state__text">Không tìm thấy thành viên nào.</p>}
            </div>
        </PhModal>
    );
}
```

- [ ] **Bước 5: Viết `components/pickhub/PhNotificationBell.js`** (đè file tạm)

```js
'use client';

import { useCallback, useEffect, useState } from 'react';
import PhModal from './PhModal';
import AssignTransactionDialog from './AssignTransactionDialog';

export default function PhNotificationBell() {
    const [items, setItems] = useState([]);
    const [open, setOpen] = useState(false);
    const [assigning, setAssigning] = useState(null);

    const load = useCallback(() => {
        fetch('/api/club/notifications', { cache: 'no-store' })
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => setItems(d?.notifications || []))
            .catch(() => {});
    }, []);

    useEffect(() => { load(); }, [load]);

    async function dismiss(item) {
        await fetch('/api/club/notifications', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: item.id, status: 'dismissed' }),
        });
        load();
    }

    return (
        <>
            <button
                type="button"
                className="ph-btn ph-btn--ghost ph-btn--sm"
                aria-label={`Thông báo${items.length ? `, ${items.length} việc cần xử lý` : ''}`}
                onClick={() => { setOpen(true); load(); }}
            >
                <span aria-hidden="true">🔔</span>
                {items.length > 0 && <span className="ph-badge ph-badge--gold">{items.length}</span>}
            </button>

            <PhModal open={open} title="Việc cần xử lý" onClose={() => setOpen(false)}>
                {items.length === 0 && <p className="ph-state__text">Không có việc nào cần xử lý.</p>}
                <div style={{ display: 'grid', gap: 10 }}>
                    {items.map((item) => (
                        <div key={item.id} className="ph-card ph-card--flat" style={{ padding: 12 }}>
                            <p style={{ margin: 0, fontWeight: 800 }}>
                                {Number(item.payload?.so_tien || 0).toLocaleString('vi-VN')}đ chưa rõ người nộp
                            </p>
                            <p style={{ margin: '4px 0 10px', fontSize: 13 }}>{item.payload?.noi_dung_goc}</p>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button type="button" className="ph-btn ph-btn--primary ph-btn--sm" onClick={() => setAssigning(item)}>
                                    Gán cho thành viên
                                </button>
                                <button type="button" className="ph-btn ph-btn--outline ph-btn--sm" onClick={() => dismiss(item)}>
                                    Bỏ qua
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </PhModal>

            <AssignTransactionDialog
                open={Boolean(assigning)}
                notification={assigning}
                onClose={() => setAssigning(null)}
                onAssigned={() => { setAssigning(null); load(); }}
            />
        </>
    );
}
```

- [ ] **Bước 6: Chạy test và build**

```bash
node tests/club-notifications.test.js && npm run build
```

- [ ] **Bước 7: Commit**

```bash
git add app/api/club/notifications components/pickhub app/api/webhook/route.js tests/club-notifications.test.js
git commit -m "feat(quy): chuong thong bao va gan thu cong giao dich chua ro nguoi nop"
```

---

## Task 13: Thẻ chia sẻ PNG

**Files:**
- Tạo: `app/api/club/bxh/share-image/route.js`, `tests/bxh-share-image.contract.test.js`

- [ ] **Bước 1: Viết test thất bại**

```js
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'app/api/club/bxh/share-image/route.js'), 'utf8');

assert(/getGroupIdForDatabase|requireValidatedGroup/.test(src), 'Phải lấy group_id từ phiên');
assert(!/searchParams\.get\(['"]group/.test(src), 'Tuyệt đối không nhận group_id từ tham số URL');
assert(/no-store/.test(src), 'Ảnh chứa dữ liệu riêng, phải Cache-Control no-store');
assert(/private/.test(src), 'Cache-Control phải là private');
assert(/image\/png/.test(src), 'Phải trả image/png');
assert(/400/.test(src), 'Tham số period sai phải trả 400');
assert(!/board/.test(src), 'Không còn tham số board — chỉ còn một bảng');
assert(/loadContributionInputs/.test(src), 'Phải dùng chung đường đọc dữ liệu với giao diện');

console.log('bxh-share-image: PASS');
```

- [ ] **Bước 2: Chạy test, xác nhận fail**

```bash
node tests/bxh-share-image.contract.test.js
```

- [ ] **Bước 3: Viết route**

Route dựng SVG rồi trả về dưới dạng PNG bằng `sharp` nếu có sẵn; nếu dự án chưa có
dependency chuyển SVG→PNG thì **trả về `image/svg+xml`** và ghi rõ hạn chế trong báo cáo,
**không tự thêm dependency mới mà không hỏi**.

Bộ khung bắt buộc:

```js
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getGroupIdForDatabase } from '@/lib/groupSession';
import { loadContributionInputs } from '@/lib/fundContributions';
import { buildContributionLeaderboard } from '@/lib/fundLeaderboard';

const PERIODS = new Set(['week', 'month', 'year', 'all']);

export async function GET(request) {
    const groupId = getGroupIdForDatabase();
    if (!groupId) {
        return NextResponse.json({ error: 'Cần phiên CLB hợp lệ.' }, { status: 403 });
    }

    const period = new URL(request.url).searchParams.get('period') || 'week';
    if (!PERIODS.has(period)) {
        return NextResponse.json({ error: 'Kỳ không hợp lệ.' }, { status: 400 });
    }

    const { transactions, members } = await loadContributionInputs(supabaseAdmin, groupId);
    const board = buildContributionLeaderboard({ transactions, members, period });

    const svg = renderShareCardSvg(board);   // nền gradient --ph-indigo, huy hiệu --ph-gold
    return new Response(svg, {
        status: 200,
        headers: {
            'Content-Type': 'image/png',
            'Cache-Control': 'private, no-store',
            'Content-Disposition': `attachment; filename="bxh-${period}.png"`,
        },
    });
}
```

`renderShareCardSvg` phải chứa: tên CLB, kỳ đang xem, top 1 nêu rõ, hai hạng kế tiếp, tổng
đóng góp, và dấu hiệu PickHub. Nền gradient indigo `#6F48C9 → #8A63E0`, huy hiệu `#FFC95E`,
chữ trắng. Xử lý được trường hợp < 3 người.

> **Ngoại lệ hex hợp lệ, không phải vi phạm ràng buộc "không hardcode #rrggbb":** SVG
> ở đây được ghép chuỗi phía server (Node.js), không chạy trong trình duyệt nên
> **không có CSS cascade và không resolve được `var(--ph-*)`**. Giá trị hex trong hàm
> này là bắt buộc phải viết trực tiếp. Điều kiện: mỗi giá trị hex trong
> `renderShareCardSvg` phải **trùng khớp chính xác** với một token trong `tokens.css`
> (`#6F48C9` = `--ph-indigo`, `#8A63E0` là sắc sáng hơn dùng riêng cho gradient — thêm
> làm hằng số `SHARE_CARD_GRADIENT_END` ngay trong file route, không thêm vào
> `tokens.css` vì nó không dùng ở đâu khác) và phải có comment nêu tên token tương ứng.
> Đây **không** áp dụng cho bất kỳ file `.css` nào — `NEW_CSS_FILES` trong
> `tests/ph-design-system.test.js` chỉ quét file CSS thật.

- [ ] **Bước 4: Chạy test, build và commit**

```bash
node tests/bxh-share-image.contract.test.js && npm run build
git add app/api/club/bxh tests/bxh-share-image.contract.test.js
git commit -m "feat(bxh): route sinh anh chia se co kiem phien va khong cache chung"
```

---

## Task 14: Dọn alias, tài liệu và evidence

**Files:** Sửa `app/styles/legacy-aliases.css`, `docs/pickhub-core/UI-BRAND-SYSTEM.md`, tạo evidence

- [ ] **Bước 1: Đếm tham chiếu còn lại theo nhóm**

```bash
node tests/ph-design-system.test.js
```

Ghi dòng `[ph-design-system] tham chiếu token khai tử còn lại: N` vào evidence.

- [ ] **Bước 2: Dọn alias trong các file đã đụng**

Chỉ trong `app/quy/bxh/`, `components/pickhub/`, `components/HomeHeader.css`,
`components/MobileBottomNav.css`: thay `var(--court-*)`, `var(--primary)`… bằng token
`--ph-*` tương ứng. **Không đụng file nào khác.**

- [ ] **Bước 3: Bổ sung token vào brand doc**

Trong `docs/pickhub-core/UI-BRAND-SYSTEM.md` mục 2, thêm vào bảng token:
`--ph-ink-2 #514A72` (chữ cấp hai), `--ph-positive #1F7A52` (số dương, 5.30:1 trên trắng),
`--ph-negative #C2453A` (số âm, 5.08:1 trên trắng). Ghi rõ `--ph-cyan` và `--ph-coral` chỉ
dùng làm nền/accent.

Thêm một dòng riêng ghi nhận nhóm token tint bổ sung ở Task 3 (`--ph-tint-indigo`,
`--ph-tint-gold`, `--ph-tint-gold-text`, `--ph-tint-cyan`, `--ph-tint-coral`,
`--ph-tint-positive`, `--ph-tint-negative`, `--ph-tint-neutral`, `--ph-tint-neutral-strong`,
`--ph-backdrop`): đây là nền nhạt phái sinh từ 4 màu accent đã duyệt, dùng cho metric
card, badge và skeleton — không phải màu mới, không đổi hệ màu.

- [ ] **Bước 4: Smoke thủ công**

Mở lần lượt và ghi nhận: `/`, `/quy`, `/quy/bxh`, `/quy/members`, `/quy/admin`,
`/admin` (cả 3 section), `/thong-tin`, `/dk`, `/giai-dau`.

Kiểm ở 4 biên: `767 / 768 / 1119 / 1120px`. Đặc biệt xác nhận dải `768–1119px` **có đúng
một** đường điều hướng (bottom nav).

Kiểm bàn phím trên `/quy/bxh`: `Tab` đi hết trang, mũi tên đổi mốc trong `PhSeg`, `Escape`
đóng modal, focus ring luôn nhìn thấy.

Kiểm vai trò: đăng nhập `member` → **không** thấy chuông; `admin` → thấy chuông.

Kiểm dữ liệu: đối chiếu tổng trên BXH với truy vấn SQL trực tiếp; gán thử một giao dịch
tồn đọng thật rồi tải lại BXH xem có lên đúng người không.

Ghi tất cả vào `docs/pickhub-core/evidence/`.

- [ ] **Bước 5: Chạy toàn bộ regression**

```bash
npm run test:regression && npm run build
```

- [ ] **Bước 6: Commit**

```bash
git add app/styles docs components app/quy
git commit -m "chore(ui): don alias trong pham vi, cap nhat brand doc va evidence"
```

---

## Tự soát kế hoạch

| Mục spec | Task phủ |
|---|---|
| 3.1–3.4 token, font | Task 2 |
| 3.5 alias 3 nhóm, điều kiện gỡ | Task 2 (tạo), Task 14 (dọn + đếm) |
| 3.6 thu gọn globals có kiểm chứng | Task 1 bước 2, Task 2 bước 5 |
| 4.1 primitive CSS | Task 3 |
| 4.2 contract React | Task 4 |
| 4.3 phạm vi thay confirm/prompt | Task 4 (xây), không chuyển màn hình ngoài phạm vi |
| 5 app shell, 5.1 breakpoint, 5.2 chống lặp | Task 5 |
| 6.1 một bảng, 6.1.1 khoản lớn | Task 9, Task 11 |
| 6.2 múi giờ VN, 4 mốc | Task 9 |
| 6.3 lọc roster, ca biên | Task 9 |
| 6.4 streak | Task 9 |
| 6.5 huy hiệu, 6.5.1 Trắng tay, 6.5.2 công tắc | Task 9, Task 10 |
| 6.6 đọc đủ dữ liệu | Task 8 |
| 6.7 bố cục và trạng thái | Task 11 |
| 6.8 thẻ chia sẻ | Task 13 |
| 6.9.1 chuẩn hoá Unknown + dọn tồn đọng | Task 7 |
| 6.9.2 bảng club_notifications | Task 6 |
| 6.9.3 sinh thông báo 2 đường | Task 12 |
| 6.9.4 chuông | Task 12 |
| 6.9.5 gán thủ công | Task 12 |
| 8 kiểm chứng | Task 2, 4, 7, 8, 9, 12, 13, 14 |

**Điểm cần chú ý khi thực thi:**

- `PhNotificationBell` được tham chiếu ở Task 5 nhưng viết đầy đủ ở Task 12. Task 5 tạo file
  tạm trả `null`; nếu bỏ bước đó thì build sẽ gãy.
- `normalizeName` và `buildContributionLeaderboard` xuất từ `lib/fundLeaderboard.js` bằng
  `module.exports`; các route dùng `import { … } from '@/lib/fundLeaderboard'` — Next 14 xử lý
  được CommonJS, nhưng nếu gặp lỗi interop thì **đổi sang `export` chuẩn ESM và cập nhật test
  cho khớp**, không dùng `require` trong route.
- Thứ tự bắt buộc: Task 6 (migration) trước Task 10 và Task 12; Task 8 trước Task 9 và 13;
  Task 7 trước Task 12.
