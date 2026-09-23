# Lát 0 — Nền tảng chung

Trạng thái: spec chờ duyệt · Không deploy riêng (đi cùng Lát A) · Xem [README](README.md)

## 1. Mục tiêu và phạm vi

Kết thúc Lát 0:

- Nhánh recovery khớp production (migration 097/098), có nguồn Stitch, skill invariants, bảng triage snapshot.
- Có draft aggregate v3 thống nhất, lưu từng bước, khôi phục, chống ghi đè và UI bốn bước theo Stitch.
- Có ghép cặp chạm-hai-người và khách mời ở mức nháp.
- Có registry thể thức, trong đó cả ba thể thức đều khóa `Sắp có`.

Không thuộc Lát 0: preview/finalize thật, xếp hạng chéo bảng, BO chung kết (thuộc Lát A).

## 2. Preflight (P0) — làm trước mọi code

| Mã | Việc | Tiêu chí xong |
|---|---|---|
| P0.1 | Xác minh Git: nhánh recovery sạch, base `29e33c6` | `git status` sạch, ghi SHA vào `_workspace/stitch-setup/P0-preflight.md` |
| P0.2 | Mang `097_fix_aggregate_draft_v3_roundtrip.sql`, `098_generalize_internal_doubles_finalize.sql` và `database/tests/` liên quan từ snapshot | SHA-256 định nghĩa hàm `finalize_internal_doubles_group_knockout_v2` trên production = `83b5076f…792ee` (đã khớp 2026-09-23). Với 097: so `pg_get_functiondef` đã chuẩn hóa khoảng trắng với thân hàm trong file. Commit riêng: `chore(db): ghi nhận migration 097/098 đã chạy trên production` |
| P0.3 | Kiểm tra 091/094 | So định nghĩa hàm production với bản git và bản snapshot. Ghi kết luận. Nếu production chạy bản snapshot thì tạo migration `099_*` tái lập đúng định nghĩa đó; không sửa file 091/094 |
| P0.4 | Copy Stitch vào `_workspace/stitch-internal-setup/` + `stitch-source-manifest.json` (`path`, `role`, `bytes`, `sha256`) | Manifest đủ 5 màn + `DESIGN.md`; commit |
| P0.5 | Mang `.claude/skills/tournament-setup-invariants/SKILL.md` sang, chưa sửa nội dung | Commit |
| P0.6 | Triage 34 file sửa + file mới của snapshot | `_workspace/stitch-setup/P0-snapshot-triage.md`: mỗi file ghi `mang sang` / `làm lại` / `bỏ` + lý do + test chứng minh. Chỉ mang sang file `mang sang` |
| P0.7 | Đọc live: bảng/cột/constraint của `tournament_athletes`, `tournament_stage_transitions`, `tournament_matches`, `tournament_setup_mutations`; grants/`search_path` các RPC setup; kiểm tra đã có unique index `(tournament_id, client_ref)` chưa | Ghi vào `P0-preflight.md`. Chỉ đọc, không DDL |

Mọi bước chỉ đọc production. Tuyệt đối không reset/drop/truncate.

## 3. Draft aggregate v3

`tournament_divisions.setup_draft` giữ JSON dưới đây (RPC 097 lưu nguyên snapshot). Client và server dùng chung một normalizer duy nhất: `lib/tournament/setupDraftV3.js`. Mọi file khác không được tự đọc hay đổi shape.

```js
{
  draftVersion: 3,
  currentStep: 1|2|3|4,
  progress: { completedThrough: 0|1|2|3 },      // server ghi, client không được tự nâng
  tournament: {
    name, eventDate /* YYYY-MM-DD */, startTime /* HH:mm */, courtCount /* 1–20 */,
    location, description, posterUrl, organizerMode: 'internal'
  },
  division: { name, playType: 'doubles' },
  participants: {
    memberIds: string[],                          // bắt buộc theo 097
    guests: [{ clientRef, displayName }]          // clientRef: ^[A-Za-z0-9_-]{8,64}$
  },
  format: {
    entrantType: 'doubles',
    formatKey: 'group_knockout'|'round_robin'|'knockout'|null,
    config: { /* theo từng lát */ }
  },
  pairs: [{ pairId, participantRefs: [ref, ref], locked: boolean }],
  unpairedRefs: ref[],
  draw: {
    status: 'none'|'draft'|'stale',
    seed: string|null,                            // server sinh, UI không bao giờ hiển thị
    previewFingerprint: string|null,
    plan: SetupPlan|null                          // do buildSetupPlan trả về (Lát A)
  },
  invalidation: { reasonCodes: string[], earliestStep: 1|2|3|4|null }
}
```

- `ref` là `member:<memberId>` hoặc `guest:<clientRef>`. Một người có đúng một ref. Tên chỉ là snapshot để hiển thị, không dùng làm định danh.
- Không còn các trường `selectedMemberIds`, `reserveMemberIds`, `inactiveSelectedMemberIds`, `invitedClubs` trong v3.
- Adapter đọc một chiều: draft v2 có `selectedMemberIds` được chuyển thành `memberIds`; `pairs[].memberIds` thành `participantRefs`; `reserveMemberIds` đưa về `unpairedRefs`. `draw` được đánh dấu `stale`. Không ghi đè khi chỉ đọc; chỉ ghi khi người dùng bấm lưu.
- Adapter phải trả về shape mà RPC 097 chấp nhận: `participants.memberIds` là mảng.

## 4. Lưu từng bước

### 4.1 Validator bước (server, JS thuần)

`lib/tournament/setupStepRules.js`: `validateStep(draft, step) → { ok, blockers[], warnings[] }`. Route `save_aggregate` gọi hàm này cho bước đang lưu, rồi đặt `progress.completedThrough` trước khi gọi RPC. Client được dùng cùng hàm để báo lỗi sớm, nhưng giá trị server mới là quyết định.

| Bước | Blocker (chặn sang bước sau) | Warning |
|---|---|---|
| 1 | `TOURNAMENT_NAME_REQUIRED`, `EVENT_DATE_REQUIRED`, `START_TIME_REQUIRED`, `COURT_COUNT_INVALID` (ngoài 1–20) | `EVENT_DATE_IN_PAST` |
| 2 | `ROSTER_EMPTY` (tổng < 2 người), `MEMBER_OUTSIDE_GROUP`, `ATHLETE_ID_MISSING` (chỉ với member), `GUEST_NAME_INVALID` (trim 2–60 ký tự), `GUEST_REF_DUPLICATE` | `INACTIVE_MEMBER_SELECTED`, `GUEST_NAME_MATCHES_MEMBER` |
| 3 | `FORMAT_REQUIRED`, `FORMAT_NOT_AVAILABLE`, `UNPAIRED_MEMBER`, `PAIR_MEMBER_COUNT_INVALID`, `PAIR_COUNT_BELOW_MINIMUM`, `FORMAT_CONFIG_INVALID` | `PAIR_COUNT_OUTSIDE_RECOMMENDED` |
| 4 | (Lát A) `DRAW_REQUIRED`, `DRAW_STALE` | (Lát A) `GROUP_SIZE_IMBALANCE` |

- Nháp chưa hợp lệ vẫn được lưu. Khi đó `completedThrough` không tăng, và nếu bước đó nhỏ hơn mức cũ thì mức cũ bị hạ xuống.
- Chỉ mở bước N khi `completedThrough ≥ N-1`. Vào URL `?step=N` khi chưa được mở thì bị chuyển về bước `completedThrough+1`. Stepper cũng không cho bấm vượt.

### 4.2 Trạng thái lưu (UI)

`Chưa lưu` · `Có thay đổi chưa lưu` · `Đang lưu` · `Đã lưu lúc HH:mm` · `Lưu thất bại`. Cấm hiện "Đã lưu tự động".

- Nút `Tiếp tục` chỉ hoạt động khi bước sạch (không có thay đổi chưa lưu) và server đã xác nhận `completedThrough ≥ bước hiện tại`. Nếu còn thay đổi chưa lưu thì nút đổi thành `Lưu & tiếp tục`: lưu trước, thành công mới chuyển bước.
- Rời bước (quay lại, bấm stepper, back của trình duyệt, đóng tab) khi đang có thay đổi chưa lưu: hiện hộp thoại `Lưu` / `Bỏ thay đổi chưa lưu` / `Ở lại`. Đóng tab dùng `beforeunload`.
- Mỗi lần lưu có `idempotencyKey` riêng. Thử lại sau timeout dùng lại đúng key đó.
- Response trả về muộn (so theo sequence của request) không được ghi đè edit mới hơn. Giữ nguyên hành vi `hydrate` của `SetupContext`: đang dirty/saving thì bỏ qua dữ liệu hydrate.
- `SETUP_REVISION_CONFLICT`: giữ dữ liệu đang nhập, hiện `Bản nháp vừa được sửa ở nơi khác` với hai lựa chọn `Tải bản mới (mất thay đổi của tôi)` / `Giữ lại để so sánh`. Không bao giờ tự ghi đè.

### 4.3 Vô hiệu hóa (stale)

| Thay đổi | Làm stale | Không động tới |
|---|---|---|
| Thêm người | `draw` | Các cặp hiện có (người mới vào `unpairedRefs`) |
| Bỏ người | `draw`; tách đúng cặp chứa người đó | Các cặp khác, kể cả cặp chưa khóa |
| Đổi `formatKey`/`config` | `draw` | Cặp |
| Ghép/tách/khóa cặp | `draw` | Người tham gia |
| Đổi Bước 1 (trừ `courtCount`/`startTime`) | Không | — |
| Đổi `courtCount`/`startTime` | Chỉ phần ước tính giờ | Draw |

Không bao giờ tự bốc lại. `invalidation.earliestStep` quyết định banner "Cần bốc thăm lại" ở Bước 4.

## 5. Người tham gia (Bước 2)

- Nguồn thành viên: roster CLB theo `group_id` trong session. Lọc `Đang hoạt động` (mặc định) / `Tất cả`. Tìm theo tên hoặc biệt danh.
- Các thao tác: `Chọn tất cả đang hiển thị`, `Chọn toàn bộ thành viên đang hoạt động`, `Bỏ chọn tất cả`. Người đã chọn nhưng bị bộ lọc ẩn vẫn giữ nguyên trạng thái chọn.
- Khách mời: có ô nhập tên và nút `Thêm khách mời`. `clientRef` sinh bằng `crypto.randomUUID()` một lần và không đổi khi sửa tên. `Sửa tên` và `Xóa` thao tác trên từng khách.
- Trùng tên (giữa khách với thành viên, hoặc giữa hai thành viên) chỉ là cảnh báo. Không gộp người.
- Hiển thị `Trình độ` nếu có `phr_rating`; thiếu thì hiện `Chưa có`. Không chặn, không hiện nhãn DUPR, không hiện `Athlete_ID`.
- Server kiểm tra: mọi `memberId` thuộc đúng `group_id` và map được `athletes.legacy_club_member_id`. Guest không cần `athlete_id`.

## 6. Ghép cặp chạm-hai-người (Bước 3)

Máy trạng thái trong `lib/tournament/pairingDraft.js` (thuần). File này thay cho mọi logic ghép cặp khác.

```text
idle ──chọn A──▶ first(A) ──chọn B≠A──▶ ready(A,B) ──Ghép cặp──▶ idle (tạo pair)
  ▲               │ chọn lại A / Esc        │ chọn lại B → first(A); chọn lại A → first(B); Esc → idle
  └───────────────┴─────────────────────────┘
```

- Chỉ chọn được người đang ở `unpairedRefs`. Nút `Ghép cặp` chỉ bật ở trạng thái `ready`.
- Pair mới có `pairId` = `pair_` + UUID, cố định suốt đời draft.
- Thao tác trên cặp: `Khóa`/`Mở khóa`, `Tách cặp` (trả hai người về danh sách chưa ghép).
- `Ghép ngẫu nhiên phần còn lại`: chỉ dùng người chưa ghép, không đụng cặp đã có. `Ghép lại các cặp chưa khóa`: là thao tác riêng, phải xác nhận, bỏ qua cặp khóa.
- Không có kéo-thả. Mỗi người trong danh sách là `button` với `aria-pressed`. Enter/Space để chọn, Esc để hủy. Focus hiển thị rõ. Vùng chạm tối thiểu 44×44px.
- Người lẻ: blocker `UNPAIRED_MEMBER` hiện ngay tại bảng ghép, kèm hai hành động: `Thêm 1 người` (về Bước 2) và `Bỏ chọn người lẻ` (chọn người cụ thể để bỏ). Không tự bỏ ai.

## 7. Registry thể thức

`lib/tournament/setupFormats.js`:

```js
{
  group_knockout: { enabled: false, label: 'Vòng bảng → Loại trực tiếp', recommended: [6, 12], minPairs: /* Lát A */ },
  round_robin:    { enabled: false, label: 'Vòng tròn tính điểm',        recommended: [3, 6],  minPairs: 3 },
  knockout:       { enabled: false, label: 'Loại trực tiếp',             recommended: [8, 32], minPairs: 4 },
}
```

- `enabled: false`: thẻ hiện trạng thái khóa kèm nhãn `Sắp có`, không chọn được. Save bước 3 với thể thức đó trả `FORMAT_NOT_AVAILABLE`. Preview và finalize cũng trả mã này.
- Mỗi lát bật đúng một cờ, và cùng lúc thêm thể thức đó vào danh sách cho phép của RPC v4.

## 8. Readiness duy nhất

`lib/tournament/setupReadiness.js` thêm hàm `computeSetupReadiness(draft)`, gộp `validateStep` của cả bốn bước. Rail `Kiểm tra sẵn sàng`, action bar, stepper và console đều đọc từ hàm này. Không hard-code `true` hay con số hoàn thành nào.

Mỗi mã lỗi có thông điệp tiếng Việt trong `lib/tournament/setupMessages.js`: `{ code → { text, step, field } }`. UI hiện `text` ngay cạnh `field`. Mã kỹ thuật chỉ ghi trong thuộc tính `data-code` để test đọc, không hiển thị ra giao diện.

## 9. UI shell Pro Court

Nguồn: Stitch Bước 1–4 + Tap-to-Pair, token trong `DESIGN.md`. Token được chuyển thành CSS custom properties `--pc-*` trong `app/giai-dau/v2/setup/setup.css`. Không dùng Tailwind CDN, không dùng avatar từ nguồn ngoài.

- **Header:** nút quay lại, tên giải, badge `NHÁP`, trạng thái lưu, tên CLB kèm vai trò.
- **Stepper 4 bước:** bước đã xong có dấu ✓ kèm tóm tắt (vd `14 VĐV`); bước hiện tại tô brand; bước chưa mở bị disabled.
- **Nội dung:** thẻ trắng `rounded-2xl`; tiêu đề mục đánh chữ `A/B/C`; container tối đa 80rem.
- **Rail phải:** `Kiểm tra sẵn sàng` và `Bước tiếp theo`. Dưới 1024px, rail chuyển thành khối gập đặt ngay trên action bar.
- **Action bar dính đáy:** `Quay lại`, trạng thái lưu, `Lưu nháp`, `Tiếp tục (Bước N)`.
- **Font:** Plus Jakarta Sans qua `next/font`, subset `vietnamese`, chỉ áp trong shell setup.

### Độ lệch có chủ ý so với Stitch

| Stitch | Triển khai |
|---|---|
| "Đã lưu tự động lúc …" | Trạng thái lưu trung thực (§4.2) |
| Chip `DUPR 2.9`, cột `Athlete_ID`, "Bảo mật DUPR" | `Trình độ` hoặc ẩn |
| Panel "Đặc tả quy tắc kiểm soát (Blocker spec)" với mã `ROSTER_EMPTY`… | Bỏ; lỗi hiện tại chỗ |
| Tay nắm kéo-thả ở bảng cặp | Bỏ; chạm hai người |
| "Tự động cân bằng DUPR" | Bỏ |
| BO riêng cho vòng bảng/bán kết/tranh hạng ba | Chỉ chung kết (Lát A) |
| Mã hash hạt giống, "Hạt giống #1", "PHR" ở Bước 4 | Bỏ |
| Tab "Thủ công" gán slot bảng | Bỏ ở đợt này |
| "Xuất PDF lịch", "Tải ảnh từ máy" (áp phích) | Bỏ; áp phích chỉ nhận URL |
| Bước 4 hiện "Chuyển sang ĐÃ LÊN LỊCH … LIVE" | Chốt không chuyển LIVE; chuyển tới trang lịch |
| Sidebar CLB, banner dashboard | Chỉ tham khảo, không dựng trong setup |

## 10. Console và luồng cũ

- Console giải chỉ còn phần vận hành. Nếu giải chưa chốt, console hiển thị `Tiếp tục thiết lập` và dẫn tới đúng bước `completedThrough+1`.
- Bỏ editor setup thứ hai trong console.
- URL wizard cũ chuyển hướng sang workspace, giữ `divisionId` và bước. Giải đã chốt thì chuyển tới lịch; không mở lại setup.
- Giữ nguyên v2/v3 cho dữ liệu cũ; không migrate dữ liệu.

## 11. Test Lát 0 (viết đỏ trước)

Đặt tại `tests/stitch-setup/lat-0/`. Chạy bằng `node`, theo mẫu `tests/unified-setup-v2/_harness.js`.

| Nhóm | Ca bắt buộc |
|---|---|
| Draft v3 | Adapter v2→v3 (selectedMemberIds, reserve, pairs.memberIds); payload luôn có `participants.memberIds` mảng; round-trip qua RPC 097 giữ nguyên guests/pairs |
| Step rules | Mỗi blocker ở §4.1; `completedThrough` hạ khi sửa bước trước thành không hợp lệ |
| Điều hướng | URL `?step=4` khi `completedThrough=1` → về 2; stepper không vượt |
| Lưu | Dirty guard 3 lựa chọn; retry cùng key → cùng kết quả; key reuse khác payload → `IDEMPOTENCY_KEY_REUSED`; response muộn không ghi đè; conflict giữ dữ liệu |
| Ghép cặp | Máy trạng thái §6 đủ nhánh; thêm/bỏ người chỉ ảnh hưởng đúng phạm vi; ghép lại bỏ qua cặp khóa; số lẻ → `UNPAIRED_MEMBER` + hai hành động; không cặp một người |
| Khách mời | Thêm/sửa/xóa; `clientRef` ổn định qua reload; tên trùng chỉ cảnh báo |
| Registry | Thể thức tắt → save/preview/finalize đều `FORMAT_NOT_AVAILABLE`; UI hiện `Sắp có` |
| UI | Không có chuỗi `DUPR`, `seed`, `hash`, `Athlete_ID`, `Đã lưu tự động`, mã lỗi thô trong DOM hiển thị; touch target ≥ 44px; không overflow ngang ở 390px |
| Tenant | Member của group khác → `MEMBER_OUTSIDE_GROUP`; không đọc được draft group khác |

## 12. Tài liệu đi kèm Lát 0

- ADR `_workspace/unified-setup-ux/ADR-005-stitch-product-overrides.md`. Đặt nối tiếp ADR-001…004 hiện có, thay cho đường dẫn `docs/superpowers/adr/` trong plan vì thư mục đó chưa tồn tại. Nội dung là D1–D12 trong README.
- Cập nhật `_workspace/unified-setup-ux/00-contract.md`: shape v3, bỏ reserve, `participantRefs`, registry.
- Sửa skill invariants: dòng 67 (bỏ dự bị), thêm D1, D4, D5.
