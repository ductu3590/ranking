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
