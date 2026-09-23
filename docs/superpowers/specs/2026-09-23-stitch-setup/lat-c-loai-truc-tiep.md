# Lát C — Loại trực tiếp

Trạng thái: spec chờ duyệt · Deploy 3 · Phụ thuộc: Lát B đã deploy · Xem [README](README.md)

## 1. Mục tiêu

Mở khóa `knockout`: một nhánh loại trực tiếp, thua một trận là bị loại. Có tranh hạng ba và BO chung kết tùy chọn. Tái dùng hạ tầng Lát A, không tạo RPC mới.

## 2. Cấu hình

```js
format: {
  entrantType: 'doubles',
  formatKey: 'knockout',
  config: { thirdPlaceEnabled: boolean, finalBestOf: 1|3|5 }
}
```

- Tối thiểu cứng 4 cặp. Khuyến nghị 8–32 cặp. Ngoài khoảng khuyến nghị chỉ cảnh báo.
- BO: giống Lát A §7. Chỉ `F` chọn được BO; các trận khác cố định BO1. Cùng dùng tầng ghi đè `match_scoring`.

## 3. Bốc thăm và bye

- Xáo các `pairId` (đã sort) bằng PRNG theo seed. Thứ tự sau khi xáo quyết định vị trí trong nhánh, thông qua `seeding.seedOrder`. Rating không tham gia.
- `B = nextPowerOfTwo(n)`; số bye = `B − n`. Engine `knockout.generateSchedule` đặt cặp được bye thẳng vào vòng 2 mà không tạo trận bye. Adapter giữ nguyên hành vi này: không tạo entrant giả, không tạo trận chỉ có một bên.
- Bye rơi vào các vị trí bốc thăm đầu tiên, tức hoàn toàn theo bốc thăm. Bước 4 hiện `Cặp được vào thẳng vòng 2: …` và cảnh báo `KNOCKOUT_BYE`.
- Sơ đồ ở vòng 2 hiện tên cặp vào thẳng. Ô còn lại mang placeholder `Thắng trận 1`.

## 4. Plan (`setupPlans/knockout.js`)

- Một stage: `planKey 'knockout'`, `scheduleFormat 'knockout'`, `config { setupPlanVersion: 4 }`, thêm `match_scoring` nếu `finalBestOf > 1`.
- Chuyển trận từ engine: `round`, `bracket_slot`, `parent_slot`.
- **`matchKey`:** trận cuối là `F`; hai trận trước đó là `SF1`/`SF2`; bốn trận trước nữa là `QF1`–`QF4`; các vòng sớm hơn là `R<round>-<bracket_slot+1>`. Thêm `BRONZE` nếu bật tranh hạng ba.
- **Progression:** mỗi cạnh `parent_slot` trở thành `match_outcome winner` tới ô a/b của trận cha, theo đúng thứ tự engine. `BRONZE` nhận `loser` của `SF1` và `SF2`.
- Engine hiện không sinh trận tranh hạng ba, nên adapter thêm.
- `counts.total = n − 1`, cộng 1 nếu có tranh hạng ba.

| Ca kiểm | Bye | Trận (+ hạng ba) | Vòng |
|---|---|---|---|
| 4 cặp | 0 | 3 (4) | 2 |
| 6 cặp | 2 | 5 (6) | 3 |
| 8 cặp | 0 | 7 (8) | 3 |
| 12 cặp | 4 | 11 (12) | 4 |
| 32 cặp | 0 | 31 (32) | 5 |

## 5. Tiến cấp khi thi đấu

Chỉ dùng cạnh `match_outcome`. Cơ chế hiện có (`replace_tournament_games_with_transitions`) đã tự điền cặp thắng/thua vào trận sau, nên không cần RPC tiến cấp mới. QA phải xác nhận cơ chế này hoạt động với stage do v4 tạo, kể cả ô cặp vào thẳng từ bye và trận `BRONZE`.

## 6. RPC v4

- Thêm `knockout` vào danh sách cho phép.
- Nhánh bất biến: plan có đúng một stage; số trận = n − 1 (+1); mỗi trận vòng 1 có đủ hai cặp; mọi ô vòng sau hoặc có cặp bye, hoặc có đúng một progression; `F` là trận duy nhất không có cạnh đi ra, không tính `BRONZE`.

## 7. Xếp hạng chung cuộc

Dùng `knockout.computeStandings` hiện có: vô địch, á quân, rồi theo vòng bị loại. Nếu có tranh hạng ba thì thắng/thua `BRONZE` quyết định hạng 3/4. Kiểm lại `finalStandingsFrom` trong `qualification.js`; nếu thiếu thì bổ sung.

## 8. UI

- **Bước 3:** thẻ `Loại trực tiếp` được bật. Có toggle `Tranh hạng ba` và BO chung kết.
- **Bước 4:** sơ đồ nhánh đầy đủ, cuộn ngang trong khung riêng ở mobile. Danh sách cặp vào thẳng. Bảng lịch nhóm theo vòng (`Vòng 1/16`, `Tứ kết`, `Bán kết`, `Chung kết`), dùng `describeRound`.
- Registry: `knockout.enabled = true`.

## 9. Test Lát C

Đặt ở `tests/stitch-setup/lat-c/`.

| Nhóm | Ca bắt buộc |
|---|---|
| Plan | 4/6/8/12/32 cặp: số trận, bye, `matchKey`, progression; không trận một bên; tranh hạng ba bật/tắt |
| Bye | Cặp vào thẳng xuất hiện ở vòng 2, placeholder đúng phía còn lại |
| BO | F BO3; SF/BRONZE/vòng sớm BO1 |
| Tiến cấp | Nhập tỉ số vòng 1 → cặp thắng được điền vào đúng ô; thua SF → vào BRONZE |
| Parity/RPC | Preview = finalize; bất biến từ chối plan sai; idempotent; rollback |
| Browser | Hành trình 4 bước, 390px/tablet/desktop, ảnh chụp để duyệt |
| Hồi quy | Test Lát 0 + A + B vẫn xanh |

## 10. Deploy 3 và kết thúc đợt

1. Apply migration RPC v4 (bản mở `knockout`), chạy toàn bộ test, người dùng duyệt ảnh, deploy.
2. Kiểm tra lại điều kiện hoàn tất ở §8 của plan.
3. Dọn CLB test:
   - Liệt kê dữ liệu theo `group_id` của CLB test và xác nhận không có dòng nào thuộc group khác.
   - Xóa theo thứ tự phụ thuộc, trong transaction, chỉ khi người dùng đã xác nhận.
   - Báo cáo số dòng đã xóa theo từng bảng.
