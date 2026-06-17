# 07 — MLP Pairs QA report (Task #5)

QA: tournament-qa · Ngày: 2026-06-17 · Spec: `06_mlp_pairs_spec.md`
Kết quả: **18/18 check PASS** · 1 bug cross-boundary đã fix.

## A. Engine — `lib/tournament/match/mlpPairs.js`
| # | Check | Kết quả |
|---|---|---|
| 1 | `node tests/tournament/mlp-pairs.test.js` pass 5 test | PASS (T1–T5 ok) |
| 2 | `npm run test:t-engines` toàn bộ xanh | PASS (12 suite ok) |
| 3 | export `generatePairSchedule`, sig `(teams, rounds, seed)`, output shape khớp spec §6 | PASS — `{seed,rounds,subKinds,teams}`, RNG mulberry32 reuse từ roundRobin |

## B. API — `app/api/tournament-v2/pairs/route.js`
| # | Check | Kết quả |
|---|---|---|
| 4 | GET dùng `getEffectiveGroupContext`, query `stageId`, trả `{pairSchedule}` | PASS (L13–35) |
| 5 | POST dùng `requireGroupAdmin`, body `{stageId,seed}`, gọi `generatePairSchedule` | PASS (L46–131) |
| 6 | merge `pairSchedule` vào `stage.config` không xóa `gamesPerMatchup`/`dreamBreaker` | PASS — `{...stage.config, pairSchedule}` (L138) |
| 7 | `generatedAt` server-side | PASS — `new Date().toISOString()` (L135) |
| 8 | guard `match_format !== 'mlp'` → 400 | PASS (L73–78) |

## C. Client — `lib/tournamentV2Client.js`
| # | Check | Kết quả |
|---|---|---|
| 9 | `getPairs(stageId)` + `generatePairs(stageId, seed)`, path `/pairs` | PASS (L97–103) |

## D. UI Wizard — `TournamentWizard.js`
| # | Check | Kết quả |
|---|---|---|
| 10 | `runGenerate` MLP gọi `generatePairs` sau `generateSchedule` | PASS (L317 → L324) |
| 11 | state `pairSchedule`/`pairBusy`/`pairError` | PASS (L75–77) |
| 12 | `PairsPreview` render subKinds labels | PASS (L804–841, dùng `subKindLabel`) |
| 13 | nút "Sinh lại cặp đôi" chỉ khi MLP | PASS (trong block `tournamentFormat === 'mlp'`, L757–779) |

## E. UI Console — `console/tabs/ResultsTab.js`
| # | Check | Kết quả |
|---|---|---|
| 14 | `load()` stage MLP gọi `getPairs(stageId)` | PASS (L396) |
| 15 | mỗi ván con MLP render lineup display | PASS (L242–255, `pairLabel`) |
| 16 | `save()` đính `lineup` snapshot vào games payload | PASS (L150–166); games route nhận `lineup` (games/route.js L62) |
| 17 | DreamBreaker section chỉ khi hòa sau đủ ván con | PASS — `subsScored>=MLP_SUBS.length && subWinsA===subWinsB` (L203–205) |
| 18 | luồng Regular KHÔNG gọi pairs | PASS — `if (isMlp) tasks.push(getPairs...)`, save chỉ set lineup khi `isMlp` |

## F. Shape cross-check
| # | Check | Kết quả |
|---|---|---|
| 19 | engine `teams[id].rounds[r]` = mảng pairs, pair = `[{mi,name},{mi,name}]` | PASS (mlpPairs L68–71) |
| 20 | API ghi `pairSchedule.teams[id].rounds[r]` same shape | PASS — ghi nguyên output engine |
| 21 | UI đọc `pairSchedule.teams[entrantAId].rounds[r][i]` cho lineup | PASS — `proposedPair()` (ResultsTab L39–46) |

---

## BUG đã fix

### BUG-1 (cross-boundary, đã fix) — `mi` index lệch giữa pairs API và entrants GET
- **Lớp**: API. File: `app/api/tournament-v2/entrants/route.js:65-69` (GET members query).
- **Kỳ vọng**: members trả về theo thứ tự `id` asc — để `mi` (member index) khớp với thứ tự mà pairs API dùng khi sinh schedule. Pairs POST (`pairs/route.js:101`) order members `.order('id', { ascending: true })`, gán `mi = vị trí trong mảng id-asc`.
- **Thực tế (trước fix)**: entrants GET query members KHÔNG có `.order(...)` → Postgres trả thứ tự không đảm bảo. ResultsTab `teamMembers(entrant)` map `entrant.members[idx] → {mi: idx}` cho picker DreamBreaker (L217) sẽ gán `mi` theo thứ tự khác với pairs engine → cùng 1 `mi` có thể trỏ 2 VĐV khác nhau giữa pairSchedule và checklist DreamBreaker. Lineup display dùng `name` snapshot nên hiển thị đúng, nhưng `mi` trong DreamBreaker lineup snapshot sẽ không nhất quán với pairs `mi`.
- **Fix**: thêm `.order('id', { ascending: true })` vào members query của entrants GET (route.js L69), khớp với pairs API. Tests + engine suite vẫn xanh sau fix.
- **Dev gốc**: tournament-api-dev (đã tự fix, thay đổi nhỏ).

---

## Ghi chú (không phải bug, ngoài scope)
- ResultsTab `MLP_SUBS` hardcode 4 ván con (`womens/mens/mixed1/mixed2`) bất kể `gamesPerMatchup`. Engine `subKinds` cho `rounds=2` trả `['womens','mens']`. Khi cấu hình 2 ván/lượt, UI console vẫn render 4 hàng — hành vi này có TRƯỚC task pairs (commit 149a7f5, console shell), KHÔNG phải regression của build này. Spec §2/§6 có nhắc case gamesPerMatchup=2 → nên gửi tournament-ui-dev xem xét ở task riêng nếu muốn console động theo gamesPerMatchup. PairsPreview ở wizard render đúng số `rounds` động.
