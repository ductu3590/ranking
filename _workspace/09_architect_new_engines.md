# 09 — Architect spec: engine mới (Double elimination + Team match cấu hình)

Trạng thái: chốt để engine-dev triển khai (test đỏ trước). Giữ nguyên toàn bộ engine cũ.

## Phạm vi
Thêm 2 engine mới, KHÔNG sửa engine cũ (round_robin, knockout, simple, mlp):
1. **`double_elim`** — schedule engine loại trực tiếp 2 nhánh (winners/losers bracket + grand final).
2. **`team`** — match engine trận đội cấu hình được: số người mỗi đội (`teamSize`) và số ván con mỗi trận đội (`subGames`). Là bản mở rộng tổng quát của MLP (MLP = team với teamSize 4 + lịch giới tính cố định).

## 1) Double elimination — `lib/tournament/engines/doubleElim.js`

### Hợp đồng (khớp registry hiện tại)
```
generateSchedule(stage, entrants, seed = 1) -> Match[]
computeStandings(stage, entrants, matches) -> Row[]
advance(stage, standings) -> [{ entrant_id, seed_in_stage }]
```

### Shape Match (mở rộng shape knockout, thêm trường phân nhánh + định tuyến loser)
Giữ nguyên các field knockout để tương thích persistence/UI hiện có:
`round, bracket_slot, parent_slot, slot, group_label:null, entrant_a_id, entrant_b_id, order`

Thêm field mới (chỉ dùng cho double_elim, các engine khác không có → an toàn):
- `bracket`: `'W' | 'L' | 'GF'` — winners / losers / grand final.
- `loser_to_slot`: number|null — slot trận thuộc nhánh thua mà **kẻ thua** của trận này đi vào. Chỉ trận nhánh W (và không phải GF) mới có. null nếu bị loại hẳn (không áp dụng ở double-elim W vì thua W → xuống L; chỉ trận cuối cùng của L thua → bị loại).
- `parent_slot` giữ nguyên nghĩa cũ: slot trận mà **kẻ thắng** đi vào.

> LƯU Ý BIÊN (cho API/persistence sau này, KHÔNG thuộc phạm vi engine test):
> `lib/tournament/persistence.js` + `results.js` hiện chỉ định tuyến 1 winner qua `parent_match_id`.
> Định tuyến loser (`loser_to_slot`) cần mở rộng persistence khi lên API. Engine chỉ phát shape.

### Quy ước
- Seed dùng `seedOrder`/`nextPowerOfTwo` từ `../seeding` (giống knockout).
- Non-power-of-2 → bù bye ở vòng 1 nhánh W (không sinh trận có entrant null), giống knockout hiện tại.
- **Grand final reset**: mặc định BẬT (`config.grandFinalReset !== false`). Sinh 2 slot GF:
  - GF1: vô địch nhánh W vs vô địch nhánh L.
  - GF2 (reset): chỉ có nghĩa khi kẻ đến từ L thắng GF1 (vì W-champ khi đó mới thua ván đầu). Engine luôn phát cả 2 slot GF; slot GF2 để trống entrant, `parent_slot=null`, và runtime bỏ qua nếu không cần. Test chỉ kiểm tra có đủ 2 slot GF khi reset bật, 1 slot khi tắt.
- `round` trong double_elim: đánh số tăng dần toàn cục theo thứ tự thi đấu để UI/sort ổn định; nhánh L xen kẽ. Test KHÔNG ràng buộc con số round tuyệt đối của nhánh L, chỉ ràng buộc:
  - tổng số trận,
  - phân bố bracket W/L/GF,
  - liên kết winner (`parent_slot`) và loser (`loser_to_slot`) hợp lệ (trỏ tới slot tồn tại).

### Tổng số trận (bất biến để test)
Với N đội (không bye), double-elim đầy đủ:
- Winners bracket: `N - 1` trận.
- Losers bracket: `N - 2` trận.
- Grand final: 1 trận (+1 slot reset khi bật).
→ Tổng **có nghĩa** (không tính slot reset rỗng) = `2N - 2`.
Ví dụ: N=4 → 6 trận; N=8 → 14 trận.
Khi reset bật, engine phát thêm 1 slot GF placeholder → mảng dài `2N-1`.

### computeStandings
- Vô địch = kẻ thắng GF (GF2 nếu chơi, ngược lại GF1). `exit_round` cao nhất.
- Á quân = kẻ thua trận GF quyết định.
- Các đội còn lại xếp theo **vòng bị loại ở nhánh L** (bị loại muộn hơn = hạng cao hơn), rồi tie-break bằng seed.
- Row shape giống knockout: `{ entrant_id, exit_round, seed, rank }`.
- Đội bị loại: exit_round = round của trận L mà họ thua (số càng lớn càng trụ lâu). Vô địch = max+1, á quân = max.

### advance
Trả `[{ entrant_id: champion, seed_in_stage: 1 }]` (giống knockout) — dùng cho mix đa giai đoạn.

## 2) Team match — `lib/tournament/match/team.js`

### Hợp đồng (giống mlp)
```
resolveMatch(match, games, config = {}) -> { winner_entrant_id, games_a, games_b, points_a, points_b, complete }
```

### Config
- `config.subGames` (số ván con mỗi trận đội, mặc định 5). Nguồn chân lý tổng ván con:
  `config.pairSchedule?.subKinds?.length` → `config.subMatches?.length` → `config.subGames` → mặc định 5.
- `config.teamSize` (số người mỗi đội, mặc định 4) — engine match KHÔNG dùng để tính thắng/thua (chỉ metadata cho UI/lịch ghép cặp); giữ trong config để lớp trên đọc. Engine chỉ đếm ván con.
- `config.dreambreaker` (mặc định true): hòa (mỗi bên thắng nửa số ván con) → dreambreaker quyết định.
- Không clinch sớm: chơi đủ số ván con rồi mới chốt (giống mlp hiện tại).

### Logic (tổng quát hoá mlp cho subGames lẻ/chẵn)
- Đếm winsA/winsB theo từng game kind != 'dreambreaker'.
- `allSubsDone = winsA + winsB >= subCount`.
- Nếu xong và winsA != winsB → winner = bên nhiều hơn, complete=true.
- Nếu xong và hòa: nếu dreambreaker bật + có game dreambreaker → winner theo dreambreaker; ngược lại complete=false, winner=null (chờ).
- points_a/points_b = tổng điểm mọi game (gồm dreambreaker).
- **subGames lẻ** (vd 5): về lý thuyết không hòa nếu chơi đủ, nhưng engine vẫn hỗ trợ dreambreaker khi cấu hình muốn (an toàn), và complete khi lệch.

> Quan hệ với MLP: mlp.js giữ nguyên (không sửa). team.js là engine độc lập tổng quát; MLP tiếp tục dùng key `mlp`. Khác biệt chính: team.js lấy tổng ván con từ `subGames` (số), mlp lấy từ `subMatches`/`gamesPerMatchup` (mảng kind giới tính).

## 3) Registry (`lib/tournament/engines/index.js`)
- `SCHEDULE`: thêm `double_elim: doubleElim` (giữ round_robin, knockout).
- `MATCH`: thêm `team` (giữ simple, mlp).
- Format lạ vẫn ném `Error`.

## 4) Tests (đỏ trước, `tests/tournament/`)
- `double-elim-schedule.test.js`: N=4 → mảng có 6 trận nghĩa (bracket W/L/GF), reset bật → dài 7; N=8 → 14 trận nghĩa; W=`N-1`, L=`N-2`, GF≥1; mọi `parent_slot`/`loser_to_slot` != null trỏ tới slot tồn tại; nhánh W trận không-chung-kết có `loser_to_slot` hợp lệ; non-power-of-2 (N=6) không sinh trận entrant null ở vòng 1 W; reset tắt (`grandFinalReset:false`) → chỉ 1 slot GF.
- `double-elim-standings.test.js`: mô phỏng kết quả 4 đội → champion rank 1 exit_round max, á quân rank 2; các đội xếp theo vòng L bị loại.
- `match-team.test.js`: subGames=5, A thắng 3-2 → winner A complete; subGames=4 hòa 2-2 + dreambreaker → theo dreambreaker; chưa đủ ván → complete=false; teamSize truyền vào không đổi kết quả.
- Cập nhật `registry.test.js`: thêm assert `double_elim` schedule + `team` match tồn tại (giữ assert cũ).
- Thêm 3 file test vào script `test:t-engines` trong `package.json`.

## 5) Wiring `de` (để mục 4 sau, KHÔNG trong lần này)
`wizardConfig.js scheduleFromFormat('de')` hiện trả `engine_pending:true`. Khi API sẵn sàng định tuyến loser sẽ đổi trỏ `double_elim` và bỏ `engine_pending`, đồng thời sửa assert `tests/phase3/wizard-config.test.js` dòng 30. Lần này giữ nguyên để không phá test phase3.
