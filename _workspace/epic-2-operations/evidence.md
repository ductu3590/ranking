# Epic 2 — Bằng chứng triển khai

Project Supabase `uhhlelemewilgsdijwja`. Spec: `docs/superpowers/specs/2026-09-24-epic-2-operations/`.

## Sửa dữ liệu hỏng (E1 §6.6) — 2026-09-24, người dùng đồng ý

Trận `GF` id 1469, giải "Nhanhthangthua" (group 1): `live`, mới một bên, 0 ván — nguyên nhân lỗi "Dữ liệu trận đã
thay đổi" khi chốt `LF` (xem README spec §Hiện trạng 1).

```sql
UPDATE tournament_matches SET status = 'pending'
WHERE id = 1469 AND group_id = 1 AND match_key = 'GF' AND status = 'live'
  AND entry_b_id IS NULL AND started_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM tournament_games g WHERE g.match_id = 1469)
RETURNING id, status, version, entry_a_id IS NOT NULL AS has_a, entry_b_id IS NOT NULL AS has_b;
```

Kết quả: đúng 1 dòng `{id: 1469, status: pending, version: 4, has_a: true, has_b: false}`. Không đổi `version`, không
migration. Trước khi sửa đã kiểm: toàn database chỉ có trận này ở trạng thái `live|warmup|paused` mà thiếu cặp.
Giải có thể chơi tiếp: chốt `LF` sẽ điền cặp thắng vào ô `b` của `GF`.

## Lát E1 — code (2026-09-24)

Không migration. Thay đổi: `lib/tournament/{matchLabels,scoreEntry,operationsBoard}.js` (mới, thuần);
`GET /api/tournament-v2/operations` (mới); `POST /games`, `POST /withdraw`, `POST /match-transition` (chặn dữ liệu);
console 4 mục (`ConsoleShell`, `TournamentConsoleV2`, `control/ControlCenter`, `control/ScoreSheet`, `leaveGuard`);
`ResultsTab` (ẩn ô BO theo lượt với stage v4, bỏ "Đội A/B"); gỡ `steps/ControlStep.js`.

| Kiểm | Kết quả |
|---|---|
| `tests/stitch-setup/epic-2/*` | labels 10/10, score-entry 8/8, board 7/7, api-contract 8/8, ui-contract 11/11 |
| `npm run test:stitch-setup` | xanh trừ `epic-1/ui-contract` (đỏ cục bộ do CRLF của `StepDraw.js`, có từ trước) |
| `npm run test:tournament`, `test:open-registration` | xanh (sau khi sửa 6 test khóa chuỗi — ADR-006 mục Epic 2) |
| `npx next build` | OK |
| Trang xem trước tạm (dựng từ `buildSetupPlan` + `buildOperationsBoard` thật, fetch giả lập; đã xoá, không commit) | 1280px: thẻ sân live/khởi động/trống/ngưng, gợi ý không trùng, "Cặp đang đấu ở Sân 01", ô chờ "Nhất bảng A"; sheet: 11–10 báo "phải thắng cách 2 điểm" + khóa nút chốt, 12–10 mở khóa; xung đột phiên bản hiện 2 cột, khóa lưu tới khi chọn; Back khi chưa lưu → hộp "Bạn có tỉ số chưa lưu", "Bỏ thay đổi" đóng sheet giữ trang; lịch sử: mở +1 mục, đóng gỡ đúng 1. 375px: không tràn ngang, thanh tab đáy, bottom sheet vừa khít, thẻ gọi sân đúng thiết kế. Không lỗi console |

Chưa làm — cần người dùng (D27): chạy thật K1/K2/K3/K4 trên CLB 59 (đăng nhập admin), đặc biệt K2 chạy tới `GF`.

## Bổ sung sau E1 — tạo giải & trạng thái (2026-09-24)

Yêu cầu người dùng: (1) Bước 1 không gõ được dấu cách; (2) Bước 3 ghép cặp lên đầu; (3) số sân chuyển sang
Bước 3 kèm gợi ý, tự tạo Sân 01…N; (4) chốt xong → "Chờ diễn ra", Nháp chỉ khi chưa xong 4 bước;
(5) nút nổi bật vào trang điều hành.

- Nguyên nhân (1): reducer `edit` chạy `normalizeDraft` → `trim()` mỗi phím, dấu cách cuối bị xoá ngay.
  Sửa: `normalizeDraft(raw, { keepWhitespace: true })` khi đang gõ; lưu/kiểm luật vẫn cắt.
- (3)(4): migration `109_prepare_tournament_after_finalize.sql` (hàm idempotent + bù dữ liệu cũ, trừ giải 204).
  Route finalize gọi hàm sau RPC chốt; gọi trận đầu tiên (`warmup`/`live`) chuyển `scheduled → live`.
- Test: `tests/stitch-setup/epic-2/setup-followup.test.js` 11/11; `test:stitch-setup` xanh trừ `epic-1/ui-contract`
  (CRLF, có từ trước); `test:tournament`, `test:open-registration` xanh; `next build` OK.
- Trang xem trước tạm (đã xoá): gõ "Giải nội bộ tháng 10", "Cụm sân CLB Mỹ Đình", "Thể lệ BO3 mỗi trận" giữ
  nguyên dấu cách; Bước 3 thứ tự A ghép cặp → B thể thức → C cấu hình → D số sân; 6 cặp/3 bảng gợi ý 3 sân,
  bấm "Dùng 3 sân" → courtCount 3; 375px không tràn ngang; không lỗi console.

## Apply migration 109 — 2026-09-24 (máy thứ hai, người dùng chọn "apply đủ cả phần bù")

- Chạy thử trước trong transaction tự huỷ (RAISE cuối khối): đúng 20 giải đổi trạng thái — `live`: 205, 210, 218
  (group 1), 219; còn lại `scheduled`: 168, 211 (group 1), 180–187 (52), 188–191 (54), 196 (19), 203 (59).
  Tạo sân: 203×3, 205×1, 210×2, 211×1, 218×2. Không giải nào khác bị chạm; sau khi huỷ, hàm chưa tồn tại.
- Apply thật qua `apply_migration` (`109_prepare_tournament_after_finalize`). Kết quả khớp lần chạy thử;
  giải 204 vẫn `draft`. `md5(prosrc)` = `ac46e3a8e21c6cd4a6344e19c45e8cdc` = thân hàm trong file.

## Nghiệm thu E1 — 2026-09-24 (người dùng, máy thứ hai, localhost:3100)

Giải 220 "Giải mới 24.9" (CLB 59): vòng bảng → loại trực tiếp, 3 sân, chung kết BO3 — chạy tới hết 15/15 trận.
Kết luận người dùng: **quy trình cơ bản hoàn tất giải 100%, giao diện chưa ổn**. Chưa merge. Phản hồi + lỗi agent soi
thêm, và cách sửa: `docs/superpowers/specs/2026-09-24-epic-2-operations/lat-e1-1-sua-sau-nghiem-thu.md` (D34–D36).

## Lát E1.1 — code (2026-09-24)

Không migration. Luật điểm "bên nhiều điểm hơn thắng" (server + sheet); thẻ "việc tiếp theo" trong Điều hành
(chốt vòng bảng / kết thúc giải); kết thúc giải chuyển giải sang `completed` ở cả Điều hành và Sơ đồ; tỉ số người
thắng trước; KPI sân đang dùng x/y; giao diện Điều hành sát Stitch OPS-01.

| Kiểm | Kết quả |
|---|---|
| `tests/stitch-setup/epic-2/*` | e1-1-acceptance 7/7, board 7/7, labels, score-entry, api-contract, ui-contract, setup-followup xanh |
| `npm run test:stitch-setup` | xanh trừ `epic-1/ui-contract` (CRLF trên Windows, đỏ cả khi bỏ thay đổi E1.1) |
| `npm run test:tournament`, `test:open-registration`, `tests/phase3/scoring-rules.test.js` | xanh |
| Trang xem trước tạm (fetch giả lập, đã xoá) | 1280/390 không tràn ngang; giữa giải: bộ lọc, tiêu đề sân, cặp canh giữa, vừa chốt "X thắng 11–9 trước Y"; vòng bảng xong: thẻ BXH tóm tắt + nút chốt → hộp xác nhận → "Quay lại"; lọc "Vòng loại trực tiếp" còn 3 trận chờ, 0 vừa chốt. Dev server không lỗi biên dịch |

Người dùng nghiệm thu trên CLB 59: **PASS E1.1** (2026-09-24).
