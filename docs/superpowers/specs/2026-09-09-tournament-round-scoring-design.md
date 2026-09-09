# Spec — Tournament Round Scoring (Số ván / BO theo từng vòng)

- Ngày: 2026-09-09
- Trạng thái: Draft (chờ user duyệt để chuyển sang plan)
- Liên quan: module giải đấu v2, `tournament-create-wizard-redesign`, `tournament-open-registration`, và **spec kế tiếp `tournament-operations`** (bàn điều hành ngày thi đấu — mục 12)
- Mockup đã duyệt: <https://claude.ai/code/artifact/d842724a-10c9-462a-8200-31844fb7d712> — màn **bước 1 · Cấu hình giải & số ván** (bảng chính) và **bước 6 · Lịch thi đấu & kết quả** (chip BO lối tắt)

## 1. Mục tiêu

Cho BTC đặt **số ván (BO) và luật điểm riêng cho từng vòng** của một giai đoạn: vòng bảng BO1, chung kết BO3 tới 15. Hôm nay luật chỉ có 3 tầng (giải → nội dung → giai đoạn) và bị khoá cứng khi giai đoạn vào `active`, nên không thể vừa chạy vòng bảng vừa chốt luật chung kết.

Yêu cầu gốc của user: *"luật/BO là điều lệ theo vòng, không cố định lúc tạo giải"*. Sau khi làm rõ, user thu hẹp lại: **điều lệ dạng văn bản đã nằm trong mô tả giải**; cái thiếu chỉ là **chỗ cấu hình BO của từng vòng**. Spec này bám đúng phạm vi hẹp đó.

## 2. Phạm vi & KHÔNG thuộc phạm vi

**Trong phạm vi**
- Tầng luật thứ tư: **vòng**, đè lên luật của giai đoạn.
- Các trường đổi được theo vòng: `best_of`, `points_to`, `win_by`, `cap`, `deciding_game`.
- Khoá theo từng vòng (vòng đã đấu thì chỉ đọc), các vòng sau vẫn sửa được khi giải đang chạy.
- API đọc/ghi luật vòng, có guard group-scoping + admin như mọi route v2.
- Component `RoundScoringPanel` + 3 chip BO lối tắt trong màn lịch/kết quả.
- Nối luật vòng vào chỗ **kiểm tra tỉ số ván** và chỗ **kết luận đội thắng trận**.

**Ngoài phạm vi**
- `win_points` / `loss_points` / `draw_points` (điểm xếp hạng) — **cố ý giữ ở tầng giai đoạn**. Xem mục 5.
- Tie-break, đổi định dạng trận (`simple` ↔ `mlp`/`team`) theo vòng — không cho, vì làm vỡ BXH đã tính.
- `lib/tournament/engines/*` — **tuyệt đối không đụng**. IDE khác đang làm `doubleElim` + trận đội cấu hình được. Spec này chỉ *chừa chỗ* cho shape có `bracket` mà engine đó phát ra.
- Bốc thăm, gán sân/giờ, bảng sân trực tiếp, đồng hồ trận, nhật ký thao tác, cấu hình số sân → **spec `tournament-operations`** (mục 12).
- Đổi layout console sang sidebar và theme tối → thuộc `tournament-operations`.

## 3. Bối cảnh code hiện có

| Thứ | Ở đâu | Ghi chú |
|---|---|---|
| Preset luật + resolve 3 tầng | `lib/tournament/rules/scoring.js` | `SCORING_PRESETS`, `resolveStageScoring(tournament, division, stage)`, `validateGameScore(game, scoring, i)` |
| Khoá luật theo giai đoạn | `app/api/tournament-v2/rules/route.js:11` | `LOCKED_STAGE_STATUSES = new Set(['active','completed'])` → 409 `RULES_LOCKED` |
| Số vòng của trận | `tournament_matches.round` (`database/migrations/015_tournament_module_v2.sql`) | integer, mặc định 1 |
| Trạng thái trận | `tournament_matches.status` | `pending` / `live` / `finalized` — theo constraint `tournament_matches_status_phase3_ck` **đang có trên DB thật**; migration 015 ghi `done` nhưng đã bị Phase 3 thay |
| Cấu hình giai đoạn | `tournament_stages.config` | đã là `jsonb`, đang giữ `config.scoring` (snapshot lúc bốc thăm) |
| Số ván cần thắng | `lib/tournament/match/simple.js:3` | `const bestOf = config.bestOf \|\| 3` |
| Console BTC | `app/giai-dau/v2/console/` | 7 tab ngang; `SettingsTab.js`, `ResultsTab.js` |

**Không cần migration.** `tournament_stages.config` đã là `jsonb`.

## 4. Mô hình dữ liệu

Thêm một khoá vào `tournament_stages.config`:

```jsonc
{
  "scoring": { /* snapshot luật giai đoạn — giữ nguyên như hiện nay */ },
  "round_scoring": {
    "1": { "best_of": 1 },
    "3": { "best_of": 3, "points_to": 15, "cap": 21 }
  }
}
```

**Quy tắc**

- Key là **round key** dạng chuỗi. Vòng nào BTC không đụng thì **không có key** → kế thừa nguyên luật giai đoạn.
- Value là **partial**: chỉ chứa các trường BTC thực sự đổi. Không sao chép cả bộ luật xuống.
- Trường hợp lệ trong value: `best_of`, `points_to`, `win_by`, `cap`, `deciding_game`. Trường lạ bị **loại bỏ khi ghi**, không báo lỗi (giữ API dễ dùng), trừ khi là trường bị cấm ở mục 5 thì trả 400.

**Round key**

| Loại giai đoạn | Key | Ví dụ |
|---|---|---|
| `round_robin`, `knockout` | `String(match.round)` | `"1"`, `"2"`, `"3"` |
| Engine phát trận có `match.bracket` (double-elim của IDE khác) | `` `${match.bracket}:${match.round}` `` | `"W:3"`, `"L:2"` |
| `match.bracket === 'GF'` | `"GF"` (bỏ số vòng, vì grand final chỉ có một) | `"GF"` |

Hàm `roundKeyOf(match)` là **nơi duy nhất** biết quy tắc này. Nếu engine mới đổi shape, chỉ sửa một chỗ.

## 5. Vì sao không cho đổi điểm xếp hạng theo vòng

`win_points` / `loss_points` / `draw_points` quyết định cột **Điểm** trong bảng xếp hạng. Nếu vòng 1 thắng được 2 điểm còn vòng 3 thắng được 3 điểm thì bảng xếp hạng vòng tròn không còn so sánh được giữa các đội đã đá lệch số vòng. Đây là ràng buộc cố ý, không phải thiếu sót: **PATCH gửi các trường này trả 400 `FORBIDDEN_ROUND_FIELD`**, kèm thông báo tiếng Việt giải thích.

## 6. Lớp thuần (`lib/tournament/rules/scoring.js`)

Chỉ **thêm** hàm, **không sửa** `resolveStageScoring` và `validateGameScore` đang có — chúng vẫn là nền tảng.

```
roundKeyOf(match) -> string
   // mục 4. Trận không có round → "1".

resolveRoundScoring(tournament, division, stage, roundKey) -> Scoring
   // = resolveStageScoring(tournament, division, stage) rồi merge shallow override.
   // Trả thêm:
   //   round_key: string
   //   round_source: 'stage' | 'round'   ('round' khi có override thật)
   //   engine.bestOf đồng bộ lại theo best_of sau merge

resolveMatchScoring(tournament, division, stage, match) -> Scoring
   // = resolveRoundScoring(..., roundKeyOf(match))

describeRound(stage, roundKey, totalRounds) -> string
   // Nhãn tiếng Việt, xem mục 7.

computeRoundLocks(stage, matches) -> { [roundKey]: RoundLock }
   // RoundLock = { locked, reason, counts: { pending, live, finalized, total } }
   // locked = counts.live > 0 || counts.finalized > 0
   // reason ∈ 'ROUND_LIVE' | 'ROUND_FINALIZED' | null

validateRoundScoringPatch(patch) -> { ok, code, message }
```

**Luật kiểm `validateRoundScoringPatch`**

| Trường | Ràng buộc | Mã lỗi khi sai |
|---|---|---|
| `best_of` | số nguyên lẻ trong `{1, 3, 5}` — đúng 3 chip UI phơi ra | `INVALID_BEST_OF` |
| `points_to` | số nguyên `1..99` | `INVALID_POINTS_TO` |
| `win_by` | số nguyên `0..5` | `INVALID_WIN_BY` |
| `cap` | `null`, hoặc số nguyên `>= points_to` sau khi merge | `INVALID_CAP` |
| `deciding_game` | `null`, hoặc object qua đúng 3 kiểm trên | `INVALID_DECIDING_GAME` |
| `win_points` / `loss_points` / `draw_points` | cấm | `FORBIDDEN_ROUND_FIELD` |
| — | patch rỗng `{}` → coi như xoá override | hợp lệ |

`best_of` chẵn bị chặn vì `ceil(BO/2)` với BO chẵn cho phép hoà — mô hình trận hiện tại không có khái niệm hoà.

**Giai đoạn `match_format` không phải `simple`.** Preset `mlp_4_van` có `best_of: 4` vì với trận đội, `best_of` mang nghĩa **số ván con cố định của một trận đội**, không phải "thắng 3 ăn 5". Đổi con số đó theo vòng sẽ làm hỏng cấu trúc ván con. Do đó: giai đoạn có `match_format` là `mlp` hoặc `team` thì **PATCH kèm `best_of` trả 400 `BEST_OF_NOT_ALLOWED_FOR_FORMAT`**; các trường còn lại (`points_to`, `win_by`, `cap`, `deciding_game`) vẫn override được bình thường.

## 7. Nhãn vòng (`describeRound`)

| Giai đoạn | Điều kiện | Nhãn |
|---|---|---|
| `knockout` | `round === totalRounds` | `Chung kết` |
| `knockout` | `round === totalRounds - 1` | `Bán kết` |
| `knockout` | `round === totalRounds - 2` | `Tứ kết` |
| `knockout` | còn lại | `Vòng {round}` |
| `round_robin` | mọi vòng | `Vòng {round}` |
| key `"GF"` | — | `Chung kết tổng` |
| key `"W:{n}"` | — | `Nhánh thắng · vòng {n}` |
| key `"L:{n}"` | — | `Nhánh thua · vòng {n}` |

`totalRounds` = `max(match.round)` trong các trận **thuộc cùng bracket** của giai đoạn. Trận tranh hạng ba (nếu engine phát ra) mang `round` riêng nên tự nhận nhãn `Vòng {n}`; **đặt tên đẹp cho trận tranh hạng ba nằm ngoài phạm vi spec này** vì phụ thuộc shape engine mới.

## 8. API — `app/api/tournament-v2/round-rules/route.js`

Theo đúng khuôn các route v2 hiện có: `requireTournamentAccess`, `supabaseAdmin ?? supabaseServer`, mọi truy vấn `.eq('group_id', access.groupId)`.

### GET `?stageId=`

`need: 'read'`. Trả:

```jsonc
{
  "stage": { "id", "name", "schedule_format", "match_format", "status", "division_id" },
  "inherited": { /* resolveStageScoring(...) đầy đủ — mức mặc định */ },
  "rounds": [
    {
      "round_key": "3",
      "label": "Chung kết",
      "match_count": 1,
      "counts": { "pending": 1, "live": 0, "finalized": 0, "total": 1 },
      "locked": false,
      "lock_reason": null,
      "scoring": { /* luật đang áp dụng cho vòng này, đã merge */ },
      "source": "round"
    }
  ]
}
```

`rounds` **chỉ liệt kê vòng có trận thật** trong lịch đã sinh, sắp theo thứ tự thi đấu. Giai đoạn chưa sinh lịch → `rounds: []`; UI hiện thông báo "sinh lịch xong mới cấu hình được". Đây là quyết định đã chốt: BO không ảnh hưởng việc sinh lịch nên không cần khai báo trước.

### PATCH

Body: `{ stage_id, round_key, scoring }`. `scoring: null` hoặc `{}` = xoá override, trả vòng về mặc định giai đoạn.

`need: 'write'`. Thứ tự kiểm:

1. Thiếu `stage_id` / `round_key` → 400.
2. `requireTournamentAccess` fail → trả response của nó.
3. Nạp giai đoạn theo `group_id`; không thấy → 404.
4. `validateRoundScoringPatch` → 400 kèm `code` + `message` tiếng Việt.
5. Nạp trận của giai đoạn, `computeRoundLocks`; vòng không tồn tại → 404 `ROUND_NOT_FOUND`; vòng `locked` → **409 `ROUND_LOCKED`** kèm `lock_reason`.
6. Ghi `config.round_scoring[round_key]`, trả về cùng shape một phần tử `rounds[]` như GET.

**Ghi đồng thời.** Ghi bằng đọc-sửa-ghi cả object `config` có rủi ro hai tab đè nhau. Vì mô hình vận hành là **một BTC**, chấp nhận rủi ro này nhưng **giảm nhẹ bằng ghi có điều kiện**: `UPDATE ... WHERE id = ? AND group_id = ? AND config->'round_scoring' IS NOT DISTINCT FROM <giá trị vừa đọc>`; không khớp → 409 `STAGE_CONFIG_CONFLICT`, UI bảo tải lại. Không cần cột version.

**Không ghi nhật ký.** Chỉ sửa được vòng chưa đấu nên không kết quả nào bị ảnh hưởng. Nhật ký thao tác là hạng mục của `tournament-operations`.

## 9. Điểm nối — dùng luật vòng ở đâu

Hôm nay `resolveStageScoring` được gọi cho cả giai đoạn. Mọi chỗ xử lý **một trận cụ thể** phải đổi sang `resolveMatchScoring`:

1. **Kiểm tỉ số ván** — chỗ đang gọi `validateGameScore` khi lưu điểm. Luật đem ra kiểm phải là luật của vòng chứa trận đó.
2. **Kết luận đội thắng trận** — `lib/tournament/match/simple.js` nhận `config.bestOf`; nơi gọi nó phải truyền `bestOf` từ `resolveMatchScoring(...).engine.bestOf`, không phải từ luật giai đoạn.
3. **Hiển thị luật** trên thẻ sân, thẻ trận, panel playoff, thẻ đọc mic.

Bước đầu của plan là **liệt kê đầy đủ nơi gọi** bằng `grep -rn "resolveStageScoring\|bestOf" lib app` rồi phân loại từng chỗ là "theo giai đoạn" hay "theo trận"; chỉ đổi nhóm thứ hai. Ghi kết quả phân loại vào plan trước khi sửa.

**Trận đã đấu xong không tính lại.** Vì luật vòng bị khoá ngay khi có trận `live`, luật áp dụng cho một trận không đổi được sau khi trận bắt đầu. Nhờ vậy **không cần cột snapshot trên `tournament_matches`**.

## 10. Giao diện

### 10.1 `RoundScoringPanel` — bảng chính

Component tự chứa: `RoundScoringPanel({ tournamentId, stageId, divisionId })`.

Mỗi vòng là một hàng:

- Trái: nhãn vòng + huy hiệu trạng thái (`Đã xong` / `Đang đấu` / `Chưa đấu`) + dòng phụ `4 trận · 4 đã có kết quả`.
- Phải: 3 chip `BO1 / BO3 / BO5`.
- Vòng **khoá**: chip thành chữ chỉ đọc `BO1 · tới 11`, thêm dòng ổ khoá nói rõ lý do (`Đã khoá vì vòng đã đấu xong` / `Đã khoá vì có trận đang diễn ra`).
- Vòng **đang sửa**: bung khối 4 ô `Tới` / `Cách biệt` / `Cap` / `Ván quyết định`, hai nút `Lưu vòng này` và `Trả về mặc định`.
- Vòng theo mặc định: dòng phụ `Đang theo mặc định của giai đoạn · tới 11 · cách 2 · cap 15`.

Trên đầu panel: dải kế thừa (`Mặc định của nội dung X: BO1 · tới 11 · cách 2 · cap 15`) + hai bộ chọn `Nội dung` và `Giai đoạn`.

**Chỗ gắn.** Spec này gắn vào **`SettingsTab`** của console hiện tại. `tournament-operations` sẽ mount lại đúng component đó dưới mục **bước 1 · Cấu hình giải & số ván** trong shell sidebar — đổi một dòng import, không viết lại.

### 10.2 Chip lối tắt trong `ResultsTab`

Header mỗi nhóm vòng có 3 chip BO + nút `Điểm…` mở panel đầy đủ. Gọi **cùng API**, cùng quy tắc khoá; nhóm vòng đã khoá thì chip thành chữ chỉ đọc kèm ổ khoá.

### 10.3 Màu

Style **hoàn toàn qua CSS variable**, không hardcode hex. Console hiện tại đang dùng token sáng; `tournament-operations` sẽ đưa vào bộ token tối/tím, panel tự đổi màu theo mà không phải sửa.

Bản sắc chuẩn là **tím `--ph-indigo #6F48C9` + mực `--ph-ink #28243D` + gold `#FFC95E`** (`docs/pickhub-core/UI-BRAND-SYSTEM.md`), thống nhất với spec `tournament-open-registration` (*"tông tối/tím ở mặt công khai lẫn console"*). Bộ xanh sân trong `app/globals.css` là hệ màu cũ chưa thay.

> **Cần ghi nhận:** `UI-BRAND-SYSTEM.md` dòng 34 viết *"Không dùng nền đen hoặc navy đặc trong các màn hình vận hành"*. Bàn điều hành cố ý phá lệ này (màn hình đứng lâu trong nhà thi đấu, cần tương phản cao và nhìn từ xa). Ngoại lệ này phải được ghi vào brand system trong `tournament-operations`, không im lặng bỏ qua.

## 11. Kiểm thử

`tests/tournament/round-rules.test.js`, node test thuần theo đúng kiểu test hiện có trong `tests/tournament/`.

**Lớp thuần**
1. Không có `round_scoring` → `resolveRoundScoring` trả đúng bằng `resolveStageScoring`, `round_source === 'stage'`.
2. Override chỉ `best_of` → các trường khác giữ nguyên của giai đoạn, `engine.bestOf` khớp `best_of` mới.
3. Override `points_to` + `cap` → `validateGameScore` với luật trả về chấp nhận `15–13`, từ chối `12–10`.
4. `roundKeyOf`: trận thường → `"1"`; có `bracket:'W', round:3` → `"W:3"`; `bracket:'GF'` → `"GF"`; thiếu `round` → `"1"`.
5. `describeRound`: knockout 3 vòng → `Tứ kết / Bán kết / Chung kết`; knockout 1 vòng → `Chung kết`; round-robin 5 vòng → `Vòng 1..5`; `"L:2"` → `Nhánh thua · vòng 2`.
6. `computeRoundLocks`: vòng toàn `pending` → mở; có 1 `live` → khoá `ROUND_LIVE`; toàn `finalized` → khoá `ROUND_FINALIZED`; đếm đúng.
7. `validateRoundScoringPatch`: chặn `best_of: 2`, `best_of: 4`, `cap: 9` khi `points_to: 11`, `points_to: 0`, `win_points: 3` (→ `FORBIDDEN_ROUND_FIELD`); chấp nhận `{}` và `null`.
8. Giai đoạn `match_format: 'mlp'`: patch `{ best_of: 3 }` → `BEST_OF_NOT_ALLOWED_FOR_FORMAT`; patch `{ points_to: 21 }` → hợp lệ.

**Hợp đồng API** (theo kiểu `tests/phase3/*-contract.test.js`)
9. GET trả `rounds[]` sắp đúng thứ tự, `inherited` không rỗng, giai đoạn chưa sinh lịch → `rounds: []`.
10. PATCH vào vòng khoá → 409 `ROUND_LOCKED`.
11. PATCH `scoring: null` → xoá key khỏi `config.round_scoring`, GET sau đó trả `source: 'stage'`.
12. Route không truy vấn bảng nào thiếu `.eq('group_id', ...)`.

## 12. Spec kế tiếp — `tournament-operations`

Phạm vi user liệt kê ban đầu được cắt làm hai. Phần dưới đây **không thuộc spec này**, ghi lại để không rơi mất; mockup đã duyệt là đích cho spec đó.

Quyết định đã chốt trong phiên brainstorm này:

| Hạng mục | Đã chốt |
|---|---|
| Layout | Sidebar cho mọi kích thước; dưới 900px thành drawer trượt |
| Điều hướng | **Đánh số lộ trình 8 bước**: 1 Cấu hình & số ván · 2 Sân & sơ đồ · 3 VĐV & cặp đấu · 4 Bốc thăm & chốt lịch · **5 Trung tâm điều hành (khối nổi bật, nhãn LIVE)** · 6 Lịch & kết quả · 7 Bảng đấu & xếp hạng · 8 Nhật ký thao tác |
| Theme | Nền đen ám tím + tím/gold/coral/cyan theo brand |
| Số sân | **Cấu hình trong bước 2**, kèm ô hệ quả: số sân × thời lượng trận → giờ dự kiến & mốc hoàn tất; bật/tắt từng sân giữa giải |
| Bốc thăm | Máy bốc → BTC sửa tay → **chốt** mới sinh lịch; chốt xong khoá |
| Sân & giờ | Bảng sân thời gian thực + giờ dự kiến tự dịch theo giờ thực tế |
| Nhập điểm | **Tỉ số từng ván** (không live scoring từng điểm); chừa chỗ mô hình cho live sau |
| Trạng thái trận | Mở rộng ngoài `pending/live/finalized`: khởi động, tạm dừng, bỏ cuộc/walkover |
| Correction | Sửa trực tiếp + bắt lý do + nhật ký; BXH và nhánh loại trực tiếp tự tính lại |
| Loa gọi VĐV | **Thẻ chữ to để BTC đọc mic** — không giọng đọc máy, không đẩy thông báo |
| Biên bản | Chỉ là **nhật ký thao tác trên màn hình**, không in giấy |
| Nhiều nội dung | Bảng sân **trộn chung**, mỗi thẻ sân ghi rõ nội dung + bảng |
| Đã loại khỏi thiết kế Stitch | `8.4 chạm/rally` (không có dữ liệu) → thay bằng **thời lượng trận trung bình**; `DUPR` → **PHR nội bộ**; `Live Stream` → bỏ |
| Cần thêm schema | Mốc thời gian trên `tournament_matches` (bắt đầu khởi động / bắt đầu đấu / kết thúc) để chạy đồng hồ trận và ước tính hoàn tất |

## 13. Ràng buộc chung

- Không đụng `lib/tournament/engines/*`.
- Không migration; không `DROP` / `TRUNCATE`.
- Mọi truy vấn scope theo `group_id`; ghi phải qua guard admin (`pickhub-engineering`).
- Thông báo lỗi hiển thị cho BTC viết bằng **tiếng Việt**, nói rõ vi phạm luật nào của vòng nào.
