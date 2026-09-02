# Kiến trúc lõi PickHub

## 1. Tầm nhìn sản phẩm

PickHub là hạ tầng hoạt động cho cộng đồng pickleball, gồm ba giá trị kết nối với nhau:

1. Mỗi CLB vận hành độc lập: thành viên, quỹ, giao dịch, thương hiệu, giải nội bộ.
2. Các CLB cộng tác trên một lớp dùng chung: giải liên CLB, giao hữu, lịch cộng đồng và BXH.
3. Mỗi VĐV có hồ sơ phát triển xuyên thời gian: CLB tham gia, trận đấu đã xác minh, trình độ, thành tích và độ tin cậy.

Lợi thế dài hạn của PickHub không phải là vẽ bracket. Lợi thế là dữ liệu đáng tin cậy và quy trình ủy quyền giúp nhiều CLB cùng vận hành một giải mà vẫn giữ quyền tự chủ.

## 2. Kiểu kiến trúc

PickHub tiếp tục là modular monolith trên Next.js, PostgreSQL/Supabase và Vercel trong sáu giai đoạn hiện tại. Module được tách bằng ranh giới code, schema, service và contract; không tách microservice khi chưa có bằng chứng về tải, đội ngũ hoặc nhu cầu triển khai độc lập.

Các module lõi:

```text
Identity & Access
  ├─ tài khoản cá nhân
  ├─ hồ sơ VĐV có thể chưa được nhận quyền sở hữu
  └─ role assignment theo phạm vi

Clubs
  ├─ roster và membership
  ├─ quỹ, ngân hàng, sự kiện nội bộ
  └─ cấu hình, thương hiệu

Competitions
  ├─ tournament → division → stage → match → game
  ├─ CLB tham dự → đăng ký đoàn → entry
  └─ public projection, lịch, BXH, bracket

Player Development
  ├─ đánh giá trình độ có lịch sử
  ├─ rating tính từ kết quả đã xác minh
  └─ ghép cân bằng và reliability

Platform Operations
  ├─ community, moderation, notifications
  ├─ audit, observability, billing
  └─ privacy, backup, export
```

## 3. Danh tính và phạm vi sở hữu

### 3.1 Tài khoản không đồng nhất với VĐV

- `profile`: người đã đăng nhập, dùng để xác thực và ghi nhận ai thao tác.
- `athlete`: hồ sơ thể thao. Có thể do trưởng CLB tạo trước và chưa có tài khoản.
- Một athlete chỉ được một profile nhận quyền sở hữu sau khi xác minh.
- Tên không phải định danh duy nhất. Không dùng `full_name UNIQUE` toàn hệ thống.

### 3.2 VĐV không đồng nhất với thành viên CLB

- Một athlete có thể có membership ở nhiều CLB theo thời gian.
- Membership chứa trạng thái, ngày hiệu lực và vai trò sinh hoạt.
- Khi thi đấu, entry phải chốt `representing_club_id`.
- Một athlete không được đại diện hai CLB trong cùng division, trừ khi điều lệ của division cho phép rõ ràng.

### 3.3 Giải liên CLB không thuộc giả một CLB

- Giải nội bộ có thể do một CLB sở hữu.
- Giải liên CLB có organizer scope riêng: PickHub/platform, community hoặc CLB đăng cai.
- Các CLB tham dự được liên kết qua bảng tham gia và ACL.
- Bảng con của giải lấy phạm vi từ tournament, không dùng `group_id` của một CLB tham dự làm tenant cho toàn giải.

## 4. Mô hình cạnh tranh chuẩn

```text
Tournament
  └─ Division
       ├─ eligibility + capacity + ruleset
       ├─ Entries
       │    └─ Entry members + club/rating snapshots
       └─ Stages
            └─ Matches
                 └─ Games
```

- `Tournament`: sự kiện tổng, ví dụ Giải giao hữu ba CLB.
- `Division`: nội dung thi đấu, ví dụ Đôi nam 3.0–3.49 hoặc Đồng đội MLP.
- `Stage`: vòng bảng, playoff, knockout hoặc giai đoạn MLP.
- `Entry`: cá nhân, cặp hoặc đội thực sự được đưa vào lịch.
- `Registration`: đề nghị tham dự trước khi được duyệt thành entry.

Engine hiện có cho stage/match được giữ lại. Logic đặc thù như “mỗi bảng một cặp của mỗi CLB” được triển khai bằng competition template và constraint policy, không hard-code vào engine vòng tròn chung.

## 5. Ranh giới code

Code mới phải hướng tới cấu trúc sau; tên thư mục chính xác được chốt trong implementation plan của từng phase:

```text
lib/domain/          entity, value object, state machine, rule thuần
lib/application/     use case điều phối domain và repository
lib/infrastructure/  Supabase repository, notification, storage, queue
app/api/             HTTP adapter mỏng: parse, authorize, gọi use case, map response
app/                 presentation và route composition
```

Quy tắc:

- Domain không import React, Next.js hoặc Supabase client.
- Route không chứa thuật toán ghép cặp, tính BXH hoặc state transition phức tạp.
- Component không gọi trực tiếp service-role hoặc tự quyết định quyền nghiệp vụ.
- Mỗi use case có input/output rõ ràng và test độc lập.
- API trả view model ổn định; không để UI phụ thuộc tùy tiện vào row shape của database.

## 6. Quyền truy cập

Quyền được cấp theo `actor + action + resource + scope`, không dựa vào một chuỗi role toàn cục.

Vai trò nền tối thiểu:

- `platform_admin`
- `community_admin`
- `club_owner`, `club_admin`, `club_treasurer`, `club_captain`
- `tournament_director`, `scorekeeper`, `referee`
- `athlete`

Một người có thể có nhiều role ở các phạm vi khác nhau. Ví dụ một người là `club_captain` tại CLB A và `scorekeeper` tại giải X.

Mọi mutation phải qua ba lớp:

1. Xác thực tài khoản hoặc session hợp lệ.
2. Authorization tại application service.
3. RLS/constraint/database function làm backstop.

## 7. Dữ liệu bất biến và snapshot

- Tên CLB, tên VĐV và rating dùng trong giải được snapshot tại thời điểm duyệt entry.
- Sửa hồ sơ hiện tại không làm thay đổi hồ sơ lịch sử của giải đã hoàn thành.
- Kết quả finalized chỉ được sửa qua correction workflow, có actor, lý do, trước/sau.
- Rating là ledger có phiên bản thuật toán; không chỉ lưu một con số hiện tại.
- Tiền và quỹ dùng entry bất biến hoặc reversal, không sửa/xóa lịch sử đã đối soát.

## 8. Trạng thái nghiệp vụ

State transition phải được khai báo tập trung và kiểm tra server-side.

- Tournament: `draft → registration_open → registration_closed → scheduled → live → completed → archived`.
- Club invitation: `invited → accepted|declined → roster_submitted → approved|changes_requested → withdrawn`.
- Registration: `draft → submitted → waitlisted|approved|rejected → checked_in|withdrawn|no_show`.
- Match: `pending → assigned → ready → live → submitted → finalized`; correction là workflow riêng.

Không được nhảy trạng thái bằng PATCH tùy ý.

## 9. Public data

- Public link resolve bằng identifier toàn hệ thống, không phụ thuộc cookie CLB.
- Tournament có visibility: `private`, `unlisted`, `public`.
- Public API đọc projection đã kiểm soát, không trả row nội bộ hoặc dữ liệu cá nhân không cần thiết.
- Realtime subscription phải lọc theo tournament/division, có polling fallback và rate limit.

## 10. Độ tin cậy kỹ thuật

- Migration forward-only, có preflight, backup và verification query.
- Thao tác replace lịch, nhập bộ game, finalize kết quả và rating update phải atomic.
- Mutation quan trọng có idempotency key hoặc optimistic version.
- Có audit log append-only.
- Mọi phase phải thêm test ở tỷ lệ phù hợp: unit, integration, RLS, contract và E2E.
- Production có staging, structured logs, error tracking, metrics, backup và quy trình rollback.

## 11. Nguyên tắc thiết kế giao diện

Domain và API được thiết kế độc lập với visual design. Tuy nhiên mỗi phase vẫn cần một reference UI đủ dùng để xác minh luồng thật. Không chờ hoàn thành cả sáu phase mới thử trải nghiệm người dùng, và không để nhu cầu làm đẹp kéo business logic vào component.

Chi tiết tại [UI-STRATEGY.md](./UI-STRATEGY.md).

## 12. Các anti-pattern bị cấm

- Dùng mật khẩu chung để cấp quyền ghi mà không biết actor.
- Dùng tên làm khóa liên kết VĐV.
- Copy VĐV thành guest text cho mọi giải và mất liên kết lịch sử.
- Gắn giải liên CLB vào `group_id` của CLB đăng cai rồi mở quyền rộng cho CLB khác.
- Cho client dùng service-role key hoặc tin vào role lưu trong localStorage.
- Xóa dữ liệu cũ trước rồi thực hiện nhiều bước ghi mới không có transaction.
- Lưu rating hiện tại nhưng không lưu nguồn, phiên bản và lịch sử.
- Hard-code một giải cụ thể vào engine tổng quát.
- Viết lại toàn bộ ứng dụng chỉ để đổi framework hoặc giao diện.
