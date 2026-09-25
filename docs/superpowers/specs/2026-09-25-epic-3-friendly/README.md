# Spec — Epic 3: Giải giao hữu liên CLB

Ngày: 2026-09-25 · Worktree `ranking-epic3`, nhánh `epic-3-friendly` (từ `origin/main` `ae59fc3`, đã có Epic 1 + 2)
Roadmap: `docs/superpowers/plans/2026-09-24-tournament-roadmap.md` (Epic 3) · Quyết định: `_workspace/unified-setup-ux/ADR-007-roadmap-decisions.md`
— **D38–D47** (chốt với người dùng, không bàn lại), giữ D8, D12, D17, D18, D34–D37.
Bất biến: skill `tournament-setup-invariants`. Brief Stitch: `_workspace/epic-3-friendly/01_stitch_brief.md`.
Thay thế: ADR-002 (`invitedClubs` trong bản nháp v2) — lời mời **không** còn nằm trong bản nháp (xem §3).

**Thay đổi so với bản nháp trước (viết trước D46/D47, chưa commit):**
1. Bỏ "tra CLB theo mã" và route `clubs/lookup`; **giữ** danh sách mọi CLB `GET /clubs?mode=available` (D46) — chỉ lọc
   CLB của chính mình và CLB hệ thống, không trả `groups.code`.
2. Thêm hạn mức số CLB khách mỗi giải (D46): một điểm quyết định `lib/tournament/friendlyEntitlements.js`, kiểm ở RPC mời
   **và** ở finalize, mã `FRIENDLY_CLUB_LIMIT_REACHED` (§5.1).
3. Thêm thông báo trong app (`club_notifications`, `kind` mới) và link mời có token (D47) (§5.2, §5.3). Migration 110
   thêm hai cột token.
4. Mời lại (`reinvite`) chuyển sang cùng RPC mời để một chỗ đếm hạn mức; thêm hành động `rotate_link`.
5. Ca nghiệm thu chuẩn đổi thành **2 CLB** (G1); ca ≥ 3 CLB chỉ còn ở test node / SQL với hạn mức truyền vào (§9).
6. Vá `PATCH /api/tournament-v2/tournaments`: đang **ghi đè cả** `settings` → giữ các khóa do server quản lý
   (`organizer_mode`, `friendly`) (§7.6).
7. Tách UI thành lát F3 có đủ nghiệm thu browser; thêm lát F2 viết đầy đủ.

## 1. Các file spec

| Lát | File | Nội dung | Migration | Cần Stitch |
|---|---|---|---|---|
| F1 | [lat-f1-loi-moi-va-dang-ky.md](lat-f1-loi-moi-va-dang-ky.md) | Danh sách CLB để mời, hạn mức CLB khách (D46), mời/mời lại + hạn mức cặp + hạn chót/khoá, link mời + thông báo (D47), quyền "CLB tham dự", hộp lời mời, lưu/gửi/duyệt/yêu cầu sửa danh sách cặp của CLB khách | 110 (cột roster + token trên `tournament_clubs`, 3 RPC, hàm đồng bộ thông báo) | Không |
| F2 | [lat-f2-chot-giai-va-xep-hang-clb.md](lat-f2-chot-giai-va-xep-hang-clb.md) | Bản nháp `friendly`, cặp hiệu lực (chủ nhà + CLB đã duyệt), rải CLB khi bốc thăm (D41), finalize v4 nhánh giao hữu + chặn hạn mức, tự bật link công khai, BXH tổng CLB (D40), D43 | 111 (`finalize_internal_setup_v4` dựng từ 108) | Không |
| F3 | [lat-f3-giao-dien.md](lat-f3-giao-dien.md) | Luồng setup chủ nhà (chọn loại giải, mời/duyệt/cặp khách/bốc thăm), chuông thông báo + màn mở link + hộp lời mời + đăng ký cặp của CLB khách, BXH CLB ở bàn điều hành + trang công khai; nghiệm thu browser tới cuối giải | Không | Có (FRD-01…08) |

F1 → F2 tuần tự (F2 đọc cột roster và entitlement của F1). Thiết kế Stitch làm song song với F1/F2 (D44); F3 chờ
`canonical/friendly/`. Deploy theo D45: một nhánh + PR nháp cho cả ba lát; agent apply 110/111 (ROLLBACK trước,
`md5(prosrc)` sau); người dùng chạy browser rồi tự merge.
Trước khi người dùng merge, nhánh `friendly` **không chạm được** trên production: `setupDraftV3` ở `main` ép
`organizerMode = 'internal'`, nên nhánh giao hữu của 111 và các RPC của 110 chỉ được gọi từ code mới. Riêng
`POST /clubs` cũ trên `main` vẫn chèn được dòng `tournament_clubs` không giới hạn — đó là một lý do finalize phải tự
chặn hạn mức (§5.1).

## 2. Quyết định áp dụng

| # | Quyết định | Áp vào |
|---|---|---|
| D38 | Hạn mức = **số cặp**; admin CLB khách chọn thành viên, **tự ghép cặp** (chạm hai người), gửi; chủ nhà **duyệt** hoặc **yêu cầu sửa** (không sửa hộ); **không khách mời** trong đội CLB khách | F1 (roster, máy trạng thái, RPC), F2 (finalize kiểm lại), F3 (FRD-02, FRD-06) |
| D39 | Chỉ mời CLB có trên PickHub; `tournament_external_clubs` để epic sau | F1 (`POST /clubs` từ chối CLB ngoài: `EXTERNAL_CLUB_NOT_SUPPORTED`), F2 (finalize chặn dòng CLB ngoài còn hiệu lực) |
| D40 | Giữ BXH cặp (gắn tên/màu CLB) + **bảng tổng hợp theo CLB** (tái dùng `aggregateClubStandings`) — với tài khoản thường là **đối đầu hai CLB** | F2 (`friendlyStandings.js`, API), F3 (FRD-07/08) |
| D41 | Bốc thăm **rải đều** cặp cùng CLB ra các bảng / nửa nhánh; không đủ chỗ → **cảnh báo, không chặn** (chính sách `spread_if_possible`) | F2 (`setupPlans/clubSpread.js`) |
| D42 | Hạn chót **tùy chọn**; qua hạn hoặc "Khoá đăng ký" → CLB khách không sửa được; chốt giải vẫn do chủ nhà bấm | F1 (RPC cửa sổ đăng ký; mọi hành động của khách kiểm cửa sổ; link mời hết hạn theo hạn chót) |
| D43 | Không tính vào xếp hạng nội bộ của CLB nào | F2 (`countsForRanking()` + test khoá; hiện không có pipeline nào đọc kết quả giải vào ranking) |
| D44 | UI mới làm Stitch trước; lát domain/API/migration song song | F1/F2 không có UI; F3 chờ `canonical/friendly/` |
| D45 | Nhánh + PR nháp; agent apply migration + kiểm thử tích hợp; người dùng chạy browser CLB 59 (chủ nhà) + một CLB test thứ hai (khách) rồi merge | §9 |
| **D46** | Chủ nhà thấy **danh sách mọi CLB** PickHub (giữ `mode=available`, lọc chính mình). Core mời không giới hạn; tài khoản thường **tối đa 1 CLB khách mỗi giải**; nhiều hơn là quyền lợi gói trả phí (làm sau). Kiểm ở **server**, mã lỗi ổn định | F1 (`friendlyEntitlements.js`, RPC mời), F2 (finalize), F3 (nút "Mời CLB" khoá + giải thích) — §5.1 |
| **D47** | Admin CLB khách nhận lời mời qua **thông báo trong app** (`club_notifications`) **và** **link mời**. Mở link bắt buộc đăng nhập; server so `group_id` phiên với `club_id` được mời; sai/chưa đăng nhập → từ chối, không lộ tên giải/CLB chủ nhà | F1 (token, route giải link, đồng bộ thông báo), F3 (chuông, màn mở link, đăng nhập quay lại link) — §5.2, §5.3 |
| D8 / D12 | Mọi trận BO1 theo `config.scoring`, chỉ `F`/`GF` chọn BO; không trận một bên | Không đổi — rải CLB chỉ đổi **vị trí**, không đổi cấu trúc |
| D17 | Cặp chỉ trong cùng CLB | F1 (roster chỉ chứa thành viên của chính CLB), F2 (finalize kiểm theo `club_id`) |
| D18 | Admin CLB khách tự đăng ký | F1 (quyền "CLB tham dự") |
| D34–D37 | Tỉ số, thẻ "việc tiếp theo", Kết thúc giải, không huỷ chốt lịch | Không đổi; áp nguyên cho giải giao hữu |

## 3. Mô hình dữ liệu — phương án chọn

**Chọn: tách đăng ký của CLB khách ra khỏi bản nháp.** Danh sách cặp của mỗi CLB khách nằm trên **chính dòng
`tournament_clubs` của CLB đó** (cột mới, migration 110). Bản nháp v3 của chủ nhà chỉ thêm `organizerMode: 'friendly'`
và **tham chiếu** các danh sách đã duyệt qua *khóa cặp hiệu lực* mang phiên bản duyệt. Không chọn phương án "mở rộng
bản nháp thêm chiều CLB". Không tạo bảng mới: `tournament_registrations` (0 dòng) là mô hình từng-VĐV của Phase 3, không
có khái niệm cặp tự ghép và phiên bản duyệt theo CLB; dùng nó phải thêm bảng cặp — nặng hơn mà không được gì.

Lý do:

1. **Cạnh tranh ghi.** Bản nháp là một dòng `tournament_divisions.setup_draft` khóa bằng `setup_revision`. Nếu CLB khách
   ghi vào đó, mọi lần CLB khách lưu sẽ tăng revision → chủ nhà đang soạn Bước 2/3 gặp `SETUP_REVISION_CONFLICT` liên
   tục. Tách dòng: mỗi CLB một dòng + `version` riêng → hai CLB **không bao giờ** tranh nhau; chỉ hai máy của cùng một
   CLB (hoặc chủ nhà duyệt đúng lúc khách rút lại) mới đụng `version`.
2. **Ranh giới dữ liệu (D18).** Bản nháp chủ nhà chứa `memberIds` của CLB chủ nhà; cho khách đọc/ghi một phần của nó
   buộc phải lọc từng trường. Tách dòng: mọi truy vấn của khách là `tournament_clubs WHERE id = ? AND club_id =
   session.group_id` — không có đường nào chạm roster CLB khác hay bản nháp chủ nhà.
3. **Giữ hai nguồn duy nhất.** `setupDraftV3` vẫn là normalizer duy nhất: thêm `normalizeClubRoster()` (cùng shape
   `memberIds/pairs/unpairedRefs`, dùng lại `reconcilePairs`). `buildSetupPlan` vẫn là nguồn cấu trúc duy nhất, chỉ nhận
   thêm `entryClubs` (tùy chọn) để rải CLB.
4. **Hết hạn bốc thăm tự nhiên.** Khóa cặp của CLB khách là `c<tournamentClubId>.<phiên bản duyệt>.<pairId>`; duyệt lại
   → khóa đổi → `planInputSignature` đổi → Bước 4 báo `DRAW_STALE`, finalize báo lệch. Không cần cơ chế đồng bộ riêng.
5. **Finalize không tin client.** Hàm SQL đọc danh sách đã duyệt thẳng từ `tournament_clubs` (khóa `FOR UPDATE`), kiểm
   thành viên theo `club_members.group_id = club_id` của từng CLB, đếm CLB khách so với hạn mức, rồi so với plan.

Cái giá: route preview/finalize phải ghép thêm nguồn (`loadFriendlyContext`), và `finalize_internal_setup_v4` có thêm
nhánh giao hữu (migration 111, có test khóa khác biệt với 108).

### 3.1 Cột mới trên `tournament_clubs` (migration 110, additive)

| Cột | Kiểu | Ý nghĩa |
|---|---|---|
| `roster_draft` | `jsonb NOT NULL DEFAULT '{}'` | Bản đang soạn của CLB khách: `{ memberIds, pairs:[{pairId, participantRefs}], unpairedRefs }`. **Chủ nhà không đọc** |
| `roster_submitted` | `jsonb` | Ảnh chụp lúc gửi: bản soạn + `memberNames {id: tên}` (server lấy từ `club_members`) + `pairCount`. Chủ nhà duyệt đúng ảnh này |
| `roster_submitted_at`, `roster_reviewed_at`, `responded_at` | `timestamptz` | Mốc gửi / duyệt-yêu cầu sửa / nhận lời-từ chối |
| `roster_approved_version` | `bigint` | `version` của dòng ngay sau lúc duyệt; NULL khi chưa duyệt / đã yêu cầu sửa / rút |
| `review_note` | `text` | Lý do yêu cầu sửa (2–300 ký tự), hiện cho CLB khách |
| `invite_token_hash` | `text` | `sha256` hex của token link mời (D47). NULL = không có link còn hiệu lực. Unique khi khác NULL |
| `invite_token_issued_at` | `timestamptz` | Lúc phát token hiện hành (hiện cho chủ nhà "Link tạo lúc …") |

Dòng của CLB chủ nhà vẫn do finalize tạo (`approved`) như 108; không dùng các cột roster/token.

### 3.2 Cửa sổ đăng ký (D42)

`tournaments.settings.friendly = { registrationDeadline: ISO | null, registrationLockedAt: ISO | null }`, chỉ ghi qua RPC
`set_friendly_registration_window` (merge `settings || …`, không ghi đè khóa khác). Đăng ký **mở** khi: giải là
`friendly`, division v3 `roster_lock_status = 'open'` (chưa chốt), không khoá, và `now() < registrationDeadline` (nếu có).
Không đặt trong bản nháp vì không ảnh hưởng cấu trúc và route của khách phải đọc được mà không chạm bản nháp. Khóa
`friendly` và `organizer_mode` là **khóa do server quản lý**: `PATCH /tournaments` phải giữ nguyên chúng (§7.6).

### 3.3 Chế độ giải

`organizerMode` chọn **một lần** ở lần lưu đầu (tạo giải). `_v1` (099/108) đã ghi `settings.organizer_mode` khi tạo và đã
chấp nhận `'friendly'`. Đổi chế độ sau khi giải đã tồn tại → route từ chối `ORGANIZER_MODE_LOCKED` (F2). Mọi route
friendly kiểm `tournaments.settings.organizer_mode = 'friendly'` (nguồn sự thật phía server), không kiểm bản nháp.

### 3.4 Không có bảng mới cho quyền lợi gói

DB hiện **không có** bảng gói/billing nào. Hạn mức D46 là hằng số trong `friendlyEntitlements.js` (`free: 1`); chỗ cắm gói
trả phí là hàm `resolveClubPlan()` — **làm khi có gói** (lúc đó mới thêm nơi lưu gói, migration riêng). Spec này không
tạo bảng hay cột nào cho gói.

## 4. Máy trạng thái lời mời CLB (giá trị cột `invitation_status` hiện có)

| Từ | Hành động | Ai | Tới | Điều kiện | RPC |
|---|---|---|---|---|---|
| — | `invite` | Chủ nhà | `invited` | Giải `friendly`, chưa chốt; CLB tồn tại, ≠ chủ nhà, ≠ CLB hệ thống; **còn hạn mức CLB khách** | `friendly_invite_club` |
| `declined`, `withdrawn` | `reinvite` | Chủ nhà | `invited` | Chưa chốt; **còn hạn mức**; giữ `roster_draft`; phát token mới | `friendly_invite_club` |
| `invited` | `accept` | Khách | `accepted` | Cửa sổ mở | `friendly_club_action` |
| `invited` | `decline` | Khách | `declined` | Cửa sổ mở | 〃 |
| `accepted`, `changes_requested` | `save_roster` | Khách | (giữ nguyên) | Cửa sổ mở; roster đúng shape; được vượt hạn mức cặp / lẻ người khi lưu nháp | 〃 |
| `accepted`, `changes_requested` | `submit_roster` | Khách | `roster_submitted` | Cửa sổ mở; ≥ 1 cặp; không người lẻ; số cặp ≤ hạn mức cặp; mọi người là thành viên đang hoạt động có hồ sơ thi đấu | 〃 |
| `roster_submitted` | `unsubmit` | Khách | `accepted` | Cửa sổ mở (rút lại để sửa) | 〃 |
| `roster_submitted` | `approve` | Chủ nhà | `approved` | Chưa chốt; kiểm lại hạn mức cặp + thành viên; ghi `roster_approved_version` | 〃 |
| `roster_submitted`, `approved` | `request_changes` | Chủ nhà | `changes_requested` | Cửa sổ mở (nếu đã khoá/qua hạn: mở lại trước); `review_note` bắt buộc | 〃 |
| `invited`…`approved` | `remove` | Chủ nhà | `withdrawn` | Chưa chốt; thu hồi token | 〃 |
| `accepted`…`approved` | `withdraw` | Khách | `withdrawn` | Cửa sổ mở | 〃 |
| mọi trạng thái trừ `declined`/`withdrawn` | `set_quota` | Chủ nhà | (giữ nguyên) | Hạn mức mới ≥ số cặp đã gửi/duyệt, nếu không → `FRIENDLY_QUOTA_BELOW_ROSTER` | 〃 |
| mọi trạng thái trừ `withdrawn` | `rotate_link` | Chủ nhà | (giữ nguyên) | Chưa chốt; token cũ hết hiệu lực ngay | 〃 |

Mọi hành động của `friendly_club_action` mang `expected_version`; thành công → `version + 1`. Sau chốt giải (division
`roster_lock_status ≠ open`) mọi hành động bị từ chối `FRIENDLY_REGISTRATION_CLOSED`. Bảng sống ở
`lib/tournament/friendlyClubs.js` (`FRIENDLY_TRANSITIONS`, mỗi dòng có `rpc: 'invite' | 'action'`); các dòng `rpc:
'action'` được chép vào khối `-- friendly:transitions` của RPC 110, test khóa hai bảng bằng nhau. `CLUB_TRANSITIONS` cũ
của `interclub.js` giữ nguyên (không dùng cho luồng này).

**Thông báo đi theo trạng thái** (§5.2): sau mỗi lần ghi, RPC gọi `friendly_sync_notifications(dòng)` — thông báo của CLB
khách **mở** khi trạng thái là `invited` hoặc `changes_requested`, **đóng** ở mọi trạng thái khác; thông báo "cần duyệt"
của chủ nhà **mở** khi `roster_submitted`, đóng ở trạng thái khác.

Chốt giải (F2) đòi mọi CLB khách ở `approved`, `declined` hoặc `withdrawn`; còn CLB nào khác → blocker
`FRIENDLY_CLUB_NOT_READY` (kèm tên). Cần ≥ 2 CLB có cặp → nếu không `FRIENDLY_CLUBS_TOO_FEW`. Số CLB khách `approved` >
hạn mức → `FRIENDLY_CLUB_LIMIT_REACHED`.

## 5. Hạn mức CLB khách (D46) và lời mời qua thông báo + link (D47)

### 5.1 Hạn mức — một điểm quyết định, hai chỗ chặn

`lib/tournament/friendlyEntitlements.js` (CommonJS thuần, chi tiết F1 §3.2):

```js
PLAN_GUEST_CLUB_LIMITS = { free: 1 }         // gói trả phí thêm khóa ở đây — làm khi có gói
CORE_MAX_GUEST_CLUBS   = 31                  // trần kỹ thuật: giải ≤ 32 cặp, mỗi CLB ≥ 1 cặp; không phải hạn mức kinh doanh
resolveClubPlan({ groupId }) → 'free'        // điểm cắm gói; khi có gói đổi thành async đọc nơi lưu gói
maxGuestClubsPerTournament({ plan }) → 1..31
resolveFriendlyEntitlements({ db, groupId }) → Promise<{ plan, maxGuestClubs, upgradeAvailable:false }>
countsTowardGuestLimit(status)               // mọi trạng thái trừ 'declined' | 'withdrawn'
guestClubLimitView({ maxGuestClubs, rows }) → { max, used, remaining, reached, upgradeHint }
```

"Tối đa 1 CLB khách mỗi giải" đếm các dòng CLB khách **còn hiệu lực** (`invited`…`approved`); CLB đã từ chối hoặc đã bị
rút không chiếm suất, nên chủ nhà mời được CLB khác thay. Không giới hạn số giải giao hữu một CLB tổ chức.

**Chặn ở đâu và vì sao cả hai chỗ:**

| Chỗ | Cách | Chống gì |
|---|---|---|
| RPC `friendly_invite_club` (mời + mời lại) | Tham số `p_max_guest_clubs` (bắt buộc, 1–31; NULL → `SETUP_PAYLOAD_INVALID`, *fail closed*). Đếm dòng còn hiệu lực dưới khóa `tournaments FOR UPDATE` → hai request mời song song không cùng lọt | Gọi API trực tiếp bỏ qua UI; bấm hai tab cùng lúc (race) |
| `finalize_internal_setup_v4` nhánh friendly (111) | Đọc `p_plan.friendly.maxGuestClubs` — route **tự dựng** `p_plan` trên server (client chỉ gửi fingerprint), rồi đếm CLB khách `approved` dưới khóa `FOR UPDATE` | Dòng lọt qua đường khác: `POST /clubs` cũ trên `main` (không giới hạn) trước khi merge, RPC 090 `replace_invited_clubs`, sửa tay DB, lỗi code sau này; **hạ gói** giữa lúc mời và lúc chốt |

Vì sao **truyền hạn mức vào** SQL thay vì SQL tự đọc: DB chưa có nơi lưu gói; viết cứng `1` trong SQL tạo **điểm quyết
định thứ hai** phải sửa bằng migration khi có gói (lệch nhau là lỗ hổng). Truyền vào thì JS là điểm quyết định duy nhất,
SQL là chỗ thực thi. Giá trị không bao giờ đến từ client: body không có trường này (allowlist), RPC chỉ `service_role` gọi
được, `p_plan` do route dựng lại. Với finalize, đặt trong `p_plan` (không thêm tham số) để giữ nguyên chữ ký 7 tham số —
`CREATE OR REPLACE` được, không cần `DROP FUNCTION`, không sinh overload mơ hồ với code `main`; `md5(p_plan)` đã nằm
trong dấu vân idempotency nên chạy lại với hạn mức khác bị `IDEMPOTENCY_KEY_REUSED`.

Mã lỗi ổn định `FRIENDLY_CLUB_LIMIT_REACHED` (HTTP 409, `params: { max }`): "Tài khoản CLB thường mời được tối đa {max}
CLB khách cho mỗi giải. Mời nhiều CLB hơn là quyền lợi của gói trả phí (sắp ra mắt)." UI: nút "Mời CLB" bị khoá kèm
đúng câu này khi `limit.reached` (F3, FRD-01).

### 5.2 Thông báo trong app — tái dùng `club_notifications`

| Trường | CLB khách (việc: trả lời / sửa danh sách) | Chủ nhà (việc: duyệt danh sách) |
|---|---|---|
| `group_id` | `tournament_clubs.club_id` (CLB khách) | `tournament_clubs.group_id` (chủ nhà) |
| `kind` | `tournament_invitation` | `tournament_roster_review` |
| `subject_type` / `subject_id` | `tournament_club` / `tournament_clubs.id` | như bên trái |
| `payload` | `{ reason: 'invited' \| 'changes_requested', tournamentName, hostClubName, eventDate }` | `{ reason: 'roster_submitted', tournamentName, guestClubName, pairCount }` |
| Mở khi | trạng thái vào `invited` / `changes_requested` | trạng thái vào `roster_submitted` |
| Đóng (`resolved`) khi | trạng thái rời hai giá trị trên (nhận lời, từ chối, gửi lại, bị rút, rút) | trạng thái rời `roster_submitted` |

Ghi **trong cùng transaction** với thay đổi trạng thái (hàm nội bộ `friendly_sync_notifications` của 110, không cấp quyền
thực thi cho ai) → không bao giờ lệch "lời mời đã đáp mà thông báo còn mở". Mở lại dùng unique sẵn có
`(group_id, kind, subject_type, subject_id)`: `ON CONFLICT … DO UPDATE SET status='open', resolved_at=NULL, payload=…,
created_at=now()`. `app/api/club/notifications/route.js` đã trả **mọi** `kind` đang mở của CLB → chỉ cần thêm chiếu hiển
thị (`display: { title, body, href, actionLabel }`) và dọn thông báo mồ côi (giải bị xoá). `PhNotificationBell` hiện coi
mọi mục là giao dịch → F3 phải rẽ nhánh theo `kind` **cùng PR** (nếu không, lời mời hiện thành "0đ chưa rõ người nộp").

### 5.3 Link mời — token chỉ là "địa chỉ", quyền do so khớp CLB

- **Phát:** route sinh `crypto.randomBytes(32).toString('base64url')` (43 ký tự) khi mời / mời lại / `rotate_link`; chỉ
  **băm** `sha256` được đưa vào RPC và lưu ở `invite_token_hash`. Token thô trả cho chủ nhà **một lần** trong response
  (`inviteUrl = <origin>/giai-dau/moi/<token>`).
- **Lưu băm, không lưu thẳng:** cùng quy ước với token trọng tài (036) và QR check-in (040); ai đọc được DB (log, bản
  sao lưu, công cụ quản trị) cũng không dựng lại được link. Cái giá: chủ nhà không xem lại link cũ — bấm "Tạo link mới"
  (link cũ hết hiệu lực). Chấp nhận được vì kênh chính là thông báo trong app; link chỉ để gửi qua Zalo.
- **Thu hồi:** `remove` → `invite_token_hash = NULL`; `rotate_link` / `reinvite` → băm mới thay băm cũ.
- **Hết hạn:** không lưu hạn riêng; link dùng được khi dòng còn hiệu lực **và** cửa sổ đăng ký mở (chưa chốt, chưa khoá,
  chưa qua `registrationDeadline` nếu có). Đổi hạn chót thì link tự theo.
- **Mở link:** trang `/giai-dau/moi/[token]` gọi `POST /api/tournament-v2/friendly/invite-links/resolve { token }`:

| Thứ tự kiểm | Kết quả | Lộ gì |
|---|---|---|
| 1. Không có `group_session` hợp lệ (kể cả chỉ có vé VĐV) | 401 `UNAUTHENTICATED` + `loginUrl = /?dang-nhap=clb&next=/giai-dau/moi/<token>` | Không gì |
| 2. Token sai định dạng / không khớp băm / dòng `withdrawn` | 404 `FRIENDLY_INVITE_LINK_INVALID` | Không gì |
| 3. `session.group_id ≠ tournament_clubs.club_id` | 403 `FRIENDLY_INVITE_WRONG_CLUB` + `currentClubName` (tên CLB **của chính phiên**) | Không tên giải, không CLB chủ nhà |
| 4. Đúng CLB nhưng `role ≠ admin` | 403 `GROUP_ADMIN_REQUIRED` | Không gì |
| 5. Đúng CLB, admin, cửa sổ đã đóng | 410 `FRIENDLY_INVITE_LINK_EXPIRED` + `invitationId` (xem lời mời chỉ đọc) | Chỉ cho đúng CLB |
| 6. Hợp lệ | 200 `{ invitationId }` → chuyển `/giai-dau/loi-moi/<id>` | — |

Rate limit `consumeRateLimit('invite-link:' + clientId, 30 lần / 10 phút)`. Sau bước 3–6, mọi đọc/ghi tiếp theo đi đường
`requireParticipantClubAccess` (so `club_id` ngay trong câu truy vấn) — token không cấp thêm quyền gì.

## 6. Luồng đầu-cuối và ma trận quyền

```text
Chủ nhà (CLB 59)                                        CLB khách (vd CLB 19)
1. Tạo giải, chọn "Giao hữu liên CLB" (một lần, Bước 1)
2. Bước 2: chọn thành viên mình; khối "CLB tham dự":
   danh sách mọi CLB (GET /clubs?mode=available) → Mời
   + hạn mức cặp (POST /clubs → RPC friendly_invite_club)
   → nhận link mời, sao chép gửi Zalo (tùy chọn).
   Đủ 1 CLB → nút "Mời CLB" khoá + gợi ý gói (D46).
   Đặt hạn chót (POST /friendly/window)                   3. Chuông "Việc cần xử lý": "CLB 59 mời giải …"
                                                             hoặc mở link → đăng nhập (nếu cần) → lời mời
                                                             → Nhận lời (POST …/invitations/:id accept)
                                                          4. Đăng ký cặp: chọn thành viên, chạm hai người →
                                                             Ghép cặp; Lưu nháp / Gửi danh sách
5. Chuông: "CLB 19 gửi 3 cặp — cần duyệt" → Duyệt
   hoặc Yêu cầu sửa + lý do                               6. Chuông: "Cần sửa: …" → sửa → Gửi lại
7. (Tùy chọn) Khoá đăng ký
8. Bước 3: ghép cặp mình; cặp CLB khách chỉ đọc,
   nhóm theo CLB; tổng số cặp = mình + đã duyệt
9. Bước 4: bốc thăm (rải CLB, cảnh báo nếu không đủ chỗ)
   → Chốt giải (finalize v4 nhánh friendly, tự bật link
   công khai nếu đang riêng tư)                           10. Hộp lời mời: "Đã chốt · Xem trang giải"
11. Điều hành như giải nội bộ (Epic 2) tới Kết thúc giải
12. Sơ đồ & xếp hạng: BXH cặp (chip CLB) + BXH CLB
    (đối đầu hai CLB); trang công khai tab Xếp hạng "Cặp · CLB"
```

| Tài nguyên | Admin chủ nhà | Thành viên chủ nhà | Admin CLB khách được mời | Thành viên CLB khách | Admin CLB không được mời | Ẩn danh |
|---|---|---|---|---|---|---|
| Danh sách mọi CLB (`/clubs?mode=available`) — `id`, `name` | R | — | R (cho giải của họ) | — | R (cho giải của họ) | — |
| Danh sách CLB của giải + ảnh chụp đã gửi + hạn mức | R/W | — | — | — | 404 | — |
| `roster_draft` của CLB khách | **Không đọc** | — | R/W (của mình) | — | 404 | — |
| Thông tin lời mời (tên giải, ngày, địa điểm, CLB chủ nhà, thể thức, hạn chót, hạn mức cặp, ghi chú mời, trạng thái, lý do yêu cầu sửa) | R | — | R (dòng của mình) | — | 404 / 403 qua link (không lộ tên) | 401 qua link |
| Thông báo `tournament_invitation` | — | — | R (của CLB mình) | — | — | — |
| Thông báo `tournament_roster_review` | R | — | — | — | — | — |
| Danh sách/số cặp của CLB khách khác trước chốt | R | — | **Không** | — | 404 | — |
| Bản nháp setup, bốc thăm, finalize | R/W | — | — | — | 404 | — |
| Bàn điều hành | R/W | R (hiện có) | — (dùng trang công khai) | — | 404 | — |
| Trang công khai | theo `visibility` | 〃 | 〃 | 〃 | 〃 | 〃 |

Thực thi: `access.js` thêm `resolveParticipantClubAccess` (thuần); `accessRuntime.js` thêm
`requireParticipantClubAccess({ tournamentClubId })` — **truy vấn** luôn có `.eq('club_id', session.group_id)` (không chỉ
kiểm sau khi đọc), không khớp → 404 `TOURNAMENT_NOT_FOUND` (không lộ giải tồn tại). Route của khách **không** dùng
`access.groupId` để liệt kê bảng nào; chỉ dùng `tournamentClubId` đã khóa theo `club_id`. `requireTournamentAccess` giữ
nguyên hành vi (khách không bao giờ được `write` trên giải của CLB khác).

## 7. Bảo mật đa CLB

1. **Danh sách CLB (D46).** `GET /clubs?mode=available` chỉ trả `{ id, name }` của `groups` (bỏ CLB của phiên và
   `PICKHUB_SYSTEM_GROUP_ID`), **không bao giờ** trả `code` (mã đăng nhập CLB), `logo_url` (data-URL nặng), liên hệ. Người
   dùng đã chấp nhận việc lộ tên CLB (không còn coi là lỗ hổng).
2. **RLS.** `tournament_clubs` và `club_notifications` đã bật RLS (030/088), server dùng service role. Preflight:
   `select * from pg_policies where tablename in ('tournament_clubs','club_notifications')` phải không có policy cho
   `anon`/`authenticated`. RPC mới: `SECURITY DEFINER`, `SET search_path = public`, `REVOKE ALL … FROM PUBLIC, anon,
   authenticated`, `GRANT EXECUTE … TO service_role` (riêng `friendly_sync_notifications`: không GRANT cho ai).
3. **Chiếu dữ liệu theo allowlist.** `projectInvitationForGuest()` / `projectClubForHost()` (thuần, `friendlyClubs.js`):
   khách không bao giờ nhận `group_id` chủ nhà ngoài tên/logo, dòng CLB khác, `roster_draft` CLB khác, số điện thoại,
   `captain_contact_profile_id`, `invite_token_hash`. Chủ nhà nhận `roster_submitted` (tên snapshot) nhưng **không** nhận
   `roster_draft`, cũng không nhận `invite_token_hash`.
4. **Không tin client.** Phía (`host`/`guest`), `p_actor_group_id`, `p_max_guest_clubs`, băm token truyền vào RPC do route
   suy từ phiên / entitlement / `crypto`; body chỉ mang `action`, `expected_version`, `roster`, `note`, `quota`.
5. **Cạnh tranh ghi.** Mỗi CLB một dòng → không tranh nhau giữa CLB. Trong một dòng: `UPDATE … WHERE version =
   expected` → 0 dòng = `FRIENDLY_CLUB_VERSION_CONFLICT` (SQLSTATE `PH409`). Mời vs mời (hạn mức): khóa `tournaments FOR
   UPDATE`. Khoá đăng ký vs gửi danh sách: RPC của khách giữ `tournaments FOR SHARE`, RPC cửa sổ lấy `FOR UPDATE` → tuần
   tự. **Thứ tự khoá thống nhất** (tránh deadlock với finalize 108 và `_v1`): `tournament_divisions` → `tournaments` →
   `tournament_clubs` → `club_notifications`.
6. **`PATCH /api/tournament-v2/tournaments` ghi đè cả `settings`.** Hiện `buildTournamentPayload` gán `settings = body.settings`
   → một lần sửa thông tin giải xoá `settings.friendly` (mất khoá đăng ký) hoặc đổi `organizer_mode`. F1 sửa: đọc `settings`
   hiện có, `{ ...body.settings, organizer_mode: cũ, friendly: cũ }` (khóa server quản lý — `SERVER_OWNED_SETTINGS_KEYS`).
7. **Chốt giải vs khách đang ghi.** Finalize khoá mọi dòng CLB khách `FOR UPDATE` sau division/tournament; RPC khách kiểm
   `roster_lock_status = 'open'` sau khi khoá → sau chốt mọi ghi của khách bị từ chối.
8. **Link mời.** Token 256 bit, lưu băm, rate limit, không lộ tên cho phiên sai CLB (§5.3); tham số `next` của trang
   đăng nhập chỉ nhận đường dẫn nội bộ khớp `^/giai-dau/(moi|loi-moi)(/[A-Za-z0-9_-]+)?$` (chống open redirect).

## 8. Thay đổi `finalize_internal_setup_v4` (tóm tắt — chi tiết F2 §6)

Migration **111** dựng từ **108** (bản mới nhất có hàm này; 109 là `prepare_tournament_after_finalize`, không đụng
finalize). Số 110/111 kiểm lại `ls database/migrations` trên `origin/main` ngay trước khi apply (roadmap §1.3). Chỉ khác
108 ở:

1. Bản nháp: `organizerMode ∈ {internal, friendly}`; `friendly` đòi `tournaments.settings->>'organizer_mode' = 'friendly'`.
2. Khối `friendly` (đánh dấu `-- friendly:begin` / `-- friendly:end`): đọc `p_plan.friendly.maxGuestClubs` (1–31); khoá
   dòng CLB khách; trạng thái `approved|declined|withdrawn` (`FRIENDLY_CLUB_NOT_READY`); CLB ngoài còn hiệu lực →
   `EXTERNAL_CLUB_NOT_SUPPORTED`; số CLB khách `approved` ≤ hạn mức (`FRIENDLY_CLUB_LIMIT_REACHED`); dựng cặp khách từ
   `roster_submitted` với khóa `c<id>.<roster_approved_version>.<pairId>`; tập khóa khách của plan phải bằng tập dựng được
   (`FRIENDLY_ROSTER_CHANGED`); ref chỉ `member:<id>` (`FRIENDLY_GUEST_NOT_ALLOWED`, D38); thành viên đang hoạt động
   **trong `club_members.group_id = club_id`** (D17, `MEMBER_NOT_ACTIVE_IN_GROUP`); có `athletes`
   (`ATHLETE_IDENTITY_MISSING`); số cặp ≤ `quota` (`FRIENDLY_QUOTA_EXCEEDED`); một `athlete_id` không ở hai CLB
   (`FRIENDLY_ATHLETE_DUPLICATE`); ≥ 2 CLB có cặp (`FRIENDLY_CLUBS_TOO_FEW`).
3. `v_pairs = cặp bản nháp || cặp khách`; phần kiểm cặp của 108 đổi `v_draft->'pairs'` → `v_pairs`, **trừ** mệnh đề "ref
   thuộc người tham gia của bản nháp" (chỉ áp cho cặp chủ nhà; cặp khách đã kiểm trong khối friendly).
4. Ghi: khối friendly riêng ghi VĐV/cặp/entry của CLB khách với `tournament_club_id` = dòng CLB đó và
   `club_name_snapshot = groups.name`. Phần ghi của chủ nhà, stage, trận, tuyến **không đổi một ký tự**.
5. Test khóa `tests/stitch-setup/epic-3/f2-api-contract.test.js`: bỏ các khối `friendly`, đảo `v_pairs → v_draft->'pairs'`
   và danh sách `organizerMode` → thân hàm bằng đúng 108.

## 9. Ca nghiệm thu chuẩn

**CLB test:** chủ nhà **59** "CLB Test 23.9.2026" (20 thành viên). CLB khách: đề xuất **19** "CLB Test Responsive UI"
(10 thành viên) — **CẦN NGƯỜI DÙNG XÁC NHẬN** (và có mật khẩu admin của CLB đó). Không đụng group 1. Preflight: 6 thành
viên CLB khách dùng trong ca phải có `athletes.legacy_club_member_id` (thiếu → `FRIENDLY_ATHLETE_ID_MISSING` khi gửi;
người dùng bổ sung hồ sơ trước, agent không tự tạo dữ liệu thật).

**G1 (chuẩn, browser, 2 CLB — tài khoản thường):** 59 = **4 cặp** (8 người), CLB khách = **3 cặp** (6 người) → **7 cặp**;
vòng bảng → loại trực tiếp, 2 bảng × 2 suất (tổ hợp `2x2`).

```text
Rải CLB (D41, chia theo CLB rồi chia bài — F2 §4):
  Bảng A (4 cặp) = 2 cặp CLB 59 + 2 cặp CLB khách → 6 trận: 4 liên CLB, 2 nội bộ (59–59, khách–khách)
  Bảng B (3 cặp) = 2 cặp CLB 59 + 1 cặp CLB khách → 3 trận: 2 liên CLB, 1 nội bộ (59–59)
  Vòng bảng: 9 trận (6 liên CLB + 3 nội bộ)
  Bán kết: Nhất A – Nhì B, Nhất B – Nhì A → 2 trận
  Chung kết: 1 trận
  TỔNG: 12 trận (13 nếu bật tranh hạng ba)
Cảnh báo (không chặn): FRIENDLY_CLUB_SPREAD_LIMITED cho CLB 59 (4 cặp > 2 bảng) và CLB khách (3 cặp > 2 bảng)
BXH CLB (D40, đối đầu): chỉ tính trận liên CLB đã chốt → sau vòng bảng mỗi CLB "đã đấu" = 6;
  cuối giải mỗi CLB "đã đấu" = 6 + số trận loại trực tiếp liên CLB (0–3, tùy kết quả);
  bất biến: thắng(59) + thắng(khách) = đã đấu(59) = đã đấu(khách)
```

| Ca | Mức | Cấu hình | Số trận kỳ vọng | Kiểm riêng |
|---|---|---|---|---|
| **G1** | Browser + SQL | Như trên (hạn mức mặc định 1) | **12** (13 có hạng ba) | Rải CLB đúng bảng trên; 2 cảnh báo; BXH CLB 2 dòng |
| G1-limit | Browser + SQL | Sau khi mời CLB khách thứ nhất, thử mời CLB thứ hai | — | Nút "Mời CLB" khoá + câu gói trả phí; gọi thẳng API → 409 `FRIENDLY_CLUB_LIMIT_REACHED`; khách thứ nhất từ chối → mời được CLB khác |
| G1-link | Browser | Link mời mở bằng: chưa đăng nhập → đăng nhập CLB khách → quay lại; phiên CLB 59; phiên thành viên CLB khách; sau khi khoá | — | Lần lượt: tới lời mời; `FRIENDLY_INVITE_WRONG_CLUB` không lộ tên; `GROUP_ADMIN_REQUIRED`; `FRIENDLY_INVITE_LINK_EXPIRED` + xem chỉ đọc |
| G-core3 | Node + SQL (hạn mức truyền **2**) | 3 CLB: 59 = 3 cặp, khách A = 2, khách B = 2 → 7 cặp, `2x2` | **12** (13) | Bảng A = 2 cặp 59 + 1 A + 1 B, bảng B = 1 cặp 59 + 1 A + 1 B; cảnh báo chỉ cho CLB 59; 8 trận vòng bảng liên CLB, 1 nội bộ; với hạn mức 1 → mời B bị `FRIENDLY_CLUB_LIMIT_REACHED`, finalize với 2 CLB `approved` và `maxGuestClubs = 1` → `FRIENDLY_CLUB_LIMIT_REACHED` |
| G-core3-KO | Node | 3 CLB × 2 cặp = 6 cặp, loại trực tiếp (nhánh 8, 2 bye) | **5** (6 có hạng ba) | Hai cặp cùng CLB luôn ở hai nửa nhánh; không cảnh báo |
| G2-KO | Node | 2 CLB: 59 = 4, khách = 3 → 7 cặp loại trực tiếp (nhánh 8, 1 bye) | **6** (7 có hạng ba) | Nửa có 4 cặp = 2 cặp 59 + 2 cặp khách, nửa có 3 cặp (chứa bye) = 2 + 1; cảnh báo cho cả hai CLB (mỗi CLB > 2 cặp) |
| G3 (âm) | Browser | CLB khách còn `roster_submitted` lúc bốc thăm | — | Bước 3 blocker `FRIENDLY_CLUB_NOT_READY`; duyệt xong mới bốc |
| G4 (âm) | SQL + browser | Khách gửi sau khi chủ nhà bấm Khoá đăng ký / qua hạn | — | `FRIENDLY_REGISTRATION_CLOSED`, trạng thái không đổi |
| G5 (âm) | SQL | Hai tab CLB khách cùng lưu | — | Tab sau `FRIENDLY_CLUB_VERSION_CONFLICT`, tải lại thấy bản của tab trước |
| Hồi quy | Node | Ca 14 người nội bộ (không CLB) | **12** (13) | Fingerprint plan **bằng đúng** trước Epic 3 (không rải khi chỉ một CLB) |

Browser (F3 §9, người dùng, D45): G1 chạy **tới cuối** trên 390px và desktop.

## 10. Ngoài phạm vi

CLB ngoài hệ thống (D39); MLP đội = CLB (Epic 5); tính ranking (D43); gói trả phí thật, trang nâng cấp, thanh toán (D46 —
chỉ có điểm cắm); thông báo Zalo/SMS/đẩy (chỉ trong app + link); lệ phí; chủ nhà sửa hộ danh sách khách (D38); chủ nhà
chỉ tổ chức mà không có cặp (Bước 2 vẫn đòi ≥ 2 người của chủ nhà); rải CLB ở vòng loại trực tiếp **sau** vòng bảng (tuyến
`group_rank` cố định 1A–2B); nhật ký thao tác cho hành động mời/duyệt (bản đầu không ghi); đổi chế độ nội bộ ↔ giao hữu
sau khi tạo.

## 11. Câu hỏi còn mở

1. **CLB khách để nghiệm thu:** dùng group **19** "CLB Test Responsive UI" (cần người dùng có mật khẩu admin CLB này và
   bổ sung hồ sơ thi đấu cho 6 thành viên nếu thiếu)? Nếu không, người dùng chỉ định CLB test khác (không phải group 1).
2. **Khách mời của CLB chủ nhà trong giải giao hữu:** D38 chỉ cấm khách mời ở đội CLB khách. Spec mặc định **cho phép**
   chủ nhà giữ khách mời như Bước 2 hiện nay, và khách mời tính vào CLB chủ nhà trong BXH CLB. Nếu người dùng muốn cấm cả
   phía chủ nhà thì chỉ thêm một blocker Bước 2 (`FRIENDLY_HOST_GUEST_NOT_ALLOWED`), không đổi mô hình.
3. **Tự bật link công khai khi chốt giải giao hữu:** thành viên CLB khách không vào được bàn điều hành của CLB khác, nên
   spec mặc định: chốt giải giao hữu mà `visibility = 'private'` → chuyển `unlisted` và sinh `public_slug` (Bước 4 báo
   trước "Giải giao hữu sẽ có link xem không liệt kê để CLB khách theo dõi"). Nếu người dùng muốn giữ riêng tư thì bỏ
   bước này và hộp lời mời chỉ hiện "Chủ nhà chưa bật link xem giải".
