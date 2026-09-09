# Phân công module giải đấu cho 3 IDE

**Bốn plan gốc** — mỗi task trong đó đã có code đầy đủ, lệnh chạy và kết quả kỳ vọng. IDE đọc thẳng task của mình là làm được, không cần đọc cả plan.

| Plan | File |
|---|---|
| Spec 0 · Danh sách & vòng đời | `docs/superpowers/plans/2026-09-09-tournament-directory-lifecycle.md` |
| Spec 1 · Số ván theo vòng | `docs/superpowers/plans/2026-09-09-tournament-round-scoring.md` |
| Spec 2 · Bàn điều hành | `docs/superpowers/plans/2026-09-09-tournament-operations.md` |
| Spec 3 · Bốc thăm / BXH / correction | `docs/superpowers/plans/2026-09-09-tournament-draw-standings-corrections.md` |

**Nhánh:** `main`. Working tree có **67 file** sửa/chưa theo dõi của việc khác.

---

## ⚠ Bốn luật bắt buộc cho mọi IDE

1. **Không `git add -A` / `git add .` trần.** Working tree có 67 file của việc khác (tournament-v2 Phase 4, `_workspace/`, `evidence/`, `.agents/`, `.codex/`). Stage đúng đường dẫn của task mình.
2. **Không sửa file ngoài cột "File sở hữu"** của luồng mình. Đó là ranh giới chống xung đột. Cần một hàm ở file người khác sở hữu thì **nhắn**, đừng tự sửa.
3. **Không đụng `lib/tournament/engines/*`.** IDE thứ tư đang làm `doubleElim.js` + `match/team.js` ở đó.
4. **Chỉ IDE 1 được apply migration.** Ba IDE cùng apply lên một database thật là cách nhanh nhất để hỏng dữ liệu. IDE 2 và 3 viết file `.sql` rồi **nhắn IDE 1 apply**.

---

## Số migration đã chốt — không được tự chọn

`043` và `044` đã bị `club_notifications` và `group_fund_qr` chiếm (đã commit, đã apply).

| Số | Nội dung | Ai viết | Ai apply |
|---|---|---|---|
| **045** | `tournament_operation_logs` | IDE 1 | IDE 1 |
| **046** | Mốc thời gian trận + trạng thái `warmup`/`paused` + CHECK `result_type` | IDE 3 | IDE 1 |
| **047** | `loser_match_id`, `final_standings`, CHECK correction | IDE 1 | IDE 1 |
| **048** | RPC định tuyến kẻ thua | IDE 3 (khối B) | IDE 1 |

---

## Bản đồ xung đột — file bị nhiều plan đụng

| File | Plan đụng vào | Cách xử lý |
|---|---|---|
| `package.json` | 0, 1, 2, 3 | **IDE 1 viết hết ở Task 0**, sau đó không ai đụng nữa |
| `lib/tournamentV2Client.js` | 1, 2, 3 | **IDE 1 viết hết ở Task 0**, sau đó không ai đụng nữa |
| `app/api/tournament-v2/tournaments/route.js` | 0, 3 | Cùng IDE 1 |
| `app/giai-dau/v2/console/TournamentConsoleV2.js` | 2, 3 | IDE 3 sở hữu; phần bước 4 của IDE 1 làm ở hợp long |
| `lib/tournament/results.js` | 1, 3-khốiB | IDE 2 làm trước, khối B sau hợp long |
| `app/api/tournament-v2/games/route.js` | 1, 3-khốiB | Như trên |
| `tests/tournament/api-tournaments.contract.test.js` | 0, 3 | Cùng IDE 1 |

Mọi file còn lại chỉ một luồng đụng → chạy song song vô tư.

---

# Task 0 — Dọn đường (IDE 1 làm một mình, hai IDE kia CHỜ)

Không thể song song được ngay vì ba plan đều cần cùng một nền tảng. Task này gộp:

- Spec 0 Task 1, 2, 3 (`lifecycle.js`, migration 045, `operationLog.js`)
- Spec 2 Task A1 (xoá bản nháp Phase 4 chưa commit)
- **Toàn bộ** hàm trong `lib/tournamentV2Client.js` mà cả ba plan cần
- **Toàn bộ** script test trong `package.json`

Hai file cuối là lý do phải làm trước: chúng bị cả ba plan đụng vào, viết một lần rồi khoá lại thì không ai xung đột với ai.

**Client cần viết đủ ngay (17 hàm)** — đọc chữ ký từ ba plan:

```
getRoundRules · updateRoundRule                                    (Spec 1)
listVenues · saveVenue · listCourts · saveCourt · setCourtActive
  · deleteCourt · transitionMatch · getCourtBoard · assignMatchCourt
  · listOperationLogs                                              (Spec 2)
getDraw · rollDraw · swapDrawEntries · lockDraw · unlockDraw        (Spec 3)
```

**Script test cần thêm đủ ngay (5 dòng)**: `test:t-lifecycle`, `test:t-round-scoring`, `test:t-operations`, `test:t-ops-ui`, `test:t-draw`, và cập nhật `test:tournament` gọi cả năm.

> Năm script này trỏ tới file test **chưa tồn tại**, nên `npm run test:tournament` sẽ đỏ cho tới khi hợp long. Đó là chủ ý. Trong lúc làm, mỗi IDE chỉ chạy `node tests/tournament/<file của mình>.js`. Ghi rõ điều này vào commit message.

Xong Task 0 thì **push và báo hai IDE kia pull**.

---

# Ba luồng chạy song song

## Luồng 1 — Vòng đời giải + xếp hạng (IDE 1, Claude Code giữ)

| Task | Nguồn | Nội dung |
|---|---|---|
| 4–8 | Plan Spec 0 | POST ép `draft` · PATCH kiểm cạnh (**vá lỗi 500**) · DELETE có điều kiện · GET làm giàu · trang danh sách 3 nhóm |
| A2 | Plan Spec 3 | Migration **047** |
| A5 | Plan Spec 3 | `qualification.js` — suất đi tiếp theo cơ hội toán học |
| A6 | Plan Spec 3 | Cột suất đi tiếp + dòng tiêu chí trong BXH |
| A7 | Plan Spec 3 | Chốt giải ghim `final_standings` |

**File sở hữu:**
```
lib/tournament/lifecycle.js          lib/tournament/operationLog.js
lib/tournament/qualification.js      database/migrations/045_*.sql  047_*.sql
app/api/tournament-v2/tournaments/route.js
app/api/tournament-v2/standings/route.js
app/giai-dau/v2/page.js              app/giai-dau/v2/v2.css
app/giai-dau/v2/console/tabs/StandingsTab.js
tests/tournament/lifecycle.test.js   migration-045.test.js  migration-047.test.js
tests/tournament/qualification.test.js
tests/tournament/api-tournaments.contract.test.js
tests/tournament/ui-list.contract.test.js
tests/tournament/ui-standings.contract.test.js
package.json                         lib/tournamentV2Client.js
```

## Luồng 2 — Luật vòng + đường nhập điểm (giao IDE khác được ngay sau Task 0)

Toàn bộ **Plan Spec 1**, Task 1 → 8. **Bỏ Task 9** (script test — IDE 1 đã làm ở Task 0).

Đây là luồng vá **bốn lỗi có thật**, quan trọng nhất trong cả đợt:

| | Lỗi | Task |
|---|---|---|
| P0 | Chốt trận ghi `'done'`, vi phạm CHECK → **mọi lần chốt trận trả 500** | 5 |
| P0 | Kiểm tỉ số bọc trong `if (scoring)` → nhập `99–0` cũng lưu | 5 |
| P1 | BXH đọc `config.bestOf` ở gốc → giai đoạn BO1 không bao giờ có đội thắng | 6 |
| P1 | Ánh xạ `finalized → done` chỉ chạy trong một nhánh | 6 |

Cả bốn **chưa từng nổ** vì `tournament_matches` có 0 dòng — đường nhập điểm này chưa chạy thật lần nào.

**File sở hữu:**
```
lib/tournament/rules/roundScoring.js
lib/tournament/results.js            lib/tournament/standingsService.js
app/api/tournament-v2/round-rules/route.js
app/api/tournament-v2/games/route.js
app/giai-dau/v2/console/RoundScoringPanel.js
app/giai-dau/v2/console/console.css
app/giai-dau/v2/console/tabs/SettingsTab.js
app/giai-dau/v2/console/tabs/ResultsTab.js
tests/tournament/round-scoring.test.js  api-round-rules.contract.test.js
tests/tournament/ui-round-scoring.contract.test.js
tests/tournament/api-games.contract.test.js  results.test.js
tests/tournament/ui-results.contract.test.js
```

## Luồng 3 — Bàn điều hành (giao IDE khác được ngay sau Task 0)

Toàn bộ **Plan Spec 2**, nhóm A2–A4, B, C, D. **Bỏ A1** (IDE 1 đã xoá ở Task 0) và **bỏ phần `package.json`/client**.

Bốn nhóm, mỗi nhóm giao được một mình — dừng sau nhóm nào cũng để lại hệ chạy được.

**File sở hữu:**
```
lib/tournament/matchLifecycle.js     lib/tournament/courtBoard.js
database/migrations/046_*.sql        (viết, IDE 1 apply)
app/api/tournament-v2/venues/        courts/     assignments/
app/api/tournament-v2/match-transition/    operation-logs/
app/giai-dau/v2/console/ConsoleShell.js    shell.css
app/giai-dau/v2/console/steps/CourtsStep.js  ControlStep.js  LogStep.js
app/giai-dau/v2/console/TournamentConsoleV2.js
docs/pickhub-core/UI-BRAND-SYSTEM.md       (chỉ Task C4)
tests/tournament/operations.test.js  migration-046.test.js
tests/tournament/api-courts.contract.test.js
tests/tournament/api-match-transition.contract.test.js
tests/tournament/ui-shell.contract.test.js
tests/tournament/ui-courts-step.contract.test.js
tests/tournament/ui-control-step.contract.test.js
tests/tournament/ui-console.contract.test.js
evidence/spec2-contrast-2026-09-09.md
```

---

## Điểm hợp long — phải chờ

| Việc | Chờ ai xong |
|---|---|
| `npm run test:tournament` xanh trọn bộ | cả ba luồng |
| Spec 3 Task A1, A3, A4 (bốc thăm) | Luồng 3 nhóm C — `DrawStep` mount vào shell |
| Spec 3 Task A8 (correction) | Luồng 2 (`resolveMatchScoring`) + Luồng 3 (migration 046 có `warmup`/`paused`) |
| Spec 3 khối B (double-elim) | IDE thứ tư commit `lib/tournament/engines/doubleElim.js` |

Sau hợp long, IDE 1 làm nốt Spec 3 A1/A3/A4/A8/A9.

---

## Ước lượng

| Luồng | Task | Ghi chú |
|---|---|---|
| Task 0 | 1 khối | Chặn hai luồng kia |
| Luồng 1 | 10 task | Nhiều task nhỏ |
| Luồng 2 | 8 task | Đụng code lõi, cẩn thận nhất |
| Luồng 3 | 12 task | Nhiều nhất, nhưng chia 4 nhóm rõ |

---

# Câu lệnh mở đầu — copy nguyên khối cho từng IDE

## → IDE 2 (Luồng 2 — luật vòng)

````
Dự án PickHub, nhánh `main`. Bạn làm một luồng trong ba luồng song song.

ĐỌC TRƯỚC:
1. docs/superpowers/plans/2026-09-09-tournament-round-scoring.md — plan của bạn,
   có sẵn code đầy đủ từng bước
2. docs/superpowers/specs/2026-09-09-tournament-round-scoring-design.md — spec
3. docs/superpowers/plans/2026-09-09-tournament-phan-cong-3-ide.md — phân công
4. Skill `pickhub-engineering` — quy ước group-scoping, admin guard

LÀM: Task 1 → Task 8 của plan. BỎ Task 9 (script package.json đã có sẵn).

BỐN LUẬT:
- Không `git add -A`. Working tree có 67 file của việc khác. Stage đúng đường dẫn.
- Chỉ sửa file trong danh sách "File sở hữu · Luồng 2" của bản phân công. Cần đổi
  file người khác giữ thì NHẮN, đừng tự sửa.
- Không đụng lib/tournament/engines/* — IDE khác đang làm ở đó.
- Không apply migration. Luồng bạn không có migration nào.

VIỆC QUAN TRỌNG NHẤT: Task 5 và 6 vá bốn lỗi có thật. Cả bốn chưa từng nổ vì
tournament_matches có 0 dòng — đường nhập điểm của module này chưa chạy thật lần
nào. Sau Task 5 và Task 6, PHẢI kiểm trên DB thật theo đúng các bước trong plan,
đừng chỉ chạy test file.

TEST: trong lúc làm chỉ chạy từng file `node tests/tournament/<tên>.js`.
`npm run test:tournament` sẽ đỏ cho tới khi cả ba luồng hợp long — đó là chủ ý,
đừng sửa package.json để làm nó xanh.

XONG THÌ BÁO: đã commit tới đâu, bốn lỗi P0/P1 đã kiểm trên DB thật chưa.
````

## → IDE 3 (Luồng 3 — bàn điều hành)

````
Dự án PickHub, nhánh `main`. Bạn làm một luồng trong ba luồng song song.

ĐỌC TRƯỚC:
1. docs/superpowers/plans/2026-09-09-tournament-operations.md — plan của bạn
2. docs/superpowers/specs/2026-09-09-tournament-operations-design.md — spec
3. docs/superpowers/plans/2026-09-09-tournament-phan-cong-3-ide.md — phân công
4. docs/pickhub-core/decisions/ADR-006-montserrat-va-hop-nhat-token-ui.md
5. Skill `pickhub-engineering`

LÀM: nhóm A (Task A2, A3, A4) → nhóm B → nhóm C → nhóm D.
BỎ Task A1 (đã làm rồi) và bỏ mọi bước sửa package.json / tournamentV2Client.js.
Migration của bạn là số 046, KHÔNG phải 044.

BỐN LUẬT:
- Không `git add -A`. Working tree có 67 file của việc khác.
- Chỉ sửa file trong "File sở hữu · Luồng 3". SettingsTab.js và ResultsTab.js do
  IDE khác giữ — bạn chỉ được import, không được sửa.
- Không đụng lib/tournament/engines/*.
- KHÔNG tự apply migration 046. Viết file .sql xong thì nhắn để IDE 1 apply.

BA ĐIỀU DỄ LÀM SAI:
- Font là Montserrat, KHÔNG phải Outfit. Mockup đã duyệt dựng bằng Outfit — đó là
  sai sót của mockup, ADR-006 đã gỡ Outfit khỏi sản phẩm.
- Task C4 bắt buộc đo lại tương phản 6 cặp màu trên nền tối và ghi kết quả vào
  evidence/. Con số trong spec design-system là đo trên nền TRẮNG, không suy ra
  được. Cặp nào trượt AA 4.5:1 thì chỉnh sắc độ rồi đo lại.
- Task C4 cũng phải ghi ngoại lệ "nền đen" vào UI-BRAND-SYSTEM.md. Tài liệu đó
  đang cấm nền đen trong màn hình vận hành; ta phá lệ có lý do, nhưng phải ghi.

TEST: chỉ chạy từng file `node tests/tournament/<tên>.js`.
`npm run test:tournament` đỏ cho tới hợp long — đừng sửa package.json.

XONG MỖI NHÓM THÌ BÁO. Dừng sau nhóm nào cũng để lại hệ chạy được.
````

## → IDE 1 (Claude Code, luồng 1) — sau khi xong Task 0

````
Tiếp tục Luồng 1 của bản phân công 3 IDE.

LÀM:
- Plan Spec 0 (2026-09-09-tournament-directory-lifecycle.md): Task 4 → 8
- Plan Spec 3 (2026-09-09-tournament-draw-standings-corrections.md):
  Task A2 (migration 047), A5, A6, A7

Sau khi cả ba luồng xong, làm nốt Spec 3 Task A1, A3, A4, A8, A9.
Khối B của Spec 3 chờ engine doubleElim.js được commit.

Cũng là người apply mọi migration: 045 (của mình), 046 (IDE 3 viết),
047 (của mình), 048 (IDE 3 viết, khối B).
````

---

## Ba việc IDE nào cũng dễ quên

1. **`tournament_matches` và `tournament_registrations` đều không có `tournament_id`.** Phải join qua `tournament_stages` và `tournament_divisions`. Ba plan đều ghi rõ chỗ này.
2. **Trạng thái trận trên DB là `finalized`, không phải `done`.** Các engine dùng `'done'` làm từ vựng nội bộ và có tầng dịch riêng ở `standingsService.js:63` — đừng "sửa" engine cho khớp DB.
3. **Thông báo lỗi cho BTC viết bằng tiếng Việt**, nói rõ phải làm gì để đi tiếp. Không để lọt thông báo Postgres ra giao diện.
