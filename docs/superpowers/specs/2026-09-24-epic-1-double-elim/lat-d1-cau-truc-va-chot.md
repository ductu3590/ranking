# Lát D1 — Cấu trúc loại kép và chốt giải

Trạng thái: spec · Phụ thuộc: Lát C đã lên production (migration 107) · Xem [README](README.md)

## 1. Mục tiêu

Sinh đúng cấu trúc loại kép cho 4–32 cặp (có bye, không trận một bên), chốt được qua `finalize_internal_setup_v4`, tiến cấp được qua 068 tới hết giải, và xếp hạng đúng D22. Chưa bật thẻ thể thức cho người dùng (bật ở D2).

## 2. Cấu hình và registry

```js
format: {
  entrantType: 'doubles',
  formatKey: 'double_elimination',
  config: { finalBestOf: 1 | 3 | 5 }   // áp cho GF (D14); mọi trận khác BO1
}
```

`lib/tournament/setupFormats.js` thêm mục `double_elimination`:

| Trường | Giá trị |
|---|---|
| `enabled` | `false` ở D1, `true` ở D2 |
| `label` | `Loại kép` |
| `supportsFinalBestOf` | `true` |
| `recommended` | `[6, 16]` (ngoài khoảng chỉ cảnh báo, D9) |
| `defaultConfig` | `{ finalBestOf: 1 }` |
| `minPairs()` | `4` |
| `maxPairs()` | `32` (mới — D15) |
| `validateConfig` | `finalBestOf ∈ {1,3,5}` như `knockout`; không có `thirdPlaceEnabled` (D22) |

`FORMAT_ORDER` thêm `double_elimination` sau `knockout`. `setupStepRules` thêm blocker chung `PAIR_COUNT_ABOVE_MAXIMUM` (Bước 3) cho thể thức có `maxPairs`; `setupMessages` thêm văn bản. Các thể thức cũ không có `maxPairs` → không đổi hành vi.

## 3. Bốc thăm và bye

Giống Lát C §3: xáo `pairId` (đã sort) bằng `seededShuffle(ids, 'double_elimination:' + seed)`; thứ tự sau xáo là hạt giống cho engine; rating không tham gia. `B = nextPowerOfTwo(n)`, số bye `B − n`; bye rơi vào các vị trí bốc đầu tiên (`byeEntryIds = order.slice(0, B − n)`), cặp được bye vào thẳng **vòng 2 nhánh thắng**. Không tạo entrant giả, không trận một bên. Cảnh báo `DOUBLE_ELIM_BYE` (Bước 4).

## 4. Builder `lib/tournament/setupPlans/doubleElim.js`

Đầu vào engine: `engines/doubleElim.generateSchedule({ config: { grandFinalReset: false } }, order → {id, seed})`. Engine cho: nhánh thắng `W` (vòng 1..K, `K = log2 B`), nhánh thua `L` (vòng 1..2K−2), một `GF`; `parent_slot` (người thắng đi đâu), `loser_to_slot` (người thua nhánh W đi đâu). Engine **không** biết bye ở nhánh thua (trận L vẫn được sinh dù nguồn là trận W không tồn tại). Builder chuẩn hóa qua bốn bước, thuần và deterministic:

### 4.1 Nguồn của từng ô (quy ước phía a/b)

| Trận đích | Ô a | Ô b |
|---|---|---|
| W vòng r ≥ 2, ô q | thắng W(r−1, 2q) hoặc cặp bye | thắng W(r−1, 2q+1) hoặc cặp bye |
| L vòng 1 (vòng ghép), ô j | thua W(1, 2j) | thua W(1, 2j+1) |
| L vòng "nhận" (nhận người thua W vòng r ≥ 2), ô t | thắng trận L trước cùng nhánh | thua W(r, q) với `t = π_M(q)` (§4.2) |
| L vòng "gộp", ô j | thắng L trước ô 2j | thắng L trước ô 2j+1 |
| GF | thắng `WF` | thắng `LF` |

Ô có nguồn là trận W vòng 1 **không tồn tại** (vị trí bye) được đánh dấu **rỗng**.

### 4.2 Đảo thứ tự khi thả xuống (D23)

Với vòng L nhận người thua W vòng r ≥ 2 có `M = B / 2^r` trận, người thua W(r, q) vào ô `t = π_M(q)`:

| M | π_M(q) | Ghi chú |
|---|---|---|
| 1 | `q` | Chung kết nhánh thua: tái đấu với người thua WF là không tránh được |
| 2, 4 | `q XOR 1` (đổi chỗ hai ô liền kề) | |
| 8 | `7 − q` (đảo ngược) | Chỉ xảy ra khi B = 32, r = 2 |

Bảng này tìm bằng vét cạn trên B = 8/16/32 với tiêu chí: người thua W(r, q) **không thể** gặp ngay ở trận L đầu tiên của mình cặp mà họ vừa loại ở W vòng r−1. Kết quả: số ca "tái đấu gần" chỉ còn 1 (LF, không tránh được) với mọi B; engine gốc (π = q) có 1/3/7/15 ca với B = 4/8/16/32. Test khóa tiêu chí này (§9), không khóa bảng — đổi bảng mà giữ tiêu chí vẫn hợp lệ.

### 4.3 Thu gọn nhánh thua khi nguồn là bye (D15)

Duyệt các trận L theo thứ tự vòng tăng dần:

- Cả hai ô có nguồn → giữ trận.
- Đúng một ô có nguồn → **bỏ trận**; nguồn duy nhất (cạnh `winner` từ trận L trước, hoặc cạnh `loser` từ trận W) được **nối thẳng** vào ô mà người thắng trận bị bỏ lẽ ra đi tới.
- Không ô nào có nguồn → bỏ trận; ô đích của nó thành **rỗng**.

Chỉ trận L vòng 1 và vòng 2 có thể bị bỏ (W vòng 1 luôn có ít nhất một cặp thật vì `n > B/2`, W vòng 2 luôn đủ hai nguồn, nên mọi vòng "gộp" và vòng "nhận" từ vòng 3 trở đi đều đủ nguồn). Số trận bị bỏ luôn bằng `B − n`. Trận W không bao giờ bị bỏ, và **mọi trận W giữ đúng một cạnh thua** (cạnh có thể đã được nối thẳng xuống vòng L sau). Builder ném `DOUBLE_ELIM_STRUCTURE_INVALID` nếu sau thu gọn còn ô rỗng ở trận được giữ (không thể xảy ra với 4 ≤ n ≤ 32; test phủ toàn bộ khoảng).

### 4.4 Khóa, lượt, thứ tự, tên (D21)

- **Vòng hiển thị trong nhánh (`bracketRound`):** W giữ vòng engine. L đánh số lại, **bỏ vòng mà mọi trận đều bị thu gọn** (n = 5, 9–12, 17–24… mất trọn vòng L1).
- **`matchKey`:** trận W vòng K là `WF`; W khác `W<r>-<bracket_slot+1>`. Trận L cuối là `LF`; L khác `L<bracketRound>-<bracket_slot+1>` (ô theo engine, có thể nhảy số khi bị thu gọn). Chung kết tổng `GF`. Regex chung: `^(W\d+-\d+|WF|L\d+-\d+|LF|GF)$`.
- **Lượt (`round`, ghi vào cột `tournament_matches.round`):** `round = 1 + max(round của các trận nguồn)`, cặp có sẵn tính 0. Mọi tuyến đi từ lượt nhỏ tới lượt lớn hơn (bất biến SQL). Lượt cũng là thứ tự xếp sân ở `setupSchedule`.
- **Thứ tự (`order`):** sắp theo `(round, nhánh W→L→GF, bracketRound, bracket_slot)`, đánh 1..2n−2.
- **`roundLabel`:** W vòng K `Chung kết nhánh thắng`; W vòng K−1 `Bán kết nhánh thắng`; W khác `Nhánh thắng · Vòng r`; `LF` `Chung kết nhánh thua`; L khác `Nhánh thua · Vòng r`; `GF` `Chung kết tổng`.
- **`title`:** `WF`/`LF`/`GF` dùng tên riêng (`Chung kết nhánh thắng`…); trận khác `Trận <order>`.
- **Nhãn ô chờ:** `Thắng trận 5`, `Thua trận 3`; với trận có tên riêng: `Thắng chung kết nhánh thắng`, `Thua chung kết nhánh thắng`, `Thắng chung kết nhánh thua`.

### 4.5 Plan trả về

```js
{
  planVersion: 4, formatKey: 'double_elimination', divisionId, seed,
  layout: `double-elim-${B}`,
  stages: [{ planKey: 'double-elim', name: 'Loại kép', scheduleFormat: 'double_elim', order: 1,
             config: { setupPlanVersion: 4, grandFinalReset: false, scoring: STAGE_SCORING,
                       ...(finalBestOf > 1 ? { match_scoring: { GF: { best_of } } } : {}) } }],
  groups: [{ label: null, stagePlanKey: 'double-elim', entryIds: order }],
  matches: [{ matchKey, title, roundLabel, stagePlanKey: 'double-elim', stageKind: 'knockout',
              bracket: 'W'|'L'|'GF', bracketRound, round, bracketSlot, entryAId, entryBId, slotA, slotB, order }],
  progressions: [{ sourceStagePlanKey: 'double-elim', targetMatchKey, targetSlot: 'a'|'b',
                   source: { kind: 'match_outcome', matchKey, outcome: 'winner'|'loser' } }],
  byeEntryIds,
  counts: { groupMatches: 0, knockoutMatches: 2n−2, total: 2n−2, winners: n−1, losers: n−2, grandFinal: 1 },
  rounds /* lượt lớn nhất */, winnersRounds: K, losersRounds, finalBestOf,
  warnings: byes ? ['DOUBLE_ELIM_BYE'] : [],
}
```

`stageKind: 'knockout'` giữ nguyên vì mọi nhánh bất biến chung (nguồn `match_outcome` phải là trận `knockout`) và `setupSchedule` đã coi đó là "trận nhánh". `BUILDERS` trong `setupPlans/index.js` thêm `double_elimination`.

## 5. BO (D14 + D8)

`STAGE_SCORING` (phong_trao_11, BO1) cho mọi trận; `config.match_scoring.GF.best_of` khi `finalBestOf > 1`. `resolveMatchScoring` đã đọc `match_scoring[match_key]` nên không cần sửa. `setupSchedule.bestOfFor` nhận cả `GF` (ước lượng thời gian Bước 4).

## 6. Migration 108 — `108_finalize_v4_double_elim.sql`

Dựng từ **107**. Số 108 kiểm lại trên `origin/main` ngay trước khi apply (roadmap §1.3).

1. **CHECK `tournament_stages.schedule_format`:** thay bằng CHECK rộng hơn thêm `'double_elim'` (mẫu 101: `DROP CONSTRAINT IF EXISTS` rồi `ADD CONSTRAINT` ngay trong cùng transaction; không đụng dữ liệu).
2. **`finalize_internal_setup_v4`** (`CREATE OR REPLACE`, giữ signature/grants). Chỉ khác 107 ở:
   - `c_allowed_formats` thêm `'double_elimination'`.
   - Danh sách `scheduleFormat` hợp lệ thêm `'double_elim'`.
   - Nhánh bất biến `double_elimination` (lỗi → `FINALIZE_PLAN_INVALID`):
     - đúng 1 stage, `scheduleFormat = 'double_elim'`, `config.grandFinalReset` là `false`; đúng 1 group trỏ stage đó;
     - số trận `= 2n − 2`; số trận W (`W…`, `WF`) `= n − 1`; số trận L (`L…`, `LF`) `= n − 2`; đúng một `WF`, một `LF`, một `GF`; mọi `matchKey` khớp regex §4.4; `stageKind = 'knockout'`; không trận nào hai ô cùng một cặp;
     - mỗi ô của mỗi trận: **hoặc có cặp, hoặc đúng một tuyến** (→ không trận một bên, không ô thừa);
     - cặp chỉ xuất hiện ở trận W; mỗi cặp đúng một lần; đều thuộc group của stage;
     - mọi tuyến là `match_outcome`, `outcome ∈ {winner, loser}`, `round` nguồn `<` `round` đích;
     - **cạnh thắng:** mọi trận trừ `GF` có đúng một cạnh thắng đi ra; `WF` và `LF` thắng → `GF`; W khác → W, L khác → L;
     - **cạnh thua:** mọi trận W (kể cả `WF`) có đúng một cạnh thua đi ra và đích là trận L; trận L và `GF` không có cạnh thua;
     - `GF` không có cạnh nào đi ra.
   - Phần ghi (VĐV, cặp, entry, stage, trận, tuyến) **không đổi**.
3. Test khóa `tests/stitch-setup/epic-1/api-contract.test.js`: bỏ các điểm trên khỏi 108 thì thân hàm phải bằng đúng 107 (mẫu `lat-c/api-contract.test.js`).

Apply: kiểm trước bằng script tích hợp nạp thân hàm trong transaction ROLLBACK (§8), apply qua Supabase MCP, so `md5(prosrc)` với thân hàm trong file.

## 7. Xếp hạng (D22)

`engines/doubleElim.computeStandings`: khi các trận có `match_key` dạng §4.4 → nhánh mới; không có → nhánh cũ nguyên vẹn.

- `GF` xong → người thắng `rank 1 · Vô địch`, người thua `rank 2 · Á quân`.
- Cặp thua một trận L ở vòng nhánh thua `t` (thua lần hai) → đồng hạng: `rank = 3 + số trận L ở các vòng > t`, `hết = rank + số trận L ở vòng t − 1`. Số trận mỗi vòng lấy từ **cấu trúc** (mọi trận của stage, kể cả chưa đá), nên hạng của cặp đã bị loại **không đổi** khi giải còn đang chạy. Nhãn: `Hạng 3`, `Hạng 4`, `Hạng 5–6`, `Hạng 7–8`, `Hạng 9–12`…
- Cặp chưa bị loại, giải chưa xong → `rank null`, nhãn `Đang thi đấu`, xếp trên các cặp đã bị loại.
- Hàng trả về giữ `entrant_id`, `exit_round` (để sort/tương thích), `seed`, thêm `label`, `placement_end`.

`standingsService`: stage `double_elim` dùng nhãn engine (không qua `knockoutPlacementLabels`). `qualification.finalStandingsFrom`: nhánh `double_elim` trả BXH chung cuộc theo rank/nhãn engine khi `GF` đã xong, rỗng khi chưa.

## 8. Kiểm thử tích hợp SQL (ROLLBACK, CLB 59)

`scripts/qa/epic-1-de-integration.js` → `database/tests/epic_1_de_integration.sql`, mẫu `stitch-lat-c-integration.js`, một transaction, **ROLLBACK** ở cuối, thành viên tạm tạo trong transaction ở `group_id = 59`:

| Kịch bản | Kiểm |
|---|---|
| D7: 7 cặp (1 bye), có khách, GF BO3 | 12 trận; stage `double_elim`, `match_scoring.GF.best_of=3`; cạnh `winner=11`, `loser=6`; 5 plan sửa tay bị từ chối (bỏ trận, ô bye thêm cạnh, cạnh thua từ trận L, cạnh thua đi vào W, hai stage); gửi lại cùng key → cùng response |
| D7 chơi hết giải | Chốt mọi trận theo `order` qua `replace_tournament_games_with_transitions`, bên thắng quy định trước; sau mỗi trận các ô đích nhận đúng cặp; không lúc nào trận có một ô bị điền hai lần; hết giải 12/12 `finalized`; `advance_division_entry_stage(next NULL)` → stage `completed` |
| D5: 5 cặp (3 bye, mất trọn vòng L1) | 8 trận, thu gọn đúng, chơi hết giải |
| D12: 12 cặp (4 bye) | 22 trận, `LF`/`GF` đúng nguồn |
| Hồi quy | knockout 6 cặp, group_knockout 7 cặp, round_robin 5 cặp vẫn chốt được |
| Sau rollback | 0 dòng test còn lại |

## 9. Test Lát D1 — `tests/stitch-setup/epic-1/`

| File | Ca bắt buộc |
|---|---|
| `plan.test.js` | n = 4..32: `2n − 2` trận (W n−1, L n−2, GF 1); không trận một bên; mỗi ô đúng một nguồn; mỗi cặp đúng một lần, chỉ ở W; bye = `B − n`, cặp bye ở W vòng 2; `matchKey` duy nhất, đúng regex; `round` nguồn < đích; W có đúng một cạnh thua, L/GF không có; GF không có cạnh ra; `WF→GF a`, `LF→GF b`; deterministic theo seed; BO: `match_scoring.GF` khi BO3/5, không có khi BO1, không có khóa `F` |
| `plan.test.js` (chống gặp lại) | B = 8/16/32: không trận L "nhận" nào có thể là tái đấu với cặp vừa bị chính người thua W loại ở vòng trước, trừ `LF` |
| `simulate.test.js` | n = 4..32 × 3 seed: mô phỏng định tuyến như 068 (điền theo cạnh), kết quả ngẫu nhiên: mọi trận khi tới lượt có đủ hai cặp, chơi đúng `2n − 2` trận, mỗi cặp bị loại sau đúng hai trận thua, vô địch thua ≤ 1 trận; BXH: hạng 1..n phủ đủ, dải đồng hạng khớp D22 |
| `standings.test.js` | Nhãn Vô địch/Á quân/Hạng 3/Hạng 4/Hạng 5–6…; giải đang chạy → `Đang thi đấu`, hạng đã loại không đổi; `finalStandingsFrom` rỗng khi GF chưa xong; nhánh cũ của engine không đổi |
| `registry.test.js` | `double_elimination` có trong registry, `enabled=false` ở D1; min 4, max 32 → blocker `PAIR_COUNT_ABOVE_MAXIMUM`; `validateConfig` BO |
| `api-contract.test.js` | Migration 108 chỉ khác 107 ở các điểm §6; không `DROP TABLE/FUNCTION/COLUMN`, `TRUNCATE`, `DELETE FROM`; registry khớp danh sách SQL; SQL tích hợp kết thúc bằng `ROLLBACK;` |
| Hồi quy | `npm run test:stitch-setup` (lat-0/a/b/c) + `tests/tournament/double-elim-*.test.js` + `tests/tournament/registry.test.js` xanh |

## 10. Không làm ở D1

UI; bật thẻ thể thức; BO theo từng trận ở bàn điều hành (Epic 2); đá lại GF (D14).
