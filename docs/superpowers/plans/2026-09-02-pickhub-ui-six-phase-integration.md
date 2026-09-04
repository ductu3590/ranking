# PickHub UI Rollout Across Six Phases Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đưa design baseline PickHub đã được duyệt vào production theo sáu
phase core, để mỗi lát cắt UI được kiểm chứng cùng domain, API, quyền, dữ liệu
và quy trình merge; không tạo một cuộc redesign big-bang hoặc một nhánh UI tách
rời khỏi roadmap.

**Architecture:** Giữ domain/service thuần trong `lib/`, route/API là adapter
trong `app/`, component dùng view model ổn định và token dùng chung trong
`components/pickhub/` cùng `app/globals.css`. UI không tự quyết định quyền,
eligibility, draw, standings, rating hay finalize. Mỗi phase branch chứa cả
code, test, migration, tài liệu và evidence của lát cắt đó.

**Tech Stack:** Next.js 14 App Router, React 18, CSS custom properties,
Supabase/RLS hiện hữu, Node test scripts, Playwright + Chrome cho browser và
visual smoke.

**Spec:** `docs/pickhub-core/UI-STRATEGY.md`,
`docs/pickhub-core/UI-BRAND-SYSTEM.md`,
`docs/pickhub-core/UI-PREVIEW-SPEC.md`,
`docs/pickhub-core/00-core-architecture.md`,
`docs/pickhub-core/DELIVERY-GOVERNANCE.md` và sáu phase spec trong cùng thư mục.

## Baseline đã hoàn thành

- [x] Reference preview đã được duyệt ngày `2026-09-02` trên nhánh
  `codex/pickhub-ui-brand-preview`, commit `e147885`.
- [x] Nền sáng, palette tím/lavender, vàng pastel, coral, cyan và quy tắc
  không dùng surface nền đen/navy đặc đã được khóa trong
  `docs/pickhub-core/UI-BRAND-SYSTEM.md`.
- [x] Thành viên có năm tab `Quỹ | Thành viên | BXH | Giải | Thông tin`, trong
  đó `BXH` ở giữa; trưởng nhóm dùng `Cấu hình`.
- [x] Preview có ba context member/leader/public, responsive desktop/mobile,
  local-only data và evidence tại
  `docs/pickhub-core/evidence/ui-preview-review.md`.

## Global Constraints

- Chỉ tạo branch Phase N từ `main` sau khi Phase N-1 đã merge và smoke test xanh.
- Không mark `completed` trước khi có test evidence, product-owner approval,
  completion record trong `PROGRESS.md` và `progress.json`, merge commit và
  smoke test trên `main`.
- Design baseline là bắt buộc; không thay `--ph-ink` thành background và không
  dùng màu theme để thay thế trạng thái success/warning/error.
- Thành viên và trưởng nhóm vẫn truy cập bằng Mã CLB + mật khẩu theo mô hình hiện
  tại; không có email/OTP/account cá nhân trong acceptance criteria của Phase 2.
  Account claim chỉ là adapter tùy chọn của một phase tương lai.
- VĐV có thể thuộc nhiều CLB; CLB mặc định chỉ quyết định không gian mở đầu,
  không cấp thêm quyền. Trưởng nhóm chỉ thấy action theo role/scope server trả.
- Public tournament chỉ hiển thị allowlist và có link riêng; không lộ quỹ,
  contact riêng, internal note hoặc actor ID.
- Mọi mutation score, roster, draw, rating assessment và finance dùng
  idempotency/version khi core contract yêu cầu; UI phải hiển thị trạng thái
  `pending`, `synced`, `conflict`, `failed`.
- Mobile touch target tối thiểu `44px`, keyboard focus rõ, loading/empty/error/
  forbidden/offline/conflict đều có màn hình hoặc inline state.

## Quy trình chung cho từng phase

1. Đọc phase spec và tạo branch đúng tên từ `main` mới nhất.
2. Bổ sung contract/view model, viết test thất bại cho behavior UI và cập nhật
   ADR nếu cần thay đổi ranh giới module.
3. Implement domain/API trước, sau đó nối component; không đặt business rule
   trong React component hoặc route handler.
4. Chạy unit, integration/RLS, API contract, E2E, concurrency/idempotency và
   visual regression phù hợp. Kiểm tra `git diff --check` và `npm run build`.
5. Tạo `docs/pickhub-core/evidence/phase-N-test-report.md` với lệnh, exit code,
   screenshot path, security result và known limitations thuộc out-of-scope.
6. Cập nhật cả `PROGRESS.md` và `progress.json` thành `awaiting_approval`.
7. Sau product-owner xác nhận: ghi `completed_at`, `approved_by`,
   `completion_commit`, tạo merge commit vào `main`, chạy smoke test trên
   `main`, rồi điền `merge_commit`.

## Task 1: Phase 1 — UI foundation cùng hardening

**Branch:** `codex/phase-1-foundation-hardening`  
**Depends on:** core blueprint đã merge vào `main`  
**Evidence:** `docs/pickhub-core/evidence/phase-1-test-report.md`

**Files:**

- Modify: `app/layout.js`, `app/globals.css`, `app/page.css`.
- Create: `components/pickhub/AppShell.js`,
  `components/pickhub/StatusState.js`, `components/pickhub/AccessBoundary.js`.
- Create: `tests/pickhub-ui-foundation.test.js`,
  `tests/pickhub-ui-foundation.browser.test.js`.
- Modify: `package.json` để có script test foundation nếu chưa có.

**Interfaces:** `AppShell` nhận `viewModel`, `activeClub`, `role` và `navItems`;
`StatusState` nhận `kind` (`loading|empty|error|forbidden|offline|conflict`),
`title`, `message` và action callback; `AccessBoundary` chỉ trình bày
authorization result từ server.

- [ ] **Step 1: Chốt shared token và shell** — đưa token approved vào CSS,
  hỗ trợ reduced motion, focus-visible, safe-area mobile, responsive container,
  skip link và role-aware navigation mà không hard-code quyền.
- [ ] **Step 2: Chuẩn hóa trạng thái dữ liệu** — tạo component cho loading,
  empty, partial/stale, error, forbidden, offline và conflict; mọi state phải
  có wording tiếng Việt và không chỉ dùng màu/icon.
- [ ] **Step 3: Bọc route guard/public fallback** — link giải public resolve
  độc lập với club context; anonymous không thấy dữ liệu private; lỗi quyền
  dùng stable error code từ API.
- [ ] **Step 4: Test và review** — chạy `npm run test:ui-preview`,
  `npm run test:mobile-nav`, `npm run test:tournament`, toàn bộ test
  multi-tenant/auth/fund, browser smoke ở 390px và 1440px, rồi `npm run build`.
- [ ] **Step 5: Gate Phase 1** — xác minh không regress route cũ, không có
  surface nền đen/navy đặc, keyboard/focus và overflow mobile đạt; ghi evidence,
  xin xác nhận, merge và smoke test `main`.

## Task 2: Phase 2 — Athlete/membership, club switcher và hai trải nghiệm role

**Branch:** `codex/phase-2-identity-clubs`  
**Depends on:** Phase 1 đã merge và `main` xanh  
**Evidence:** `docs/pickhub-core/evidence/phase-2-test-report.md`

**Files:**

- Modify: `app/quy/page.js`, `app/quy/members/page.js`,
  `app/quy/bxh/page.js`, `app/admin/page.js` và các CSS hiện hữu tương ứng.
- Create: `components/pickhub/ClubSwitcher.js`,
  `components/pickhub/MemberInfoPanel.js`,
  `components/pickhub/RoleActionBar.js`.
- Create: `app/thong-tin/page.js`, `app/thong-tin/page.css`.
- Create: `tests/pickhub-ui-phase2.test.js`,
  `tests/pickhub-ui-phase2.browser.test.js`.

**Interfaces:** `ClubSwitcher` nhận danh sách club access context đã có trên
thiết bị và `defaultClubId`; việc thêm CLB mới luôn yêu cầu code + password.
`MemberInfoPanel` nhận athlete/membership view model, PHR snapshot,
assessment history và privacy flags phù hợp shared session; `RoleActionBar`
nhận server-provided permissions (`member|admin`).

- [ ] **Step 1: Mở đúng CLB mặc định** — member/leader nhập Mã CLB + mật khẩu,
  vào đúng CLB mặc định đã lưu trên thiết bị; đổi CLB không đổi identity dữ liệu
  và không tự cấp role.
- [ ] **Step 2: Hoàn thiện nav member** — giữ đúng năm tab và thứ tự
  `Quỹ | Thành viên | BXH | Giải | Thông tin`; `BXH` là tab trung tâm với BXH
  đóng phạt/đóng quỹ như PickHub hiện tại; tab `Thông tin` hiển thị thông tin
  cá nhân, PHR cá nhân, lịch sử cập nhật và các CLB đang sinh hoạt.
- [ ] **Step 3: Hoàn thiện nav leader** — trưởng nhóm vẫn có `Cấu hình`, thấy
  thu–chi, roster, thông báo cần xử lý và action cập nhật PHR theo quyền; không
  hiển thị control quản trị cho member.
- [ ] **Step 4: Giữ mô hình VĐV chưa cần account** — roster hiển thị athlete/
  membership và alias rõ ràng; member dùng code + password, không có bước claim,
  invite, OTP hoặc tạo tài khoản; lớp liên kết cá nhân chỉ ghi nhận như adapter
  tương lai, không đưa vào luồng Phase 2.
- [ ] **Step 5: Test và gate** — chạy `npm run test:phase2`,
  `npm run test:isolation`, `npm run test:leaderboard`, `npm run test:teamfund`,
  browser test mobile/desktop cho hai role và `npm run build`; cập nhật evidence,
  xác nhận, merge `main` và smoke test.

## Task 3: Phase 3 — UI MVP giải liên CLB

**Branch:** `codex/phase-3-interclub-tournament-mvp`  
**Depends on:** Phase 2 đã merge, roster pilot đủ dùng  
**Evidence:** `docs/pickhub-core/evidence/phase-3-test-report.md`

**Files:**

- Modify: `app/giai-dau/v2/page.js`,
  `app/giai-dau/v2/TournamentWizard.js`,
  `app/giai-dau/v2/[slug]/page.js`,
  `app/giai-dau/v2/[slug]/public.css`.
- Create: `components/pickhub/TournamentSetupStepper.js`,
  `components/pickhub/RegistrationRoster.js`,
  `components/pickhub/DrawPolicyToggle.js`.
- Modify: `tests/tournament/ui-wizard.contract.test.js`,
  `tests/tournament/ui-public.contract.test.js`.
- Create: `tests/pickhub-ui-phase3.test.js`,
  `tests/pickhub-ui-phase3.browser.test.js`.

**Interfaces:** `TournamentSetupStepper` dùng tournament/division/ruleset
view model; `RegistrationRoster` dùng athlete snapshot + eligibility warnings;
`DrawPolicyToggle` nhận `divisionId`, `enabled`, `lockedAt` và chỉ gọi server
command preview/commit, không tự ghép cặp ở client.

- [ ] **Step 1: Tạo giải theo wizard** — director chọn template, tạo từng nội
  dung, thời gian đăng ký, logo/ảnh bìa/màu riêng; validation báo lỗi tại trường
  và giữ mọi theme override trong token được phép.
- [ ] **Step 2: Captain đăng ký thay VĐV** — roster theo CLB, quota,
  eligibility, nickname ưu tiên khi đã liên kết và tên CLB chủ quản khi chưa có;
  submit có version/conflict state.
- [ ] **Step 3: Cấu hình ghép/bốc thăm** — ON/OFF ghép ngẫu nhiên cân bằng riêng
  từng nội dung; preview giải thích seed, chênh lệch trình độ và constraint;
  commit atomic rồi khóa roster/draw.
- [ ] **Step 4: Public tournament** — public link riêng hiển thị tổng quan,
  lịch, bảng đấu, kết quả, nhánh thắng/nhánh thua và PHR snapshot được phép;
  không cần cookie CLB và không lộ dữ liệu quỹ.
- [ ] **Step 5: Test và gate** — chạy `npm run test:tournament`,
  `npm run test:phase3`, isolation/RLS, browser captain/director/public ở
  390px và 1440px, kiểm tra link public trong browser sạch, rồi build/evidence/
  approval/merge/smoke.

## Task 4: Phase 4 — UI vận hành tại sân

**Branch:** `codex/phase-4-tournament-operations`  
**Depends on:** Phase 3 đã merge, rehearsal MVP hoàn tất  
**Evidence:** `docs/pickhub-core/evidence/phase-4-test-report.md`

**Files:**

- Modify: `app/giai-dau/v2/console/TournamentConsoleV2.js`,
  `app/giai-dau/v2/console/console.css`,
  `app/giai-dau/v2/console/tabs/OverviewTab.js`,
  `app/giai-dau/v2/console/tabs/ResultsTab.js`,
  `app/giai-dau/v2/console/tabs/BracketTab.js`.
- Create: `components/pickhub/OfflineScoreQueue.js`,
  `components/pickhub/CourtBoard.js`,
  `components/pickhub/ConflictResolver.js`.
- Create: `tests/pickhub-ui-phase4.test.js`,
  `tests/pickhub-ui-phase4.browser.test.js`.

**Interfaces:** `OfflineScoreQueue` nhận mutation có idempotency key và trạng
thái sync; `CourtBoard` nhận public/admin projection khác nhau; `ConflictResolver`
nhận server version và options correction có audit.

- [ ] **Step 1: Bàn điều hành desktop** — tổng quan check-in, sân, trận live,
  delay, cảnh báo conflict và thông báo cần xử lý; mật độ thông tin phù hợp
  màn hình BTC, không dùng nền đen.
- [ ] **Step 2: Lịch tự động + chỉnh thủ công** — hiển thị số sân, khung giờ,
  thời lượng, rest/dependency; BTC sửa trực tiếp từng trận, cảnh báo xung đột
  để tự quyết định và lưu audit.
- [ ] **Step 3: Scorekeeper mobile/offline** — “trận của tôi”, nhập điểm,
  xử thua theo luật (ví dụ 15–0), queue offline, retry/backoff, conflict rõ;
  sửa kết quả chỉ qua correction flow server.
- [ ] **Step 4: Public court board** — trang chiếu desktop và spectator mobile
  dùng projection công khai, cập nhật realtime/polling có backoff, ưu tiên trận
  hiện tại và bracket cuộn ngang trên mobile.
- [ ] **Step 5: Test và gate** — chạy `npm run test:tournament`,
  `npm run test:phase4`, browser test bàn BTC ở 1440px và scorekeeper ở 390px,
  rehearsal offline/conflict/concurrency, build/evidence/approval/merge/smoke.

## Task 5: Phase 5 — UI PHR, rating và ghép cân bằng

**Branch:** `codex/phase-5-player-rating`  
**Depends on:** Phase 4 đã merge, match finalized có provenance  
**Evidence:** `docs/pickhub-core/evidence/phase-5-test-report.md`

**Files:**

- Create: `app/thong-tin/phr/page.js`,
  `app/thong-tin/phr/page.css`,
  `components/pickhub/PhrTimeline.js`,
  `components/pickhub/AssessmentForm.js`.
- Modify: `app/giai-dau/v2/console/tabs/TeamsTab.js` và
  `app/giai-dau/v2/console/tabs/SettingsTab.js`.
- Create: `app/giai-dau/v2/console/tabs/PairingPreviewTab.js`.
- Create: `tests/pickhub-ui-phase5.test.js`,
  `tests/pickhub-ui-phase5.browser.test.js`.

**Interfaces:** `PhrTimeline` nhận assessment/rating events có source,
  confidence, effective date và algorithm version; `AssessmentForm` nhận
  scheme/version và assessor scope; `PairingPreviewTab` nhận candidate plans,
  fairness score, hard-constraint warnings, explanation và seed.

- [ ] **Step 1: Nhập đánh giá manual-first** — trưởng nhóm nhập nhãn + điểm
  theo thang PickHub đã chốt; lưu assessor, thời gian, evidence note và không
  ghi đè lịch sử.
- [ ] **Step 2: Hồ sơ `Thông tin`** — member xem PHR cá nhân, timeline nguồn,
  reliability và lịch sử trận theo privacy; leader xem roster assessment và
  cảnh báo stale theo scope.
- [ ] **Step 3: Eligibility/snapshot** — director xem assessment + rating,
  override bắt buộc reason; registration snapshot khóa ở thời điểm chốt roster.
- [ ] **Step 4: Preview ghép cân bằng** — hiển thị nhiều phương án, fairness
  score, chênh lệch dự kiến, lịch sử partner/opponent, constraint warnings và
  explanation; chỉ director mới commit.
- [ ] **Step 5: Test và gate** — chạy unit/property/replay rating,
  `npm run test:phase5`, RLS/privacy, browser member/captain/director,
  deterministic seed và build; chỉ bật official rating sau ADR/approval, rồi
  evidence/merge/smoke.

## Task 6: Phase 6 — UI community và scale toàn quốc

**Branch:** `codex/phase-6-national-scale`  
**Depends on:** Phase 5 đã merge, rating/operations ledger ổn định  
**Evidence:** `docs/pickhub-core/evidence/phase-6-test-report.md`

**Files:**

- Create: `app/cong-dong/page.js`, `app/cong-dong/page.css`,
  `app/danh-ba-clb/page.js`, `app/lich-giai/page.js`.
- Create: `components/pickhub/OnboardingStepper.js`,
  `components/pickhub/PrivacyVisibilityControl.js`,
  `components/pickhub/EntitlementGate.js`,
  `components/pickhub/ExportJobStatus.js`.
- Modify: `app/layout.js`, `app/globals.css` và public tournament layout để
  hỗ trợ community/club/tournament theme hierarchy.
- Create: `tests/pickhub-ui-phase6.test.js`,
  `tests/pickhub-ui-phase6.browser.test.js`.

**Interfaces:** `OnboardingStepper` hiển thị dry-run/import/verification;
`PrivacyVisibilityControl` dùng policy server trả; `EntitlementGate` luôn
đi kèm server check; `ExportJobStatus` hiển thị queue/retry/completed/error.

- [ ] **Step 1: Onboarding self-service** — đăng ký/xác minh CLB, import roster
  có preview, duplicate candidate, rollback và trạng thái pending/verified/
  restricted/suspended.
- [ ] **Step 2: Discovery cộng đồng** — danh bạ CLB, lịch giải theo khu vực,
  level và thời gian, public profile/bookmark; không xây social feed/chat khi
  chưa có evidence nhu cầu.
- [ ] **Step 3: Privacy, moderation, entitlement** — control public/private,
  report/restriction/appeal, plan/feature/limit; UI không dùng hide button thay
  cho authorization.
- [ ] **Step 4: Scale/accessibility** — kiểm tra large public tournament,
  cache/projection state, keyboard/screen reader, contrast, reduced motion,
  responsive và không overflow ở các viewport chuẩn.
- [ ] **Step 5: Test và gate** — chạy `npm run test:phase6`, toàn bộ test
  tournament/multi-tenant, load/public live rehearsal, backup/restore evidence,
  browser onboarding/public/privacy ở 390px và 1440px, build/evidence/approval/
  merge/smoke.

## UI acceptance matrix cho mọi phase

| Nhóm kiểm tra | Bắt buộc |
|---|---|
| Brand | Token đúng baseline; không nền đen/navy đặc; theme override không phá contrast |
| Responsive | Mobile 390px không tràn ngang; desktop 1440px đọc được hierarchy và bảng/bracket |
| Accessibility | Keyboard focus, semantic label, `44px` touch target, reduced motion, không phụ thuộc màu |
| Data states | Loading, empty, error, forbidden, stale, offline, conflict có wording và action |
| Security | Không suy quyền từ localStorage/ẩn nút; public/admin projection tách; RLS/API test xanh |
| Reliability | Mutation có idempotency/version; retry và conflict không mất dữ liệu |
| Evidence | Screenshot/log path, command + exit code, known limitation và kết luận `PASS` |

## Final handoff

Khi cả sáu phase đã merge và `main` xanh, UI baseline được xem là production
ready theo phạm vi đã duyệt. Mọi thay đổi làm khác information architecture,
palette, role navigation hoặc public/privacy boundary phải tạo ADR, cập nhật
`UI-STRATEGY.md`/`UI-BRAND-SYSTEM.md` và đi qua lại các gate bị ảnh hưởng; không
chỉnh trực tiếp prototype để né quy trình.
