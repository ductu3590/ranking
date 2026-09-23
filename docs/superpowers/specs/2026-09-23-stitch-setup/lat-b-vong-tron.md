# Lát B — Vòng tròn tính điểm

Trạng thái: spec chờ duyệt · Deploy 2 · Phụ thuộc: Lát A đã deploy · Xem [README](README.md)

## 1. Mục tiêu

Mở khóa `round_robin`: một bảng, mọi cặp gặp nhau một lần, xếp hạng chung cuộc theo bảng điểm. Không có vòng loại, không có chung kết.

Lát này tái dùng toàn bộ hạ tầng Lát A: `buildSetupPlan`, RPC v4, ước tính lịch, UI Bước 4. Không tạo RPC mới.

## 2. Cấu hình

```js
format: { entrantType: 'doubles', formatKey: 'round_robin', config: {} }
```

- Tối thiểu cứng 3 cặp (`PAIR_COUNT_BELOW_MINIMUM`). Khuyến nghị 3–6 cặp. Từ 7 cặp trở lên hiện cảnh báo kèm số trận, vd `10 cặp → 45 trận, ~4h với 3 sân`. Không đặt trần cứng ngoài giới hạn 128 người của roster.
- Không có BO: mọi trận BO1. Bước 3 ẩn bảng BO và hiện dòng `Mỗi trận 1 ván (BO1)`. Lý do: không có trận chung kết nên quyết định D8 không áp dụng.
- Không có tranh hạng ba.

## 3. Plan (`setupPlans/roundRobin.js`)

- Một stage: `planKey 'round-robin'`, `scheduleFormat 'round_robin'`, `config { groupCount: 1, shuffle: false, setupPlanVersion: 4 }`.
- **Thứ tự:** xáo các `pairId` (đã sort) bằng PRNG theo seed của Lát A (seed dạng chuỗi), rồi gọi `engines/roundRobin.generateSchedule` với `shuffle: false`. Không sửa `roundRobin.js` (file đóng băng), vì PRNG nội bộ của nó chỉ nhận seed dạng số.
- `groups: [{ label: 'A', entryIds }]`. Trận có `matchKey = GROUP-A-<order+1>` và `round` lấy từ circle method.
- `progressions: []`.
- `counts.total = n(n−1)/2`.

| Ca kiểm | Trận | Lượt |
|---|---|---|
| 3 cặp | 3 | 3 |
| 4 cặp | 6 | 3 |
| 6 cặp | 15 | 5 |
| 7 cặp | 21 | 7 |

## 4. Bốc thăm

Bốc thăm chỉ quyết định thứ tự lượt và cặp nào gặp nhau ở lượt nào. Đặc điểm này hiện rõ ở Bước 4 bằng dòng `Bốc thăm xác định thứ tự các lượt đấu`. `Bốc lại` có xác nhận như Lát A.

## 5. RPC v4

- Thêm `round_robin` vào danh sách thể thức cho phép (migration thay thân hàm bằng `CREATE OR REPLACE`, giữ nguyên signature và grants).
- Nhánh bất biến: plan có đúng một stage, không có progression, số trận = n(n−1)/2, mỗi cặp đá đúng n−1 trận.
- Không ghi `match_scoring`.

## 6. Xếp hạng chung cuộc

Dùng `computeStandings` và tiebreak hiện có của `round_robin`, không đổi gì. Bước 4 hiện thẻ tiêu chí xếp hạng chỉ đọc theo policy đang áp dụng. Khi xong mọi trận, trang kết quả hiện hạng chung cuộc; không có bước tiến cấp.

## 7. UI

- **Bước 3:** thẻ `Vòng tròn tính điểm` được bật. Rail ước tính hiện tổng trận, số lượt, thời lượng.
- **Bước 4:** ẩn sơ đồ nhánh. Thẻ bảng hiện toàn bộ cặp. Bảng lịch nhóm theo `Lượt N`. Nội dung chốt: `Chốt lịch vòng tròn (N trận)`.
- Registry: `round_robin.enabled = true`.

## 8. Test Lát B

Đặt ở `tests/stitch-setup/lat-b/`.

| Nhóm | Ca bắt buộc |
|---|---|
| Plan | 3/4/6/7 cặp đúng số trận và lượt; mỗi cặp n−1 trận; không cặp nào gặp nhau hai lần; cùng seed → cùng fingerprint |
| Giới hạn | 2 cặp → `PAIR_COUNT_BELOW_MINIMUM`; 7 cặp → chỉ cảnh báo |
| Parity/RPC | Preview = finalize; nhánh bất biến từ chối plan sai số trận; idempotent; rollback |
| Đóng băng | `roundRobin.js` không đổi (so hash file) |
| Guest | Cặp có khách chốt được như Lát A |
| Browser | Hành trình 4 bước, 390px/tablet/desktop, ảnh chụp để duyệt |
| Hồi quy | Toàn bộ test Lát 0 + A vẫn xanh |

## 9. Deploy 2

Apply migration RPC v4 (bản mở `round_robin`), chạy test Lát 0 + A + B, người dùng duyệt ảnh, rồi deploy.
