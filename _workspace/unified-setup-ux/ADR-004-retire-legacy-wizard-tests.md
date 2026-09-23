# ADR-004 — Gỡ năm contract test của wizard cũ, đưa bất biến về nhà mới

**Ngày:** 2026-09-21
**Trạng thái:** đã áp dụng
**Liên quan:** ADR-003 (theme console), plan §T2.D, §8

## Bối cảnh

Năm file dưới `tests/unified-setup/` đỏ từ commit `e567260` (T2.D) mà không ai phát hiện:

| File | Số check đỏ |
|---|---|
| `wizard-checkpoints.contract.test.js` | 19/36 |
| `wizard-pair-identity.repro.test.js` | 6/7 |
| `wizard-swallowed-failure.repro.test.js` | 2/12 |
| `duplicate-safety.contract.test.js` | 1/41 |
| `wizard-retry-replay.contract.test.js` | 1/4 |

Lọt lưới vì exit gate của T2.D và T2.E chỉ liệt kê `npm run test:t-*` và `test:regression`, thiếu `node tests/unified-setup/run-all.js` — trong khi release gate plan §8 **có** lệnh này.

## Vì sao chúng đỏ

Cả năm khẳng định chuỗi **8 checkpoint chạy phía client** bên trong `TournamentWizard.js`:
`localStorage`, `CHECKPOINT.HOST_CLUB`, `beginMutation`, `replaceDivisionParticipants`,
thông điệp `"Đã tạo giải"`, nút `"Thử lại"`.

T2.D thay toàn bộ bằng workspace 4 bước cộng **finalize nguyên tử phía server**. Đối chiếu tại `e567260^` so với HEAD:

| Chuỗi | Wizard cũ | Wizard hiện tại (135 dòng) |
|---|---|---|
| `localStorage` | 4 | 0 |
| `CHECKPOINT.HOST_CLUB` | 2 | 0 |
| `beginMutation` | 4 | 0 |
| `"Đã tạo giải"` | 2 | 0 |

## Vì sao không trỏ test sang file mới

Cách rẻ là đổi đường đọc sang `lib/tournament/wizardRunner.js` và `wizardDraft.js` — nơi phần lớn chuỗi đó còn tồn tại. **Không làm vậy**, vì hai file đó nay là code chết:

- `runCheckpointSequence` có **0 caller** trong `app/` và `lib/`.
- `wizardDraft.js` chỉ được `wizardRunner.js` dùng; `wizardRunner.js` không ai dùng.

Trỏ test sang đó sẽ cho đèn xanh trên code không bao giờ chạy — tệ hơn là xoá, vì tạo cảm giác an toàn giả.

Quan trọng hơn: chuỗi checkpoint phía client **chính là** vấn đề E mà `plan-1.md` nêu — "gọi nhiều API nối tiếp, nhiều bước có catch bỏ qua lỗi để tiếp tục". Finalize nguyên tử phía server là lời giải thay thế. Giữ test bảo vệ cơ chế cũ là bảo vệ chính thứ đợt này loại bỏ.

## Quyết định

Gỡ năm file, thay bằng một file: `tests/unified-setup/legacy-wizard-retired.contract.test.js` (20 check), làm hai việc:

1. **Chốt kiến trúc cũ đã rời đường dùng chính** — wizard dưới 300 dòng, không `runCheckpointSequence`, không browser storage, có uỷ quyền cho workspace, `wizardRunner` không bị nối lại.
2. **Chốt từng bất biến cũ còn một chỗ sống**, đỏ nếu mất nhà:

| Bất biến (test cũ bảo vệ) | Nhà mới |
|---|---|
| Không "thành công giả" | `setupFinalize.js` giữ `FINALIZE_NOT_ATOMIC`; finalize đi qua RPC, không phải chuỗi request client |
| Retry không tạo bản ghi thứ hai | `idempotencyKey` ở client, `/setup`, `/setup/finalize` |
| Hai người sửa đồng thời | `expectedRevision` ở client, `expected_setup_revision` CAS ở `/setup` |
| Bản nháp sống qua reload | `getDivisionSetup` + `GET /setup` aggregate, thay cho `localStorage` |
| Danh tính cặp/VĐV ghi thật | `replaceDivisionParticipants` / action `replace_participants` |
| Giải có kết quả thì khoá cấu trúc | `setupValidation.js` giữ `STRUCTURE_LOCKED_BY_RESULTS` |

Bằng chứng chạy thật của các bất biến này nằm ở `tests/unified-setup-v2/`: `api/finalize-contract.test.js` (idempotency, revision, atomic, duplicate), `participants/participant-contract.test.js` (danh tính), `setup-guard-acceptance.test.js` và `t3.2-edge-journeys.test.js` (khoá kết quả, 409, retry). File mới là **lớp chống hồi quy kiến trúc**, không thay thế chúng.

## Kiểm chứng file mới không phải con dấu cao su

Phá có chủ đích rồi khôi phục, mỗi lần đúng 1 check đỏ:

- Đổi cả `expectedRevision` lẫn `expected_setup_revision` trong client → 1 FAILED.
- Thêm `const legacy = runCheckpointSequence;` vào `TournamentWizard.js` → 1 FAILED.

Lần thử đầu không bắt được vì phép thử sai, không phải assertion sai: đổi mỗi `expectedRevision` thì alternation vẫn khớp `expected_setup_revision`; và `runCheckpointSequence` thêm dạng comment bị `stripJsComments` loại. Assertion đã siết bằng word boundary sau đó.

## Nợ kỹ thuật ghi nhận, chưa xử lý

`lib/tournament/wizardRunner.js` và `lib/tournament/wizardDraft.js` là code chết (0 caller sản phẩm). Chưa xoá trong ADR này vì nằm ngoài phạm vi và cần lead quyết. File test mới sẽ đỏ nếu ai nối `wizardRunner` trở lại đường dùng chính.

## Kết quả

`node tests/unified-setup/run-all.js`: 8 PASS, 0 FAIL, 1 BLOCKED (`wizard-journey.browser.test.js` — thiếu env QA, không liên quan ADR này).
