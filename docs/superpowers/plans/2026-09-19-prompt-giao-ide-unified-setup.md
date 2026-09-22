## Kết luận rà soát

**Không nên tiếp tục chạy theo các wave/task cũ hoặc coi worktree hiện tại là sẵn sàng phát hành.** Có nhiều phần tái sử dụng được, nhưng đường đi từ tạo giải → lưu nháp → mở lại → bốc thăm → chốt lịch chưa hoạt động thống nhất.

Tôi đã dùng ba lượt rà soát độc lập cho domain/API/database, UI và cơ chế điều phối/kiểm thử; đồng thời khảo sát các vùng rủi ro ngoài giải đấu. Đây là **đánh giá mã nguồn và bằng chứng hiện có**, chưa phải kiểm chứng toàn ứng dụng bằng chạy thực tế: chưa chạy test/build/browser hay truy vấn database; chưa xác nhận trạng thái Git dirty.

### Các lỗi cần ưu tiên

| Mức | Phát hiện | Bằng chứng |
|---|---|---|
| Chặn phát hành | Tạo giải mới bắt đầu không có ID, nhưng lưu nháp yêu cầu đã có tournament/division ID; chưa nối bước tạo ban đầu. | `app/giai-dau/v2/TournamentWizard.js:29`, `lib/tournamentV2Client.js:153` |
| Chặn phát hành | “Lưu nháp” chỉ lưu roster hoặc CLB mời, không lưu đủ cấu hình/cặp/bốc thăm; gửi `member_id` dưới tên `athlete_ids`. | `lib/tournamentV2Client.js:163`, `lib/tournamentV2Client.js:178` |
| Chặn phát hành | Dữ liệu tải bất đồng bộ không hydrate vào reducer; mở lại có thể giữ bản nháp rỗng hoặc cũ. | `app/giai-dau/v2/setup/SetupContext.js:203` |
| Chặn phát hành | Ghép tự động tạo cặp xong vẫn đưa sai người vào danh sách chưa ghép. Với số chẵn, toàn bộ pool vẫn bị đánh dấu chưa ghép. | `lib/tournament/pairingDraft.js:28` |
| Chặn phát hành | Preview nhận payload khác cấu trúc UI gửi; kết quả preview không được đưa vào draft. | `app/api/tournament-v2/preview-schedule/route.js:10`, `app/giai-dau/v2/setup/steps/DrawScheduleStep.js:69` |
| Chặn phát hành | Finalize chấp nhận danh sách stage rỗng và có thể báo thành công dù không tạo lịch; revision/idempotency cấp aggregate chưa đầy đủ. | `lib/tournament/setupFinalize.js:26`, `database/migrations/090_unified_setup_friendly_invites.sql:198` |
| An toàn dữ liệu | Đường mời CLB chưa kiểm tra tenant của `externalClubId`; SQL ghi nhiều stage có nguy cơ trùng bảng tạm trong cùng transaction. Cần đối chiếu RPC thật. | `database/migrations/090_unified_setup_friendly_invites.sql:83`, `database/migrations/034_phase3_entry_schedule_rpc.sql:51` |
| Độ tin cậy kiểm thử | Runner bỏ qua test lồng thư mục; CI chưa chạy đầy đủ unified setup. Nhiều test chỉ tìm chuỗi trong source, không kiểm tra hành vi. | `tests/unified-setup-v2/run-all.js:7`, `package.json:52` |

Ngoài ra, readiness, vô hiệu hóa kết quả bốc thăm, nút finalize và chuyển trang chưa dùng chung một luồng xử lý. Console vẫn còn đường thiết lập riêng.

**Ngoài setup:** có rủi ro cần xác minh ở ghi dữ liệu đăng ký nhiều bước, quyền đọc sau thu hồi phiên và webhook của CLB chưa cấu hình secret. Chưa đủ bằng chứng để kết luận các rủi ro này đang bị khai thác hoặc ảnh hưởng dữ liệu thật.

## Vì sao cách điều phối cũ thất bại?

Không chỉ là giao tiếp giữa Claude và người viết code:

- **Giao việc theo tầng nhưng thiếu người chịu trách nhiệm luồng hoàn chỉnh.** UI và backend đều giả định phía còn lại tạo dữ liệu ban đầu.
- **Contract đã “đóng băng” nhưng chưa được kiểm chứng bằng test tích hợp.** Spec yêu cầu lưu aggregate, implementation lại lưu từng phần.
- **Nhiều nguồn chỉ dẫn mâu thuẫn.** Có hướng dẫn auth/database cũ, đường dẫn agent không tồn tại và cơ chế team không có trong công cụ hiện tại.
- **Đánh dấu hoàn thành dựa trên artifact hoặc test cục bộ.** Có file, có helper, có test xanh không đồng nghĩa người dùng tạo được giải.
- **Ownership quá cứng ở một số chỗ, nhưng không bảo vệ được mọi cách ghi file.** Điều này vừa gây dừng việc, vừa không ngăn lệch contract.

**Không cần viết lại toàn bộ.** Cần giữ engine và phần đã đúng, sửa các điểm nối, thay cơ chế nghiệm thu.

## Plan mới: Khôi phục theo luồng hoàn chỉnh

Phạm vi đã chốt với bạn: **nội bộ trước; giữ tương thích giao hữu và các thể thức hiện có; xác minh và xử lý lỗi an toàn nghiêm trọng ngoài setup.**

### R0 — Chốt baseline và an toàn

- Ghi nhận Git HEAD, staged/unstaged/untracked và bảo toàn thay đổi đang có.
- Xác minh công cụ thực thi; kiểm tra schema/RPC/quyền thật trên Supabase, không suy từ file migration.
- Chạy baseline, phân loại lỗi sản phẩm, test lỗi thời và thiếu môi trường.
- Hợp nhất chỉ dẫn điều phối; giữ tài liệu cũ làm lịch sử, không xóa `_workspace`.
- Xác minh các rủi ro ngoài setup; sửa hẹp nếu nghiêm trọng và đã chứng minh.

**Điều kiện qua chặng:** biết chính xác trạng thái code/database, lỗi nền và công cụ có thể sử dụng.

### R1 — Một contract và bộ test đáng tin

*Phụ thuộc R0.*

- Chốt cách tạo lần đầu khi chưa có ID, lưu đầy đủ draft, ánh xạ danh tính, revision, idempotency và lỗi API.
- Thống nhất cấu trúc preview, suất chờ đi tiếp và trạng thái draw.
- Sửa test discovery/CI; bổ sung test hành vi tái hiện lỗi trước khi sửa.
- Test bắt buộc thiếu điều kiện chạy phải báo **BLOCKED**, không được tính là PASS.

**Điều kiện qua chặng:** mỗi lỗi trọng yếu có test tái hiện; UI/API/database không còn dùng các contract khác nhau.

### R2 — Hoàn chỉnh tạo → lưu → mở lại

*Phụ thuộc R1. Sửa domain ghép cặp và backend lưu draft có thể song song nếu không chồng file.*

- Sửa ghép cặp, dự bị, khóa cặp, ID ổn định và xử lý thêm/bớt người.
- Lưu aggregate nguyên tử; server giải quyết `member_id` và kiểm tra tenant.
- Nối đủ thông tin giải, lựa chọn thể thức, roster, cặp và bước đang làm.
- Sửa hydration, resume, lỗi mạng và trường hợp người dùng sửa tiếp khi request lưu đang chạy.

**Điều kiện qua chặng:** tạo từ dashboard, lưu rồi reload vẫn giữ đầy đủ dữ liệu; lưu nháp không sinh trận chính thức.

### R3 — Một preview và finalize nguyên tử

*Phụ thuộc R2.*

- Dùng `buildDivisionStagePayloads()` làm nguồn chuyển đổi thể thức duy nhất.
- Preview dùng cặp và kết quả bốc thăm thật; trả fingerprint để xác nhận đúng bản được duyệt.
- Finalize ghi stages, entrants, transitions, fixtures, trạng thái khóa và revision trong **một transaction**.
- Chặn plan rỗng, draw cũ, revision cũ, sai tenant và giải đã có trận bắt đầu/tỉ số.
- Retry cùng request trả lại kết quả cũ; không tạo trùng hoặc báo thành công giả.

**Điều kiện qua chặng:** 14 người → 7 cặp → bảng 4/3 → **12 trận**, hoặc **13** khi tranh hạng ba; 15 người lưu nháp được nhưng phải xử lý người lẻ trước finalize. Lỗi giữa transaction không để lại dữ liệu dở dang.

### R4 — Một đường thiết lập, giữ vận hành tương thích

*Phụ thuộc R2–R3.*

- Dùng chung bộ điều khiển save/finalize và readiness cho shell, review, console.
- Draft quay về workspace; giải đã chốt đi đúng màn lịch, không tự chuyển LIVE.
- Gỡ đường setup trùng sau khi kiểm thử redirect; giữ riêng thao tác điều hành.
- Kiểm tra giao hữu và các thể thức hiện có để không làm mất chức năng.
- Hoàn thiện tiếng Việt, mobile 390px, bàn phím/focus, loading và thông báo lỗi.

**Điều kiện qua chặng:** không còn hai luồng thiết lập cạnh tranh; giải cũ đang thi đấu không bị thay đổi cấu trúc.

### R5 — QA độc lập và báo cáo sẵn sàng phát hành

*Phụ thuộc các chặng trước.*

- Chạy CI/build, toàn bộ unified suites và identity regressions.
- Browser thật cho tạo mới, lưu/mở lại, 14/15 người, trùng tên, khóa cặp, draw hết hiệu lực, retry và hai phiên sửa đồng thời.
- Kiểm tra database về rollback, tenant, revision, số trận và tuyến đi tiếp.
- Regression CLB, đăng ký, tài chính, auth và thanh toán theo phạm vi ảnh hưởng.
- Đo hiệu năng cùng điều kiện; bằng chứng gắn với phiên bản code và môi trường cụ thể.

**Điều kiện hoàn thành:** không còn lỗi chặn; không tính test bắt buộc bị bỏ qua là đạt. Phát hành vẫn cần bạn cho phép riêng.

## Cách tôi và subagent sẽ làm

- **Tôi là đầu mối duy nhất:** giữ contract, phân việc, tích hợp và quyết định qua từng chặng.
- **Subagent nhận nhiệm vụ có đầu ra kiểm chứng được**, không tự truyền yêu cầu qua nhiều tầng.
- **Không hai agent cùng ghi một file.** Song song cho nghiên cứu/review hoặc phần code độc lập; phần dùng chung tích hợp tuần tự.
- **Người review độc lập với người thực hiện.** Không nhận “DONE” chỉ dựa trên báo cáo của agent.
- **Không hỏi lại các quyết định kỹ thuật thường lệ.** Chỉ hỏi khi đổi nghiệp vụ/phạm vi, ảnh hưởng tương thích người dùng thật, rủi ro dữ liệu hoặc deploy.

Các điểm sửa chính là `TournamentWizard`, `TournamentSetupProvider`, `tournamentV2Client`, các route setup/preview/finalize, `pairingDraft`, `stagePlan`, transaction database và runner kiểm thử. Danh sách đường dẫn đầy đủ, phụ thuộc và tiêu chí nghiệm thu đã lưu trong `/memories/session/plan.md`.

**Chưa sửa code hay database.** Khi chuyển sang thực thi, cần bật công cụ chỉnh sửa, terminal, browser và Supabase tương ứng; phiên hiện tại chỉ đủ cho nghiên cứu/lập kế hoạch.