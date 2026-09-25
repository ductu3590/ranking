# ADR-006 — Gỡ/viết lại contract test của wizard v2 khi chuyển sang luồng Stitch

**Ngày:** 2026-09-23
**Trạng thái:** đã áp dụng (Lát 0)
**Liên quan:** ADR-004 (tiền lệ), ADR-005, spec `docs/superpowers/specs/2026-09-23-stitch-setup/lat-0-nen-tang.md`

## Bối cảnh

Lát 0 thay wizard v2 bằng `app/giai-dau/v2/setup-v3/`, viết lại `lib/tournament/pairingDraft.js` thành máy trạng thái chạm-hai-người, và cho route lưu nhận lần lưu đầu chưa có id (khớp hàm `_v1` thật trên production, xem `_workspace/stitch-setup/P0-preflight.md`). Chạy toàn bộ 186 test node ở HEAD so với base `29e33c6`:

- 6 file đỏ **từ trước ở base** (không liên quan Lát 0): `bxh-share-image.contract`, `club-notifications`, `phase2/validated-mutation-guard`, `phase3/wizard-redesign-contract`, `pickhub-ui-phase2`, `unified-setup/legacy-wizard-retired.contract`.
- 7 file đỏ **mới**, đều vì khẳng định hành vi đã bị thay có chủ đích.

## Quyết định

| File | Xử lý | Bất biến còn giá trị → nơi mới |
|---|---|---|
| `tests/unified-setup-v2/pairing-acceptance.test.js` | Gỡ | Bỏ người giữa giữ cặp khác, ghép lại bỏ qua cặp khóa, lẻ → `UNPAIRED_MEMBER`, không cặp một người → `tests/stitch-setup/lat-0/pairing.test.js` |
| `tests/unified-setup-v2/t3.2-edge-journeys.test.js` | Viết lại 3 ca | Ba ca ghép cặp chuyển sang API mới ngay trong file; 11 ca còn lại giữ nguyên |
| `tests/unified-setup-v2/api/aggregate-draft-contract.test.js` | Sửa 1 assertion | "Bắt buộc cả hai id" → "cả hai hoặc không id nào" (bootstrap theo `client_draft_key`) |
| `tests/unified-setup-v2/ui/draw-actions.test.js` | Gỡ | Kiểm `rollDraw` cục bộ + wiring `DrawScheduleStep` của wizard cũ. Lát 0 bỏ bốc thăm cục bộ làm nguồn; bốc thăm server có test ở Lát A |
| `tests/unified-setup-v2/ui/lifecycle-repair-contract.test.js` | Gỡ | Cầu nối `ReviewFinalizeStep` ↔ `SetupContext` cũ không còn tồn tại |
| `tests/tournament/ui-unified-wizard.contract.test.js` | Gỡ | Hai kiểm tra console (không `DivisionSetupPanel`, `TeamsTab` chỉ đọc với nội dung đôi) và "không tự LIVE" → `tests/stitch-setup/lat-0/ui-contract.test.js` |
| `tests/tournament/ui-wizard.contract.test.js` | Gỡ (và khỏi `test:t-ui`) | Chỉ khớp chuỗi token cũ (`createTournament saveDivision …`) mà wizard v2 phải chèn comment giả để giữ xanh |

## Hệ quả

- `npm run test:stitch-setup` là cổng test của luồng mới.
- 6 file đỏ từ trước vẫn đỏ; không thuộc phạm vi Lát 0, cần task riêng.

## Bổ sung — Lát A (2026-09-23)

| File | Xử lý | Bất biến còn giá trị → nơi mới |
|---|---|---|
| `tests/unified-setup-v2/api/finalize-contract.test.js` | Gỡ | Route chốt giải chuyển sang `finalize_internal_setup_v4`. Admin guard, scope group, không dùng `tournament_draw_slots` → `tests/stitch-setup/lat-a/api-contract.test.js` |
| `tests/unified-setup-v2/api/preview-schedule-contract.test.js` | Gỡ | Preview v3 tự lưu plan qua RPC có CAS (spec Lát A §12 đã sửa), không còn `draftFingerprint`/`draftUpdate`/bốc thủ công. Thay bằng `lat-a/api-contract.test.js` + `lat-a/plan.test.js`. `buildInternalDoublesGroupKnockoutPlan` (luồng v2) vẫn có test domain riêng |
| `tests/unified-setup-v2/api/finalize-v3-contract.test.js` | Sửa 1 assertion | Kiểm tra migration 095 giữ nguyên; "route gọi v3" đổi thành "luồng mới không gọi v3" |

## Bổ sung — Lát C (2026-09-23)

Cả ba thể thức đã bật, không còn thể thức thật nào để làm ca "chưa bật".

| File | Xử lý | Bất biến còn giá trị → nơi mới |
|---|---|---|
| `tests/stitch-setup/lat-0/step-rules.test.js` | Sửa 2 ca | Nhánh `FORMAT_NOT_AVAILABLE` và "`completedThrough` dừng ở bước 2" giả lập registry khóa `knockout` qua `ctx.isFormatEnabled` (cơ chế có sẵn); thêm assertion registry thật cho `knockout` đi tới bước 3 |
| `tests/stitch-setup/lat-a/plan.test.js` | Sửa 1 assertion | `buildSetupPlan` với key không có builder (`mlp_team`) vẫn ném `FORMAT_NOT_AVAILABLE` |

## Bổ sung — Epic 2 Lát E1 (2026-09-24)

Console sau khi chốt giải còn 4 mục (ADR-007 D29): bước Cấu hình / VĐV & cặp / Bốc thăm gộp vào mục "Cài đặt",
"Trung tâm điều hành" thay bằng mục "Điều hành" (`control/ControlCenter.js`). `ControlStep.js` bị gỡ vì nút
"Ghi điểm / Chốt" chốt trận không kèm tỉ số/người thắng (trận loại trực tiếp không tiến cấp — spec E1 §6.4).

| File | Xử lý | Bất biến còn giá trị → nơi mới |
|---|---|---|
| `tests/tournament/ui-shell.contract.test.js` | Sửa 1 nhóm assertion | Nhãn 8 bước → 4 mục; drawer → thanh tab đáy; giữ kiểm token/theme/reduced-motion và LogStep chỉ đọc. Bảng ánh xạ link cũ khóa đầy đủ ở `tests/stitch-setup/epic-2/ui-contract.test.js` |
| `tests/tournament/ui-console.contract.test.js` | Sửa 1 assertion, bỏ 1 | "mount ba màn mới" → mount `ControlCenter` + `CourtsStep` + `LogStep` và không còn `ControlStep`; bỏ kiểm `readiness` (readiness chuẩn bị thuộc workspace setup) |
| `tests/tournament/ui-control-step.contract.test.js` | Đổi đích file | Cùng cam kết (nút gọi sân/bắt đầu/tạm dừng, thẻ đọc mic, không tính năng ngoài phạm vi, không hardcode màu) áp cho `control/ControlCenter.js`; thêm "không còn Ghi điểm / Chốt" |
| `tests/tournament/ui-draw-step.contract.test.js` | Sửa 1 assertion | `DrawStep` nằm trong mục Cài đặt, chỉ admin (link cũ `?step=draw` → `settings`) |
| `tests/open-registration/ui.contract.test.js` | Sửa 2 assertion | `OpenRegTab` là thẻ "Đăng ký mở" trong Cài đặt; `?tab=openreg` → `settings` |
| `tests/unified-setup/console-empty-roster.repro.test.js` | Đổi khối được soi | Khối `step === 'athletes'` → `step === 'settings'`; các kiểm "TeamsTab chỉ đọc với đôi", "không DivisionSetupPanel chỉ theo activeStage" giữ nguyên |

Đỏ từ trước, không thuộc Epic 2 (đã kiểm trên code gốc): `tests/phase2/validated-mutation-guard.test.js`
(route `stages`), `tests/phase3/wizard-redesign-contract.test.js` (nhãn wizard). Trên Windows,
`tests/stitch-setup/epic-1/ui-contract.test.js` đỏ cục bộ vì `StepDraw.js` được checkout CRLF (`core.autocrlf=true`)
trong khi test so chuỗi có `\n`; không đổi file.

## Bổ sung sau E1 — tạo giải (2026-09-24, yêu cầu người dùng)

Số sân chuyển từ Bước 1 sang Bước 3 (sau khi ghép cặp mới gợi ý được số sân); chốt giải mở mục "Điều hành".

| File | Xử lý | Lý do |
|---|---|---|
| `tests/stitch-setup/lat-0/step-rules.test.js` | Bỏ `COURT_COUNT_INVALID` khỏi 2 ca bước 1; thêm ca bước 3 | Luật số sân nay thuộc bước 3 (`setupStepRules.step3`) |
| `tests/stitch-setup/epic-1/registry.test.js`, `lat-b/plan.test.js`, `lat-c/plan.test.js` | Fixture bước 3 thêm `tournament.courtCount` | Bản nháp mẫu thiếu số sân nên bước 3 chặn thêm `COURT_COUNT_INVALID` |
| `tests/stitch-setup/lat-a/api-contract.test.js` | Redirect sau chốt `?step=schedule` → `?step=control` | Chốt xong vào thẳng mục Điều hành |

`tests/unified-setup/release-hardening.contract.test.js` từng đỏ sau E1 (route `games` bỏ khai báo
`CONFLICT_CODES`): khai báo lại và dùng làm mã 409 dự phòng — không sửa test.
`tests/unified-setup/legacy-wizard-retired.contract.test.js` (3 ca soi wizard v2 đã gỡ) đỏ từ trước, không đụng.

## Bổ sung — Epic 2 lát E1.1, sửa sau nghiệm thu (2026-09-24)

| File | Xử lý | Lý do |
|---|---|---|
| `tests/phase3/scoring-rules.test.js` | Ca `WIN_BY_NOT_MET` (11–10) và `SCORE_CAP_EXCEEDED` (16–14) đổi thành hợp lệ; thêm ca 17–15, 7–21, hoà, âm, lẻ | D34: bên nhiều điểm hơn thắng, không kiểm mốc tới / cách / trần |
| `tests/stitch-setup/epic-2/board.test.js` | "Trận vừa chốt" `7–11` → `11–7` | Điểm cặp thắng đứng trước (đọc "X thắng 7–11" bị ngược nghĩa) |

## Bổ sung — Epic 2 lát E2 (2026-09-25)

| File | Xử lý | Lý do |
|---|---|---|
| `tests/stitch-setup/epic-2/ui-contract.test.js` | `readOnly` → `!isAdmin \|\| (finalized && !correcting)`; nút lưu/chốt khóa theo `!readOnly && !finalized` | Trận đã chốt có chế độ "Sửa kết quả" (corrections), vẫn không có nút lưu/chốt |
| `tests/tournament/ui-draw-step.contract.test.js` | `DrawStep` chỉ còn trong Cài đặt của giải cũ (`step === 'settings' && !v4Schedule`) | Giải setup v4 dùng `SettingsView`; huỷ chốt lịch cho giải v4 chưa hỗ trợ (xem spec E2 §Lệch spec) |
