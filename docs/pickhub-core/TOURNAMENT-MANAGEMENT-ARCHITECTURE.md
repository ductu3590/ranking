# Kiến trúc và quy trình quản lý giải đấu PickHub

## 1. Mục đích

Tài liệu này mô tả đầy đủ mô hình quản lý giải đấu của PickHub để kiểm tra xem các Phase 3, Phase 4 và những phase liên quan đã tạo thành một hệ thống thống nhất hay chưa.

## 2. Mô hình phân cấp

```text
Tournament / Giải tổng
└── Division / Nội dung thi đấu
    ├── Registration / Đăng ký
    ├── Athlete hoặc Pair/Team Entry
    ├── Stage / Vòng đấu
    │   └── Match
    │       └── Game
    └── Standings / Kết quả riêng
```

Giải tổng là container để quản lý tên giải, BTC, địa điểm, thời gian và trang công khai. Mỗi division là một cuộc thi độc lập có thể trao giải nhất, nhì, ba riêng.

Ví dụ: “Cộng đồng Pickleball Yên Bái mở rộng” có các division Đôi nam 5.2, Đôi nam 6.0, Đôi nữ 4.8 và Đôi nam nữ Open.

## 3. Loại giải và quyền

### 3.1 Giải nội bộ CLB

- Organizer: `club_admin`.
- VĐV: thành viên CLB hoặc VĐV khách nếu điều lệ cho phép.
- Không bắt buộc PHR.
- Có thể ghép đôi tự động cân bằng hoặc ghép thủ công.

### 3.2 Giải giao hữu liên CLB

- Organizer: `club_admin` của CLB chủ giải.
- Organizer mời một hoặc nhiều CLB, không giới hạn cứng trong schema.
- CLB được mời phải tự xác nhận/từ chối.
- Sau khi chấp nhận, CLB khách tự nộp danh sách VĐV.
- Organizer duyệt hoặc yêu cầu chỉnh sửa.

### 3.3 Giải cộng đồng

- Organizer: `community_admin`, quyền cấp toàn hệ thống.
- Mọi CLB trong PickHub có thể gửi đăng ký sau khi giải mở.
- `community_admin` duyệt CLB và đội hình.
- Có thể tạo VĐV khách không thuộc CLB.
- Có thể bật Open hoặc giới hạn tổng PHR.

## 4. Cấu hình division

Mỗi division phải có:

| Thuộc tính | Giá trị |
|---|---|
| Loại thi đấu | Đơn, đôi, đội |
| Phân loại | Nam, nữ, nam nữ, mở rộng |
| Tính thành tích | Cá nhân hoặc CLB |
| Trình độ | Open hoặc tổng PHR tối đa |
| Ghép cặp | Không áp dụng, tự động cân bằng/ngẫu nhiên, thủ công |
| Thể thức | Vòng bảng, loại trực tiếp, round robin, MLP… |

Một giải tổng có thể chứa các division khác nhau. Ví dụ một division tính điểm CLB và division khác tính điểm cá nhân.

## 5. Luồng tạo giải

```text
Chọn loại giải
→ nhập thông tin giải tổng
→ lưu bản nháp riêng tư
→ tạo các division
→ cấu hình đơn/đôi, thành tích, trình độ
→ cấu hình CLB và hạn đăng ký
→ cấu hình đội hình/cặp
→ xem cảnh báo
→ mở đăng ký hoặc gửi lời mời
→ đóng đăng ký
→ bốc thăm và tạo lịch
→ công bố lịch
```

Bản nháp chỉ BTC nhìn thấy. Khi giải cộng đồng mở đăng ký, thông tin giải được công khai cho mọi người xem; chỉ CLB đăng nhập mới được gửi đăng ký.

## 6. Luồng đăng ký CLB

```text
CLB nhận lời mời hoặc thấy giải cộng đồng
→ xác nhận tham gia / gửi đăng ký
→ chọn division
→ chọn VĐV từ roster
→ tạo VĐV khách nếu được phép
→ ghép cặp tự động hoặc thủ công
→ kiểm tra PHR và cảnh báo
→ gửi đội hình
→ BTC duyệt hoặc yêu cầu chỉnh sửa
→ entry được khóa
```

Với giải giao hữu, CLB khách tự quản lý đội hình của mình. CLB chủ giải có thể nhập hộ roster theo mục 14.4: bản ghi lưu actor/lý do và chờ CLB khách xác nhận; không được sửa đội hình đã được CLB xác nhận mà không có audit.

## 7. Đơn, đôi và ghép cặp

### 7.1 Đánh đơn

Mỗi VĐV là một entry. Không tạo pair. Kết quả tính theo cá nhân hoặc CLB tùy `scoring_scope`.

### 7.2 Đánh đôi

Có hai chế độ:

- `random_balanced`: ưu tiên dùng PHR để ghép cân bằng; nếu thiếu PHR thì ngẫu nhiên.
- `manual`: BTC/CLB sắp xếp hai VĐV thành một cặp.

Hệ thống phải preview trước khi khóa, không cho một VĐV xuất hiện ở hai cặp trong cùng division. Cặp đã khóa là snapshot lịch sử.

## 8. PHR và nội dung giới hạn

Điều kiện của nội dung đôi giới hạn trình độ:

```text
PHR của VĐV 1 + PHR của VĐV 2 <= giới hạn nội dung
```

Các trạng thái PHR:

```text
missing → pending → confirmed
                  ↘ rejected
over_limit
```

- `club_admin` cập nhật PHR cho VĐV thuộc CLB.
- `community_admin` xác nhận/từ chối PHR ở giải cộng đồng.
- Thiếu, pending hoặc vượt giới hạn chỉ tạo cảnh báo.
- Cặp vẫn được gửi đăng ký và BTC vẫn có thể duyệt.
- Sau này có thể thêm policy gói VIP hoặc bắt buộc PHR mà không đổi mô hình dữ liệu.

## 9. Bốc thăm và thi đấu

```text
Đội hình được duyệt
→ đóng đăng ký
→ preview draw
→ BTC xác nhận draw
→ khóa entry và draw
→ gán sân/giờ/scorekeeper
→ thi đấu
→ nhập điểm
→ finalize match
→ tính BXH và giải thưởng
→ hoàn tất và lưu archive
```

Draw phải deterministic theo seed, có constraint theo division và chạy atomic khi commit. Phase 4 bổ sung scheduler, check-in, offline score, correction và audit.

## 10. Trạng thái

```text
Tournament:
draft → registration_open → registration_closed → scheduled → live → completed → archived

Participation:
invited → accepted → roster_submitted → approved | changes_requested → withdrawn

Registration:
draft → submitted → approved | rejected | waitlisted → checked_in | withdrawn | no_show

Match:
pending → assigned → ready → live → submitted → finalized
```

Không cho client nhảy trạng thái bằng PATCH tùy ý. Mọi transition qua application use case và được database/RLS làm backstop.

## 11. Trang công khai

Trang công khai hiển thị:

- tên, poster, địa điểm, thời gian, thể lệ;
- danh sách nội dung;
- CLB tham gia;
- tên thi đấu của VĐV/cặp;
- lịch, kết quả và bảng xếp hạng.

Không hiển thị số điện thoại, email, ghi chú nội bộ, trạng thái xét duyệt chi tiết hoặc dữ liệu riêng tư.

## 12. Các điểm đã có thiết kế cho tương lai

- Giới hạn số CLB/VĐV theo gói tài khoản VIP.
- Liên kết VĐV khách với profile thật.
- PHR ledger và thuật toán rating chính thức.
- Nhiều `community_admin`.
- Quyền delegate tournament director.
- Thanh toán và lệ phí online.
- Thể thức đội khác ngoài MLP.

## 13. Các điểm cần kiểm tra trước khi triển khai

- Tên và schema chính thức của `community_admin`.
- Cách tạo profile cấp hệ thống đầu tiên.
- Bộ quy tắc giới tính và đôi nam nữ.
- Số lượng giải thưởng và cách công bố giải.
- Cách seed tài khoản `community_admin` đầu tiên (script bootstrap, không tạo qua UI công khai).
- Mức PHR nào được coi là hợp lệ và cách xử lý dữ liệu thiếu.
- Policy giới hạn theo gói VIP.

Các điểm trên không cản trở việc xây dựng core Phase 3; chúng cần được đưa thành policy/versioned ruleset thay vì hard-code.

## 14. Cập nhật sau kiểm tra hệ thống hiện hữu

### 14.1 Chuẩn hóa entry theo division

Stage và match bắt buộc thuộc một division. `tournament_entries` là đơn vị mới được đưa vào lịch; `tournament_entrants` chỉ còn là adapter tương thích trong giai đoạn chuyển đổi. Không tạo thêm materialize ngược làm mô hình chính.

Migration cần thêm `division_id` vào stage/match, chuyển stage-entry và match references sang `tournament_entries`, sau đó chuyển engine, standings và public projection sang mô hình mới.

### 14.2 Tenant kỹ thuật và ownership

Trong giai đoạn chuyển tiếp, `group_id` có thể giữ `NOT NULL` để không phá API/RLS hiện hữu. Với giải cộng đồng, dùng một system group kỹ thuật; system group không đại diện cho CLB sở hữu hay CLB tham dự.

Ownership thực tế được xác định bằng `organizer_type`, `organizer_club_id`, platform actor và `tournament_id`. Về dài hạn, child tables sẽ được authorization theo tournament scope thay vì group scope.

`public_slug` phải unique toàn hệ thống. Database đã có global unique index từ migration 018; API vẫn cần bỏ filter `group_id` khỏi public lookup.

### 14.3 Platform identity

`community_admin` dùng `platform_accounts` và cookie `platform_session` riêng, có hash mật khẩu, expiry, revoke, rate limit và audit. Không dùng `group_session` để giả lập quyền hệ thống. Các cột profile reference phải nullable/compatibility-safe cho đến khi profile identity được xây dựng.

### 14.4 CLB ngoài PickHub và nhập hộ

`tournament_clubs` có thể tham chiếu CLB PickHub hoặc `tournament_external_clubs`. CLB ngoài hệ thống nhận link mời và có thể tham gia trong phạm vi giải mà chưa cần tạo group.

BTC được nhập hộ roster trong thực tế vận hành. Bản ghi bắt buộc lưu actor, lý do và trạng thái chờ CLB xác nhận; BTC có thể override với audit reason.

### 14.5 Ghép cặp và duplicate CLB

Duplicate CLB trong pool không phải lỗi toàn cục. Ruleset chọn `unique_per_pool`, `spread_if_possible` hoặc `allow_multiple`. Mặc định ưu tiên rải đều và trả warning; chỉ hard-block khi điều lệ nội dung yêu cầu.

### 14.6 Scorekeeper không cần tài khoản

Phase 3 có thể cấp token ký/hash theo trận hoặc sân, có expiry, revoke và chống replay. Token chỉ cấp quyền nhập điểm trong phạm vi được cấp.

### 14.7 Mapping trạng thái

Dữ liệu cũ `tournament.status = draft|active|completed` và `match.status = pending|live|done` phải được inventory và mapping có kiểm soát. Không đổi nghĩa âm thầm; state machine mới tách registration, scheduling và competition status.

## 15. Cấu hình điểm số theo stage

Luật tính điểm là thuộc tính của **stage**, không phải của division hay giải tổng. Cùng một division có thể đá vòng bảng một ván tới 11 và bán kết/chung kết best-of-3 tới 15.

### 15.1 Lớp cấu hình

```text
Tournament.default_scoring   (mặc định cho giải, BTC đặt một lần)
└── Division.scoring_override (tùy chọn, ví dụ nội dung nữ đá tới 11)
    └── Stage.scoring          (giá trị hiệu lực, snapshot khi commit draw)
```

Giá trị hiệu lực của stage được tính bằng `resolveStageScoring(tournament, division, stage)` khi commit draw và lưu vào `tournament_stages.config`. Sau khi stage có match `live`/`done`, đổi luật chỉ được áp cho stage chưa bắt đầu hoặc qua correction workflow.

### 15.2 Trường của `scoring`

| Trường | Giá trị | Ghi chú |
|---|---|---|
| `match_format` | `simple`, `mlp` | Trục tính trận hiện có |
| `best_of` | 1, 3, 5 | Số ván tối đa; `simple` |
| `points_to` | 11, 15, 21 | Điểm kết thúc ván |
| `win_by` | 1, 2 | Cách biệt tối thiểu |
| `cap` | null hoặc số | "Điểm chết": ván kết thúc khi chạm cap dù chưa cách 2 |
| `deciding_game` | `{points_to, win_by, cap}` hoặc null | Ván quyết định có luật riêng, ví dụ ván 3 tới 11 |
| `win_points`, `loss_points`, `draw_points` | số | Điểm BXH theo trận |
| `mlp` | `{sub_matches, dreambreaker, dreambreaker_points_to}` | Chỉ khi `match_format = mlp` |

Khóa trong JSON dùng snake_case; engine hiện có đọc `bestOf`, `winPoints`, `lossPoints`, `subMatches`, `dreambreaker`, cần adapter map hai chiều trong giai đoạn chuyển đổi và chuyển dần engine sang snake_case.

### 15.3 Validate khi nhập điểm

Server validate mỗi game theo `scoring` hiệu lực của stage: điểm thắng phải đạt `points_to`, cách biệt đạt `win_by` trừ khi chạm `cap`, số ván không vượt `best_of`, ván quyết định dùng `deciding_game` nếu có. Kết quả không hợp lệ bị từ chối với mã lỗi rõ; BTC có thể ghi đè bằng correction có lý do. Walkover và bỏ cuộc được lưu bằng `result_type` của match chứ không bằng cách nhập điểm giả.

### 15.4 Preset

Wizard cung cấp preset để BTC chọn nhanh, sau đó vẫn sửa được từng trường:

- `phong_trao_11`: best-of-1, tới 11, cách 2, cap 15.
- `phong_trao_15`: best-of-1, tới 15, cách 2, cap 21.
- `ban_ket_chung_ket`: best-of-3, tới 11, cách 2, ván 3 tới 11.
- `mlp_4_van`: 4 ván con tới 21 cách 2, dreambreaker tới 21.

Preset là dữ liệu cấu hình có version, không hard-code trong engine.

## 16. Tie-break tùy chọn theo giải

### 16.1 Nguyên tắc

Tie-break là **policy có thứ tự**, đặt ở giải tổng và có thể override ở division. Stage kế thừa policy của division. Policy được snapshot vào `tournament_stages.config.tiebreak` khi commit draw để BXH của giải đã hoàn thành không đổi khi BTC sửa policy sau này.

```text
Tournament.tiebreak_policy   (mặc định cho mọi nội dung)
└── Division.tiebreak_override (tùy chọn)
    └── Stage.config.tiebreak   (snapshot khi commit draw)
```

### 16.2 Tiêu chí hỗ trợ

| Mã | Ý nghĩa | Phạm vi |
|---|---|---|
| `match_points` | Điểm BXH theo trận | Luôn là tiêu chí đầu tiên |
| `wins` | Số trận thắng | |
| `head_to_head` | Đối đầu trực tiếp | Chỉ áp khi nhóm hòa có 2 đội, hoặc mini-league khi nhóm hòa lớn hơn 2 và policy bật `head_to_head_group` |
| `game_diff` | Hiệu số ván | |
| `game_ratio` | Tỷ lệ ván thắng | |
| `point_diff` | Hiệu số điểm | |
| `point_ratio` | Tỷ lệ điểm | |
| `points_for` | Tổng điểm ghi | |
| `points_against` | Tổng điểm thủng, ít hơn xếp trên | |
| `seed` | Hạt giống thấp hơn xếp trên | |
| `draw_lot` | Bốc thăm, dùng seed deterministic của stage và ghi vào audit | Luôn là tiêu chí cuối |

Policy là mảng có thứ tự, ví dụ mặc định phong trào:

```json
["match_points", "head_to_head", "game_diff", "point_diff", "points_for", "draw_lot"]
```

### 16.3 Hòa nhiều bên

Khi nhóm hòa có từ 3 đội, mỗi tiêu chí được tính trên **các trận trong nhóm hòa** nếu policy đặt `scope: "tied_group"`, hoặc trên toàn bảng nếu `scope: "all"`. Sau khi một tiêu chí tách được một phần nhóm, các đội còn hòa quay lại tiêu chí đầu tiên trên nhóm nhỏ hơn. Cách tính này phải deterministic và trả `explanation` cho từng vị trí để BTC giải thích với VĐV.

### 16.4 Preset

- `phong_trao_mac_dinh`: như ví dụ trên.
- `hieu_so_van_truoc`: `match_points → game_diff → head_to_head → point_diff → draw_lot`.
- `giao_huu_clb`: dùng cho `scoring_scope = club`: `match_points → point_diff → points_for → head_to_head → draw_lot`.

Engine round-robin hiện hard-code thứ tự `match_points → diff → h2h → points_for → seed`; thứ tự này trở thành preset `legacy_v2` để BXH của giải cũ không đổi.

## 17. Chia sẻ Zalo và xuất ảnh

PickHub **không tích hợp Zalo OA/ZNS API** trong Phase 3 và Phase 4. Zalo OA yêu cầu xác thực doanh nghiệp, có phí và không phù hợp với CLB phong trào. "Kênh Zalo" ở đây nghĩa là làm cho mọi thứ BTC cần gửi vào nhóm Zalo đều có sẵn để copy/dán trong một thao tác.

### 17.1 Link chia sẻ có preview

- Trang công khai và từng division có `generateMetadata` với Open Graph: tiêu đề, mô tả ngắn, ảnh poster hoặc ảnh tự sinh. Dán link vào Zalo hiển thị card có ảnh thay vì link trần.
- Ảnh OG mặc định được render server-side từ tên giải, ngày, địa điểm và logo CLB chủ giải khi BTC chưa tải poster.
- Link resolve bằng `public_slug` toàn hệ thống và tôn trọng `visibility`.

### 17.2 Xuất ảnh

Mỗi view công khai có nút "Xuất ảnh" tạo PNG kích thước phù hợp màn hình dọc điện thoại:

| Ảnh | Nội dung |
|---|---|
| Kết quả bốc thăm | Bảng/nhánh sau khi commit draw, kèm seed để đối chiếu |
| Lịch thi đấu theo sân hoặc theo CLB | Giờ, sân, cặp đấu |
| Bảng xếp hạng | Theo bảng hoặc toàn division, kèm thứ tự tie-break đang dùng |
| Kết quả trận và sơ đồ knockout | Tỉ số từng ván |
| Bảng vàng | Nhất, nhì, ba từng nội dung khi giải hoàn tất |

Ảnh được render từ projection công khai, không chứa dữ liệu riêng tư, có watermark tên giải và thời điểm xuất để tránh nhầm phiên bản lịch. Người dùng tự gửi ảnh vào Zalo; hệ thống không gửi thay.

### 17.3 Copy văn bản

Nút "Sao chép thông báo" tạo text thuần định dạng cho tin nhắn Zalo: lịch trận sắp tới, kết quả vừa chốt, hoặc gọi trận vào sân. Template có version và BTC sửa được trước khi copy.

### 17.4 Để ngỏ cho tương lai

Adapter thông báo của Phase 4 giữ interface `NotificationChannel`; Zalo OA/ZNS là một implementation có thể thêm sau khi có nhu cầu và pháp nhân, không thay đổi domain.
