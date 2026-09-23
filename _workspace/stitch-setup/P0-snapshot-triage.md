# P0.6 — Triage snapshot `ranking-unified-setup-ux`

Kết luận chung: phần lớn thay đổi đã sửa ở snapshot **lùi về trước `29e33c6`** (đưa lại `reserveMemberIds`, `selectedMemberIds`, bỏ bốc thủ công, finalize v3 → v2, bỏ `round_scoring`) để khớp các hàm đang chạy trên production. Các chỗ lùi đó trái với quyết định D3 (không dự bị) và với draft v3, nên không mang sang. Chỗ lệch với production được xử lý bằng migration 099/100 (xem `P0-preflight.md`).

| File | Xử lý | Lý do |
|---|---|---|
| `database/migrations/097_*.sql`, `098_*.sql` | Mang sang | Đã chạy trên production, khớp SHA/logic |
| `database/tests/098_*.sql` | Mang sang | Bộ test SQL của 098 |
| `database/migrations/091_*.sql`, `094_*.sql` (đã sửa) | Bỏ | Không sửa migration đã chạy; bản đúng của `_v1` tái lập bằng 099 |
| `app/api/tournament-v2/setup/route.js` (cho phép lưu lần đầu khi chưa có id) | Làm lại | Ý tưởng đúng với `_v1` production (bootstrap), cài lại trong route save v3 |
| `app/api/tournament-v2/setup/finalize/route.js` (v3 → v2) | Bỏ | Lát A dùng RPC v4 |
| `app/api/tournament-v2/preview-schedule/route.js` | Bỏ | Đưa lại reserve; Lát A viết route tổng quát |
| `lib/tournament/aggregateDraftSnapshot.js` (mới) | Làm lại | Ý tưởng một snapshot dùng chung cho lưu + fingerprint → `setupDraftV3.js` |
| `lib/tournamentV2Client.js` | Làm lại | Đổi shape v3 |
| `lib/tournament/pairingDraft.js` | Bỏ | Đưa lại `reserveMember`; viết lại theo máy trạng thái chạm-hai-người |
| `lib/tournament/internalDoublesGroupKnockoutPlan.js` | Bỏ | Bỏ bốc thủ công/`round_scoring`; file giữ nguyên cho v2, Lát A viết `setupPlans/groupKnockout.js` |
| `app/giai-dau/v2/TournamentWizard.js`, `setup/*.js`, `setup/steps/*.js`, `setup/pairing/*`, `setup/participants/*`, `setup/draw/*` | Bỏ | Đưa lại reserve/`selectedMemberIds`; UI dựng lại theo Stitch |
| `app/giai-dau/v2/setup/pro-court.css` (mới) | Tham khảo | Token Stitch; dựng lại `--pc-*` từ `DESIGN.md` |
| `scripts/qa/perf-after-unified-setup.js` | Bỏ | Đổi nhỏ theo shape cũ |
| `tests/unified-setup-v2/**` (đã sửa) | Bỏ | Khẳng định hành vi cũ (reserve, v2) |
| `tests/unified-setup-v2/api/preview-draw-stability.test.js`, `preview-fingerprint-roundtrip.test.js` (mới) | Tham khảo | Ý tưởng test dùng lại ở Lát A |
| `tests/unified-setup-v2/ui/stitch-typography-contract.test.js`, `browser/stitch-readonly.browser.test.js` (mới) | Tham khảo | Ý tưởng test Lát 0 UI |
| `_workspace/stitch-internal-setup/` | Mang sang | Nguồn Stitch (P0.4); log/ảnh QA cũ không mang |
| `_workspace/migration098-verification.json`, `run-migration098.cjs`, `finalize-management.cjs`, evidence browser | Không mang | Bằng chứng một lần; số liệu đã ghi vào `P0-preflight.md` |
| `app/favicon.ico`, `tests/home-modal-favicon.browser.test.js` | Không mang | Ngoài phạm vi |
