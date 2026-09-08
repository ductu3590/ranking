# Prompt giao IDE khác thực thi — Design system + BXH đóng góp + chuông thông báo

Dán nguyên khối dưới đây. Mỗi lần chạy tiếp chỉ đổi số task ở mục **"Task cần làm lần này"**.

---

Bạn là kỹ sư triển khai của PickHub — Next.js 14 App Router, **JavaScript thuần (không TypeScript)**, Supabase. **Đây là dự án đang vận hành thật, database có CLB thật với 686 giao dịch và 38 thành viên.** Nhiệm vụ của bạn là thực thi kế hoạch đã chốt **đúng thứ tự, đúng thiết kế**, không tự ý đổi hướng.

## 1. Nguồn sự thật — đọc hết trước khi viết dòng code đầu tiên

Đọc theo đúng thứ tự này. Khi hai tài liệu mâu thuẫn, **tài liệu đứng trước thắng**:

1. `docs/superpowers/plans/2026-09-08-pickhub-design-system-va-bxh.md` — kế hoạch thực thi, là mệnh lệnh trực tiếp, chứa code cụ thể cho từng bước.
2. `docs/superpowers/specs/2026-09-08-pickhub-design-system-va-bxh-design.md` — quyết định thiết kế, lý do và số liệu đo thật. Khi kế hoạch không nói rõ một chi tiết, tra ở đây.
3. `docs/pickhub-core/UI-BRAND-SYSTEM.md` — baseline thương hiệu bắt buộc: bảng token, typography, component principles, accessibility, quy tắc BXH và share card.
4. `docs/pickhub-core/decisions/ADR-006-montserrat-va-hop-nhat-token-ui.md` — vì sao hợp nhất token, phân biệt quy tắc nghiệp vụ / quy tắc trình bày / mở rộng contract.
5. `docs/pickhub-core/UI-STRATEGY.md` — ranh giới core/UI và nguyên tắc "không hai design system song song".
6. `CLAUDE.md` và skill `pickhub-engineering` — quy ước kỹ thuật bắt buộc: auth cookie `group_session`, group-scoping, admin guard, client Supabase nào dùng ở đâu, style migration và node test.

Nếu bạn thấy tài liệu mâu thuẫn nhau ở điểm ảnh hưởng tới code: **dừng lại, trích dẫn cả hai nguồn, hỏi trước khi chọn.** Không tự phân xử.

## 2. Ràng buộc tuyệt đối — vi phạm là phải sửa, không được biện minh

**Phối hợp**

- **Không đụng bất kỳ file nào trong `app/giai-dau/` ngoài đúng `app/giai-dau/layout.js`**, và ở file đó chỉ đổi import + JSX của shell. Một session khác đang phát triển module giải đấu ở đó. Không sửa `v2.css`, `wizard.css`, `console.css`, `bracket.css`, `public.css`, `share.css`.
- Migration mới bắt đầu từ **`043`**. Các số `038`–`042` đã bị công việc chưa commit của session kia chiếm. Kiểm lại `ls database/migrations/` trước khi tạo file.

**Dữ liệu**

- Cấm `DROP`, `TRUNCATE`, `DELETE` không điều kiện, reset database.
- Mọi truy vấn Supabase phải scope `.eq('group_id', …)`. Không ngoại lệ.
- Migration chỉ được cộng thêm, idempotent (`IF NOT EXISTS`), có giá trị mặc định.
- Bước dữ liệu (backfill) phải **đếm trước, chạy, đếm sau**, và dán cả ba kết quả thật vào báo cáo. Nếu số đếm trước lớn bất thường thì dừng và hỏi.

**Kiến trúc**

- `lib/fundLeaderboard.js` và `lib/fundContributions.js` là **hàm thuần**: không import React, không import Next, không gọi Supabase trực tiếp trong hàm tính toán. `fundContributions` nhận client làm tham số.
- Route trong `app/api/**` chỉ parse, authorize, gọi hàm, map response. Không chứa thuật toán xếp hạng.
- **Không tạo họ class CSS mới ngoài tiền tố `ph-`.** Dự án đã có 5 họ nút (`btn-*`, `dk-btn`, `v2-btn-*`, `w3-btn`, `v2share-btn`); mục tiêu của việc này là dừng lại ở đó, không đẻ họ thứ sáu.
- **Không hardcode `#rrggbb`** trong CSS bạn viết mới. Mọi màu đi qua token `--ph-*`.
- **Không dùng `window.confirm()` / `window.prompt()`** trong code mới. Đã có `PhConfirm`.
- Chỉ `app/styles/legacy-aliases.css` được phép **định nghĩa** token màu cũ. File khác chỉ được **tham chiếu**.

**Nội dung**

- **Không dùng chữ "nộp phạt"** trong bất kỳ nhãn, tiêu đề, huy hiệu hay copy giao diện nào. Từ vựng là **"đóng góp" / "nộp tiền" / "đóng quỹ"**. Tên trang là **"BXH đóng góp"**.
- Giá trị `nop_phat` trong cột `loai_giao_dich` của database **giữ nguyên**. Chỉ lớp hiển thị đổi chữ. Không viết migration đổi dữ liệu này.
- Mọi copy giao diện bằng tiếng Việt, câu ngắn, không thuật ngữ kỹ thuật.
- Status badge luôn có chữ; màu và icon không bao giờ là tín hiệu duy nhất.
- Touch target ≥ 44px. Hỗ trợ `prefers-reduced-motion`. Focus ring luôn nhìn thấy.

**Ba quyết định dễ bị làm sai — đọc kỹ**

1. **Bộ lọc BXH là đối chiếu roster, không phải danh sách đen.** Chỉ giao dịch có `nguoi_nop` khớp `club_members.full_name` (không phân biệt hoa/thường, sau chuẩn hoá khoảng trắng) mới lên bảng. **Không** lọc bằng `parsing_method` hay `confidence_score` — đã đo và chứng minh hai cột đó mâu thuẫn với chính chúng.
2. **Múi giờ là `Asia/Ho_Chi_Minh` (UTC+7, không DST) ở cả client và server.** Nếu dùng `new Date()` theo múi giờ môi trường, server Vercel chạy UTC sẽ cắt biên tuần lệch 7 giờ so với trình duyệt và ra bảng khác nhau. Kế hoạch có sẵn hàm `toVnWall` / `fromVnWall` — dùng đúng nó.
3. **Ảnh chia sẻ lấy `group_id` từ phiên, tuyệt đối không nhận từ tham số URL,** và trả `Cache-Control: private, no-store`. Ảnh chứa tên thật và số tiền của một CLB cụ thể.

## 3. Thứ tự thực thi — không được đảo

```
Task 1   Preflight, chốt số liệu                     ← không bỏ qua
Task 2   Token + font Montserrat + thay test cũ
Task 3   Primitive CSS
Task 4   PhModal, PhConfirm, PhSeg
Task 5   AppShell, side rail, breakpoint điều hướng
Task 6   Migration 043                               ← trước Task 10 và 12
Task 7   Chuẩn hoá 'Unknown' + dọn tồn đọng          ← trước Task 12
Task 8   Đọc đủ giao dịch (phân trang)               ← trước Task 9 và 13
Task 9   Logic BXH đóng góp
Task 10  Công tắc huy hiệu qua API
Task 11  Trang BXH
Task 12  Chuông thông báo + gán thủ công
Task 13  Thẻ chia sẻ PNG
Task 14  Dọn alias, tài liệu, evidence
```

**Task 1 là cửa chặn.** Nó xác minh ba giả định mà cả kế hoạch dựa vào: 5 rule class trong `globals.css` là rule chết, trần số hàng Supabase đã chạm chưa, và regression có xanh từ trước không. Nếu kết quả khác kỳ vọng ghi trong kế hoạch, **dừng và báo cáo** — đừng đi tiếp với giả định sai.

## 4. Quy trình bắt buộc cho từng task

1. Đọc lại task tương ứng trong kế hoạch và mục spec mà nó tham chiếu.
2. **Viết test trước. Chạy. Quan sát nó fail thật. Dán output fail vào báo cáo.** Không viết implementation trước test. Không viết test sau khi code đã xanh rồi bảo là TDD.
3. Viết implementation tối thiểu để test xanh.
4. Chạy test focused, rồi chạy regression liên quan:
   - `node tests/ph-design-system.test.js` sau mọi thay đổi CSS hoặc token.
   - `node tests/fund-leaderboard.test.js` sau mọi thay đổi logic BXH.
   - `npm run build` sau mọi thay đổi component hoặc route.
   - `npm run test:regression` ở cuối Task 2, Task 9 và Task 14.
5. Migration: viết file, chạy preflight query, apply qua Supabase MCP trên project **`uhhlelemewilgsdijwja` (Ranking 246)**, chạy verification query, **dán kết quả thật** vào báo cáo, rồi `npm run migration:ledger`. Không báo "đã apply" khi chưa chạy.
6. **Một task một commit.** Message tiếng Việt không dấu, theo mẫu có sẵn trong kế hoạch.
7. **Dừng lại và báo cáo. Không tự động chạy sang task tiếp theo.**

## 5. Mẫu báo cáo sau mỗi task

```
## Task N — <tên>

### Test viết trước
<đường dẫn file test>
Output khi chạy lần đầu (fail):
<dán nguyên văn>

### Thay đổi
- <file>: <mô tả một dòng>

### Kết quả chạy
$ <lệnh>
<dán nguyên văn>

### Migration (nếu có)
Preflight: <kết quả thật>
Apply: <kết quả thật>
Verification: <kết quả thật>

### Lệch so với kế hoạch
<không có / mô tả chính xác chỗ lệch và lý do>

### Commit
<hash> <message>
```

Mục **"Lệch so với kế hoạch"** là bắt buộc. Nếu bạn phải làm khác kế hoạch — vì kế hoạch sai, vì thư viện không có, vì code thật khác mô tả — hãy ghi rõ ra thay vì im lặng làm khác. Kế hoạch có thể sai; giấu chỗ lệch mới là vấn đề.

## 6. Khi nào phải dừng và hỏi

Dừng ngay, đừng tự quyết, trong các trường hợp sau:

- Task 1 cho kết quả khác kỳ vọng (có file dùng 5 rule class kia; số API < số SQL; regression đỏ sẵn).
- Backfill ở Task 7 đếm ra > 100 dòng sẽ bị đổi — có thể roster đang thiếu người và bạn sắp xoá tên thật.
- Cần thêm một dependency npm mới (ví dụ để chuyển SVG sang PNG ở Task 13).
- Kế hoạch và code thật mâu thuẫn ở điểm ảnh hưởng kiến trúc.
- Bạn thấy mình sắp sửa một file trong `app/giai-dau/` ngoài `layout.js`.
- Bạn thấy mình sắp viết một họ class mới không bắt đầu bằng `ph-`.
- Bạn thấy mình sắp sửa test cho khớp code thay vì sửa code cho khớp test.

## 7. Trạng thái các task

| Task | Trạng thái |
|---|---|
| Task 1 — Preflight | ✅ Xong, duyệt. Evidence: `docs/pickhub-core/evidence/design-system-bxh-task-1-preflight-2026-09-08.md` |
| Task 2 — Token + Montserrat | ✅ Xong, duyệt độc lập (đọc code + tự chạy lại test/build/regression). Commit `4b97122`. Evidence: `docs/pickhub-core/evidence/design-system-bxh-task-2-token-font-2026-09-08.md` |
| Task 3 — Primitive CSS | 🔧 Kế hoạch đã sửa (xem đính chính bên dưới), chưa thực thi lại |
| Task 4 trở đi | Chưa làm |

**Đính chính từ Task 1, đã sửa trong kế hoạch:**

- Tham chiếu token khai tử là **301**, không phải 291. Con số cũ là lỗi cộng nhẩm khi
  soạn kế hoạch, không phải codebase thay đổi.
- Số giao dịch thật là **688** (spec ghi 686 vì đo sớm hơn một ngày). SQL bằng API nên
  trần 1.000 hàng chưa bị chạm; **Task 8 giữ nguyên vị trí**, không cần đảo lên trước.
- `npm run test:regression` **PASS** trước khi sửa gì. Đây là mốc so sánh: mọi lỗi đỏ
  từ Task 2 trở đi là do đợt này gây ra.

**Sửa lỗi trong kế hoạch — Task 3, phát hiện khi bạn dừng lại đúng lúc hỏi:**

`primitives.css` bản đầu của Task 3 dùng hex hardcode (`#fff`, `#F4F2FE`, `#FFF8E9`,
`#EEF0F5`, `rgba(40,36,61,.45)`…) cho tint nền của metric/badge/skeleton/backdrop —
vi phạm thẳng ràng buộc "không hardcode #rrggbb" ở mục 2. Đây là lỗi tôi viết sai khi
soạn kế hoạch, không phải bạn hiểu nhầm.

**Đã sửa, không phải ngoại lệ:** thêm 13 token tint mới vào `tokens.css`
(`--ph-tint-indigo`, `--ph-tint-gold`, `--ph-tint-gold-text`, `--ph-tint-cyan`,
`--ph-tint-coral`, `--ph-tint-positive`, `--ph-tint-negative`, `--ph-tint-neutral`,
`--ph-tint-neutral-strong`, cùng các `-line` tương ứng) và `--ph-backdrop`. Đây là
mở rộng baseline đúng cách — cùng kiểu với `--ph-positive`/`--ph-negative` đã làm ở
Task 2 — không phải hardcode lách luật. `primitives.css` giờ chỉ dùng `var(--ph-*)`,
kể cả `#fff` cũng đổi thành `var(--ph-card)`.

Task 3 trong kế hoạch giờ có 7 bước thay vì 3: thêm token trước (TDD — mở rộng
`REQUIRED_TOKENS` trong test, chạy fail, rồi thêm token cho pass), sau đó mới viết
`primitives.css`, và cuối cùng thêm **test chặn hardcode tự động**
(`NEW_CSS_FILES` trong `ph-design-system.test.js`) để lỗi này không lặp lại ở các
task CSS sau — Task 11 (trang BXH) đã được nối vào cùng danh sách kiểm đó.

**Ghi nhận từ review Task 2 — áp dụng cho mọi task sau:**

- Trong file evidence, chỉ điền hash commit **sau khi đã commit xong**. Task 2 tự ghi
  một hash không khớp commit thật vì viết evidence trước — không sai nghiêm trọng,
  nhưng đừng đoán trước hash.
- Khi một token trong `globals.css`/CSS công khai đổi tên (ví dụ
  `--mobile-bottom-nav-height` → `--ph-bottom-nav-height`), giữ tên cũ làm **alias**
  trong `legacy-aliases.css` trỏ sang tên mới — đừng đổi tên tại chỗ dùng. Task 2 đã
  làm đúng cách này, tiếp tục theo mẫu đó ở các task sau.

## 8. Task cần làm lần này

**Task 3 — làm lại từ đầu theo kế hoạch đã sửa (`git pull` trước).**

Kế hoạch Task 3 giờ có 7 bước: mở rộng test token (bước 1) → thêm token tint vào
`tokens.css` (bước 2) → chạy test xác nhận phần token pass (bước 3) → viết
`primitives.css` chỉ dùng `var(--ph-*)` (bước 4) → mở rộng test chặn hardcode tự động
(bước 5) → chạy test toàn bộ (bước 6) → build và commit (bước 7). Đọc lại nguyên
văn trong kế hoạch, đừng dùng bản primitives.css cũ trong bộ nhớ của bạn.

Chỉ làm task này. Làm xong thì báo cáo theo mẫu mục 5 và dừng lại chờ xác nhận.
