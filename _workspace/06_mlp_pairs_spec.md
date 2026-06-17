# Spec 06 — MLP Pairs Generation (Step 4 wizard)

Tác giả: tournament-architect · Ngày: 2026-06-17 · Trạng thái: SẴN SÀNG triển khai
Liên quan: `02_engine_api.md` (engine), `03_api_contract.md` (API). Đây là **partial run** — module v2 đã build xong, chỉ THÊM tính năng sinh cặp đôi cho MLP. **Không cần migration mới.**

---

## 0. Vấn đề & bối cảnh

MLP thi đấu theo **đội nhiều VĐV**. Khi 2 đội gặp nhau (1 `tournament_matches` = 1 matchup) họ đá `gamesPerMatchup` ván con (2 hoặc 4). Mỗi ván con là 1 trận đôi: **đôi i của đội A vs đôi i của đội B**. Mỗi vòng (ván con) các đội **shuffle lại** thành phần đôi từ danh sách VĐV của mình.

Hiện tại engine `lib/tournament/match/mlp.js` đã resolve điểm theo `kind` sub-match, `tournament_games.lineup jsonb` đã tồn tại — nhưng CHƯA có ai sinh ra "vòng nào ghép ai với ai". Đó là phần spec này bổ sung: **pair schedule** (lịch ghép đôi nội bộ mỗi đội).

Phân biệt 2 khái niệm — đừng nhầm:
- **Matchup** (đã có) = trận giữa 2 đội = 1 row `tournament_matches`. Do `roundRobin.generateSchedule` sinh.
- **Pair schedule** (spec này) = với MỖI đội, mỗi vòng ghép VĐV thành các đôi như thế nào. Thuộc về **nội bộ một đội**, độc lập với việc đội đó gặp ai.

---

## 1. Quyết định lưu trữ — KHUYẾN NGHỊ: `stage.config.pairSchedule` (JSONB)

So sánh 3 phương án:

| Phương án | Migration | Ưu | Nhược |
|---|---|---|---|
| **A. `stage.config.pairSchedule`** ✅ | Không | Pair schedule là **thuộc tính của stage MLP** (cùng `gamesPerMatchup`, `dreamBreaker`). Đọc/ghi 1 lần cùng stage. Không động schema. Atomic với config. | Object hơi to nếu đội đông (chấp nhận được — giải phong trào ≤ vài chục VĐV). |
| B. Cột `pair_schedule jsonb` trên `tournament_entrants` | Cần migration | Tách theo đội, query lẻ được | Pair schedule là khái niệm **per-stage**, không phải per-entrant toàn giải. Một entrant có thể (tương lai) tham gia nhiều stage MLP với pairing khác nhau → nhét vào entrant là sai trục. Thừa migration. |
| C. Bảng mới `tournament_pairs` | Cần migration | Chuẩn hóa cao, query SQL được từng đôi | Over-engineering. Pair schedule không cần JOIN/filter/aggregate độc lập — luôn đọc trọn theo stage. Thêm bảng + RLS + API CRUD cho thứ chỉ đọc-trọn-gói. Vi phạm nguyên tắc "field chỉ phục vụ 1 thể thức → đẩy vào jsonb". |

**Quyết định: Phương án A.** Lý do cốt lõi:
1. **Đúng trục dữ liệu**: pairing là per-stage-per-team, mà stage đã có `config jsonb` mở. MLP-only → đúng nguyên tắc clean-slate "field 1 thể thức vào jsonb".
2. **Zero migration** → triển khai nhanh, không rủi ro schema.
3. **Truy cập trọn gói**: UI console MLP luôn cần cả lịch ghép của mọi đội cùng lúc (để hiển thị "vòng 1: A1 vs B1..."). Không có use-case query 1 đôi lẻ.
4. **Atomic**: regenerate pairs = ghi đè 1 key trong `config`, không cần transaction nhiều bảng.

> CẦN XÁC NHẬN (không chặn triển khai): nếu sau này 1 đội đá nhiều stage MLP với pairing khác → vẫn đúng vì mỗi stage giữ pairSchedule riêng. Phương án A scale tốt hơn B.

---

## 2. Schema `stage.config.pairSchedule`

Ghi vào `tournament_stages.config` (merge, giữ nguyên `gamesPerMatchup`/`dreamBreaker`):

```jsonc
{
  "gamesPerMatchup": 4,
  "dreamBreaker": true,
  "pairSchedule": {
    "seed": 42,                 // hạt giống đã dùng — để tái lập / hiển thị
    "generatedAt": "2026-06-17T09:00:00Z",
    "rounds": 4,                // = gamesPerMatchup (số vòng shuffle)
    "subKinds": ["womens", "mens", "mixed1", "mixed2"],  // nhãn kind cho từng vòng (khớp game.kind)
    "teams": {
      "<entrantId>": {
        "pairsPerRound": 2,     // = floor(memberCount / 2)
        "rounds": [
          // round 0 (vòng 1) — mảng các đôi, mỗi đôi = [memberRef, memberRef]
          [
            [{ "mi": 0, "name": "Lan" }, { "mi": 3, "name": "Mai" }],
            [{ "mi": 1, "name": "Tú" }, { "mi": 2, "name": "Nam" }]
          ],
          // round 1 (vòng 2) — shuffle lại
          [
            [{ "mi": 0, "name": "Lan" }, { "mi": 1, "name": "Tú" }],
            [{ "mi": 2, "name": "Nam" }, { "mi": 3, "name": "Mai" }]
          ],
          [ /* round 2 */ ],
          [ /* round 3 */ ]
        ]
      },
      "<entrantId2>": { "pairsPerRound": 2, "rounds": [ /* ... */ ] }
    }
  }
}
```

**Ghi chú field:**
- `mi` = **member index** trong mảng `members` của entrant (theo thứ tự GET entrants trả về). KHÔNG dùng `member_id` (có thể null cho VĐV nhập tay). `name` chỉ để hiển thị/debug, nguồn chân lý là `mi`.
- `subKinds[r]` = `kind` của ván con vòng `r` — phải khớp enum `tournament_games.kind`. Với `gamesPerMatchup=2` → `["womens","mens"]`; với `4` → `["womens","mens","mixed1","mixed2"]`. (Đây cũng là `config.subMatches` mà `mlp.resolveMatch` đọc.)
- VĐV lẻ (đội số VĐV lẻ): VĐV dư **ngồi ngoài vòng đó** (bench). Đôi cuối có thể chỉ 1 người? Không — pickleball đôi cần đúng 2. `pairsPerRound = floor(memberCount/2)`, VĐV thừa rotate nghỉ luân phiên giữa các vòng (engine lo phần xoay vòng để công bằng).

**Ghép đôi khi 2 đội gặp nhau** (đôi i vs đôi i) KHÔNG lưu trong pairSchedule — nó là phép suy ra lúc nhập điểm: matchup A-vs-B, vòng r, ván con thứ i → `teams[A].rounds[r][i]` vs `teams[B].rounds[r][i]`. Xem mục 4.

---

## 3. API endpoint mới: `/api/tournament-v2/pairs`

Đặt cùng nhóm `app/api/tournament-v2/pairs/route.js`. Auth & lỗi theo quy ước `03_api_contract.md`.

### GET /api/tournament-v2/pairs (public)
Đọc pairSchedule hiện có của 1 stage.
- **Query**: `?stageId=<id>` (bắt buộc).
- **200**: `{ "pairSchedule": <object|null> }` — `null` nếu chưa sinh.
- **Lỗi**: 400 `stageId is required`. 404 `Stage không tồn tại`.

### POST /api/tournament-v2/pairs (admin)
Sinh (hoặc regenerate) pairSchedule cho stage MLP.
- **Body**: `{ stageId*, seed?=<random|1> }`.
- **Hành vi server**:
  1. `requireGroupAdmin()`.
  2. Load stage (scope group). 400 nếu `match_format !== 'mlp'` → `Pair schedule chỉ áp dụng cho stage MLP`.
  3. Load entrants + members của tournament (theo thứ tự seed, members theo thứ tự id) → dựng `teams = [{ entrantId, members: [{name}] }]`.
  4. 400 nếu đội nào < 2 VĐV → `Đội "<name>" cần ít nhất 2 VĐV`.
  5. Gọi engine `generatePairSchedule(teams, rounds, seed)` (rounds = `config.gamesPerMatchup`).
  6. Merge kết quả vào `config.pairSchedule`, PATCH `tournament_stages.config`.
- **200**: `{ "success": true, "pairSchedule": <object> }`.
- **Lỗi**: 403. 400 (các thông báo trên). 404 `Stage không tồn tại`. 500 Supabase.
- **Idempotent**: POST lại = ghi đè (regenerate). Không tạo bản ghi mới.

> **Why endpoint riêng, không nhét vào `/generate`?** `/generate` sinh **matchups** (round_robin). Pairs sinh **lịch nội bộ đội** — trục khác, có thể regenerate độc lập (admin muốn shuffle lại mà không phá matchup/điểm đã nhập). Tách 2 endpoint cho 2 trục dữ liệu khác nhau.

---

## 4. Match/game storage — đọc từ pairSchedule, snapshot vào `game.lineup`

**Nguyên tắc: pairSchedule là TEMPLATE (nguồn chân lý lúc render đề xuất). `game.lineup` là SNAPSHOT (sự thật lúc chốt điểm).**

Khi nhập điểm 1 matchup MLP (route `PUT /games` đã tồn tại), mỗi ván con = 1 row `tournament_games`:
```jsonc
{
  "match_id": <matchupId>,
  "game_no": 1,                 // = vòng r + 1
  "kind": "womens",             // = subKinds[r]
  "score_a": 11, "score_b": 7,
  "lineup": {                   // SNAPSHOT đôi thực đá ván này
    "round": 0,
    "pairIndex": 0,
    "a": [{ "mi": 0, "name": "Lan" }, { "mi": 3, "name": "Mai" }],   // đôi đội A
    "b": [{ "mi": 1, "name": "Hoa" }, { "mi": 2, "name": "Yến" }]    // đôi đội B
  }
}
```

**Luồng**: UI console mở matchup A-vs-B → đọc `stage.config.pairSchedule`, với mỗi vòng `r` và mỗi `pairIndex i` dựng đề xuất `teams[A].rounds[r][i]` vs `teams[B].rounds[r][i]` → admin xác nhận/sửa → POST games kèm `lineup` snapshot.

**Why snapshot, không chỉ tham chiếu pairSchedule lúc đọc?**
- Admin có thể **regenerate** pairSchedule sau khi đã nhập vài trận → nếu chỉ tham chiếu, các game cũ sẽ "đổi người" sai lịch sử. Snapshot `lineup` khóa cứng ai đã đá ván đó.
- DreamBreaker & sửa tay (admin đổi người ngoài đề xuất) chỉ ghi được vào snapshot.
- `mlp.resolveMatch` KHÔNG cần đọc `lineup` (chỉ cần `kind`/`score`) → snapshot là dữ liệu hiển thị/lịch sử, không ảnh hưởng engine resolve. Engine giữ nguyên, không sửa.

`game.lineup` đã là cột JSONB sẵn có → **không cần migration, không cần đổi `PUT /games` contract** (nó đã nhận `lineup` optional, xem `03_api_contract.md` mục games). Chỉ cần UI gửi `lineup` đúng shape trên.

---

## 5. DreamBreaker pairs

DreamBreaker = sub-match tiebreaker khi hòa sau đủ vòng. Theo `02_engine_api.md`, đây là **đơn luân phiên rally đến 21**, **cặp đôi/người tự chọn** (không nằm trong pairSchedule sinh sẵn).

- **Không sinh trong `generatePairSchedule`** — DreamBreaker chỉ xuất hiện khi hòa, người chơi tự chọn lúc đó.
- Lưu như 1 game `kind:'dreambreaker'`, `game_no = gamesPerMatchup + 1`, `lineup` snapshot người được chọn:
```jsonc
{
  "match_id": <matchupId>, "game_no": 5, "kind": "dreambreaker",
  "score_a": 21, "score_b": 18,
  "lineup": {
    "dreamBreaker": true,
    "a": [{ "mi": 0, "name": "Lan" }],   // 1 hoặc nhiều VĐV luân phiên — admin chọn
    "b": [{ "mi": 2, "name": "Yến" }]
  }
}
```
- `mlp.resolveMatch` đã xử lý `kind==='dreambreaker'` đúng (winner theo score). Không sửa engine.
- **UI**: matchup hiển thị nút "Thêm DreamBreaker" CHỈ khi resolve trả `complete=false` mà đã đá đủ sub (winsA===winsB). Admin chọn VĐV mỗi đội → POST thêm game dreambreaker.

---

## 6. Engine spec — `lib/tournament/match/mlpPairs.js`

Hàm thuần CommonJS, deterministic theo `seed`, không I/O. Thêm test `test:t-engines`.

### Signature
```js
generatePairSchedule(teams, rounds, seed = 1) -> PairSchedule
```

**Input:**
```js
teams = [
  { entrantId: 10, members: [{ name: 'Lan' }, { name: 'Tú' }, { name: 'Nam' }, { name: 'Mai' }] },
  { entrantId: 11, members: [{ name: 'Hoa' }, { name: 'Yến' }, /* ... */ ] }
]
rounds = 4          // = gamesPerMatchup
seed   = 42
```

**Output** (chính là object `pairSchedule` mục 2, KHÔNG kèm `generatedAt` — server gắn timestamp):
```js
{
  seed: 42,
  rounds: 4,
  subKinds: rounds === 2 ? ['womens','mens'] : ['womens','mens','mixed1','mixed2'],
  teams: {
    '10': { pairsPerRound: 2, rounds: [ [[{mi,name},{mi,name}], ...], ... ] },
    '11': { ... }
  }
}
```

**Thuật toán (mỗi đội độc lập):**
1. `n = members.length`; `pairsPerRound = floor(n/2)`; nếu `n < 2` → ném `Error('Đội cần ≥ 2 VĐV')` (API đã chặn trước, engine vẫn guard).
2. Với mỗi vòng `r ∈ [0, rounds)`: shuffle `members` bằng RNG seed-hóa (`seed + r*131 + teamHash` để mỗi vòng/đội khác nhau nhưng tái lập được). Tham khảo `roundRobin.js` đã có util shuffle deterministic — TÁI SỬ DỤNG cùng kiểu RNG (mulberry32/LCG) để nhất quán codebase.
3. Cắt mảng đã shuffle thành các đôi liên tiếp `[m0,m1],[m2,m3],...`. Nếu lẻ → phần tử cuối là **bench** (bỏ khỏi rounds, KHÔNG tạo đôi 1 người). Để công bằng, VĐV ngồi ngoài nên xoay vòng — đảm bảo cùng 1 người không bench mọi vòng (dùng offset theo `r`).
4. Mỗi member ref = `{ mi: <indexGốcTrongMembers>, name }`.

**Ràng buộc determinism (cho QA test):** cùng `(teams, rounds, seed)` → output byte-identical. Khác `seed` → khác hoán vị. Đây là điều kiện test bắt buộc.

> Engine KHÔNG biết "đôi i đội A đấu đôi i đội B" — đó là phép ghép cross-team suy ra ở UI/API lúc nhập điểm (mục 4). Engine chỉ sinh lịch nội bộ từng đội. Giữ engine thuần, single-responsibility.

---

## 7. Tích hợp wizard + console (UX flow)

### Wizard — chèn vào STEP 4 MLP (hiện step 4 chỉ "Sinh lịch")
Hiện `runGenerate()` gọi `generateSchedule(stages[0].id)` (sinh matchups). Với MLP, sau khi sinh matchups thành công → **gọi tiếp** POST `/pairs` để sinh pairSchedule:
```
Step 4 MLP:
  1. Sinh lịch (matchups round_robin)      → POST /generate
  2. Sinh cặp đấu (pair schedule)          → POST /pairs   (tự động nối tiếp, hoặc nút riêng)
  3. Hiển thị: "✓ Đã sinh N trận · M vòng ghép đôi"
  4. Nút "Mở console giải"
```
Khuyến nghị: **tự động** chạy bước 2 ngay sau bước 1 (admin không cần thao tác thừa), nhưng để **1 nút "Sinh lại cặp đôi"** trong console cho phép shuffle lại.

> Không cần thêm STEP riêng trong wizard — gộp vào step 4 hiện có. Mảng `STEPS_MLP` giữ nguyên 4 bước.

### Console giải (trang quản lý matchup MLP)
- Mở 1 matchup A-vs-B → đọc `GET /pairs?stageId=` (cache theo stage) + entrants.
- Render bảng `rounds × pairIndex`: mỗi dòng = 1 ván con, cột trái đề xuất đôi A (`teams[A].rounds[r][i]`), cột phải đôi B, ô nhập `score_a`/`score_b`.
- Cho phép admin **sửa thành phần đôi** ngay tại ô (override) trước khi lưu → khi `PUT /games`, gửi `lineup` = đôi thực tế (đã sửa hoặc theo đề xuất).
- Sau khi đủ vòng mà hòa → hiện khối **DreamBreaker** (chọn VĐV + nhập điểm) → `PUT /games` thêm game `kind:'dreambreaker'`.
- Nút **"Sinh lại cặp đôi"** (admin) → POST `/pairs` seed mới. Cảnh báo: chỉ đổi ĐỀ XUẤT, các game đã lưu (`lineup` snapshot) giữ nguyên.

---

## 8. Thứ tự triển khai cho dev

1. **engine-dev**: `lib/tournament/match/mlpPairs.js` + test determinism (`test:t-engines` thành 11 dòng ok). Export `generatePairSchedule`. (Mục 6)
2. **api-dev**: `app/api/tournament-v2/pairs/route.js` (GET + POST). Merge vào `stage.config`. Thêm client helper trong `lib/tournamentV2Client.js` (`getPairs`, `generatePairs`). (Mục 3)
3. **ui-dev**: nối step 4 wizard (auto POST /pairs sau /generate) + render đôi trong console matchup MLP + khối DreamBreaker + nút sinh lại. (Mục 7) Gửi `game.lineup` đúng shape (mục 4–5).
4. **qa**: determinism engine; regenerate không phá game cũ; đội <2 VĐV bị chặn; đội số VĐV lẻ bench xoay vòng; dreambreaker lưu/resolve đúng.

**Không cần migration. Không sửa `mlp.resolveMatch`. Không đổi contract `PUT /games`.**
