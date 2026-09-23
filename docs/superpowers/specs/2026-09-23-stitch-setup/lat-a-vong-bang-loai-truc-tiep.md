# Lát A — Vòng bảng → Loại trực tiếp

Trạng thái: spec chờ duyệt · Deploy 1 (cùng Lát 0) · Phụ thuộc: Lát 0 xanh · Xem [README](README.md)

## 1. Mục tiêu

Mở khóa `group_knockout` với:

- 2–4 bảng, mỗi bảng lấy 1–2 cặp; thiếu suất thì bù bằng cặp xếp kế tiếp tốt nhất giữa các bảng.
- Khách mời chốt được.
- BO chung kết tùy chọn.

Lát này dựng hạ tầng dùng chung cho Lát B và C: `buildSetupPlan`, RPC `finalize_internal_setup_v4`, ước tính lịch và UI Bước 4.

## 2. Cấu hình

```js
format: {
  entrantType: 'doubles',
  formatKey: 'group_knockout',
  config: {
    groupCount: 2|3|4,              // mặc định 2
    qualifiersPerGroup: 1|2,        // mặc định 2
    thirdPlaceEnabled: boolean,     // mặc định false
    finalBestOf: 1|3|5              // mặc định 1
  }
}
```

### Tổ hợp hợp lệ

`direct = groupCount × qualifiersPerGroup`; `target` = 4 nếu `direct ≤ 4`, ngược lại 8; `pool = target − direct` là số suất bù, lấy từ các cặp đứng hạng `qualifiersPerGroup + 1`. Mỗi bảng phải có ít nhất `qualifiersPerGroup + 1` cặp.

| Bảng × lấy | Trực tiếp | Suất bù | Vào vòng loại | Tối thiểu cặp | Vòng loại |
|---|---|---|---|---|---|
| 2 × 2 | 4 | 0 | 4 | 6 | Bán kết |
| 3 × 1 | 3 | 1 nhì tốt nhất | 4 | 6 | Bán kết |
| 4 × 1 | 4 | 0 | 4 | 8 | Bán kết |
| 3 × 2 | 6 | 2 ba tốt nhất | 8 | 9 | Tứ kết |
| 4 × 2 | 8 | 0 | 8 | 12 | Tứ kết |
| 2 × 1 | — | — | — | — | Không hợp lệ: "Với 2 bảng hãy lấy 2 cặp mỗi bảng" |

- Thiếu số cặp so với tối thiểu → `PAIR_COUNT_BELOW_MINIMUM` kèm con số cụ thể.
- Tổ hợp không có trong bảng → `FORMAT_CONFIG_INVALID`.
- Ngoài khoảng khuyến nghị 6–12 cặp chỉ hiện cảnh báo (`PAIR_COUNT_OUTSIDE_RECOMMENDED`).
- **Thay đổi so với v2:** tối thiểu của 2 × 2 tăng từ 4 lên 6 cặp. Lý do: bảng 2 cặp lấy 2 thì không loại ai. Draft cũ 4–5 cặp sẽ nhận blocker và gợi ý đổi thể thức khi Lát B mở.

## 3. Bốc thăm

- Bấm `Bốc thăm` hoặc `Bốc lại` (có xác nhận) → preview route với `action: 'draw'`. Server sinh `seed = randomUUID()`. Các lần preview sau đó (vd đổi `thirdPlaceEnabled`) dùng lại seed và không xáo lại. Riêng đổi `groupCount` hoặc cặp sẽ làm draw stale và cần bốc lại.
- Chia bảng: xáo trộn các `pairId` (đã sort) bằng PRNG theo seed rồi chia vòng lần lượt A, B, C, D… để các bảng lệch nhau tối đa 1 cặp. Dùng lại `dealtGroupSizes` trong `playoffPlan.js`, không viết hàm chia thứ hai. Rating không tham gia vào việc chia.
- Bảng lệch số cặp → cảnh báo `GROUP_SIZE_IMBALANCE`, không chặn.

## 4. SetupPlan (hợp đồng chung cho mọi thể thức)

`lib/tournament/setupPlans/index.js`: `buildSetupPlan({ formatKey, config, pairs, seed, divisionId }) → SetupPlan`. Hàm thuần, deterministic. Lát A cài `setupPlans/groupKnockout.js`, tổng quát hóa từ `internalDoublesGroupKnockoutPlan.js` (file cũ giữ nguyên cho v2).

```js
SetupPlan = {
  planVersion: 4, formatKey, seed,
  stages: [{ planKey, name, scheduleFormat, order, config }],
  groups: [{ label, entryIds }],                                // chỉ thể thức có bảng
  matches: [{ planKey /*=matchKey*/, stagePlanKey, round, order, groupLabel?, entryAId?, entryBId?,
              slotA?: Placeholder, slotB?: Placeholder }],
  progressions: [{ sourceStagePlanKey, targetMatchKey, targetSlot: 'a'|'b',
                   source: { kind: 'group_rank', groupLabel, rank }
                         | { kind: 'group_rank_pool', rank, poolPosition }
                         | { kind: 'match_outcome', matchKey, outcome: 'winner'|'loser' } }],
  counts: { groupMatches, knockoutMatches, total },
  warnings: string[],
  fingerprint                                                   // sha256(stableStringify(plan không kèm fingerprint))
}
Placeholder = { kind: 'progression', label }                    // label hiển thị, xem §5
```

- `matchKey` nhóm bảng: `GROUP-<nhãn>-<thứ tự>`, giữ như v2. Vòng loại: `QF1`–`QF4`, `SF1`, `SF2`, `F`, `BRONZE`.
- Không có entrant giả. Ô chưa biết cặp có `entryXId = null` và mang placeholder.
- Công thức trận: vòng bảng = Σ n(n−1)/2; vòng loại: 4 cặp → 3 trận, 8 cặp → 7 trận; cộng 1 nếu có tranh hạng ba.

| Ca kiểm | Bảng | Trận bảng | Vòng loại | Tổng (+ hạng ba) |
|---|---|---|---|---|
| 14 VĐV, 2 × 2 | 4/3 | 9 | 3 | 12 (13) |
| 12 VĐV, 3 × 1 | 2/2/2 | 3 | 3 | 6 (7) |
| 16 VĐV, 4 × 1 | 2/2/2/2 | 4 | 3 | 7 (8) |
| 18 VĐV, 3 × 2 | 3/3/3 | 9 | 7 | 16 (17) |
| 24 VĐV, 4 × 2 | 3/3/3/3 | 12 | 7 | 19 (20) |

## 5. Xếp nhánh vòng loại

### Vị trí tĩnh (ghi vào plan)

| Tổ hợp | Trận | Slot a | Slot b |
|---|---|---|---|
| 2 × 2 | SF1 / SF2 | Nhất A / Nhất B | Nhì B / Nhì A |
| 3 × 1 | SF1 / SF2 | Nhất A / Nhất B | Nhì tốt nhất / Nhất C |
| 4 × 1 | SF1 / SF2 | Nhất A / Nhất B | Nhất D / Nhất C |
| 3 × 2 | QF1 / QF2 / QF3 / QF4 | Nhất A / Nhất C / Nhất B / Nhì A | Ba tốt nhất #1 / Nhì B / Ba tốt nhất #2 / Nhì C |
| 4 × 2 | QF1 / QF2 / QF3 / QF4 | Nhất A / Nhất C / Nhất B / Nhất D | Nhì B / Nhì D / Nhì A / Nhì C |

- Vòng sau: `SF1 = thắng QF1 – thắng QF2`, `SF2 = thắng QF3 – thắng QF4`; `F = thắng SF1 – thắng SF2`; `BRONZE = thua SF1 – thua SF2`.
- Nhãn placeholder: `Nhất A`, `Nhì B`, `Nhì tốt nhất`, `Ba tốt nhất #1`, `Thắng tứ kết 1`, `Thắng bán kết 1`, `Thua bán kết 2`.
- Với 4 × 2 và 3 × 2, hai cặp cùng bảng nằm ở hai nửa nhánh khác nhau nên chỉ có thể gặp nhau ở chung kết.

### Hoán đổi tránh cùng bảng (khi tiến cấp)

Chỉ áp cho suất bù, vì nguồn gốc bảng của suất bù chỉ biết sau khi có kết quả:

- **3 × 1:** nếu `Nhì tốt nhất` thuộc bảng A thì đổi chỗ nó với `Nhất C`. Kết quả: SF1 = Nhất A – Nhất C, SF2 = Nhất B – Nhì A.
- **3 × 2:** nếu `Ba tốt nhất #1` thuộc bảng A, hoặc `Ba tốt nhất #2` thuộc bảng B, thì đổi chỗ hai suất ba cho nhau. Một lần đổi luôn đủ vì hai suất ba đến từ hai bảng khác nhau.

Hàm thuần `resolveGroupKnockoutAdvance(plan, standingsByGroup, stageSeed) → [{ targetMatchKey, targetSlot, entryId, swapped }]` nằm trong `setupPlans/groupKnockout.js`. Preview hiện ghi chú "Tránh hai cặp cùng bảng gặp nhau ở vòng đầu" bên dưới sơ đồ nhánh.

## 6. So chéo bảng cho suất bù

`lib/tournament/crossGroupRanking.js`: `rankAcrossGroups(candidates, seed) → candidates đã sắp`. `candidates` là cặp đứng hạng `qualifiersPerGroup + 1` của mỗi bảng, số liệu lấy từ `computeStandings` hiện có (walkover tính theo luật 096).

1. Tỉ lệ thắng = thắng / số trận đã đấu (cao hơn đứng trên).
2. Hiệu số điểm trung bình mỗi trận = (điểm được − điểm thua) / số trận.
3. Điểm ghi trung bình mỗi trận.
4. Bốc thăm: PRNG với seed = `group_stage_results_fingerprint` của stage, để lần tính lại cho cùng kết quả.

Thứ hạng trong từng bảng vẫn theo tiebreak hiện có, không đổi. Bước 4 có thẻ chỉ đọc "Tiêu chí xếp hạng", hiện cả hai bộ tiêu chí khi có suất bù.

## 7. BO chung kết

- `config.finalBestOf` ∈ {1, 3, 5}. UI chỉ có một segmented control ở dòng `Chung kết`. Các dòng vòng bảng, tứ kết/bán kết, tranh hạng ba đều hiện `BO1 (cố định)`.
- **Vì sao không dùng `round_scoring`:** trong dữ liệu hiện tại, `BRONZE` và `F` cùng `round = 2`, nên ghi đè theo vòng sẽ áp luôn cho trận tranh hạng ba.
- **Cách làm:** thêm tầng ghi đè theo trận `stage.config.match_scoring = { F: { best_of } }`. `resolveMatchScoring` trong `rules/roundScoring.js` đọc tầng này sau tầng vòng: `stage → round → match`. Route setup chỉ chấp nhận key `F`.
- `games`, `corrections`, `standingsService` đã đi qua `resolveMatchScoring`, nên không phải sửa thêm. QA phải xác nhận BO3 chỉ có hiệu lực ở trận F.

## 8. Khách mời khi chốt

- Mỗi guest → `tournament_athletes(source='guest', athlete_id NULL, display_name_snapshot, client_ref, tournament_club_id = CLB chủ)`.
- Idempotent theo `(tournament_id, client_ref)`. Thêm partial unique index nếu P0.7 cho thấy chưa có (additive).
- Guest không vào `club_members`, không có `athletes`, không được tính vào xếp hạng hay snapshot CLB. QA phải kiểm cả luồng ranking và public snapshot.

## 9. Database (migration additive, đánh số tiếp sau P0.3)

| Migration | Nội dung |
| *(bỏ)* index `client_ref` | P0.7 xác nhận production đã có `idx_tournament_athletes_client_ref (group_id, tournament_id, client_ref)` |
|---|---|
| `…_stage_transition_pool_source.sql` | Thêm cột `source_pool_position integer`. Thay CHECK `tournament_stage_transitions_check` bằng bản mở rộng cho `source_kind='group_rank_pool'` (`source_group_label IS NULL`, `source_rank > 0`, `source_pool_position > 0`). Mở rộng `source_kind_check`. Dùng `ADD CONSTRAINT … NOT VALID` rồi `VALIDATE`; không xóa dữ liệu |
| `…_finalize_internal_setup_v4.sql` | RPC chung §10 |
| `…_advance_group_rank_transitions_v2.sql` | RPC tiến cấp §11 |

Việc thay CHECK là DDL trên constraint, không xóa dòng nào. Trước khi apply phải chụp định nghĩa constraint cũ vào `P0-preflight.md`.

## 10. RPC `finalize_internal_setup_v4`

`(p_group_id, p_tournament_id, p_division_id, p_expected_setup_revision, p_idempotency_key, p_preview_fingerprint, p_plan jsonb) RETURNS jsonb`. Dạng `SECURITY DEFINER`, `SET search_path = public`, chỉ grant cho `service_role`.

Route finalize: đọc draft → validate bước 1–4 → tính lại `buildSetupPlan` trên server → nếu fingerprint khác `draft.draw.previewFingerprint` hoặc khác `p_preview_fingerprint` thì trả `DRAW_STALE` → gọi RPC với plan vừa tính.

Trong một transaction:

1. **Idempotency và khóa.** Dùng `tournament_setup_mutations` (operation `finalize_internal_setup_v4`) và `pg_advisory_xact_lock`. Cùng key, cùng payload → trả response đã lưu. Cùng key, khác payload → `IDEMPOTENCY_KEY_REUSED`.
2. **Phạm vi và trạng thái.** Tenant, tournament, division đúng; `setup_revision` = expected (nếu khác → `SETUP_REVISION_CONFLICT`); chưa chốt; không có trận đã bắt đầu hoặc đã có tỉ số (nếu có → `STRUCTURE_LOCKED_BY_RESULTS`).
3. **Fingerprint và thể thức.** `p_plan->>'fingerprint'` = `p_preview_fingerprint` = `draft.draw.previewFingerprint`. `formatKey` phải nằm trong danh sách cho phép của RPC; Lát A chỉ có `group_knockout`.
4. **Bất biến cấu trúc.** Mỗi `pairId` của draft xuất hiện đúng một lần trong plan. `matchKey` duy nhất. Mọi ô vòng loại có đúng một progression. Số trận khớp `counts`. Mỗi cặp có đúng hai người, và mỗi người thuộc đúng một cặp.
5. **Ghi dữ liệu.**
   - `tournament_athletes`: member (logic như 098) và guest (§8).
   - Roster, `tournament_pairs`, `tournament_pair_members`, `tournament_entries` (`approved`).
   - `tournament_stages` theo `plan.stages`. `config` gồm `groupCount`, `advancePerGroup`, `setupPlanVersion: 4`, draw lock kèm fingerprint, và `match_scoring` khi `finalBestOf > 1`.
   - `tournament_stage_entrants` cho vòng bảng.
   - `tournament_matches` theo `plan.matches`; ô vòng loại để `NULL`.
   - `tournament_stage_transitions` theo `plan.progressions`.
6. **Chốt nháp.** Draft chuyển `finalized`, lưu snapshot, cập nhật trạng thái division/tournament như v2. Không chuyển LIVE.

Lỗi ở bất kỳ bước nào → rollback toàn bộ; response không mang dữ liệu dở dang.

## 11. RPC tiến cấp `advance_division_group_rank_transitions_v2`

`(p_group_id, p_stage_id, p_resolved jsonb, p_idempotency_key, p_expected_results_fingerprint)`, trong đó `p_resolved = [{ transition_id, entry_id, swapped }]`.

- Route `advance` tính standings trên server như hiện nay, sau đó gọi `resolveGroupKnockoutAdvance`.
- Stage có `config.setupPlanVersion = 4` dùng v2. Stage cũ vẫn dùng v1.
- RPC giữ các kiểm tra của v1: idempotency, `GROUP_RESULTS_CHANGED`, `STAGE_NOT_COMPLETE`, scope entry, trùng entry, `PLAYOFF_TARGET_CONFLICT`, chỉ tăng `version` khi thực sự đổi.
- Thêm kiểm tra: `p_resolved` phủ đúng mọi transition `group_rank` và `group_rank_pool` của stage, mỗi transition một lần.
- Hoán đổi (§5) được ghi vào response để audit.
- `unseed_division_group_playoff` phải gỡ được cả ô `group_rank_pool`. Nếu hàm này đang lọc theo `source_kind='group_rank'` thì cần phiên bản v2 tương ứng.

## 12. Preview route (tổng quát)

`POST /api/tournament-v2/preview-schedule`, body `{ tournamentId, divisionId, expectedRevision, draftFingerprint, action?: 'draw' }`:

- Đọc draft v3 và validate bước 1–3; `formatKey` phải được registry bật.
- Kiểm tra định danh: member active, thuộc đúng group, có `athlete`; guest có tên hợp lệ.
- Entries lấy từ `pairId`. Nếu `action` là `draw` thì sinh seed mới; ngược lại dùng seed trong draft (không có seed → `DRAW_REQUIRED`).
- Body có thêm `idempotencyKey`. Route **tự lưu** plan + seed + fingerprint vào bản nháp qua RPC lưu (CAS theo `expectedRevision`), rồi trả `{ draft, readiness, setup_revision, fingerprint }` cùng shape với lưu nháp. *(Sửa khi triển khai: bản trước để client lưu `draftUpdate` — hai lượt gọi, dễ lệch; một lượt ghi có CAS an toàn hơn. `draftFingerprint` bỏ vì CAS revision đã đủ.)*
- Ước tính lịch (§13) tính phía client từ `draft.draw.plan`, không trả từ route.
- Bỏ các nhánh `reserveMemberIds` và `selectedMemberIds`.

## 13. Ước tính lịch

`lib/tournament/setupSchedule.js`: `estimateSchedule(plan, { courtCount, startTime, minutesByBestOf: { 1: 15, 3: 35, 5: 55 } })`.

- Trận vòng bảng xếp theo lượt, xen kẽ giữa các bảng; vòng loại xếp sau khi xong vòng bảng.
- Mỗi lượt lấp đủ số sân. Nếu có trận thay thế thì tránh để một cặp đá hai lượt liền.
- Trả `[{ matchKey, court, startsAt, durationMinutes }]` cùng tổng thời lượng.
- Chỉ để hiển thị, không ghi khi chốt.

## 14. UI Lát A

**Bước 3 (cấu hình):**
- Thẻ `Vòng bảng → Playoff` được bật.
- Segmented `Số bảng` 2/3/4 và `Lấy mỗi bảng` 1/2. Tổ hợp không hợp lệ bị disable kèm lý do.
- Dòng tóm tắt, vd `Vào vòng loại: 6 cặp nhất/nhì + 2 cặp ba tốt nhất → Tứ kết`.
- Toggle `Tranh hạng ba`.
- Bảng BO theo §7.
- Rail `Ước tính`: tổng trận, thời lượng, sân, số cặp mỗi bảng.

**Bước 4 (theo Stitch Bước 4, bỏ các phần lệch ở Lát 0 §9):**
- Banner cảnh báo lệch bảng (có nút `Bỏ qua`).
- Thẻ các bảng A–D: tên cặp, không hiện số hạt giống.
- Nút `Bốc thăm` / `Bốc lại`.
- Sơ đồ nhánh có placeholder và giờ ước tính.
- Bảng `Xem trước lịch thi đấu dự kiến (N trận)`.
- Thẻ tiêu chí xếp hạng chỉ đọc.
- Rail `Kiểm tra toàn vẹn`.
- Khối `Chốt bốc thăm & tạo lịch` có hộp thoại xác nhận. Thành công thì chuyển tới lịch của giải. Thất bại thì giữ nguyên màn và hiện lỗi tiếng Việt.

**Mobile 390px:** các bảng xếp dọc; sơ đồ nhánh cuộn ngang trong khung riêng (không làm tràn trang); bảng lịch chuyển sang dạng thẻ.

## 15. Test Lát A

Đặt ở `tests/stitch-setup/lat-a/`.

| Nhóm | Ca bắt buộc |
|---|---|
| Plan | Năm tổ hợp §4: số trận, `matchKey`, placeholder, progression; 2 × 1 và thiếu cặp → mã lỗi đúng; cùng seed → cùng fingerprint; đổi seed → khác |
| Ca chuẩn | 14 VĐV → 7 cặp → 4/3 → 12 (13) trận, `GROUP_SIZE_IMBALANCE` là warning |
| Chéo bảng | Ba tiêu chí + bốc thăm; bảng lệch số trận so theo trung bình; kết quả lặp lại được |
| Hoán đổi | 3 × 1 với nhì A; 3 × 2 với (A3, B3), (A3, C3), (B3, A3), (C3, B3) |
| Parity | Preview và finalize cùng `matchKey`/số trận; route finalize từ chối plan bị sửa tay (`DRAW_STALE`) |
| RPC v4 | Rollback khi lỗi giữa chừng (không còn stage/entry/match mồ côi); idempotent; conflict revision; `STRUCTURE_LOCKED_BY_RESULTS`; thể thức ngoài danh sách bị từ chối; tenant khác bị từ chối |
| Guest | Chốt tạo `tournament_athletes` source guest; chốt lại không nhân đôi; không lọt vào ranking/snapshot CLB |
| Tiến cấp | v2 điền đúng ô, kể cả suất bù và hoán đổi; `GROUP_RESULTS_CHANGED`; unseed rồi tiến cấp lại |
| BO | F nhận BO3; BRONZE, SF, trận bảng giữ BO1; nhập điểm BO3 ở F hoạt động |
| Browser | Hành trình đủ 4 bước trên CLB test ở 390px/tablet/desktop; reload ở mỗi bước; ảnh chụp đặt cạnh Stitch |

## 16. Deploy 1 (Lát 0 + A)

1. Tạo CLB test mới `PickHub QA Stitch 2026-09`. Ghi `group_id` vào `_workspace/stitch-setup/test-club.md`.
2. Apply các migration §9 qua Supabase MCP, lần lượt từng file. Sau mỗi file đọc lại định nghĩa hàm/constraint để xác nhận.
3. Chạy toàn bộ test Lát 0 + A, browser trên CLB test.
4. Người dùng duyệt ảnh chụp.
5. Deploy app. Kiểm tra một giải thật đang chạy của CLB hoạt động (chỉ đọc) để chắc luồng cũ không hỏng.
