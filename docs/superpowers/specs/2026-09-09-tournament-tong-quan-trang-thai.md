# Toàn cảnh module Giải đấu — spec, code, việc còn lại

- Ngày rà soát: **2026-09-09**
- Nhánh: `feat/dieu-huong-va-giao-dien-clb`
- Cách rà: đọc code thật trong working tree, đối chiếu `git ls-files` để biết đã commit chưa, và truy vấn schema trực tiếp trên Supabase `uhhlelemewilgsdijwja`.
- **Không tin checkbox trong plan.** Plan wizard hiện 0/51 tick nhưng code đã chạy và đã commit; các plan `2026-06-15-*` cũng 0 tick nhưng đã bị Phase 3 thay thế. Bảng dưới đây dựa trên **code**, không dựa trên tick.

## Ký hiệu

| | Nghĩa |
|---|---|
| ✅ | Đã có spec **và** code đã commit, chạy được |
| 🟡 | Code có nhưng chưa commit, hoặc có code mà chưa có spec |
| 📝 | Có spec, **chưa có code** |
| ❌ | Chưa có cả spec lẫn code |

---

## 1. Bức tranh một trang

```
       TẠO GIẢI                     ĐĂNG KÝ                  CHUẨN BỊ
  ┌──────────────────┐      ┌──────────────────────┐   ┌──────────────────┐
  │ Danh sách giải   │ 🟡   │ Trang công khai /dk  │✅ │ 1 Cấu hình & BO │📝
  │ Wizard 7 bước    │ ✅   │ Đăng ký · ghép cặp   │✅ │ 2 Sân & sơ đồ   │📝
  │ Vòng đời 7 t.thái│ 📝   │ Bảng duyệt của BTC   │✅ │ 3 VĐV & cặp đấu │✅
  └──────────────────┘      │ Theo dõi trạng thái  │✅ │ 4 Bốc thăm      │🟡
                            └──────────────────────┘   └──────────────────┘
                                                                 │
       SAU GIẢI                    TRONG GIẢI                     ▼
  ┌──────────────────┐      ┌──────────────────────┐   ┌──────────────────┐
  │ 8 Nhật ký        │ 📝   │ 6 Lịch & kết quả     │🟡 │ 5 TRUNG TÂM     │📝
  │ Chốt giải        │ 📝   │ 7 BXH & sơ đồ nhánh  │🟡 │   ĐIỀU HÀNH     │
  │ Hạng chung cuộc  │ 📝   │ Sửa kết quả đã chốt  │📝 │   (bảng sân live)│
  │ Trang public+share│✅   │ Nhập điểm            │🟡 └──────────────────┘
  └──────────────────┘      └──────────────────────┘
```

**Đọc nhanh:** phần *đăng ký cộng đồng* và *tạo giải* đã xong và đang chạy. Phần *điều hành trong ngày thi đấu* mới chỉ có spec, chưa có dòng code nào. Phần *bốc thăm / nhập điểm / BXH* có code cũ chạy được nhưng chưa có spec và sẽ được viết lại.

---

## 2. Bảng spec

### 2.1 Spec đã duyệt và đã thi công

| Spec | Trạng thái code | Bằng chứng |
|---|---|---|
| [`2026-09-04-phase-3-interclub-tournament-mvp`](2026-09-04-phase-3-interclub-tournament-mvp-design.md) | ✅ **xong**, còn 7 mục kiểm tay chưa làm | Plan 74/81 tick. 7 mục còn lại đều là *kiểm bằng trình duyệt* và *rehearsal*, không phải code |
| [`2026-09-07-tournament-create-wizard-redesign`](2026-09-07-tournament-create-wizard-redesign.md) | ✅ **xong** | `app/giai-dau/v2/TournamentWizard.js` + `wizard/` đã commit; audit `_workspace/08_audit_task6b_7.md` xác nhận đủ 7 bước. Plan **không tick** nhưng code có thật |
| [`2026-09-07-tournament-open-registration`](2026-09-07-tournament-open-registration-design.md) | ✅ **xong** | Plan 99/99 tick. `app/dk/page.js`, `app/dk/[slug]/[division]/page.js`, `app/dk/theo-doi/page.js`, `app/dk/openreg.css` + 4 route `public/*` — **tất cả đã commit** |
| [`2026-09-08-pickhub-design-system-va-bxh-design`](2026-09-08-pickhub-design-system-va-bxh-design.md) | 📝 **approved, chưa thi công** | Ràng buộc mọi UI mới — xem mục 5 |

### 2.2 Spec + plan viết hôm nay, chưa có dòng code nào

| # | Spec | Plan thi công | Nội dung | Migration |
|---|---|---|---|---|
| 0 | [spec](2026-09-09-tournament-directory-lifecycle-design.md) | [plan](../plans/2026-09-09-tournament-directory-lifecycle.md) · 9 task | Danh sách Sắp/Đang/Đã · vòng đời 7 trạng thái · chốt giải · **sửa lỗi `active`** | **045** (bảng nhật ký) |
| 1 | [spec](2026-09-09-tournament-round-scoring-design.md) | [plan](../plans/2026-09-09-tournament-round-scoring.md) · 9 task | Số ván (BO) theo từng vòng · **vá 4 lỗi P0/P1** | không |
| 2 | [spec](2026-09-09-tournament-operations-design.md) | [plan](../plans/2026-09-09-tournament-operations.md) · 13 task, 4 nhóm | Shell 8 bước · sân · trung tâm điều hành · nhật ký | **046** |
| 3 | [spec](2026-09-09-tournament-draw-standings-corrections-design.md) | [plan](../plans/2026-09-09-tournament-draw-standings-corrections.md) · 13 task, 2 khối | Bốc thăm chốt lịch · BXH & bracket · sửa kết quả đã chốt | **047** (+048 RPC) |

### 2.3 Spec đã lỗi thời

| Spec | Vì sao |
|---|---|
| `2026-06-14-tournament-admin-redesign-design.md` | Trang admin cũ đã redirect sang `/giai-dau/v2` |
| `2026-06-15-tournament-module-design.md` | Bị `phase-3-interclub-tournament-mvp` thay thế |
| `docs/pickhub-core/04-phase-tournament-operations.md` | Rộng hơn nhu cầu thật; Spec 2 cắt gọt lại — xem mục 6 |

---

## 3. Bảng chức năng — đã có gì, thiếu gì

### 3.1 Tạo & quản lý giải

| Chức năng | Code | Ở đâu | Spec |
|---|---|---|---|
| Menu **Giải** → `/giai-dau/v2` | ✅ | `lib/globalNavigation.js:5` | — |
| Danh sách giải (card, chip, sửa, xoá) | 🟡 chạy nhưng **có lỗi** | `app/giai-dau/v2/page.js` | Spec 0 |
| Nhóm Sắp / Đang / Đã · lọc · tìm | ❌ | — | Spec 0 |
| Wizard tạo giải 7 bước | ✅ | `app/giai-dau/v2/TournamentWizard.js` | wizard-redesign |
| Nhiều nội dung (division) trong 1 giải | ✅ | `app/api/tournament-v2/divisions/` | wizard-redesign |
| Mời CLB ngoài | ✅ | `app/api/tournament-v2/clubs/` | phase-3 |
| Vòng đời 7 trạng thái + kiểm cạnh chuyển | ❌ | — | Spec 0 |
| Chốt giải · hạng chung cuộc | ❌ | — | Spec 0 + 3 |

> **Lỗi đang chờ nổ.** `page.js:10-21` chỉ biết `draft / active / completed`, nhưng `tournaments_status_phase3_ck` cho 7 giá trị và **`active` không nằm trong đó**. API PATCH không validate `status` ([`tournaments/route.js:16`](../../../app/api/tournament-v2/tournaments/route.js)) → admin chọn "Đang diễn ra" rồi Lưu là **500 Postgres**. Chưa ai gặp vì cả 4 giải trong DB đều ở `draft`.

### 3.2 Đăng ký giải cộng đồng — **đã xong trọn vẹn**

| Chức năng | Code | Ở đâu |
|---|---|---|
| Trang danh sách giải cộng đồng (public) | ✅ | `app/dk/page.js` |
| Trang đăng ký theo nội dung | ✅ | `app/dk/[slug]/[division]/page.js` |
| Trang VĐV theo dõi trạng thái | ✅ | `app/dk/theo-doi/page.js` |
| Bảng duyệt của BTC | ✅ | `console/tabs/OpenRegTab.js` + `registrations/board/` |
| Lời mời ghép cặp | ✅ | `public/pair-invite/` |
| Sức chứa · waitlist · chống trùng SĐT | ✅ | `lib/tournament/openRegistration.js` |
| Trang công khai giải + ảnh OG + xuất ảnh | ✅ | `app/giai-dau/v2/[slug]/`, `lib/tournament/share.js` |

**Ngoài phạm vi đã chốt từ trước:** thu phí/nộp tiền, OTP xác thực SĐT. Nội dung Đội/MLP cộng đồng đăng ký qua luồng admin CLB, không qua link công khai.

### 3.3 Chuẩn bị giải

| Chức năng | Code | Ở đâu | Spec |
|---|---|---|---|
| Cấu hình luật điểm & tie-break (giải/nội dung/giai đoạn) | ✅ | `app/api/tournament-v2/rules/`, `lib/tournament/rules/` | phase-3 |
| **Số ván (BO) theo vòng** | ❌ | — | **Spec 1** |
| Địa điểm · sân · số sân · thời lượng trận | ❌ | bảng DB có, code không | **Spec 2** |
| VĐV · cặp đấu · ghép cặp | ✅ | `console/tabs/TeamsTab.js`, `pairings/` | wizard + phase-3 |
| Sinh lịch (một phát ra luôn) | 🟡 | `app/api/tournament-v2/generate/` | phase-3 |
| **Bốc thăm nháp → sửa tay → chốt** | ❌ | — | **Spec 3** |

### 3.4 Điều hành ngày thi đấu — **chưa có gì**

| Chức năng | Code | Spec |
|---|---|---|
| Shell sidebar 8 bước + theme tối/tím | ❌ | Spec 2 |
| Bảng sân trực tiếp · trạng thái sân | ❌ | Spec 2 |
| Gọi vào sân · thẻ đọc mic | ❌ | Spec 2 |
| Đồng hồ trận · đếm ngược khởi động | ❌ | Spec 2 |
| Tiến độ giải · ước tính hoàn tất | ❌ | Spec 2 |
| Hàng đợi trận chờ · giờ dự kiến | ❌ | Spec 2 |
| Bỏ cuộc / walkover | ❌ | Spec 2 |
| Nhật ký thao tác | ❌ | Spec 2 |

Bản nháp duy nhất đang tồn tại là `app/giai-dau/v2/operations/page.js` (96 dòng, **chưa commit**) — Spec 2 xoá nó.

### 3.5 Kết quả & xếp hạng

| Chức năng | Code | Ở đâu | Spec |
|---|---|---|---|
| Nhập tỉ số từng ván | 🟡 chạy, chưa spec | `console/tabs/ResultsTab.js` (690 dòng) | Spec 2 viết lại |
| Kiểm ván theo luật | ✅ | `lib/tournament/rules/scoring.js` | phase-3 |
| Kiểm theo **luật của vòng** | ❌ | — | Spec 1 |
| Bảng xếp hạng | 🟡 chạy, chưa spec | `lib/tournament/standingsService.js`, `StandingsTab.js` | Spec 3 |
| Cột **suất đi tiếp** | ❌ | — | Spec 3 |
| Sơ đồ nhánh knockout | 🟡 | `BracketTab.js`, `bracketRender.js` | Spec 3 |
| Sơ đồ nhánh **double-elim** | ❌ | — | Spec 3 (phụ thuộc engine) |
| Sửa kết quả đã chốt (correction) | ❌ | bảng DB có, code không | Spec 3 |
| Nhập điểm qua token cho thư ký sân | ✅ | `score-tokens/`, `lib/tournament/scorekeeperToken.js` | phase-3 |

---

## 4. Code chưa commit — cần quyết

### 4.1 Lớp "Phase 4" của agent trước

11 route API + `lib/tournament/operations.js` + trang `operations/`, **chưa commit**. Chất lượng thấp: `operations.js` 56 dòng, route `schedule` viết dồn một dòng minify. Migration **039–041 đã apply lên DB thật**, 10 bảng tồn tại nhưng **rỗng 0 dòng**.

| Route | Xử lý theo Spec 2 |
|---|---|
| `courts`, `venues`, `assignments`, `schedule` | **Viết lại** |
| `check-ins`, `qr-checkins`, `score-submissions`, `corrections`, `notifications`, `finance`, `time-slots` | **Không commit** — chưa spec nào dùng. Bảng DB giữ nguyên, rỗng, vô hại |

`corrections` sẽ được **viết lại** ở Spec 3 (bảng `tournament_result_corrections` giữ nguyên).

### 4.2 Engine của IDE khác — **không đụng**

`lib/tournament/engines/doubleElim.js` và `lib/tournament/match/team.js` chưa commit, do IDE khác đang làm theo `_workspace/09_architect_new_engines.md`. Mọi spec hôm nay đều ghi rõ **không sửa `lib/tournament/engines/*`**.

Phần double-elim của Spec 3 (vẽ nhánh W/L/GF, định tuyến kẻ thua qua `loser_match_id`) **phụ thuộc shape engine đó** — plan phải để thành nhóm task cuối, cắt ra được nếu engine chưa xong.

---

## 5. Ràng buộc thiết kế mọi UI mới phải theo

Hai tài liệu này ràng buộc Spec 0–3, quan trọng hơn `app/globals.css`:

**[`ADR-006`](../../pickhub-core/decisions/ADR-006-montserrat-va-hop-nhat-token-ui.md)** — `accepted`, 2026-09-07:
1. Font chính là **`Montserrat`**, thay `Inter`. **`Outfit` bị gỡ khỏi sản phẩm.**
2. Chỉ còn bộ token `--ph-*`. Các token `--court-green`, `--pickle-lime`, `--surface-court`, `--live-cyan`, `--rally-coral` **bị khai tử**.

**[`2026-09-08-pickhub-design-system`](2026-09-08-pickhub-design-system-va-bxh-design.md)** — `approved`:
- `app/styles/tokens.css` là nguồn token duy nhất; `primitives.css` là lớp component chung; `legacy-aliases.css` là tầng khai tử.
- `--ph-cyan` và `--ph-coral` **chỉ dùng làm nền/accent, không dùng cho chữ** (trên nền trắng chỉ đạt ~1.3:1 và ~2.5:1). Chữ dương/âm dùng `--ph-positive #1F7A52` / `--ph-negative #C2453A`.

> **Hai điểm phải sửa khi thi công Spec 2.** Mockup đã duyệt dựng bằng **Outfit** — phải đổi sang **Montserrat**. Và mockup dùng cyan/coral **làm chữ trên nền đen** — phép đo khác hẳn nền trắng, nên plan phải có bước **đo lại tương phản toàn bộ theme tối** cho đạt AA 4.5:1 trước khi chốt token. Không suy ra từ con số đo trên nền sáng.

Ngoài ra `UI-BRAND-SYSTEM.md` dòng 34 viết *"Không dùng nền đen hoặc navy đặc trong các màn hình vận hành"*. Bàn điều hành cố ý phá lệ (màn hình đứng lâu trong nhà thi đấu). Plan Spec 2 phải có bước **ghi ngoại lệ này vào brand system kèm lý do**.

---

## 6. Nợ kỹ thuật đã biết, chưa xử lý

| Nợ | Chi tiết | Định xử ở đâu |
|---|---|---|
| **P0 — chốt trận luôn vỡ** | `games/route.js:121` và `score-submissions/route.js:20` ghi `status = 'done'`; RPC `replace_tournament_games` làm `SET status = p_status` không map; CHECK chỉ nhận `pending\|live\|finalized` → **mọi lần chốt trận trả 500**. Chưa ai gặp vì `tournament_matches` có 0 dòng | **Spec 1** mục 9.3 |
| **P0 — kiểm tỉ số bị bỏ qua** | `games/route.js:80` bọc trong `if (scoring)`; giai đoạn chưa qua `generate` thì không có `config.scoring` → nhập `99–0` cũng lưu được | **Spec 1** mục 9.1 |
| **P1 — BXH tính `bestOf` sai** | `standingsService.js:86` truyền `stage.config` gốc, nhưng `bestOf` nằm ở `config.scoring.engine.bestOf` → `simple.js` rơi về mặc định 3; giai đoạn BO1 không bao giờ ghi nhận đội thắng | **Spec 1** mục 9.2 |
| `tournaments.status` lệch UI | UI biết 3 giá trị, DB cho 7, `active` không hợp lệ → 500 | **Spec 0** |
| 4 cột trạng thái chồng nhau | `tournament_divisions` có `registration_status`, `scheduling_status`, `competition_status`, `schedule_publication_status` | chưa xếp lịch — cần một đợt dọn riêng |
| `matches.court` là `text` | Di sản; nguồn sự thật mới là `match_assignments.court_id` | Spec 2 ghi kèm nhãn để không vỡ; gỡ ở spec sau |
| Hai design system song song | `globals.css` ghi đè `--ph-*` bằng bảng xanh sân; test `court-energy-css.test.js` đóng đinh cả hai hệ | spec design-system 2026-09-08 |
| Không có trạng thái `cancelled` | Giải huỷ giữa chừng phải dùng `archived` + ghi lý do vào mô tả | tạm chấp nhận; thêm cần migration |
| 7 mục kiểm tay của phase-3 | Preview Zalo/OG, tải PNG, rehearsal community + token thư ký | chưa ai làm |
| Migration 038–041 chưa commit | Đã apply lên DB thật nhưng file `.sql` còn untracked | phải commit khi làm Spec 2 |
| Số migration đã dịch | `043`/`044` đã bị `club_notifications` và `group_fund_qr` chiếm. Bốn plan dùng **045 · 046 · 047 · 048** | đã sửa 2026-09-09 |

---

## 7. Thứ tự thi công đề xuất

| Đợt | Làm gì | Vì sao trước |
|---|---|---|
| **0** | Spec 0 — danh sách & vòng đời | Cửa vào module, và vá lỗi 500 đang chờ nổ. Không migration, rẻ |
| **1** | Spec 1 — số ván theo vòng | Nhỏ, đúng yêu cầu bắt buộc. Spec 2 mục 7 phụ thuộc `resolveMatchScoring` |
| **2** | Spec 2 — bàn điều hành | Khối lớn nhất. Migration 046. Bắt đầu bằng lớp thuần + test đỏ trước, rồi API, rồi shell, rồi từng bước |
| **3** | Spec 3 — bốc thăm, BXH, correction | Migration 047. Phần double-elim để cuối, cắt ra được nếu engine chưa xong |

Trước đợt 0 nên chốt xong **spec design system 2026-09-08** (tokens.css / primitives.css / Montserrat), nếu không mọi UI mới của Spec 0–3 sẽ phải sơn lại một lần nữa.

---

## 8. Việc chưa có spec, chưa xếp lịch

- Thu phí giải, đối soát nộp tiền.
- Thông báo tới VĐV (Zalo / push).
- Check-in và QR check-in tại sân.
- Live scoring từng điểm.
- Cộng điểm PHR sau giải (`docs/pickhub-core/05-phase-player-rating.md` để riêng).
- Offline / đồng bộ lại khi mất mạng giữa giải.
- Kho lưu trữ giải cũ (giao diện riêng cho `archived`).
