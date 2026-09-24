# Spec — Epic 1: Loại kép (double elimination)

Ngày: 2026-09-24 · Roadmap: `docs/superpowers/plans/2026-09-24-tournament-roadmap.md` (Epic 1)
Quyết định: `_workspace/unified-setup-ux/ADR-007-roadmap-decisions.md` — D14, D15 và D21–D24 (chốt ở vòng brainstorm của epic này).
Bất biến: skill `tournament-setup-invariants`. Nền tảng: spec Stitch `docs/superpowers/specs/2026-09-23-stitch-setup/` (Lát 0/A/B/C).

## Các file spec

| Lát | File | Nội dung | Deploy |
|---|---|---|---|
| D1 | [lat-d1-cau-truc-va-chot.md](lat-d1-cau-truc-va-chot.md) | Registry, builder `setupPlans/doubleElim.js` (đảo thứ tự + thu gọn bye), xếp hạng, migration 108 (CHECK + lưu nháp + finalize v4), kiểm thử tích hợp SQL | Migration apply ngay; code không deploy riêng (đi cùng D2 trong một PR) |
| D2 | [lat-d2-giao-dien-va-dieu-hanh.md](lat-d2-giao-dien-va-dieu-hanh.md) | Bước 3/4, sơ đồ W/L/GF ở bàn điều hành + trang công khai, BXH, kết thúc giải; bật thẻ | Deploy Epic 1 |

Registry bật `double_elimination` ngay ở D1 vì test Lát A khóa bất biến "RPC và registry mở cùng thể thức" (migration 108 đã mở phía SQL). Người dùng chưa chạm được thể thức cho tới khi PR (D1 + D2) được merge và Vercel deploy: code production hiện tại không có builder/registry loại kép.

## Quyết định

| # | Quyết định | Nguồn |
|---|---|---|
| D14 | Không đá lại chung kết tổng (không bracket reset). Chung kết tổng (`GF`) chọn BO1/3/5; mọi trận khác BO1 | ADR-007 |
| D15 | Nhận 4–32 cặp, có bye. Không sinh trận một bên: nhánh thua được thu gọn khi nguồn là bye | ADR-007 |
| D21 | Tên hiển thị: `Nhánh thắng · Vòng r`, `Bán kết nhánh thắng`, `Chung kết nhánh thắng`; `Nhánh thua · Vòng r`, `Chung kết nhánh thua`; `Chung kết tổng`. Mã nội bộ `W<r>-<ô>`, `WF`, `L<r>-<ô>`, `LF`, `GF` | Brainstorm Epic 1 |
| D22 | Không có trận tranh hạng ba. Vô địch/Á quân theo `GF`; Hạng 3 = thua `LF`; Hạng 4 = thua trận nhánh thua ngay trước `LF`; các cặp còn lại **đồng hạng** theo vòng bị loại ở nhánh thua (`Hạng 5–6`, `Hạng 7–8`, `Hạng 9–12`…) | Brainstorm Epic 1 |
| D23 | Chống gặp lại sớm: cặp thua nhánh thắng từ vòng 2 trở đi được thả sang nửa đối diện của nhánh thua theo bảng hoán vị cố định (Lát D1 §4.2) | Brainstorm Epic 1 |
| D24 | Quy trình deploy của epic: agent apply migration (ROLLBACK trước, so `md5(prosrc)` sau), chạy test + kiểm thử tích hợp SQL, push nhánh epic và mở PR nháp; **người dùng** chạy thật trên browser (CLB 59) rồi merge để Vercel deploy | Brainstorm Epic 1 (thay bước `push HEAD:main` của roadmap §1.1 cho epic này) |

## Kiến trúc (không đổi so với đợt Stitch)

```text
Bước 3 chọn "Loại kép" ─▶ save_aggregate (registry kiểm enabled + validateConfig + minPairs/maxPairs)
Bước 4 bốc thăm ─▶ preview-schedule ─▶ buildSetupPlan('double_elimination') ─▶ setupPlans/doubleElim.js
                                                                                 └─ engines/doubleElim.js (grandFinalReset:false)
                                                                                 └─ chuẩn hóa: đảo thứ tự → thu gọn bye → khóa/tên/lượt
Chốt ─▶ finalize route tính lại plan ─▶ finalize_internal_setup_v4 (migration 108: nhánh bất biến DE)
Thi đấu ─▶ replace_tournament_games_with_transitions (068) điền cặp thắng/thua theo cạnh match_outcome
Kết thúc ─▶ advance_division_entry_stage (next NULL) ─▶ BXH: engines/doubleElim.computeStandings (nhánh có match_key)
```

- **Một nguồn cấu trúc:** chỉ `setupPlans/doubleElim.js` quyết định trận, `matchKey`, tuyến, bye, tên. SQL chỉ kiểm bất biến rồi ghi. Không viết bộ chuyển đổi thứ ba.
- **Không có RPC tiến cấp mới:** tuyến `loser` từ nhánh thắng xuống nhánh thua là cạnh `match_outcome` bình thường mà 068 đã xử lý.
- **Không sửa ba file đóng băng** (`setupContract.js`, `engines/roundRobin.js`, `draw.js`) và không sửa `wizardModel.js`.
- **`engines/doubleElim.js`:** phần sinh cấu trúc giữ nguyên (test cũ `tests/tournament/double-elim-*.test.js` phải xanh). Chỉ thêm nhánh xếp hạng cho trận có `match_key` (Lát D1 §7); nhánh cũ giữ nguyên hành vi.

## Ca nghiệm thu xuyên suốt

| Cặp | Nhánh | Bye | Trận (= 2n − 2) | Trận L bị thu gọn |
|---|---|---|---|---|
| 4 | 4 | 0 | 6 | 0 |
| 5 | 8 | 3 | 8 | 3 |
| 6 | 8 | 2 | 10 | 2 |
| 7 | 8 | 1 | 12 | 1 |
| 8 | 8 | 0 | 14 | 0 |
| 12 | 16 | 4 | 22 | 4 |
| 16 | 16 | 0 | 30 | 0 |
| 17 | 32 | 15 | 32 | 15 |
| 32 | 32 | 0 | 62 | 0 |

Công thức: nhánh thắng là một nhánh loại trực tiếp của n cặp → `n − 1` trận; nhánh thua nhận `n − 1` cặp thua và loại `n − 2` cặp → `n − 2` trận; cộng `GF` → **`2n − 2`**. Engine sinh nhánh thua đủ `B − 2` trận (B = lũy thừa 2 kế tiếp), nên số trận nhánh thua bị thu gọn luôn bằng **số bye `B − n`**.

**Ca 14 VĐV của đợt setup** (7 cặp): nhánh 8, 1 bye → nhánh thắng 6 trận, nhánh thua 5 trận, GF 1 → **12 trận**, không trận nào chỉ có một bên.
