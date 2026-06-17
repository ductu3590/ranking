# Spec 06 — MLP Pairs Generation (Step 4 wizard) — v2

Tác giả: tournament-architect · Ngày: 2026-06-17 · Cập nhật: 2026-06-17
Trạng thái: **ĐÃ TRIỂN KHAI v2** — đổi từ gender-based (womens/mens/mixed1/mixed2) sang vòng đấu linh hoạt.

---

## 0. Thay đổi v2 so với v1

| Thuộc tính | v1 (gender-based) | v2 (vòng đấu) |
|---|---|---|
| SubKinds | `['womens','mens','mixed1','mixed2']` cố định | `['round_1_pair_1','round_1_pair_2',...]` động |
| Số vòng | 2 hoặc 4 cứng | `gamesPerMatchup` tùy chọn (1..10) |
| Tên hiển thị | "Đôi nữ", "Đôi nam", "Mixed 1/2" | "Vòng 1 · Đôi 1", "Vòng 1 · Đôi 2", ... |
| Ghép đôi | Không có (admin tự sắp) | Ngẫu nhiên theo seed, admin sửa thủ công |
| mlp.resolveMatch | Hardcode 4 sub | Đọc từ `pairSchedule.subKinds.length` |

## 1. Luồng hoạt động

```
Tạo giải → Step 2: chọn số vòng (2 hoặc 4) + dreamBreaker
→ Step 3: thêm VĐV vào đội (không giới hạn giới tính)
→ Step 4: sinh lịch matchups (round_robin) + tự động sinh pairSchedule
→ Console: mỗi trận hiển thị "Vòng 1 · Đôi 1: Tú + Hải vs Thắng + Huy"
→ Admin có thể sửa lịch ghép đôi thủ công (PATCH /pairs)
→ Cập nhật kết quả từng vòng → +1 điểm mỗi vòng thắng
→ Hòa sau tất cả vòng → DreamBreaker (đơn luân phiên)
```

## 2. Engine `lib/tournament/match/mlpPairs.js`

### Signature
```js
generatePairSchedule(teams, rounds, seed = 1) -> PairSchedule
```

### SubKinds động
- `pairsPerRound = floor(memberCount / 2)` — số đôi mỗi vòng (đội cùng số VĐV)
- `pairsPerRound === 1` → subKinds = `['round_1', 'round_2', ...]`
- `pairsPerRound > 1` → subKinds = `['round_1_pair_1', 'round_1_pair_2', 'round_2_pair_1', ...]`

### VĐV lẻ
`pairsPerRound = floor(n/2)`, VĐV thừa bench xoay vòng theo round index (công bằng).

### Determinism
Cùng `(teams, rounds, seed)` → output byte-identical (RNG mulberry32, seed riêng cho mỗi đội × vòng).

## 3. Lưu trữ `stage.config.pairSchedule`

```jsonc
{
  "gamesPerMatchup": 4,
  "dreamBreaker": true,
  "pairSchedule": {
    "seed": 42,
    "generatedAt": "...",
    "updatedAt": "...",   // set khi admin PATCH thủ công
    "rounds": 4,
    "subKinds": ["round_1_pair_1", "round_1_pair_2", "round_2_pair_1", "round_2_pair_2"],
    "teams": {
      "<entrantId>": {
        "pairsPerRound": 2,
        "rounds": [
          // vòng 0 (Vòng 1): 2 đôi
          [
            [{"mi": 0, "name": "Tú"}, {"mi": 1, "name": "Hải"}],
            [{"mi": 2, "name": "Long"}, {"mi": 3, "name": "Tùng"}]
          ],
          // vòng 1 (Vòng 2): shuffle lại
          [...]
        ]
      }
    }
  }
}
```

## 4. `mlp.resolveMatch` — flexible round count

```js
// Nguồn chân lý theo thứ tự ưu tiên:
const pairSubKinds = config.pairSchedule?.subKinds;
const subs = pairSubKinds?.length ? pairSubKinds
  : config.subMatches?.length ? config.subMatches   // legacy
  : Array.from({ length: config.gamesPerMatchup || 4 }, (_, i) => `round_${i+1}`);
// `subs.length` = tổng sub-matches cần chốt kết quả
```

## 5. API Endpoints

| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/tournament-v2/pairs?stageId=` | Đọc pairSchedule |
| POST | `/api/tournament-v2/pairs` | Sinh / regenerate (random) |
| PATCH | `/api/tournament-v2/pairs` | Ghi đè thủ công (admin sửa) |

## 6. UI — Console ResultsTab

- **Labels**: `round_1_pair_2` → "Vòng 1 · Đôi 2" (hàm `subKindDisplayLabel`)
- **Lineup**: parse subKind → `{round, pairIndex}` → lookup `pairSchedule.teams[id].rounds[r][pi]`
- **Nút "🔀 Sinh lại"**: POST /pairs seed mới; cảnh báo các game đã lưu giữ snapshot
- **Nút "✏️ Sửa lịch"**: mở `PairScheduleEditor` — chọn VĐV từ dropdown cho từng slot đôi từng vòng → PATCH /pairs

## 7. UI — SettingsTab (admin)

Mới thêm:
- **Sửa thông tin giải** (tên, ngày, địa điểm)
- **Điều lệ vòng đấu MLP**: `gamesPerMatchup` + `dreamBreaker` → PATCH /stages

## 8. Thứ tự deploy

Không cần migration. Không cần restart Supabase. Deploy code là đủ.
