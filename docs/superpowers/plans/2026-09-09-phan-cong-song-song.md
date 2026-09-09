# Phân công song song — 20 task còn lại

**Plan gốc:** `docs/superpowers/plans/2026-09-09-dieu-huong-va-giao-dien-clb.md`
Mỗi task trong đó đã có code đầy đủ, lệnh chạy và kết quả kỳ vọng — IDE khác đọc thẳng task của mình là làm được, không cần đọc cả plan.

**Nhánh:** `feat/dieu-huong-va-giao-dien-clb`. Phase A (Task 1–6) đã xong, commit cuối `766d009`.

---

## ⚠ Ba luật bắt buộc cho mọi IDE

1. **Không `git add -A` / `git add .` trần.** Working tree có 16 file sửa + 44 file chưa theo dõi của việc khác (tournament-v2, `_workspace/`, `evidence/`, `.agents/`). Stage đúng đường dẫn của task mình.
2. **Không sửa file ngoài cột "File sở hữu"** của task mình. Đó là ranh giới chống xung đột.
3. **Hai test đỏ có sẵn, đừng sửa, đừng hoảng:**
   - `npm run test:ph-ui` — 19 hex trong `app/bxh/page.css`, **chỉ Task 19 được dọn**
   - `tests/pickhub-ui-phase2.browser.test.js:125` — assert markup không tồn tại, ngoài phạm vi

---

## Bản đồ xung đột — file bị nhiều task đụng

| File | Task đụng vào | Hệ quả |
|---|---|---|
| `app/quy/page.js` | **14, 25** | Phải cùng một người, hoặc 25 chờ 14 |
| `app/thanh-vien/page.js` | **16, 17** | Phải cùng một người, tuần tự |
| `app/admin/ClubSettings.js` | **22, 24** | Phải cùng một người, 22 trước |
| `components/pickhub/AppShell.css` | **8, 9** | Phải cùng một người |
| `tests/multitenant-phase3.test.js` | **22** | Chỉ 22 |

Mọi task còn lại tạo **file mới hoàn toàn** → chạy song song vô tư.

---

## Bốn luồng chạy song song

### Luồng A — Shell (Claude Code giữ)
Ràng buộc: 8 và 9 chung `AppShell.css`. Mọi trang phụ thuộc thị giác vào luồng này.

| Task | Nội dung | File sở hữu | Ước |
|---|---|---|---|
| 7 | `AppTopBar` breadcrumb | `components/pickhub/AppTopBar.{js,css}` | 20′ |
| 8 | `SideRail` brand + user card | `components/pickhub/SideRail.js`, `AppShell.css` | 40′ |
| 9 | Ghép shell + 3 mốc responsive | `components/pickhub/AppShell.{js,css}` | 50′ |

### Luồng B — Component quỹ (giao IDE khác được ngay)
Bốn task này **chỉ tạo file mới**, không đụng gì của ai. Chạy song song cả 4 cũng được.

| Task | Nội dung | File sở hữu | Ước |
|---|---|---|---|
| 11 | `FundTransactionList` dòng-thẻ | `components/pickhub/fund/FundTransactionList.{js,css}` | 40′ |
| 12 | `FundEntryForm` ghi thu/chi | `components/pickhub/fund/FundEntryForm.js` | 35′ |
| 13 | `FundTransactionEditor` | `components/pickhub/fund/FundTransactionEditor.js` | 30′ |
| 10 | `AssignTransactionDialog` nhận transaction | `components/pickhub/AssignTransactionDialog.js`, `PhNotificationBell.js` | 20′ |

### Luồng C — BXH (giao IDE khác được ngay)
Hoàn toàn tách biệt, không ai đụng `app/bxh/`.

| Task | Nội dung | File sở hữu | Ước |
|---|---|---|---|
| 19 | Dựng lại dòng xếp hạng + **dọn 19 hex** | `app/bxh/page.{js,css}` | 70′ |

> Task này là task duy nhất được phép sửa `app/bxh/page.css`. Xong nó thì `npm run test:ph-ui` mới xanh trở lại.

### Luồng D — Backend + Cấu hình (giao IDE khác được ngay)
20, 21, 23 là file mới → song song. 22 rồi 24 phải tuần tự vì chung `ClubSettings.js`.

| Task | Nội dung | File sở hữu | Ước |
|---|---|---|---|
| 20 | Migration `groups.fund_qr_url` | `database/migrations/044_group_fund_qr.sql` | 25′ |
| 21 | API ghi/đọc QR | `app/api/club/settings/route.js`, `app/api/club/fund-qr/route.js` | 30′ |
| 23 | `ClubSettingsNav` sub-menu neo | `components/pickhub/ClubSettingsNav.{js,css}` | 35′ |
| 22 | Xoá regenerate-code | `app/api/club/settings/regenerate-code/`, `ClubSettings.js`, `tests/multitenant-phase3.test.js` | 25′ |
| 24 | Chia `ClubSettings` thành 7 mục | `app/admin/ClubSettings.js`, `club-settings.css` | 100′ |

---

## Điểm hợp long — phải chờ

Năm task này **không giao song song được**, vì cần kết quả của luồng khác:

| Task | Chờ ai | Nội dung | Ước |
|---|---|---|---|
| 14 | Luồng B xong (10–13) | Ghép thao tác vào `app/quy/page.js` | 70′ |
| 15 | 14 xong | Xoá `app/quy/admin/` | 10′ |
| 16 → 17 | — (nhưng tuần tự với nhau) | Cột PHR, rồi diện mạo thành viên | 35′ + 40′ |
| 18 | 17 xong | `MemberProfileView` + route `[id]` + `/thong-tin` | 80′ |
| 25 | 14 và 21 xong | QR ở cột phải `/quy` | 25′ |
| 26 | Tất cả | Chốt hồi quy + evidence | 40′ |

---

## Tổng lượng

| Nhóm | Task | Giờ |
|---|---|---|
| Luồng A — shell | 7, 8, 9 | ~1,8 |
| Luồng B — component quỹ | 10–13 | ~2,1 |
| Luồng C — BXH | 19 | ~1,2 |
| Luồng D — backend + cấu hình | 20–24 | ~3,6 |
| Hợp long | 14, 15, 16, 17, 18, 25, 26 | ~5,0 |
| **Tổng nếu làm tuần tự** | **20 task** | **~13,7 giờ** |
| **Nếu chạy 4 luồng song song** | | **~7 giờ** |

Đường găng là **Luồng D → 24** (100′) và cụm hợp long (5 giờ) — cụm hợp long không rút ngắn được bằng cách thêm người.

---

## Giao ngay được, không cần chờ gì

Ba gói dưới đây khởi động song song được **ngay bây giờ**, không đụng nhau và không đụng Phase A:

- **Gói 1 → IDE #2:** Task 11, 12, 13, 10 (luồng B)
- **Gói 2 → IDE #3:** Task 19 (luồng C)
- **Gói 3 → IDE #4:** Task 20, 21, 23 (phần file-mới của luồng D)

Claude Code giữ luồng A và toàn bộ cụm hợp long.

---

## Câu lệnh mở đầu cho IDE khác

> Đọc `docs/superpowers/plans/2026-09-09-dieu-huong-va-giao-dien-clb.md`, làm đúng **Task N**.
> Chỉ sửa file trong cột "File sở hữu" của task đó. Không `git add -A`.
> Hai test `test:ph-ui` và `pickhub-ui-phase2.browser.test.js` đang đỏ sẵn — kệ chúng.
> Commit lên nhánh `feat/dieu-huong-va-giao-dien-clb`.
