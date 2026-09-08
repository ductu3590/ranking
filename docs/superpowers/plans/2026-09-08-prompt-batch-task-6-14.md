# Prompt giao IDE chạy trọn Task 6 → 14 (chế độ batch)

Dán nguyên khối dưới đây. Đây là chế độ chạy liên tục nhiều task, khác với chế độ
checkpoint từng task trước đó. Task 1–5 đã xong và được duyệt.

---

Bạn là kỹ sư triển khai của PickHub — Next.js 14 App Router, **JavaScript thuần**,
Supabase. **Dự án đang vận hành thật, database có CLB thật (~688 giao dịch).** Task 1–5
của kế hoạch đã hoàn tất và được duyệt. Nhiệm vụ lần này: **chạy trọn Task 6 đến Task 14
theo đúng thứ tự**, mỗi task một commit, dừng lại ở đúng hai điểm bắt buộc nêu bên dưới.

## 0. `git pull` trước. Đọc nguồn sự thật trước khi viết dòng đầu tiên

Theo đúng thứ tự, tài liệu trước thắng khi mâu thuẫn:

1. `docs/superpowers/plans/2026-09-08-pickhub-design-system-va-bxh.md` — kế hoạch, có code cụ thể từng bước. Task 6–14 nằm ở đây.
2. `docs/superpowers/specs/2026-09-08-pickhub-design-system-va-bxh-design.md` — quyết định thiết kế và số liệu đo thật.
3. `docs/pickhub-core/UI-BRAND-SYSTEM.md`, `ADR-006`, `UI-STRATEGY.md` — baseline và ranh giới.
4. `CLAUDE.md` và skill `pickhub-engineering` — quy ước bắt buộc.

Nếu tài liệu mâu thuẫn ở điểm ảnh hưởng code: **dừng, trích dẫn hai nguồn, hỏi.**

## 1. Nền tảng đã có sẵn từ Task 1–5 — dùng lại, không dựng lại

- Token `--ph-*` và tint đầy đủ trong `app/styles/tokens.css`. Mọi màu qua `var(--ph-*)`.
- Primitive trong `app/styles/primitives.css`: `ph-btn`, `ph-card`, `ph-panel`, `ph-metric`,
  `ph-badge`, `ph-chip`, `ph-seg`, `ph-table`, `ph-modal`, `ph-field`, `ph-state`, `ph-skeleton`.
- Component: `components/pickhub/PhModal.js`, `PhConfirm.js`, `PhSeg.js`, `AppShell.js`,
  `SideRail.js`, và `PhNotificationBell.js` (đang là placeholder trả `null`, Task 12 viết đè).
- Test guard: `tests/ph-design-system.test.js` chặn hardcode hex trong `NEW_CSS_FILES` và
  chặn định nghĩa token cũ ngoài `legacy-aliases.css`.

## 2. Ràng buộc tuyệt đối — giữ nguyên như 5 task đầu

- **Không đụng bất kỳ file nào trong `app/giai-dau/`.** Task 5 đã sửa `layout.js` xong;
  từ Task 6 trở đi không có lý do chạm thư mục đó nữa. Một session khác đang làm ở đó.
- Cấm `DROP`, `TRUNCATE`, `DELETE` không điều kiện, reset database.
- Mọi truy vấn Supabase scope `.eq('group_id', …)`.
- Migration additive, idempotent, có default. Số kế tiếp là **`043`** (kiểm `ls database/migrations/`).
- `lib/fundLeaderboard.js`, `lib/fundContributions.js` là **hàm thuần** — không React, không
  Next, không gọi Supabase trong hàm tính. `fundContributions` nhận client làm tham số.
- Route `app/api/**` chỉ parse/authorize/gọi hàm/map response. Không chứa thuật toán xếp hạng.
- Không hardcode `#rrggbb` trong file `.css` mới. Không tạo họ class ngoài `ph-`.
- Không dùng `window.confirm()` / `window.prompt()` mới.
- **Không dùng chữ "nộp phạt"** trong copy giao diện. Từ vựng: "đóng góp" / "nộp tiền" /
  "đóng quỹ". Tên trang BXH là "BXH đóng góp". Giá trị `nop_phat` trong database giữ nguyên.
- File evidence **không chứa hash commit** (git log của file là nguồn thật). Hash ghi trong
  báo cáo chat, không ghi trong file.

## 3. Ba quyết định dễ làm sai — đọc kỹ, đã đo trên dữ liệu thật

1. **Bộ lọc BXH là đối chiếu roster** (`nguoi_nop` khớp `club_members.full_name`, không phân
   biệt hoa/thường sau chuẩn hoá khoảng trắng), KHÔNG phải danh sách đen, KHÔNG dùng
   `parsing_method`/`confidence_score`.
2. **Múi giờ `Asia/Ho_Chi_Minh` (UTC+7, không DST)** ở cả client và server. Dùng
   `toVnWall`/`fromVnWall` trong kế hoạch. Sai chỗ này thì server Vercel (UTC) và trình
   duyệt cắt biên tuần lệch 7 giờ.
3. **Ảnh chia sẻ lấy `group_id` từ phiên, KHÔNG nhận từ URL**, trả `Cache-Control: private, no-store`.

## 4. Thứ tự và HAI ĐIỂM DỪNG BẮT BUỘC

```
Task 6   Migration 043                              ← ĐIỂM DỪNG 1
Task 7   Chuẩn hoá 'Unknown' + dọn tồn đọng         ← ĐIỂM DỪNG 2 (bước dữ liệu)
Task 8   Đọc đủ giao dịch (phân trang)
Task 9   Logic BXH đóng góp
Task 10  Công tắc huy hiệu qua API
Task 11  Trang BXH
Task 12  Chuông thông báo + gán thủ công
Task 13  Thẻ chia sẻ PNG
Task 14  Dọn alias, tài liệu, evidence
```

**ĐIỂM DỪNG 1 — sau khi VIẾT file migration `043`, TRƯỚC khi apply lên database:**
Chạy preflight query, dán kết quả vào báo cáo, **rồi DỪNG và báo cáo trước khi gọi
`apply_migration`.** Việc apply lên database thật cần người xác nhận. Không tự apply.

**ĐIỂM DỪNG 2 — Task 7 bước dữ liệu (dọn tồn đọng `nguoi_nop`):**
Chạy câu **đếm trước** (bước 1 của script), dán số vào báo cáo, **rồi DỪNG.** Không tự
chạy câu UPDATE. Nếu số đếm > 100, càng phải dừng — có thể roster thiếu người và sắp
ghi đè tên thật. Chờ xác nhận rồi mới chạy UPDATE và đếm sau.

Ngoài hai điểm đó, **chạy liên tục** Task 6 (phần viết file + test) → 14 không cần dừng
giữa chừng. Vẫn giữ một-task-một-commit.

## 5. Quy trình mỗi task — không đổi

1. Đọc lại task trong kế hoạch và mục spec nó tham chiếu.
2. **Viết test trước, chạy, thấy fail thật.** Không viết implementation trước test.
3. Viết implementation tối thiểu cho test xanh.
4. Chạy test focused + regression liên quan:
   - `node tests/ph-design-system.test.js` sau thay đổi CSS.
   - `node tests/fund-leaderboard.test.js` sau thay đổi logic BXH.
   - `npm run build` sau thay đổi component/route.
   - `npm run test:regression` sau Task 9 và sau Task 14.
5. Một task một commit, message tiếng Việt không dấu.

## 6. Khi nào phải DỪNG ngoài hai điểm trên

- Cần thêm dependency npm mới (đặc biệt Task 13 cần thư viện SVG→PNG — kế hoạch cho phép
  tạm trả `image/svg+xml` kèm ghi chú thay vì tự cài `sharp`; nếu muốn cài thật thì hỏi).
- Kế hoạch mâu thuẫn code thật ở điểm ảnh hưởng kiến trúc.
- Test focused đỏ mà sửa mãi không xanh sau 3 lần — dừng, báo cáo output, đừng nới lỏng test.
- Sắp phải đụng file trong `app/giai-dau/` hoặc tạo họ class ngoài `ph-`.

## 7. Báo cáo cuối

Sau khi xong Task 14 (hoặc dừng ở điểm dừng), báo cáo gộp gồm:

- Bảng: mỗi task | file thay đổi chính | test focused pass/fail | commit message (KHÔNG hash trong file, hash để trong bảng chat này).
- Migration `043`: preflight / verification thật (nếu đã apply sau xác nhận).
- Bước dữ liệu Task 7: đếm trước / đếm sau thật.
- `npm run test:regression` cuối cùng: nguyên văn dòng kết.
- `npm run build` cuối cùng: pass/fail.
- Mục "Lệch so với kế hoạch" gộp: mọi chỗ phải làm khác kế hoạch và lý do.
- Danh sách file mới tạo để tôi review.

Bắt đầu từ **Task 6**. Dừng ở **ĐIỂM DỪNG 1** (sau khi viết migration, trước khi apply).
