# Spec — Tournament Draw, Standings & Corrections (Bốc thăm, xếp hạng, sửa kết quả)

- Ngày: 2026-09-09
- Trạng thái: Draft (chờ user duyệt để chuyển sang plan)
- Thứ tự: **Spec 3 — làm sau Spec 0, 1, 2**
- Liên quan: `tournament-directory-lifecycle` (Spec 0), `tournament-round-scoring` (Spec 1), `tournament-operations` (Spec 2)

## 1. Mục tiêu

Ba việc xoay quanh **kết quả** và đều dùng chung một cơ chế tính lại, nên gộp một spec:

1. **Bốc thăm & chốt lịch** (bước 4) — máy bốc ra nháp, BTC sửa tay, chốt rồi mới sinh lịch.
2. **Bảng xếp hạng & sơ đồ nhánh** (bước 7) — gồm cột *suất đi tiếp* và **hạng chung cuộc** khi giải chốt.
3. **Sửa kết quả đã chốt** (correction) — bắt lý do, tính lại BXH và nhánh loại trực tiếp.

## 2. Hiện trạng đã kiểm chứng

**Có sẵn, dùng lại**

| Thứ | Ở đâu |
|---|---|
| Registry engine | `lib/tournament/engines/index.js` — `roundRobin`, `knockout` (+ `doubleElim`, `team` do IDE khác đang làm) |
| Hạt giống / bye | `lib/tournament/seeding.js` — `seedOrder`, `nextPowerOfTwo` |
| Ghi lịch xuống DB | `lib/tournament/persistence.js` — `scheduleToInsertRows`, `resolveParentLinks` |
| Suy kết quả trận | `lib/tournament/results.js` — `advanceWinner`, `buildResolvedMatches` |
| Tính BXH | `lib/tournament/standingsService.js` — `loadStageData`, `computeStageStandings` |
| Tie-break | `lib/tournament/rules/tiebreak.js` |
| Sinh lịch | `app/api/tournament-v2/generate/route.js` — nhận `seed`, chốt snapshot luật vào `stage.config` |
| Đẩy vòng sau | `app/api/tournament-v2/advance/route.js` |
| UI | `console/tabs/StandingsTab.js` (78 dòng), `console/tabs/BracketTab.js` (76 dòng), `bracketRender.js`, `standingsRender.js` |
| Bảng correction | `tournament_result_corrections` — **đã tồn tại, rỗng**: `match_id, before_payload, after_payload, reason, requester, approver, status ('requested'), requested_at, approved_at, applied_at` |

**Chưa có**

- Không có bước **bốc thăm nháp**: `generate` bấm phát ra lịch luôn, không xem trước, không sửa tay, không chốt.
- Không có khái niệm **khoá lịch sau khi chốt**.
- Không có cột **suất đi tiếp** trong BXH, không có **hạng chung cuộc**.
- Không có luồng correction nào chạm vào `tournament_result_corrections`; route `corrections/` chưa commit là bản nháp minify, **sẽ viết lại**.

**Ràng buộc engine.** `doubleElim` phát ra trận có thêm `bracket` (`'W'|'L'|'GF'`) và `loser_to_slot`. `persistence.js` và `results.js` hiện **chỉ định tuyến một winner** qua `parent_match_id` — chưa có đường cho kẻ thua. Đây là việc của spec này (tầng persistence/API), **không phải của engine**; `lib/tournament/engines/*` vẫn không được đụng.

## 3. Bốc thăm & chốt lịch (bước 4)

### 3.1 Ba trạng thái của một giai đoạn

| Trạng thái lịch | Nghĩa | Ở đâu |
|---|---|---|
| `none` | Chưa bốc | `stage.config.draw` không tồn tại |
| `draft` | Có bản nháp, chưa sinh trận | `stage.config.draw.status = 'draft'` |
| `locked` | Đã chốt, đã sinh trận | `stage.config.draw.status = 'locked'` |

Không cần migration — `tournament_stages.config` là `jsonb`.

```jsonc
"draw": {
  "status": "draft",
  "seed": 1739,
  "slots": [ { "entry_id": 12, "group_label": "A", "seed_in_stage": 1 } ],
  "drawn_at": "2026-09-09T08:12:00Z",
  "locked_at": null
}
```

### 3.2 Luồng

1. **Bốc thăm** — máy xếp đội vào bảng/nhánh theo `seedOrder` với một `seed` ngẫu nhiên, ghi vào `config.draw` ở trạng thái `draft`. **Chưa sinh trận nào.**
2. **Sửa tay** — BTC đổi chỗ hai đội (đổi `group_label` / `seed_in_stage`). Chỉ đổi được khi `draft`.
3. **Bốc lại** — sinh `seed` mới, ghi đè `slots`, mất hết sửa tay (có hỏi lại).
4. **Chốt** — kiểm hợp lệ (mục 3.3) → gọi engine sinh lịch → `scheduleToInsertRows` → `resolveParentLinks` → `config.draw.status = 'locked'`. Đây là chỗ **duy nhất** tạo trận.
5. **Huỷ chốt** — chỉ khi **chưa trận nào `live`/`finalized`**; xoá toàn bộ trận của giai đoạn, quay về `draft`, **bắt nhập lý do**, ghi nhật ký. Có trận đã đấu → 409 `DRAW_HAS_PLAYED_MATCHES`.

### 3.3 Kiểm trước khi chốt

| Kiểm | Sai thì |
|---|---|
| Mỗi đội xuất hiện đúng một lần | 400 `DRAW_DUPLICATE_ENTRY` |
| Số đội ≥ 2 | 400 `DRAW_TOO_FEW_ENTRIES` |
| Vòng tròn nhiều bảng: chênh lệch số đội giữa các bảng ≤ 1 | **cảnh báo, không chặn** |
| Hai đội cùng CLB rơi cùng bảng | **cảnh báo, không chặn** |

Cảnh báo hiện dưới dạng danh sách vàng kèm nút "Chốt luôn" — giống cách wizard đang xử lý cảnh báo ghép cặp (`summarizeRosterWarnings` luôn `blocking: false`).

### 3.4 Giao diện

Bảng/nhánh xếp cạnh nhau, mỗi ô là một đội. Đổi chỗ bằng **chọn hai ô rồi bấm Đổi chỗ** — không kéo thả, vì bàn điều hành có thể chạy trên tablet và kéo thả trong danh sách cuộn rất dễ hỏng. Trên đầu: nút **Bốc thăm** / **Bốc lại**, dải cảnh báo, nút **Chốt & sinh lịch** (đậm, phải xác nhận).

## 4. Bảng xếp hạng & sơ đồ nhánh (bước 7)

### 4.1 Bảng xếp hạng

Dùng `computeStageStandings` đang có. Bổ sung ba thứ:

**Cột *suất đi tiếp*.** Suy từ `stage.config.advance` (số suất đi tiếp mỗi bảng, đã có khi cấu hình giai đoạn) + thứ hạng hiện tại:

| Điều kiện | Nhãn |
|---|---|
| Hạng ≤ số suất, và **đã đủ điều kiện toán học** | `Nhất bảng A` / `Nhì bảng A` |
| Hạng ≤ số suất, còn trận chưa đấu | `Tạm nhất bảng A` |
| Ngoài suất nhưng còn cơ hội toán học | `Tranh vé vớt` |
| Không còn cơ hội toán học | `Đã loại` |

"Đủ điều kiện toán học" = kể cả thua hết trận còn lại và các đội dưới thắng hết, thứ hạng vẫn không tụt khỏi suất. Tính bằng một hàm thuần `qualificationOutlook(rows, remainingByEntry, slots)`.

**Dòng tiêu chí.** Hiện dưới bảng: `Điểm → Hiệu số → Đối đầu trực tiếp → PHR`, lấy từ `tiebreak_policy` đang áp dụng chứ không viết cứng.

**Hạng chung cuộc.** Khi giải chuyển `completed` (Spec 0 mục 6), tính hạng cuối từng nội dung rồi **ghim** vào cột mới `tournament_divisions.final_standings jsonb` (migration 044):

```jsonc
[
  { "rank": 1, "entry_id": 12, "label": "Vô địch" },
  { "rank": 2, "entry_id": 27, "label": "Á quân" },
  { "rank": 3, "entry_id": 31, "label": "Hạng ba" }
]
```

Ghim chứ không tính lại mỗi lần đọc: sau khi giải xong, hạng là **dữ kiện lịch sử** — nếu để tính động thì đổi luật tie-break năm sau sẽ làm đổi hạng của giải năm trước. Dùng cột riêng chứ không nhét vào `eligibility` (điều kiện dự giải) hay `competition_status` (trạng thái vận hành) để ba thứ khác nghĩa không lẫn nhau.

Nguồn hạng: nội dung có giai đoạn loại trực tiếp → lấy từ nhánh (vô địch, á quân, hạng ba); chỉ có vòng tròn → lấy thứ tự BXH giai đoạn cuối.

### 4.2 Sơ đồ nhánh

`BracketTab` hiện vẽ được knockout một nhánh. Bổ sung:

- **Double elimination**: vẽ ba cụm `Nhánh thắng` / `Nhánh thua` / `Chung kết tổng` theo `match.bracket`. Cuộn ngang trong khung riêng.
- **Định tuyến kẻ thua**: `persistence.js` phải lưu `loser_to_slot` → thêm cột `tournament_matches.loser_match_id bigint` (migration 044) và `resolveParentLinks` nối cả hai đường. `results.js` khi chốt trận đẩy **kẻ thắng** vào `parent_match_id` và **kẻ thua** vào `loser_match_id`.
- Trận chưa có đội hiện `Thắng BK1` / `Thua TK2` thay vì để trống.

> **Phụ thuộc.** Phần double-elim chỉ làm được sau khi engine của IDE khác xong và shape `bracket` / `loser_to_slot` đã chốt. Plan phải để nó thành **nhóm task cuối, có thể cắt ra** nếu engine chưa sẵn sàng — phần knockout một nhánh và vòng tròn không phụ thuộc gì.

## 5. Sửa kết quả đã chốt (correction)

### 5.1 Nguyên tắc

Đã chốt với user: **sửa trực tiếp, bắt lý do, ghi nhật ký** — không có luồng đề xuất → duyệt hai bước, vì mô hình vận hành chỉ có một BTC.

Bảng `tournament_result_corrections` đã có cột `requester`/`approver`/`status`/`approved_at` cho luồng hai bước. Spec này **dùng bảng đó nhưng ghi thẳng** `status = 'applied'`, `requester = approver = actor`, `approved_at = applied_at = now()`. Không tạo bảng mới, không bỏ cột — để dành nếu sau này có giải lớn cần duyệt hai bước.

### 5.2 Luồng

1. BTC mở một trận `finalized`, bấm **Sửa kết quả**.
2. Nhập lại tỉ số từng ván. Kiểm bằng **luật của vòng chứa trận** (`resolveMatchScoring`, Spec 1) — kể cả khi luật vòng đó đã khoá.
3. **Bắt buộc nhập lý do.**
4. Máy hiện **bản xem trước hệ quả** trước khi lưu: BXH đổi thế nào, đội nào đổi suất đi tiếp, trận nào ở vòng sau bị ảnh hưởng.
5. Lưu → ghi `tournament_result_corrections` + một dòng `tournament_operation_logs` (`action = 'result_corrected'`), cập nhật ván/`winner_entry_id`, **tính lại theo mục 5.3**.

### 5.3 Tính lại tới đâu

- **BXH**: tính lại toàn bộ giai đoạn chứa trận. Rẻ, `computeStageStandings` vốn tính từ đầu.
- **Nhánh loại trực tiếp**: nếu đổi đội thắng, đội ở trận sau phải đổi theo. Chỉ làm được khi **trận sau chưa `finalized`**. Trận sau đã đấu xong → **409 `CORRECTION_BLOCKED_DOWNSTREAM`**, kèm danh sách trận phải huỷ chốt trước. Máy **không tự dây chuyền huỷ kết quả** — quá nguy hiểm, để BTC quyết từng bước.
- **Hạng chung cuộc**: giải đã `completed` mà sửa kết quả → xoá `final_standings`, buộc BTC chốt giải lại.

### 5.4 Giao diện

Nằm ở **bước 6 · Lịch thi đấu & kết quả**: mỗi trận `finalized` có nút **Sửa kết quả**. Lịch sử sửa của một trận hiện ngay dưới trận đó. Toàn bộ bản ghi correction cũng đổ vào **bước 8 · Nhật ký thao tác**.

## 6. Migration `044_tournament_draw_and_results.sql`

Chỉ thêm cột, không xoá.

```sql
-- Định tuyến kẻ thua cho double elimination
ALTER TABLE public.tournament_matches
  ADD COLUMN IF NOT EXISTS loser_match_id bigint
  REFERENCES public.tournament_matches(id) ON DELETE SET NULL;

-- Hạng chung cuộc ghim khi giải chốt
ALTER TABLE public.tournament_divisions
  ADD COLUMN IF NOT EXISTS final_standings jsonb;

-- Trạng thái correction: siết lại giá trị hợp lệ
ALTER TABLE public.tournament_result_corrections
  ADD CONSTRAINT tournament_result_corrections_status_ck
  CHECK (status IN ('requested','approved','applied','rejected'));
```

Bảng correction đang rỗng nên thêm CHECK an toàn; plan vẫn phải chạy `SELECT DISTINCT status` để xác nhận trước.

## 7. Kiểm thử

**Lớp thuần** — `tests/tournament/draw.test.js`, `tests/tournament/standings-outlook.test.js`:

1. `validateDraw`: đội trùng → `DRAW_DUPLICATE_ENTRY`; 1 đội → `DRAW_TOO_FEW_ENTRIES`; bảng lệch 2 đội → cảnh báo `blocking: false`; hai đội cùng CLB một bảng → cảnh báo.
2. `swapDrawSlots`: đổi chỗ hai đội giữ nguyên tổng số đội và không tạo trùng.
3. `qualificationOutlook`: đội dẫn đầu còn 0 trận và cách đội thứ 3 nhiều hơn số điểm tối đa còn lại → `Nhất bảng A`; đội cùng điểm còn trận → `Tạm nhất`; đội không thể đuổi kịp → `Đã loại`.
4. `finalStandingsFrom`: nội dung có knockout → vô địch/á quân/hạng ba lấy từ nhánh; nội dung chỉ vòng tròn → lấy BXH giai đoạn cuối.
5. `resolveParentLinks` với trận có `loser_to_slot` → nối đúng cả `parent_match_id` lẫn `loser_match_id`; trận knockout thường → `loser_match_id` là `null`.
6. `correctionImpact`: trả đúng danh sách trận vòng sau bị ảnh hưởng; trận sau đã `finalized` → cờ `blocked = true`.

**Hợp đồng API**:

7. Chốt bốc thăm hai lần liên tiếp → lần hai 409 `DRAW_ALREADY_LOCKED`.
8. Huỷ chốt khi có trận `finalized` → 409 `DRAW_HAS_PLAYED_MATCHES`.
9. Correction thiếu `reason` → 400.
10. Correction làm đổi đội thắng trong khi trận vòng sau đã `finalized` → 409 `CORRECTION_BLOCKED_DOWNSTREAM`.
11. Mỗi correction sinh đúng một dòng `tournament_result_corrections` và một dòng `tournament_operation_logs`.
12. Mọi truy vấn có `.eq('group_id', ...)`; mọi ghi qua guard admin.

**Kiểm tay**: chạy trọn một nội dung 8 đội — bốc thăm, đổi chỗ, bốc lại, chốt, đấu hết vòng bảng, xem cột suất đi tiếp đổi theo từng trận, sửa một kết quả đã chốt rồi xác nhận BXH và nhánh cập nhật đúng.

## 8. Ràng buộc

- **Không đụng `lib/tournament/engines/*`.** Định tuyến kẻ thua làm ở `persistence.js` / `results.js` / API.
- Phần double-elim là **nhóm task cuối, cắt ra được** nếu engine chưa xong.
- Không `DROP` / `TRUNCATE`.
- Mọi truy vấn scope `group_id`; mọi ghi qua guard admin.
- Thông báo lỗi cho BTC bằng **tiếng Việt**, nói rõ phải làm gì để đi tiếp.
