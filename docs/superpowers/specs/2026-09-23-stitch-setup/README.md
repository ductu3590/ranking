# Spec — Tạo giải nội bộ theo Stitch (chia theo lát)

Ngày: 2026-09-23 · Plan nguồn: `docs/superpowers/plans/2026-09-23-tournament-setup-stitch-recovery.md` (đã chốt)

## Các file spec

| Lát | File | Mở khóa | Deploy |
|---|---|---|---|
| 0 | [lat-0-nen-tang.md](lat-0-nen-tang.md) | Không thể thức nào | Không deploy riêng; đi cùng Lát A |
| A | [lat-a-vong-bang-loai-truc-tiep.md](lat-a-vong-bang-loai-truc-tiep.md) | Vòng bảng → loại trực tiếp | Deploy 1 (Lát 0 + A) |
| B | [lat-b-vong-tron.md](lat-b-vong-tron.md) | Vòng tròn tính điểm | Deploy 2 |
| C | [lat-c-loai-truc-tiep.md](lat-c-loai-truc-tiep.md) | Loại trực tiếp | Deploy 3 |

Lát 0 không deploy riêng: nếu chỉ có Lát 0 thì cả ba thẻ thể thức đều khóa và luồng mới không tạo được giải nào. Lát 0 phải xanh test trước khi bắt đầu code Lát A.

## Kiến trúc chung (áp dụng mọi lát)

```text
UI 4 bước ──save từng bước──▶ POST /api/tournament-v2/setup (save_aggregate)
   │                              └─ validate bước (JS, server) ─▶ RPC save_unified_setup_aggregate_draft (097, CAS + idempotency)
   │
   ├─ Bốc thăm / xem trước ─▶ POST /api/tournament-v2/preview-schedule
   │                              └─ buildSetupPlan(formatKey)  ← NGUỒN CẤU TRÚC DUY NHẤT (JS thuần, lib/tournament/setupPlans/)
   │                              └─ lưu plan + fingerprint vào draft.draw qua save_aggregate
   │
   └─ Chốt ─▶ POST /api/tournament-v2/setup/finalize
                  └─ route TÍNH LẠI buildSetupPlan từ draft trên server, so fingerprint
                  └─ RPC finalize_internal_setup_v4(..., p_plan) — materialize plan chung, không tự suy ra cấu trúc
```

Nguyên tắc:

1. **Một nguồn cấu trúc.** Chỉ `buildSetupPlan` (JS) quyết định bảng, trận, `matchKey`, tuyến đi tiếp và placeholder. SQL chỉ kiểm tra bất biến rồi ghi. Preview và finalize khớp nhau vì cùng gọi một hàm.
2. **Không tin client.** Finalize tính lại plan trên server từ draft đã lưu. Plan client gửi lên, nếu có, bị bỏ qua.
3. **Additive.** Không sửa migration đã chạy (`091`–`098`), không sửa RPC v2/v3, không sửa ba file đóng băng (`setupContract.js`, `engines/roundRobin.js`, `draw.js`).
4. **Registry thể thức.** `lib/tournament/setupFormats.js` là nơi duy nhất bật/tắt thể thức. UI, route save/preview/finalize và RPC v4 đều kiểm tra theo registry này (RPC có danh sách riêng tương ứng).

## Quyết định sản phẩm (nguồn cho ADR ở Lát 0)

| # | Quyết định | Lát |
|---|---|---|
| D1 | Ghép cặp bằng chạm/chọn đúng hai người; không kéo-thả | 0 |
| D2 | Không hiển thị seed/hash/DUPR; rating chỉ tư vấn (`Trình độ`) | 0 |
| D3 | Không có dự bị; số lẻ phải xử lý trước Bước 4 | 0 |
| D4 | Khách mời là VĐV riêng của giải (`tournament_athletes.source='guest'`, `athlete_id` rỗng) | 0 (draft), A (chốt) |
| D5 | Phát hành từng thể thức; thể thức chưa mở hiện `Sắp có` và bị server từ chối | 0 |
| D6 | Vòng bảng: 2–4 bảng × lấy 1–2; tổng vào vòng loại là 4 hoặc 8; thiếu thì bù bằng cặp xếp kế tiếp tốt nhất | A |
| D7 | So chéo bảng: tỉ lệ thắng → hiệu số TB/trận → điểm ghi TB/trận → bốc thăm | A |
| D8 | Chỉ trận chung kết chọn BO1/BO3/BO5; mọi trận khác BO1 | A, C |
| D9 | Ngoài quy mô khuyến nghị chỉ cảnh báo | 0 |
| D10 | Không autosave; lưu từng bước bằng nút | 0 |
| D11 | Không canary; kiểm thử trên CLB test mới rồi deploy | 0 |
| D12 | Bye ở loại trực tiếp là cặp vào thẳng vòng sau, không phải thay đồng đội | C |

## Mặc định do kiến trúc sư đặt (đã thông báo, chưa có phản đối)

- Tối thiểu cứng mỗi bảng = số suất lấy + 1 (mỗi bảng phải loại ít nhất một cặp). Vì vậy 2 bảng × lấy 2 cần tối thiểu 6 cặp, khác mốc 4 cặp của v2 (xem Lát A §2).
- Vòng tròn tối thiểu 3 cặp; loại trực tiếp tối thiểu 4 cặp.
- Ước lượng thời lượng: BO1 15 phút, BO3 35 phút, BO5 55 phút (theo Stitch).
- Finalize không xếp sân/giờ chính thức; giờ ở Bước 4 chỉ là ước tính. Xếp sân thật thuộc màn điều hành.
- Font Plus Jakarta Sans tải qua `next/font` (self-host lúc build, subset `vietnamese`) và chỉ áp cho shell setup.
