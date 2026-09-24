# Epic 1 — Loại kép: bằng chứng triển khai

Project Supabase `uhhlelemewilgsdijwja`. CLB test `group_id = 59` ("CLB Test 23.9.2026"). Spec: `docs/superpowers/specs/2026-09-24-epic-1-double-elim/`.

## Lát D1 — database (2026-09-24)

### Preflight

| Kiểm | Kết quả |
|---|---|
| Số migration kế tiếp trên `origin/main` | 107 là cuối → dùng **108** |
| `finalize_internal_setup_v4` trên production trước apply | md5 `prosrc` `d1049809…d253` = thân hàm file 107 |
| `save_unified_setup_aggregate_draft_v1` trước apply | md5 `31da06b4…2984` = thân hàm file 099 |
| CHECK `tournament_stages.schedule_format` trước apply | `round_robin, knockout` |
| Hàm tiến cấp 068 (`replace_tournament_games_with_transitions`) | định tuyến mọi cạnh `match_outcome` theo `source_outcome` winner/loser → không cần sửa |

### Phát hiện khi chạy tích hợp lần đầu (ROLLBACK)

Lần chạy đầu (nạp CHECK + hàm finalize mới trong transaction ROLLBACK) dừng ở bước lưu nháp: `save_unified_setup_aggregate_draft_v1` có danh sách `formatKey` riêng (`round_robin, knockout, group_knockout, mlp`) → `SETUP_PAYLOAD_INVALID`. Không có dữ liệu nào được ghi (ROLLBACK). Đã bổ sung vào 108: `CREATE OR REPLACE _v1` chép nguyên thân 099, chỉ thêm `'double_elimination'` (test khóa `epic-1/api-contract.test.js`). Lần chạy đó cũng xác nhận CHECK mới và thân hàm finalize mới biên dịch được trên production.

### Apply

| Migration | Kết quả | md5 `prosrc` sau apply = md5 thân hàm trong file |
|---|---|---|
| `108_finalize_v4_double_elim` (qua `apply_migration`) | OK | `finalize_internal_setup_v4` = `73d5ad13…dd9a`; `save_unified_setup_aggregate_draft_v1` = `5fb603e4…b21f` |

CHECK sau apply: `schedule_format = ANY (ARRAY['round_robin','knockout','double_elim'])`. Không `DROP TABLE/FUNCTION/COLUMN`, `TRUNCATE`, `DELETE`. Người dùng chưa chạm được nhánh mới: code production (Vercel) chưa có builder/registry loại kép cho tới khi PR Epic 1 được merge.

Vì sao apply trước khi chạy đủ kịch bản trong ROLLBACK: thân hàm cho phần thể thức cũ bị khóa bằng test so khớp văn bản (108 − nhánh DE = 107; `_v1` 108 − một dòng = 099), nhánh mới không ai gọi được khi code production chưa có builder loại kép, và bản ROLLBACK đầu đã xác nhận DDL + hàm biên dịch trên production. Hồi quy chạy ngay sau apply (dưới).

### Kiểm thử tích hợp (sau apply, mỗi lần một transaction ROLLBACK, dữ liệu tạm trong CLB 59)

Sinh bởi `node scripts/qa/epic-1-de-integration.js --applied --only=<kịch bản>`; file đầy đủ (nạp 108 trong transaction): `database/tests/epic_1_de_integration.sql`.

| Kịch bản | Kết quả |
|---|---|
| D7: 7 cặp (1 bye), có khách, GF BO3 — 7 plan sửa tay (bỏ trận, ô bye thêm cạnh, cạnh thua WF→LF đổi thành thắng, cạnh thắng LF→GF đổi thành thua, bật GF reset, hai stage, đổi tên LF) | cả 7 → `FINALIZE_PLAN_INVALID`; 0 stage được ghi |
| D7: chốt | 12 trận; stage `double_elim:GF=3:bo=1:reset=false`; 7 stage entrants (nhãn NULL); cạnh `loser=6, winner=11`; khóa `W1-2@r1:AB, W1-3@r1:AB, W1-4@r1:AB, W2-1@r2:A_, W2-2@r2:__, L1-2@r2:__, WF@r3, L2-1@r3, L2-2@r3, L3-1@r4, LF@r5, GF@r6`; khách `guest\|NULL` |
| D7: gửi lại cùng key | response giống hệt, vẫn 12 trận |
| D7: chơi hết giải qua `replace_tournament_games_with_transitions` (GF cho cặp nhánh thua thắng) | 12/12 `finalized`, **0** trận thiếu bên, số cạnh định tuyến khớp mọi trận; số trận thua `1×2, 2×5`; `GF` = thắng WF (a) + thắng LF (b); LF có người thua WF; `advance_division_entry_stage(next NULL)` → `final=true`, stage `completed` |
| D5: 5 cặp (3 bye, mất trọn vòng L1 engine) | 8 trận `W1-2@r1, W2-2@r1, W2-1@r2, L1-1@r2, WF@r3, L2-1@r3, LF@r4, GF@r5`; chơi hết 8/8, 0 thiếu bên; thua `1×2, 2×3`; kết thúc giải OK |
| D12: 12 cặp (4 bye) | 22 trận; chơi hết 22/22, 0 thiếu bên; thua `1×2, 2×10`; kết thúc giải OK |
| Hồi quy qua hàm mới | knockout 6 cặp: 6 trận, `knockout:entrants=6`; group_knockout 7 cặp: 13 trận, `round_robin:entrants=7, knockout:entrants=0`; round_robin 5 cặp: 10 trận |
| Sau rollback | 0 thành viên `IT DE VĐV %`, 0 giải `IT DE %`, 0 mutation `it-de-%`, 0 stage `double_elim` |

### Test JS

`npm run test:stitch-setup` — toàn bộ lat-0/a/b/c + epic-1 (plan, simulate, standings, registry, api-contract) xanh; `tests/tournament/*.test.js` xanh (gồm `double-elim-schedule`, `double-elim-standings`).

## Lát D2 — giao diện (2026-09-24)

| Kiểm | Kết quả |
|---|---|
| `npx next build` | OK (không lỗi biên dịch) |
| `tests/stitch-setup/epic-1/ui-contract.test.js` | 5/5 |
| Test Lát B/C khóa chuỗi mã nguồn (BracketTab, StepDraw, StandingsTab) | giữ nguyên chuỗi cũ, không sửa test cũ → không cần mục ADR-006 |
| Ảnh chụp (trang xem trước tạm dựng từ chính `buildSetupPlan` + mô phỏng nửa giải, đã xóa, không commit) | `evidence/epic-1/{390-7cap,390-5cap,1280-12cap}-{step3,step4,console}.png`; không tràn ngang ở 390px, không lỗi runtime |
| Lỗi phát hiện qua ảnh và đã sửa | Ô chung kết tổng đang chờ hiện `BYE` (logic sơ đồ cũ coi ô trống là bye) → loại kép truyền `noByes`, hiện `chờ` |

### Chưa làm — cần người dùng (D24)

Chạy thật trên browser trong CLB 59 (người dùng tự đăng nhập): hành trình 4 bước với 7 cặp (1 bye) và 5 cặp; 390px / tablet / desktop; chốt; nhập hết tỉ số tới chung kết tổng; BXH đúng D22; `Kết thúc giải & chốt xếp hạng`; trang công khai. Giữ lại giải test. Sau đó merge PR để Vercel deploy.

## Nghiệm thu của người dùng (2026-09-24)

Người dùng chạy thật trên browser: quy trình tạo giải loại kép và nhập tỉ số ra kết quả đúng. **Kết luận: nhánh PASS.** Một số lỗi nhỏ để lại cho Epic 2 (người dùng sẽ nêu khi bắt đầu Epic 2). Từ ảnh chụp người dùng gửi, đã ghi vào roadmap mục Epic 2 "Nợ ghi nhận": ô chọn BO theo "Lượt" vẫn hiện ở tab Kết quả; thông báo "Dữ liệu trận đã thay đổi, hãy tải lại." khi lưu tỉ số (nghi phiên bản trận cũ sau khi 068 điền cặp tiến cấp).

Còn lại: người dùng merge PR để Vercel deploy production.
