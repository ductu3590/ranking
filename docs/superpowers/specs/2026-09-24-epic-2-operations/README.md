# Spec — Epic 2: Tối ưu điều hành giải

Ngày: 2026-09-24 · Roadmap: `docs/superpowers/plans/2026-09-24-tournament-roadmap.md` (Epic 2)
Quyết định: `_workspace/unified-setup-ux/ADR-007-roadmap-decisions.md` — D8, D14, D21–D22 (giữ nguyên) và D25–D33 (epic này).
Thiết kế chuẩn: `_workspace/stitch-internal-setup/canonical/operations/` (README ở đó liệt kê screen ID và các điểm
thiết kế ≠ nghiệp vụ). So sánh Sportix: `_workspace/epic-2-operations/02_sportix_benchmark.md`.
Bất biến: skill `tournament-setup-invariants`.

## Các file spec

| Lát | File | Nội dung | Migration |
|---|---|---|---|
| E1 | [lat-e1-dieu-hanh.md](lat-e1-dieu-hanh.md) | Shell 4 mục; mục **Điều hành** (thẻ sân, hàng chờ theo lượt, thẻ gọi sân, sheet nhập tỉ số); nhãn trận & ô chờ theo nguồn; chặn các đường làm hỏng dữ liệu trận (nguyên nhân lỗi "Dữ liệu trận đã thay đổi") | Không |
| E2 | [lat-e2-tran-dau-so-do-cai-dat.md](lat-e2-tran-dau-so-do-cai-dat.md) | Mục **Trận đấu**, **Sơ đồ & xếp hạng** (component sơ đồ dùng chung, Tranh hạng ba tách riêng), **Cài đặt** (link/chia sẻ, sân, nhật ký đọc được, vùng nguy hiểm); bỏ ô BO theo vòng cho stage v4 | Không |
| E3 | [lat-e3-trang-cong-khai.md](lat-e3-trang-cong-khai.md) | Trang công khai 4 tab (Trực tiếp · Lịch · Xếp hạng · Sơ đồ) dùng lại component của E1/E2 | Không |

Mục tiêu "không migration": mọi sửa nằm ở route Node + UI; hàm SQL (068, finalize v4…) giữ nguyên. Nếu khi code phát
hiện bắt buộc phải sửa SQL, dừng lại và bổ sung spec (quy tắc chung §1.2–1.4 của roadmap).

## Quyết định áp dụng

| # | Quyết định |
|---|---|
| D8 / D14 | Mọi trận v4 BO1 theo `config.scoring`; chỉ `F` (loại trực tiếp/playoff) và `GF` (loại kép) có BO riêng, chọn lúc setup. Không có ô chọn BO theo vòng/lượt sau khi chốt |
| D21 / D22 | Nhãn và xếp hạng loại kép như Epic 1 |
| D25 | Thiết kế Stitch là chuẩn thị giác (bộ `canonical/operations/`) |
| D26 | Lát đầu là trung tâm điều hành, gom sửa nợ |
| D27 | Deploy: nhánh + PR nháp; agent chạy test; người dùng chạy browser CLB 59 rồi merge |
| D28 | Phạm vi nợ = danh sách roadmap mục Epic 2 (+ nguyên nhân gốc tìm được, §Hiện trạng) |
| D29 | Console sau chốt còn 4 mục: `Điều hành` · `Trận đấu` · `Sơ đồ & xếp hạng` · `Cài đặt`; mobile = thanh tab đáy |
| D30 | Trang công khai 4 tab: Trực tiếp · Lịch · Xếp hạng · Sơ đồ |
| D31 | Không làm Nhánh Bạc |
| D32 | Không làm link trọng tài (API `score-tokens` giữ nguyên, không UI) |
| D33 | Hàng chờ chỉ có nút "Gọi vào sân…", không kéo-thả |

## Hiện trạng đã kiểm chứng (2026-09-24)

1. **Nguyên nhân "Dữ liệu trận đã thay đổi, hãy tải lại."** (nợ Epic 1): giải loại kép thử nghiệm
   "Nhanhthangthua" (group 1) có trận `GF` (id 1469) ở trạng thái `live`, mới một bên, 0 ván. Route
   `POST /api/tournament-v2/games` nhận lưu **khi trận thiếu cặp và khi không có ván nào**, và mọi lần lưu chưa đủ
   ván đều đặt `status = 'live'`. Khi chốt `LF`, hàm 068 thấy trận đích không còn `pending|warmup` → ném
   `PLAYOFF_TARGET_CONFLICT` (40001) → route gộp chung thông báo với lỗi phiên bản. Toàn database chỉ có đúng 1 trận
   rơi vào trạng thái này. Hàm 068 đúng; lỗi ở route + UI.
2. Route `match-transition` cho phép chuyển trận sang `finalized` **không kèm tỉ số / người thắng / tiến cấp**
   (nút "Ghi điểm / Chốt" của ControlStep, W.O., bỏ cuộc). Trận loại trực tiếp chốt kiểu này không bao giờ điền cặp
   vào trận sau.
3. Lưu tỉ số qua route `games` **không ghi `started_at` / `ended_at`** → thống kê "TB phút/trận", giờ dự kiến xong,
   "Trận vừa chốt" thiếu dữ liệu (các trận của giải trên đều `ended_at = NULL`).
4. Bảng sân (`GET /assignments`) chỉ trả `entry_*_id`, không có tên, nhãn trận, nguồn ô chờ → UI hiện "Trận #id".
5. Không có cột `label`; nhãn trận suy từ `match_key` (quy ước ổn định): `GROUP-<bảng>-<n>`, `R<r>-<ô>`, `QF<n>`,
   `SF<n>`, `F`, `BRONZE`, `W<r>-<ô>`, `WF`, `L<r>-<ô>`, `LF`, `GF`; nguồn ô chờ lấy từ `tournament_stage_transitions`.
6. `OverviewTab` (chia sẻ Zalo, chuyển giai đoạn) không còn được mount ở đâu.
7. Test khóa chuỗi UI cũ sẽ phải sửa: `tests/tournament/ui-shell|ui-control-step|ui-courts-step|ui-results|ui-round-scoring.contract.test.js`
   → ghi lý do vào `_workspace/unified-setup-ux/ADR-006-retire-v2-wizard-tests.md` (quy tắc chung §1.7).

## Kiến trúc

```text
lib/tournament/matchLabels.js      (mới, thuần)  match_key + stage + transitions → nhãn tiếng Việt, nhãn ô chờ
lib/tournament/operationsBoard.js  (mới, thuần)  courts + matches + entries + assignments + transitions → view model bàn điều hành
lib/tournament/scoreEntry.js       (mới, thuần)  kiểm điều kiện lưu tỉ số, suy trạng thái, tạo ván W.O./bỏ cuộc
GET  /api/tournament-v2/operations?tournamentId=   (mới)  trả view model (E1)
POST /api/tournament-v2/games                      (sửa)  chặn trận thiếu cặp / không ván; ghi mốc giờ; W.O./bỏ cuộc (E1)
POST /api/tournament-v2/match-transition           (sửa)  chặn *→finalized; kiểm cặp sẵn sàng khi gọi sân (E1)
app/giai-dau/v2/console/*                          (viết lại shell + 4 mục; E1 Điều hành, E2 ba mục còn lại)
components dùng chung console ↔ công khai: BracketView, StandingsView, MatchRow, ScoreSheet (chỉ console)
```

## Ca nghiệm thu xuyên suốt (chạy tay trên CLB 59, người dùng — D27)

| Ca | Thể thức | Việc phải chạy tới cuối |
|---|---|---|
| K1 | Vòng bảng → loại trực tiếp, 7 cặp, 3 sân, có Tranh hạng ba | Gọi sân → khởi động → đấu → nhập tỉ số mọi trận; một trận W.O.; chung kết BO3; kết thúc giải; BXH + trang công khai |
| K2 | Loại kép, 7 cặp (1 bye), 2 sân | Chạy hết tới `GF` (đúng chỗ lỗi cũ); thử lưu nháp một trận chưa đủ cặp → bị chặn có thông báo rõ |
| K3 | Vòng tròn, 5 cặp, 2 sân | Hàng chờ theo lượt, cặp đang đấu không gọi được sân khác; nhật ký đọc được |
| K4 | Hai tab/máy cùng mở một trận | Máy B lưu sau máy A → banner xung đột, "Tải bản mới nhất" / "Giữ tỉ số của tôi" |
