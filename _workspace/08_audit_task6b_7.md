# Audit Task 5b/6/6b/7 trước khi commit

Ngày audit: 2026-09-05. Phạm vi: đọc code thật trong working tree (Task 6b + Task 7 chưa commit), đối chiếu
`docs/superpowers/plans/2026-09-04-phase-3-interclub-tournament-mvp.md`,
`docs/superpowers/plans/2026-09-05-prompt-codex-phase-3.md` (mục 2),
`docs/pickhub-core/TOURNAMENT-MANAGEMENT-ARCHITECTURE.md` (mục 14–17).
Không sửa code, không commit.

## Bảng checkbox

| Task | Checkbox rút gọn | Trạng thái | Bằng chứng file:line |
|---|---|---|---|
| 5b | Chặn UpdateScoringRules / UpdateTiebreakPolicy khi stage đã live/done | ĐÃ LÀM | `app/api/tournament-v2/rules/route.js:11` (`LOCKED_STAGE_STATUSES = new Set(['active','completed'])`), `:80-94` trả 409 `RULES_LOCKED`; `lib/tournament/wizardModel.js:206` khoá UI. Đã xác minh `tournament_stages.status` chỉ nhận `pending/active/completed` (`database/migrations/015_*.sql`, migration 033 chỉ mở rộng `tournaments.status` và `tournament_matches.status`) → 'active'/'completed' là ánh xạ đúng của "live/done" ở tầng stage |
| 5b | Chạy test tập trung rồi `npm run test:t-engines` | ĐÃ LÀM (chưa ghi bằng chứng) | Đã chạy lại trong audit: 12 test engine xanh, `npm run test:phase3-interclub` 12/12 xanh, `tests/phase3/share.test.js` và `tests/phase3/wizard-competition-contract.test.js` exit 0. Nhưng plan/evidence file không có dòng log nào → cần dán kết quả vào plan trước khi tick |
| 6 | Cho phép BTC nhập hộ đội hình, có audit và CLB xác nhận sau | LÀM MỘT PHẦN | Audit đủ: `lib/tournament/wizardModel.js:339-359` (`buildRosterAudit` bắt buộc `reason` cho actor `organizer`, set `club_confirmation_status:'pending'`, `private_note`, `captain_declaration.audit`), `app/api/tournament-v2/registrations/route.js:64-98` lưu `submitted_by_actor`/`private_note`, `:136-143` PATCH set `confirmed`, `app/giai-dau/v2/TournamentWizard.js` panel "BTC nhập hộ đội hình" + `submitProxyRoster` (bắt lý do), cột DB `database/migrations/035_*.sql:98-100` + `030_*.sql:71-72`. Thiếu: bước "CLB xác nhận sau" vẫn do chính group admin của BTC bấm — không có actor phía CLB khách, nên `club_confirmation_status:'confirmed'` chưa phản ánh CLB thật sự xác nhận |
| 6b | Viết test share/OG thấy đỏ trước | ĐÃ LÀM (không thể xác minh hồi tố "đỏ trước") | `tests/phase3/share.test.js:1-341` có fixture bơm marker riêng tư (`PRIVATE_MARKERS`) và assert vắng mặt trong snapshot/OG/3 text/7 kind ảnh; assert `SHARE_NOT_PUBLIC` cho visibility private. Thứ tự đỏ-trước không kiểm được từ working tree |
| 6b | `generateMetadata` cho trang public + trang nội dung | ĐÃ LÀM | `app/giai-dau/v2/[slug]/layout.js` (`generateMetadata` → `loadPublicShareData` → `buildPublicMetadata`, catch trả `robots:{index:false,follow:false}`), `app/giai-dau/v2/[slug]/noi-dung/[division]/page.js` (`generateMetadata` theo division, kiểm tra division thuộc snapshot), `app/giai-dau/v2/[slug]/shareMetadata.js` |
| 6b | Route ảnh OG mặc định | ĐÃ LÀM | `app/giai-dau/v2/[slug]/opengraph-image.js` (1200×630, 404 khi không public), `app/api/tournament-v2/public/share-image/route.js:1-66`, font Việt `app/api/tournament-v2/public/share-image/cardImage.js:1-133` (fallback SVG khi tải font lỗi) |
| 6b | 5 loại ảnh xuất khổ dọc, có watermark | ĐÃ LÀM | `lib/tournament/share.js:1-120` (`SHARE_IMAGE_KINDS` 7 kind: card + draw/schedule_court/schedule_club/standings/results/honors), khổ dọc 1080×≥1350 và watermark "tên giải + Xuất lúc … · PickHub" trong `buildShareImageModel`/`renderShareImage` (`share.js:732`, `:925`), UI `app/giai-dau/v2/ShareActions.js`, xuất PNG `app/giai-dau/v2/shareCanvas.js` |
| 6b | Mẫu text thông báo sửa được, có version | ĐÃ LÀM | `lib/tournament/share.js` (`SHARE_TEXT_TEMPLATES = ['schedule','result','call_to_court']`, `SHARE_TEXT_VERSION`), `buildShareText` tại `:408`; UI cho sửa nháp trong `<textarea>` + nhãn `Mẫu {SHARE_TEXT_VERSION}` ở `app/giai-dau/v2/ShareActions.js`; `text_template_version` nằm trong `PUBLIC_SHARE_FIELDS` (`lib/tournament/publicSnapshot.js`) |
| 6b | Kiểm tra bằng trình duyệt (preview Zalo/OG, tải PNG) | CHỈ KIỂM ĐƯỢC BẰNG TAY | Không tự động hoá được: cần mở `/giai-dau/v2/<slug>`, dán link vào Zalo/Facebook debugger, bấm "Xuất ảnh" tải PNG. Code sẵn sàng nhưng chưa có bằng chứng chạy thật |
| 7 | Wizard 7 bước theo mô hình hội tụ | ĐÃ LÀM | `app/giai-dau/v2/TournamentWizard.js:1-60` (`STEPS` 7 bước: Thông tin → Nội dung → CLB → Đội hình & Ghép cặp → Giai đoạn → Luật điểm & Tie-break → Sinh lịch) |
| 7 | Chọn chế độ tổ chức (nội bộ/giao hữu/cộng đồng) | ĐÃ LÀM | `lib/tournament/wizardModel.js` (`ORGANIZER_MODES`, `resolveOrganizerPayload` set `requires_platform_session` cho community), Wizard bước 1 render `MODE_HELP` và khoá mode sau khi tạo |
| 7 | Nhiều nội dung thi đấu (division) trong một giải | ĐÃ LÀM | `wizardModel.buildDivisionPayload` (map play_type → entrant_type), Wizard bước 2 (play_type/scoring_scope/rating_policy + cap/pairing_mode), `app/api/tournament-v2/divisions/route.js` |
| 7 | Mời CLB ngoài | ĐÃ LÀM | Wizard bước 3 (CLB nội bộ + mời CLB ngoài + review), `app/api/tournament-v2/clubs/route.js:82-121` (`mode=available`, upsert CLB ngoài, phân biệt host/invited) |
| 7 | Đăng ký cộng đồng mở | LÀM MỘT PHẦN | Chỉ tạo được giải community: `app/api/tournament-v2/tournaments/route.js:154` (`requirePlatformAdmin`). Không có luồng cá nhân/CLB tự đăng ký từ trang public, và 7 route con chỉ nhận `group_session` nên giải community không quản lý tiếp được (xem Rủi ro 4) |
| 7 | Đội hình + ghép cặp (preview/chốt, cảnh báo không chặn) | ĐÃ LÀM | Wizard bước 4 (`previewDivisionPairing`/`confirmDivisionPairing`, ghi chú "Chỉ là cảnh báo — vẫn gửi đăng ký được"), `wizardModel.summarizeRosterWarnings` luôn `blocking:false`, `canSubmitRoster`/`canApproveRoster` luôn cho phép, `app/api/tournament-v2/pairings/route.js` |
| 7 | Giai đoạn theo từng division | ĐÃ LÀM | `wizardModel.buildDivisionStagePayloads` (bắt buộc `division.id`), Wizard bước 5 gọi `saveStage` cho từng division |
| 7 | Luật điểm & tie-break theo preset, khoá khi đã bốc thăm | ĐÃ LÀM | Wizard bước 6 (`updateTournamentRules` + `buildRulesPreview` trả `scoring_source`/`tiebreak_source`/`locked`), `app/api/tournament-v2/rules/route.js:80-94` |
| 7 | Sinh lịch từ wizard | ĐÃ LÀM | Wizard bước 7 gọi `generateSchedule`; comment `TournamentWizard.js:36-39` xác nhận đã bỏ `saveEntrant` legacy; test hợp đồng `tests/phase3/wizard-competition-contract.test.js` assert 6 route không còn chạm `tournament_entrants` |

## Rủi ro kiến trúc

### 1. PRIVACY — sạch

Ba lớp chặn độc lập, không tìm thấy đường rò:

- Tầng query: `lib/publicTournamentRead.js:70` `.eq('public_slug', slug).in('visibility', ['unlisted','public'])`; `app/api/tournament-v2/public/route.js:51` cùng filter. Giải `private` không bao giờ ra khỏi DB.
- Tầng projection: `lib/tournament/publicSnapshot.js` là allowlist tường minh — `PUBLIC_TOURNAMENT_FIELDS` không có `group_id` cũng không có `share_settings`; `PUBLIC_ENTRANT_FIELDS = ['id','division_id','name','seed','color']` (không `captain_contact`, không `private_note`); `projectStageTiebreak` chỉ lấy `{version, order}` chứ không cả `stage.config`.
- Tầng domain: `lib/tournament/share.js:176-182` `assertShareable` fail `SHARE_NOT_PUBLIC`, được gọi từ cả 4 cửa vào — `buildShareUrl:292`, `buildOpenGraph:343`, `buildShareText:408`, `buildShareImageModel:732` (nên `renderShareImage:925` cũng bị chặn).

PHR chỉ hiện khi bật cờ: `lib/tournament/publicSnapshot.js:113` `tournament?.share_settings?.public_phr === true || tournament?.public_phr === true`; API tổng hợp PHR cũng gác cùng cờ tại `app/api/tournament-v2/public/route.js:85`. Trạng thái duyệt chi tiết (`changes_requested`…) không có trong allowlist và được test assert vắng mặt (`tests/phase3/share.test.js` `PRIVATE_MARKERS`).

Đầu vào duy nhất không đi qua projection là `host` (`groups.name` + `logo_url`) ở `lib/publicTournamentRead.js`, dùng để vẽ thẻ — có chủ đích, không phải dữ liệu riêng tư. `robots.index` chỉ true khi `visibility === 'public'` (`share.js:382`) nên unlisted chia sẻ được mà không index.

### 2. DOMAIN THUẦN — sạch

Grep toàn bộ `lib/tournament/**` và `lib/domain/**` cho `react`, `next/`, `@supabase`: không match.
`lib/tournament/share.js` (962 dòng) không `require` gì bên ngoài; `lib/tournament/wizardModel.js` chỉ `require('./interclub')`, `require('./rules/scoring')`, `require('./rules/tiebreak')`. `lib/publicTournamentRead.js` nằm ngoài `lib/tournament` nên dùng Supabase là hợp lệ theo mục 2 của prompt.

### 3. ROUTE MỎNG — có vi phạm

- **Chính: `app/api/tournament-v2/pairings/route.js:106-158`** — nhánh POST confirm điều phối 4 lần insert tuần tự (`tournament_pairs` → `tournament_pair_members` → `tournament_entries` → `tournament_entry_members`) trong vòng lặp, mỗi lỗi `return NextResponse.json(...)` giữa chừng ⇒ **không atomic, để lại pair mồ côi/entry thiếu member**. Đồng thời quyết định `pairing_mode` và dựng `name_snapshot` ngay trong route thay vì trong domain.
- `app/api/tournament-v2/entries/route.js:78-110` — insert hai bước không atomic (entry rồi members) và kiểm `SINGLES_ENTRY_SIZE` bằng logic inline trong route.
- `app/api/tournament-v2/clubs/route.js:82-121` — upsert CLB ngoài + quyết định host/invited nằm trong route.
- `app/api/tournament-v2/rules/route.js:11` — chính sách khoá (`LOCKED_STAGE_STATUSES`) hard-code trong route, trùng lặp với `lib/tournament/wizardModel.js:206` ⇒ hai nguồn sự thật, dễ lệch (route: `active/completed`; wizardModel: thêm `live/done`).

Không tìm thấy thuật toán ghép cặp hay toán bảng xếp hạng trong route (những phần đó nằm ở `lib/tournament/**`), nên vi phạm là về **orchestration + atomicity**, không phải về thuật toán.

### 4. AUTHZ — có lỗ hổng

- **Cả 7 route mới chỉ chấp nhận `group_session`.** `requirePlatformAdmin()` xuất hiện duy nhất ở `app/api/tournament-v2/tournaments/route.js:154` (POST giải community). Hệ quả: `community_admin` tạo được giải cộng đồng nhưng **không** tạo/sửa được division, clubs, athletes, pairings, entries, rules, registrations của chính giải đó — mutation nào cũng qua `requireValidatedGroupAdmin()` + `.eq('group_id', ...)`. Đây là mâu thuẫn trực tiếp với "quyền sở hữu thật đến từ `organizer_type`/`organizer_club_id`/platform actor".
- **GET dùng `getClubScope()` không validate role**: `divisions`, `athletes`, `entries`, `registrations` — member thường đọc được. Riêng `app/api/tournament-v2/registrations/route.js` `SELECT_FIELDS` gồm `private_note, captain_declaration` ⇒ GET trả dữ liệu nội bộ cho bất kỳ role nào trong group.
- `app/api/tournament-v2/clubs/route.js` `mode=available` liệt kê toàn bộ bảng `groups` toàn hệ thống (chấp nhận được cho tính năng mời CLB, nhưng là phơi bày danh sách tenant — nên xác nhận có chủ đích).
- Không có route nào ghi được `share_settings`: `ALLOWED_TOURNAMENT_FIELDS` trong `tournaments/route.js` bỏ `share_settings` ⇒ `poster_url`/`public_phr` chỉ đặt được bằng SQL tay.

## Việc còn thiếu thật sự

Xếp theo mức nghiêm trọng:

1. **Authorization cho platform/community trên 7 route con** — giải community hiện là "tạo rồi kẹt". Cần lớp resolve quyền dùng chung (group admin của CLB tổ chức HOẶC platform admin) thay cho `requireValidatedGroupAdmin()` thuần.
2. **Atomicity cho `pairings` confirm (và `entries` POST)** — chuyển sang một RPC/transaction như migration 034 đã làm; hiện lỗi giữa chuỗi để lại dữ liệu nửa vời.
3. **Nối 2 file test mới vào npm script** — `tests/phase3/share.test.js` và `tests/phase3/wizard-competition-contract.test.js` chạy xanh nhưng không nằm trong `test:phase3-interclub` (12 file) cũng không trong `test:regression` ⇒ CI không bảo vệ được test privacy. Đây là gap của Task 8 nhưng ảnh hưởng ngay Task 6b.
4. **Siết field ở `registrations` GET** — bỏ `private_note`/`captain_declaration` khỏi payload đọc, hoặc yêu cầu admin.
5. **Không có API set `share_settings`** — thiếu đường bật `public_phr`/`poster_url` từ UI.
6. **Rehearsal bằng tay cho Task 6b** — preview OG trên Zalo/Facebook + tải PNG thật.
7. **Luồng tự đăng ký cộng đồng** — chưa có entry point public cho cá nhân/CLB.
8. **Hợp nhất `LOCKED_STAGE_STATUSES`** — đưa về một nguồn trong `lib/tournament/**`, route import lại.
9. **Xác nhận phía CLB khách (mục 14.4)** — hiện BTC tự duyệt bản nhập hộ của chính mình; cần actor CLB riêng để `club_confirmation_status:'confirmed'` có ý nghĩa.
