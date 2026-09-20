# Prompt điều hành — Unified Internal Tournament Setup

**Plan:** `docs/superpowers/plans/2026-09-19-unified-internal-tournament-setup-parallel.md`
**Worktree:** `C:\Users\ductu\ranking-unified-setup-ux` · branch `feat/tournament-unified-setup-ux`
**Cập nhật:** 2026-09-20

> Tài liệu này viết cho **một session lead duy nhất**. Dán §1 một lần khi mở session, sau đó mỗi task chỉ dán đoạn ngắn ở §3. Không lặp lại luật.

---

## 1. Primer — dán MỘT LẦN khi mở session

```text
Bạn là lead/integrator đợt "Unified Internal Tournament Setup" của Pickhub.
Worktree: C:\Users\ductu\ranking-unified-setup-ux. Làm trong worktree này, không cd ra ngoài.

Đọc ngay, một lần:
- docs/superpowers/plans/2026-09-19-unified-internal-tournament-setup-parallel.md (plan thi hành)
- docs/superpowers/plans/2026-09-19-prompt-giao-ide-unified-setup.md (tài liệu này)
- _workspace/unified-setup-ux/00-contract.md (contract đã khóa)
- skill tournament-setup-invariants  ← gọi skill này, nó chứa bất biến + ma trận ownership

$env:PICKHUB_TASK_ID = "LEAD"

LUẬT (áp dụng cả session, tôi sẽ không nhắc lại):
1. Hook .claude/hooks/ownership-guard.js chặn ghi sai phạm vi. Bị chặn thì DỪNG và hỏi tôi,
   không tắt hook, không đặt PICKHUB_GUARD_OFF / PICKHUB_ALLOW_FROZEN.
2. Khi giao việc cho sub-agent, đặt PICKHUB_TASK_ID đúng mã task của nó.
   Chỉ có 5 sub-agent: tournament-architect, tournament-engine-dev, tournament-api-dev,
   tournament-ui-dev, tournament-qa. KHÔNG có agent tên LEAD — việc integrator bạn tự làm.
3. Ba file đóng băng, không ai sửa: lib/tournament/setupContract.js,
   lib/tournament/engines/roundRobin.js, lib/tournament/draw.js.
4. Shared entry points chỉ mình bạn sửa: TournamentWizard.js, TournamentV2DashboardClient.js,
   console/**, lib/tournamentV2Client.js, package.json.
5. Test đỏ trước, xanh sau. Không sửa test để che bug. Commit riêng từng task.
   Handoff _workspace/unified-setup-ux/<ID>.md.
6. Không DROP/TRUNCATE/reset DB. Dữ liệu test scope theo group_id, cleanup an toàn.
7. Contract đổi thì phải có ADR ngắn trong _workspace/unified-setup-ux/.
8. Nhiễu có sẵn trong worktree (38 file plan cũ bị xóa có chủ ý, docs chưa track) KHÔNG phải
   lỗi — đừng dừng vì nó. Chỉ dừng khi thấy thay đổi lạ trong app/, lib/, tests/, database/.

Báo tôi trạng thái ngắn sau mỗi task: xong gì, test nào xanh, rủi ro gì, cần tôi quyết gì.
Xác nhận đã đọc xong rồi chờ tôi giao task.
```

---

## 2. Trạng thái

| Wave | Task | Trạng thái | Commit |
|---|---|---|---|
| 0 | T0.1 contract + preflight | xong | `df67630`, `e1ea803` |
| 0 | T0.2 acceptance tests đỏ | xong | `ab6a056` |
| 0 | T0.3 baseline (khung) | xong | `9a6a38a`, `d1355bf` |
| — | T0.3-live (số thật) | xong | `9589237` |
| 1 | T1.A domain | xong | `6f1ca23` |
| 1 | T1.B aggregate/finalize | xong | `3aabe01` |
| 1 | T1.C roster/pair | xong | `6165c1f` |
| 1 | T1.D browser harness | xong | `5827749` |
| 2 | T2.A shell + T2.B participants | xong | `1a9168a` |
| 2 | T2.C draw/review | xong | `a269b70` |
| 2 | T2.D integrator | xong | `e567260` |
| 3 | T3.4 vòng 1 (nhãn bước, assertion console) | **chưa commit** | — |
| 2 | **T2.E giao hữu** | **đang làm** | — |
| 3 | T3.1 / T3.2 / T3.3 | chưa | — |
| 4 | Release gate | chưa | — |

**Đang chặn release:** `tests/phase3/interclub-ui.test.js` đỏ vì T2.D xóa mất đường tạo giải giao hữu → T2.E xử lý.

---

## 3. Prompt còn lại

Dán trực tiếp, không cần khung chung.

### 3.1 — Commit T3.4 (bạn tự làm)

```text
Commit T3.4 (nhãn bước + assertion console) ngay, đừng chờ release gate xanh.
Lệnh đỏ duy nhất là interclub-ui.test.js, đỏ vì regression T2.D, xử lý ở T2.E.

Trước khi commit: _workspace/unified-setup-ux/perf-evidence/ có 5 thư mục timestamp từ các
lần chạy thử. Chỉ 2026-09-20T02-03-29-088Z là bằng chứng thật (đã trong commit 9589237).
Xóa 4 cái còn lại, kiểm git log trước khi xóa.

Message:
  fix: dua nhan buoc ve dung contract va siet assertion console

  interclub-ui.test.js con do vi T2.D xoa duong tao giai giao huu
  (regression ngoai pham vi plan); xu ly o task T2.E.

T3.4-round1.md ghi rõ release gate CHƯA xanh + lý do. Không ghi "hoàn tất".
```

### 3.2 — T1.B bổ sung: server ghi lời mời CLB

```text
@runSubagent tournament-api-dev  (PICKHUB_TASK_ID=T1.B)

Đọc plan §T2.E bảng "Phân chia ba phần" trước.

A. /setup/finalize ghi lời mời, NGUYÊN TỬ.
   finalize(draft) ở client đã POST nguyên draft → body.draft.invitedClubs có sẵn, không cần
   đổi client. Đọc nó, ghi lời mời TRONG CÙNG transaction với stage/entrants/fixtures/khóa draw.
   CẤM gọi tuần tự từng lời mời rồi nuốt lỗi — đó là lỗi E của plan-1.md.
   CLB trùng: coi là 'invited', không hỏng transaction.
   Blocker NO_CLUB_INVITED khi organizerMode='friendly' mà invitedClubs rỗng.

B. /setup nhận action replace_invited_clubs.
   saveDraft hiện chỉ gửi athlete_ids nên nháp giao hữu mất CLB sau reload trong khi UI báo
   "Đã lưu" — bug kiểu plan-1 §F. Thêm action, cùng chuẩn revision CAS + idempotency key.
   GET /setup trả invitedClubs trong aggregate để resume được.

Migration chỉ khi preflight chứng minh thiếu — tournament_clubs và tournament_external_clubs
đã có, kiểm bằng Supabase MCP + npm run migration:ledger trước.

Handoff T1.B-friendly.md phải ghi shape invitedClubs để T2.E và tôi dùng đúng.
```

### 3.3 — Integrator nối saveDraft (bạn tự làm, sau 3.2)

```text
lib/tournamentV2Client.js, hàm saveDraft (~dòng 153): hiện chỉ gửi action 'replace_roster'
với athlete_ids. Thêm nhánh organizerMode==='friendly' gửi action 'replace_invited_clubs'
với draft.invitedClubs, theo shape trong T1.B-friendly.md.
Giữ nguyên expectedRevision, idempotencyKey, lỗi SETUP_DRAFT_LOCAL_ONLY.
KHÔNG đụng TournamentWizard.js. Chỉ sửa file này. Commit riêng.
```

### 3.4 — T2.E giao hữu trên workspace (sau 3.2 và 3.3)

```text
@runSubagent tournament-ui-dev  (PICKHUB_TASK_ID=T2.E)

Đọc plan §T2.E. Luồng giao hữu cũ xem bằng:
  git show e567260^:app/giai-dau/v2/TournamentWizard.js
(chú ý scope==='friendly', inviteClubs state, validate "Hãy mời ít nhất một CLB")

1. ADR trước: _workspace/unified-setup-ux/ADR-002-friendly-invited-clubs.md — thêm
   invitedClubs: [{clubId, name, source:'system'|'external', status}] vào SetupDraftV2,
   thêm blocker NO_CLUB_INVITED. Nêu rõ phần còn lại của contract không đổi.

2. Bước 1 có bộ chọn phạm vi: 'Nội bộ CLB' / 'Giao hữu liên CLB' → draft.tournament.organizerMode.
   Mặc định 'internal'.

3. Khi organizerMode='friendly', Bước 1 đổi sang MỜI CLB:
   - Liệt kê bằng listAvailableTournamentClubs() — ĐÃ export sẵn ở lib/tournamentV2Client.js:285,
     gọi KHÔNG cần tournamentId. Đừng viết helper mới.
   - Ghi vào draft.invitedClubs theo shape T1.B-friendly.md.
   - Blocker NO_CLUB_INVITED.
   - TUYỆT ĐỐI KHÔNG gọi inviteTournamentClub trong vòng lặp ở UI. T1.B ghi server-side khi
     finalize. UI chỉ thu thập vào draft.

4. Cảnh báo cùng CLB chung bảng: giao hữu PHẢI có. draw.js đã đúng sẵn (chỉ bỏ qua khi
   internal) — KHÔNG sửa draw.js, chỉ truyền organizerMode xuống đúng.

5. tests/phase3/interclub-ui.test.js: đổi ĐƯỜNG ĐỌC sang app/giai-dau/v2/setup/** vì UI đã
   dời hợp lệ. GIỮ NGUYÊN cả ba assertion nội dung ('Giao hữu', 'inviteTournamentClub',
   'CLB được mời') — chúng bắt được bug này.

File được chạm: app/giai-dau/v2/setup/**, tests/phase3/interclub-ui.test.js (chỉ đường đọc),
tests/unified-setup-v2/ui/**, _workspace/**. Ngoài danh sách → dừng, hỏi tôi.

Exit gate: interclub-ui.test.js xanh; wizard-redesign-contract + ui-unified-wizard vẫn xanh;
npm run test:regression, test:t-ui, build xanh; grep inviteTournamentClub|listAvailableTournamentClubs
trong app/ (trừ app/api) phải có caller thật.
```

### 3.5 — Wave 3 (ba QA song song, sau T2.E)

```text
@runSubagent tournament-qa  (PICKHUB_TASK_ID=T3.1)
Happy path theo plan §T3.1, BẰNG CA 14 NGƯỜI. Dùng fixture T1.D.
Ngoài assertion trong plan, kiểm thêm: đúng 2 stage cho group_knockout cùng division_id,
tuyến đi tiếp hợp lệ, tổng 12 trận (13 khi tranh hạng ba), knockout là placeholder chờ suất
không có entrant giả, advance ghép đúng bán kết chéo bảng.
Không tự sửa production code — báo bug theo ownership.
```

```text
@runSubagent tournament-qa  (PICKHUB_TASK_ID=T3.2)
Toàn bộ edge journeys plan §T3.2, không bỏ ca nào. Mỗi ca ghi: bước tái hiện, kỳ vọng,
thực tế, mã lỗi. Chú ý ca trùng tên, chưa có athlete_id, member_id khác tenant, bỏ người
giữa danh sách không phá cặp khóa, số lẻ 15 người, giải đã có tỉ số, advance khi kết quả
chưa đủ, hai admin 409, retry fault từng checkpoint.
```

```text
@runSubagent tournament-qa  (PICKHUB_TASK_ID=T3.3)
Accessibility/responsive theo plan §T3.3. Bàn phím, 390px không tràn, target 44px,
summary rail tablet/desktop, loading cục bộ, theme thống nhất (GAP-THEME), lỗi cạnh chỗ cần sửa.
Chụp màn hình từng viewport làm bằng chứng.
```

### 3.6 — Wave 4 release gate (bạn tự làm)

```text
Chạy đúng khối lệnh plan §8, không bỏ lệnh nào, ghi output thật.
Sau đó browser journeys với fixture đã scope, advisors nếu có DDL.
Đo lại hiệu năng: lặp đúng kịch bản trong T0.3-perf-baseline.md, ghi bảng trước/sau.
Ghi 99-qa-report.md và evidence/unified-internal-tournament-setup-2026-09-19.md.
Đối chiếu đủ hai nhóm điều kiện chặn release ở §8 và toàn bộ checklist §12.
Chỉ báo hoàn tất khi TẤT CẢ xanh. Mục nào không chạy được thì ghi rõ, không báo hoàn tất mờ.
```

---

## 4. Ghi chú vận hành

- **`LEAD` là vai trò, không phải agent.** `PICKHUB_TASK_ID="LEAD"` là giá trị biến môi trường hook hiểu; việc integrator bạn tự làm trong session này.
- **Van thoát** `PICKHUB_ALLOW_FROZEN=1`, `PICKHUB_GUARD_OFF=1`: chỉ integrator, chỉ khi đã ghi lý do vào handoff.
- **Prompt các wave đã xong** không lưu ở đây nữa. Xem plan và handoff `_workspace/unified-setup-ux/*.md`.
