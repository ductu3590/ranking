# Spec — Module Giải đấu Pickleball (clean-slate, v1)

**Ngày:** 2026-06-15
**Dự án:** Pickhub (`quy-pickleball`) — Next.js 14 App Router (JS thuần) + Supabase, multi-tenant theo `group_id`.
**Harness:** `tournament-orchestrator` điều phối `tournament-architect / engine-dev / api-dev / ui-dev / qa`. Skill nền: `pickleball-formats`, `pickhub-engineering`.

## 1. Mục tiêu & bối cảnh

Xây mới (clean-slate) module tạo và quản lý giải đấu cho CLB Pickleball phong trào tự tổ chức. Bỏ qua code giải đấu MLP cũ (rối, bám 1 thể thức). Hỗ trợ 4 "thể thức" người dùng nêu: **MLP, vòng tròn tính điểm, loại trực tiếp, mix đa giai đoạn**.

**Quyết định nền (đã chốt với user):**
- **Clean-slate**: migration mới tạo bảng mới; **drop** các bảng giải cũ (`tournament_teams/players/pairings/matches/settings` + dữ liệu giải cũ của CLB 246 — user đồng ý mất).
- **Mô hình 2 trục** (Approach A): tách *thể thức xếp lịch* (vòng tròn/knockout) khỏi *thể thức tính trận* (thường/MLP); "mix" = nhiều stage. 4 thể thức = tổ hợp 2 trục + stage.
- **Entrant v1**: cặp đôi (doubles) + đội (MLP). Đánh đơn để ngỏ (mô hình hỗ trợ, UI chưa làm).
- **Nguồn VĐV**: chọn từ member CLB (`member_id`) **hoặc** nhập tay (tên khách).
- **Tỉ số**: nhập theo **từng ván** (best-of-N).
- **v1 có**: xem realtime, lineup MLP, link/QR công khai.
- **v1 hoãn**: tự động bốc thăm/balanced/seed (v1 admin xếp tay), double elimination, cache BXH, thống kê xuyên giải.

## 2. Mô hình lõi

- **Giải (tournament)** = chuỗi **stage** tuần tự. Mỗi stage có đúng 1 `schedule_format` + 1 `match_format`.
- **Mix** = ≥2 stage (vd Stage 1 vòng tròn chia bảng → Stage 2 knockout giữa các đội đi tiếp).
- **Entrant** = đơn vị được xếp hạng/đối đầu (cặp hoặc đội), thống nhất cho mọi thể thức. Bên trong gồm nhiều member.
- **Match** = 1 trận giữa 2 entrant trong 1 stage. **Game** = ván trong trận (best-of-N với `simple`; các ván con nam/nữ/mix + Dreambreaker với `mlp`).

## 3. Data model (7 bảng, đều có `group_id`)

Quy ước: PK `id` (integer identity hoặc bigserial), mọi bảng có `group_id`; RLS DISABLE (backstop), app scope ở server. Cấu hình lặt vặt để trong `jsonb`, không tạo bảng key-value.

### 3.1 `tournaments`
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | identity PK | |
| group_id | int | tenant |
| name, description, location | text | |
| event_date | date | |
| status | text | `draft` · `active` · `completed` |
| entrant_type | text | `pair` · `team` (để ngỏ `individual`) |
| public_slug | text unique (theo group) | link/QR công khai |
| settings | jsonb | mặc định bestOf, v.v. |
| created_at, updated_at | timestamptz | |

### 3.2 `tournament_stages`
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | identity PK | |
| group_id | int | |
| tournament_id | FK → tournaments | |
| stage_order | int | thứ tự (1,2,…) |
| name | text | vd "Vòng bảng", "Playoff" |
| schedule_format | text | `round_robin` · `knockout` |
| match_format | text | `simple` · `mlp` |
| status | text | `pending` · `active` · `completed` |
| config | jsonb | `groupCount`, `advancePerGroup`, `bestOf`, `pointsToWin`, luật MLP (`subMatches`, `dreambreaker`), `thirdPlace`, `winPoints`… |

### 3.3 `tournament_entrants`
| id PK · group_id · tournament_id FK · name · seed (int) · color/logo (nullable) |

### 3.4 `tournament_entrant_members`
| id PK · group_id · entrant_id FK · member_id (FK members, **nullable**) · display_name (cho khách) · gender (`m`/`f`, phục vụ lineup MLP) |

### 3.5 `tournament_stage_entrants`
| id PK · group_id · stage_id FK · entrant_id FK · group_label (vd 'A') · seed_in_stage |
Xác định entrant nào tham gia stage nào (stage 2 chỉ gồm đội đi tiếp). Unique `(group_id, stage_id, entrant_id)`.

### 3.6 `tournament_matches`
| id PK · group_id · stage_id FK · round (int) · bracket_slot (int, knockout) · group_label · court (nullable) · order (int) · entrant_a_id / entrant_b_id (FK, nullable cho bye/chưa xác định) · status (`pending`·`live`·`done`) · winner_entrant_id (FK, nullable) · parent_match_id (FK self, cây knockout) |

### 3.7 `tournament_games`
| id PK · group_id · match_id FK · game_no (int) · kind (`game`·`womens`·`mens`·`mixed1`·`mixed2`·`dreambreaker`) · score_a (int) · score_b (int) · winner_entrant_id (FK) · lineup (jsonb: ai đánh — cho MLP) |

**BXH**: không lưu bảng riêng — tính tại chỗ khi đọc qua engine `computeStandings`.

## 4. Format engine (`lib/tournament/engines/`)

JS thuần, hàm thuần (no I/O), deterministic, nhận `seed` cho mọi random. Interface chung:

| Hàm | Vào | Ra |
|---|---|---|
| `generateSchedule(stageConfig, entrants, seed)` | cấu hình stage + entrants | danh sách match (round, slot, cặp, group_label, bye) |
| `computeStandings(stageConfig, entrants, matches, games)` | + kết quả | BXH đã sắp tie-break |
| `advance(stageConfig, standings)` | BXH stage | seeding entrant cho stage kế |

**Schedule engines:**
- `roundRobin.js` — circle method; chia M bảng kiểu snake theo seed; lẻ entrant → bye; số trận C(n,2)/bảng. Tie-break: điểm xếp hạng → hiệu số điểm → đối đầu → tổng điểm → seed.
- `knockout.js` — bracket size = lũy thừa 2 ≥ N; bye = B−N cho hạt giống cao; seeding chuẩn đệ quy (`[1,8,5,4,3,6,7,2]`…); dựng `parent_match_id` để UI vẽ cây; option `thirdPlace`.

**Match engine** (tính winner 1 trận từ games):
- `simple` — best-of-N: bên thắng đa số ván.
- `mlp` — cộng ván con thắng; hòa → Dreambreaker; giữ `rallyDiff` làm tie-break phụ. Cấu hình `subMatches` qua `config`.

**Orchestrator engine** — ghép stage: chỉ cho mở stage sau khi stage trước `completed`; gọi `advance()` lấy top-K mỗi bảng, seed cross-bảng sang knockout; ánh xạ entrant xuyên stage.

Registry `engines/index.js` chọn engine theo `(schedule_format, match_format)`.

## 5. API (`app/api/tournament-v2/*`, group-scoped + admin guard)

Tuân `pickhub-engineering`: ghi → `requireGroupAdmin()`; đọc → `getEffectiveGroupContext()`; mọi query `.eq('group_id', …)` + đúng `tournament_id`/`stage_id`; client `supabaseAdmin || supabaseServer`; thuật toán gọi từ `lib/…`, không nhúng vào route.

Endpoint dự kiến:
- `tournaments` (GET list / POST / PATCH / DELETE) — DELETE xóa cascade stage/entrant/match/game theo group.
- `tournaments/[id]/stages` (CRUD stage).
- `tournaments/[id]/entrants` (CRUD entrant + members).
- `stages/[id]/generate` (POST) — gọi schedule engine, ghi matches.
- `stages/[id]/advance` (POST) — chốt stage, seed stage kế.
- `matches/[id]/games` (PUT) — nhập/sửa tỉ số ván + lineup; cập nhật `winner`, `status`.
- `tournaments/[id]/standings` (GET) — tính BXH tại chỗ.
- `public/[slug]` (GET) — dữ liệu xem công khai (lịch, BXH, bracket).
- Realtime: subscribe thay đổi `tournament_matches`/`tournament_games` theo tournament (Supabase Realtime client, chỉ đọc).

## 6. UI (`app/giai-dau/*`, mobile-first tiếng Việt)

- **Danh sách giải** + nút Tạo.
- **Wizard tạo giải (4 bước)**: (1) Thông tin + entrant_type; (2) Giai đoạn — thêm stage, chọn 2 trục + config (mix = 2 stage); (3) Đội/Cặp — chọn member hoặc gõ tên, kéo sắp hạt giống; (4) Sinh lịch.
- **Console có tab**: Tổng quan · Kết quả (nhập tỉ số từng ván; MLP có lineup) · BXH · Sơ đồ (cây knockout, cuộn ngang) · Đội · Cài đặt (link/QR, reset).
- **Trang công khai** `/giai-dau/<slug>`: chỉ xem, realtime; admin thấy thêm nút sửa (role từ `getCurrentGroupClient()`).
- Mỗi component có file `.css` kèm; tái dùng biến/style sẵn có.

## 7. Error handling

- Engine: edge case (lẻ entrant, không đủ đội cho bye, hòa ở knockout) xử lý theo quy ước trong `pickleball-formats`, ghi chú trong code.
- API: `try/catch` → `NextResponse.json({error}, {status})` + `console.error`; không nuốt lỗi.
- Sinh lịch khi stage đã có match → cảnh báo/ghi đè có xác nhận (không tự xóa kết quả đã nhập).
- Migration phá vỡ không tự apply prod; user apply + deploy Vercel.

## 8. Testing

- **Engine**: node test runtime thật trong `tests/` — vòng tròn đủ cặp đấu & tie-break; knockout đúng số vòng + bye + seeding; MLP cộng ván con + Dreambreaker; mix seed chuyển đúng. Deterministic theo `seed`.
- **Contract test** (theo pattern hiện có): route có admin guard + group scope, không hardcode id; shape API ↔ UI khớp.
- **QA so khớp biên** (`tournament-qa`): đối chiếu field engine ↔ API ↔ UI, chạy incremental sau mỗi lớp.

## 9. Phạm vi & thứ tự triển khai

1. Migration clean-slate (drop bảng cũ + tạo 7 bảng mới).
2. Engine: roundRobin + knockout + match(simple/mlp) + orchestrator + registry (+ test).
3. API tournament-v2 (CRUD + generate/advance/games/standings/public).
4. UI: danh sách + wizard + console + trang công khai + realtime.
5. QA xen kẽ + contract test; cập nhật `pickleball-formats` nếu phát sinh quy ước mới (harness evolution).

## 10. Ngoài phạm vi (phase sau)

Tự động bốc thăm/balanced/seed, double elimination, cache BXH, lịch theo sân/giờ nâng cao, thống kê VĐV xuyên giải, đánh đơn (UI).
