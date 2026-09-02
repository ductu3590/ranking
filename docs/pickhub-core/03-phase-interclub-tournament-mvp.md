# Phase 3 — MVP giải liên CLB

## 1. Mục tiêu

Cho phép PickHub tổ chức một giải liên CLB hoàn chỉnh: mời CLB, trưởng CLB đăng ký VĐV, BTC duyệt, sinh lịch, nhập kết quả, tính BXH CLB và công khai giải. MVP phải tái tạo được giải Giao Hữu hiện tại bằng cấu hình, không hard-code ba CLB.

Nhánh: `codex/phase-3-interclub-tournament-mvp`

## 2. Phạm vi pilot

- Organizer ban đầu: `platform_admin` hoặc `tournament_director` do PickHub cấp.
- Các CLB chưa được tự tạo giải liên CLB ở Phase 3.
- Pilot mục tiêu: ba CLB hiện hữu, một giải Giao Hữu, mobile-first score entry.
- Athlete không cần tự đăng ký; captain đăng ký thay từ roster.
- Chưa thu phí online và chưa tính rating tự động.

## 3. Refactor sở hữu tournament

Tournament không còn mặc định thuộc `group_id` của CLB đang đăng nhập.

### 3.1 Organizer

Tournament có:

- `organizer_type`: `platform`, `community`, `club`.
- `organizer_club_id` nullable.
- `organizer_community_id` nullable khi community module tồn tại.
- Check constraint bảo đảm tổ hợp ID phù hợp organizer type.
- `created_by_profile_id` và ownership audit.

Trong Phase 3, `platform` và `club` được triển khai; `community` được chừa schema/interface nhưng không có self-service UI.

### 3.2 Child scope

- Division, stage, entry, match và game scope qua parent tournament.
- `group_id` denormalized ở bảng tournament cũ được migrate/deprecate có kiểm soát.
- Authorization kiểm tra tournament staff hoặc participating club scope.
- Không mở rộng quyền bằng cách cho captain truy cập toàn bộ tournament rows.

## 4. Mô hình dữ liệu mới

### 4.1 `tournament_divisions`

- Tên, entrant type, capacity, registration window.
- Eligibility JSON/schema version: giới tính/nội dung, tuổi, manual skill band, club quota.
- Competition template và ruleset version.
- Trạng thái registration/scheduling/competition riêng.

### 4.2 `tournament_clubs`

- Tournament, club, invitation status, quota, captain contact profile.
- Status: `invited`, `accepted`, `declined`, `roster_submitted`, `changes_requested`, `approved`, `withdrawn`.
- Một CLB chỉ có một participation record/tournament.

### 4.3 `tournament_registrations`

- Division, athlete, representing club, submitted by, status.
- Eligibility snapshot và captain declaration.
- Support registration theo athlete hoặc team draft tùy entrant type.

### 4.4 `tournament_entries` và members

- Entry là đơn vị đã duyệt được engine xếp lịch.
- Có representing club, name/color snapshot và seed.
- Member rows chứa athlete ID, display/club/skill snapshot và roster role.
- Unique ngăn athlete xuất hiện hai entry trong cùng division nếu rules không cho phép.

### 4.5 `tournament_staff`

- Profile, tournament/division scope, role và expiry.
- Phase 3 cần `tournament_director` và `scorekeeper`.

### 4.6 Public projection

- Tournament/club/division metadata công khai.
- Entries chỉ trả display data đã được phép.
- Schedule, result, standings, club aggregate và rules.
- Không trả private registration notes hoặc athlete contact.

## 5. Competition template Giao Hữu

Template ID/version: `interclub_friendly_team_v1`.

Cấu hình:

- Số CLB tham gia >= 2.
- Số vòng, số cặp mỗi CLB mỗi vòng và số bảng/sân.
- Mỗi pool chứa tối đa một entry từ mỗi CLB.
- Pair roster có thể khác giữa các vòng nếu rules cho phép.
- Lịch vòng tròn trong mỗi pool.
- Điểm match được aggregate lên club standings.
- Tie-break cấu hình: wins, point differential, points for, head-to-head.
- Optional loss contribution/meal settlement để tái tạo Giao Hữu; tắt mặc định cho giải khác.

Draw engine nhận seed deterministic và trả explanation. Preview không ghi DB. Commit draw chạy atomic, tăng version và khóa roster/draw theo state.

## 6. Luồng nghiệp vụ

### 6.1 Tạo giải

1. Director nhập thông tin và chọn template.
2. Tạo division/nội dung và ruleset.
3. Mời CLB, gán quota và captain.
4. Mở đăng ký.

### 6.2 Trưởng CLB đăng ký đoàn

1. Captain xem quota và eligibility.
2. Chọn athlete từ active roster.
3. Xếp cặp/đội theo vòng hoặc để BTC ghép tùy rules.
4. Submit roster; sau submit chỉ sửa khi director trả về `changes_requested`.

### 6.3 BTC duyệt và sinh lịch

1. Xem roster từng CLB, conflict và eligibility warning.
2. Approve hoặc yêu cầu sửa có lý do.
3. Đóng đăng ký.
4. Preview draw deterministic; commit và lock.
5. Public schedule được publish theo visibility.

### 6.4 Thi đấu và kết thúc

1. Scorekeeper nhập điểm theo match được giao.
2. Server validate rules và lưu atomic.
3. Standings/BXH CLB cập nhật realtime.
4. Director finalize kết quả và giải.
5. Public archive giữ snapshot lịch sử.

## 7. API/use cases chính

- `CreateInterclubTournament`
- `InviteClubToTournament`
- `AcceptTournamentInvitation`
- `SubmitClubRoster`
- `RequestRosterChanges`
- `ApproveClubRoster`
- `Open/CloseRegistration`
- `PreviewConstrainedDraw`
- `CommitDraw`
- `AssignScorekeeper`
- `SubmitMatchResult`
- `FinalizeMatch/Tournament`
- `GetPublicTournamentProjection`

Mỗi mutation kiểm tra allowed transition và expected version.

## 8. Reference UI

- Director console: overview, clubs, divisions, registrations, draw, results, public settings.
- Captain portal: invitation, quota, roster picker, validation, submit/status.
- Scorekeeper mobile view: trận được giao, score entry, offline/retry indicator tối thiểu.
- Public event page: hero, chương trình, thể lệ, CLB, roster công khai, lịch, kết quả, BXH.

Giao diện tham khảo trải nghiệm của source Giao Hữu nhưng dữ liệu và quyền dùng core mới.

## 9. Ngoài phạm vi

- Club self-service tạo giải liên CLB.
- Payment/refund, waitlist tự động, check-in và substitution nâng cao.
- Rating tự động và tích hợp DUPR.
- Full court/time optimizer.
- Visual redesign toàn hệ thống.

## 10. Test matrix bắt buộc

### Unit/domain

- Invitation/roster/tournament state machines.
- Constraint draw mỗi pool tối đa một entry/CLB.
- Determinism theo seed.
- Club aggregate standings và tie-break.
- Eligibility/quota và duplicate athlete rules.

### Integration/security

- Captain chỉ quản lý roster CLB mình trong tournament được mời.
- Captain không xem private roster note của CLB khác.
- Scorekeeper chỉ nhập match được cấp quyền.
- Public projection không phụ thuộc cookie và không lộ private data.
- Commit draw atomic; retry cùng idempotency key không tạo match trùng.
- Finalized result không sửa qua endpoint nhập điểm thường.

### E2E pilot

- Director tạo giải, mời ba CLB.
- Ba captain accept, đăng ký roster và được duyệt.
- Sinh hai vòng theo template Giao Hữu.
- Nhập toàn bộ kết quả trên mobile viewport.
- BXH CLB và settlement khớp hệ thống Giao Hữu tham chiếu với cùng input.
- Người xem mở link browser sạch và thấy realtime update.

### Performance

- Public page chịu tải mục tiêu pilot với realtime/polling.
- Standings update trong ngưỡng UX đã chốt sau score submission.

## 11. Exit gate

- Một giải pilot thật hoặc rehearsal đầy đủ với ba CLB hoàn thành end-to-end.
- Không nhập lại tên VĐV dạng text khi athlete đã có trong roster.
- Zero cross-club authorization leak trong security test.
- Kết quả/BXH/settlement đối chiếu đúng với bộ dữ liệu tham chiếu.
- Director và captain xác nhận workflow dùng được.
- Evidence `evidence/phase-3-test-report.md` PASS.
- Public archive hoạt động sau khi giải completed.

## 12. Điều kiện mở Phase 4 và UI redesign

Phase 3 merge vào `main`, pilot retrospective được lưu và các workflow/API chính ổn định. Khi đó có thể tạo `codex/ui-redesign-foundation` theo chiến lược UI, đồng thời Phase 4 vẫn tuân nhánh core riêng.
