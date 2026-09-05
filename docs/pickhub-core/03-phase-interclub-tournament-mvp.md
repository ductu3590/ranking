# Phase 3 — MVP giải liên CLB

## 1. Mục tiêu

Cho phép CLB tự tạo giải nội bộ hoặc giải giao hữu có mời nhiều CLB; đồng thời cho phép `community_admin` tạo giải cộng đồng mở đăng ký cho mọi CLB trên PickHub. Mỗi giải tổng chứa nhiều nội dung thi đấu độc lập; mỗi nội dung hỗ trợ đơn/đôi, tính thành tích cá nhân/CLB, đăng ký đội hình, ghép cặp, sinh lịch, kết quả và công khai riêng.

Nhánh: `codex/phase-3-interclub-tournament-mvp`

## 2. Phạm vi pilot

- Organizer: `club_admin` cho giải của CLB; `community_admin` cho giải cộng đồng toàn hệ thống.
- Pilot mục tiêu: giải nội bộ, giải giao hữu nhiều CLB và một giải cộng đồng có nhiều nội dung.
- Athlete không cần tự đăng ký; `club_admin` đăng ký thay từ roster hoặc tạo VĐV khách trong phạm vi được phép.
- Chưa thu phí online và chưa tính rating tự động. PHR hiện tại có thể được club admin cập nhật; nội dung giới hạn chỉ cảnh báo để community admin/BTC duyệt thủ công.

## 3. Refactor sở hữu tournament

Tournament không còn mặc định thuộc `group_id` của CLB đang đăng nhập.

### 3.1 Organizer

Tournament có:

- `organizer_type`: `platform`, `community`, `club`.
- `organizer_club_id` nullable.
- `organizer_community_id` nullable; `community` là phạm vi toàn hệ thống, không bắt buộc Community record.
- Check constraint bảo đảm tổ hợp ID phù hợp organizer type và không buộc `community` phải có `organizer_community_id`.
- `created_by_profile_id` nullable trong giai đoạn chưa có profile; thêm `created_by_platform_account_id` cho `community_admin`.

Trong Phase 3, `club` và `community` đều có UI; `community_admin` có quyền toàn hệ thống, còn `club_admin` chỉ có quyền trên giải do CLB mình sở hữu.

### 3.2 Child scope

- Division, stage, entry, match và game scope qua parent tournament.
- `group_id` denormalized ở bảng tournament cũ được migrate/deprecate có kiểm soát.
- Authorization kiểm tra tournament staff hoặc participating club scope.
- Không mở rộng quyền bằng cách cho captain truy cập toàn bộ tournament rows.

## 4. Mô hình dữ liệu mới

### 4.1 `tournament_divisions`

- Tên hiển thị, `play_type` (`singles|doubles|team`), `scoring_scope` (`athlete|club`), capacity, registration window.
- `rating_policy` (`open|capped`) và `rating_cap` là tổng PHR tối đa của cặp; không bắt buộc PHR ở giải nội bộ/giao hữu.
- `pairing_mode` (`none|random_balanced|manual`) và pairing status.
- Eligibility JSON/schema version: giới tính/nội dung, tuổi, club quota.
- Competition template và ruleset version.
- `scoring_override` và `tiebreak_override` JSON nullable; kế thừa `default_scoring`/`tiebreak_policy` của tournament khi null.
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

### 4.7 VĐV khách và cặp đấu

- `tournament_athletes`: `profile_id` nullable, `display_name`, `representing_club_id` nullable, `source` (`club_member|guest`) và status.
- `tournament_pairs`/`tournament_pair_members`: lưu cặp đã ghép tự động hoặc thủ công, skill balance score, seed và thời điểm khóa.
- Ghép tự động ưu tiên cân bằng PHR khi có dữ liệu; nếu không có PHR thì ngẫu nhiên.
- Ghép thủ công do `club_admin` hoặc `community_admin` thực hiện trong phạm vi quyền.
- Một athlete chỉ thuộc một cặp trong cùng division; cặp đã khóa không tự thay đổi khi PHR hiện tại thay đổi.

### 4.8 PHR theo giải

- `athlete_ratings` lưu giá trị PHR, nguồn, người cập nhật, trạng thái `pending|confirmed|rejected` và lịch sử.
- Nội dung capped tính `PHR_A + PHR_B <= rating_cap`.
- Thiếu/chưa xác nhận/vượt giới hạn tạo warning; đăng ký vẫn được gửi và BTC quyết định duyệt.

### 4.9 Luật điểm số và tie-break

- `tournaments.default_scoring` và `tournaments.tiebreak_policy` JSON là mặc định cho mọi nội dung; division có override; stage nhận giá trị hiệu lực khi commit draw và snapshot vào `tournament_stages.config.scoring` và `config.tiebreak`.
- `scoring` gồm `match_format`, `best_of`, `points_to`, `win_by`, `cap`, `deciding_game`, `win_points`, `loss_points`, `draw_points`, `mlp`. Preset `phong_trao_11`, `phong_trao_15`, `ban_ket_chung_ket`, `mlp_4_van` là dữ liệu cấu hình có version.
- `tiebreak` là mảng tiêu chí có thứ tự trong tập `match_points`, `wins`, `head_to_head`, `game_diff`, `game_ratio`, `point_diff`, `point_ratio`, `points_for`, `points_against`, `seed`, `draw_lot`, kèm `scope: tied_group|all`. Thứ tự engine hiện hành trở thành preset `legacy_v2`.
- Nhập điểm được validate theo `scoring` hiệu lực của stage; BXH tính theo `tiebreak` snapshot và trả explanation cho từng vị trí.
- Chi tiết tại `TOURNAMENT-MANAGEMENT-ARCHITECTURE.md` mục 15 và 16.

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
- Duplicate CLB trong pool theo policy `unique_per_pool|spread_if_possible|allow_multiple`; template này mặc định `spread_if_possible` và cảnh báo khi không rải đều được.
- Pair roster có thể khác giữa các vòng nếu rules cho phép.
- Lịch vòng tròn trong mỗi pool.
- Điểm match được aggregate lên club standings.
- Tie-break dùng policy mục 4.9; template gợi ý preset `giao_huu_clb`.
- Optional loss contribution/meal settlement để tái tạo Giao Hữu; tắt mặc định cho giải khác.

Draw engine nhận seed deterministic và trả explanation. Preview không ghi DB. Commit draw chạy atomic, tăng version và khóa roster/draw theo state.

## 6. Luồng nghiệp vụ

### 6.1 Tạo giải

1. Organizer chọn loại giải: nội bộ, giao hữu hoặc cộng đồng.
2. Nhập thông tin giải tổng; bản nháp riêng tư.
3. Tạo một hoặc nhiều division/nội dung.
4. Với từng division chọn đơn/đôi/đội, cá nhân/CLB, Open hoặc giới hạn PHR.
5. Chọn CLB nội bộ, gửi lời mời hoặc mở đăng ký toàn hệ thống.
6. Mở đăng ký/công bố.

### 6.2 Trưởng CLB đăng ký đoàn

1. `club_admin`/đại diện CLB xem nội dung và eligibility.
2. Chọn athlete từ active roster hoặc tạo VĐV khách.
3. Với nội dung đôi, chọn ghép tự động cân bằng/ngẫu nhiên hoặc ghép thủ công.
4. Hệ thống tính PHR, cảnh báo thiếu/chưa xác nhận/vượt giới hạn.
5. Submit roster; sau submit chỉ sửa khi BTC trả về `changes_requested`.

### 6.3 BTC duyệt và sinh lịch

1. Xem roster từng CLB, cặp đấu, PHR và eligibility warning.
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

- `CreateTournament`
- `CreateTournamentDivision`
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
- `PreviewPairing`
- `ConfirmPairing`
- `CreateTournamentGuestAthlete`
- `UpdateAthletePHR`
- `ReviewPHRWarning`
- `UpdateScoringRules` (tournament default hoặc division override, chỉ khi stage chưa bắt đầu)
- `UpdateTiebreakPolicy` (tournament default hoặc division override, chỉ khi stage chưa bắt đầu)
- `ExportShareImage` (bốc thăm, lịch, BXH, kết quả, bảng vàng từ public projection)

Mỗi mutation kiểm tra allowed transition và expected version.

## 8. Reference UI

- Organizer console: overview, divisions, registrations, pairings, draw, results, public settings.
- Club portal: invitation/registration, roster picker, guest athlete, pairing, validation, submit/status.
- Scorekeeper mobile view: trận được giao, score entry, offline/retry indicator tối thiểu.
- Public event page: hero, chương trình, thể lệ, CLB, roster công khai, lịch, kết quả, BXH.
- Chia sẻ: Open Graph metadata cho trang giải và từng division, nút "Xuất ảnh" và "Sao chép thông báo" để BTC tự gửi vào nhóm Zalo. Không tích hợp Zalo OA/ZNS.
- Wizard: bước chọn preset điểm số và preset tie-break cho giải, override theo division.

Giao diện tham khảo trải nghiệm của source Giao Hữu nhưng dữ liệu và quyền dùng core mới.

## 9. Ngoài phạm vi

- Payment/refund, waitlist tự động, check-in và substitution nâng cao.
- Rating tự động và tích hợp DUPR. Quy trình xác nhận PHR đầy đủ thuộc Phase 4; Phase 3 dùng warning và duyệt thủ công.
- Full court/time optimizer.
- Không big-bang redesign ngoài lát cắt UI giải đấu được mô tả ở mục 8;
  các lát cắt vận hành nâng cao, rating chính thức và thanh toán thuộc phase sau.

## 10. Test matrix bắt buộc

### Unit/domain

- Invitation/roster/tournament state machines.
- Draw theo policy duplicate CLB: `unique_per_pool` hard-block, `spread_if_possible` warning, `allow_multiple` không cảnh báo.
- Determinism theo seed.
- Club aggregate standings và tie-break theo policy: preset `legacy_v2` cho kết quả giống engine cũ trên corpus hiện có; hòa 3 bên với `scope: tied_group`; `draw_lot` deterministic.
- Validate game theo `scoring` của stage: `points_to`, `win_by`, `cap`, `deciding_game`, `best_of`.
- Resolve scoring/tiebreak: tournament default → division override → stage snapshot; đổi policy sau commit không đổi BXH stage đã snapshot.
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
- Dán link giải vào Zalo hiển thị card có ảnh; xuất ảnh BXH và lịch không chứa dữ liệu riêng tư.

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

## 12. Điều kiện mở Phase 4

Phase 3 merge vào `main`, pilot retrospective được lưu và các workflow/API chính
ổn định. Lát cắt UI Phase 3 phải đã dùng design baseline và có visual evidence;
Phase 4 tiếp tục triển khai trên nhánh core riêng theo kế hoạch tích hợp UI sáu
phase.

## 13. Điều chỉnh bắt buộc sau kiểm tra hệ thống hiện hữu

- Trước khi hoàn thiện Wizard, phải hội tụ mô hình `division → entry → stage → match`; `tournament_entrants` chỉ còn là adapter đọc dữ liệu cũ.
- Stage và match phải có `division_id`; engine, standings và public projection không được đọc entry cấp giải như mô hình chính.
- `group_id` trong giai đoạn chuyển tiếp là technical tenant. Giải cộng đồng dùng system group; ownership vẫn do organizer/platform scope quyết định.
- `community_admin` dùng platform account/session riêng.
- Hỗ trợ `tournament_external_clubs`, VĐV khách, cặp tự động/thủ công và PHR warning.
- BTC được nhập hộ roster của CLB khách nhưng phải ghi actor/reason và chờ CLB xác nhận.
- Scorekeeper Phase 3 dùng token ký/hashed theo trận hoặc sân; tài khoản cá nhân là phase sau.
- Duplicate CLB trong pool là policy của ruleset, không phải lỗi cứng của engine chung.
- Luật điểm số và tie-break là policy có version ở tournament/division, snapshot vào stage khi commit draw; không hard-code trong engine.
- Migration 030 đã được apply trên Supabase; mọi bổ sung cột/bảng Phase 3 phải là migration mới, không sửa file 030.
- Chia sẻ Zalo = Open Graph + xuất ảnh + copy text; không tích hợp Zalo API.
