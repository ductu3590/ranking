** Vấn đề hiện tại **
1. Những vấn đề đã xác định
A. Chọn “Vòng bảng + CK” nhưng không tạo đúng cấu trúc giải — nghiêm trọng nhất
Có hai lỗi độc lập:

Wizard lưu số bảng bằng config.groupCount = 2.
Logic bốc thăm lại đọc config.groups; không tìm thấy nên mặc định 1 bảng.
Tôi chạy đúng tổ hợp cấu hình này với 7 cặp, kết quả thực tế trả về chỉ ["A"].

Ngoài ra, nhánh tạo giải hiện chỉ tạo một giai đoạn vòng tròn, chưa tạo giai đoạn loại trực tiếp và liên kết đi tiếp.

Hệ quả: màn hình xem trước hứa “2 bảng + playoff”, nhưng dữ liệu được tạo không thể hiện đầy đủ điều đó. Đây là lỗi chức năng, không phải bạn thao tác sai.

B. Cảnh báo cùng CLB không phù hợp với giải nội bộ
Bộ kiểm tra bốc thăm đang cảnh báo khi nhiều suất thi đấu cùng CLB rơi vào một bảng, nhưng không xét phạm vi giải.

Với giải nội bộ, mọi người cùng CLB là điều hiển nhiên, không phải vấn đề cần cảnh báo.

Cần phân biệt:

Nội bộ: không cảnh báo cùng CLB.
Giao hữu: chỉ cảnh báo nếu BTC bật yêu cầu hạn chế cùng CLB chung bảng.
Cảnh báo phải chỉ rõ điều cần xử lý, không làm người dùng nghi ngờ một cấu hình hợp lệ.
C. Chọn thành viên đang được thiết kế như nhập danh sách khách
Code hiện giữ danh sách người chơi chủ yếu bằng chuỗi tên, chọn từ roster cũng chuyển thành tên. Khi tạo suất thi đấu, wizard gửi display_name, không giữ ID thành viên trong payload này.

Điều đó dẫn đến:

Thiếu thao tác “Chọn toàn bộ thành viên”.
Khó tìm kiếm, chọn nhiều và kiểm tra ai còn thiếu.
Hai người trùng tên có nguy cơ bị xử lý như cùng một người.
Không bảo đảm liên kết danh tính ngay từ lúc chọn.
PHR hiện thành hàng loạt nhãn “chưa gắn”, nhưng không giúp BTC ra quyết định.
Với giải nội bộ, danh sách thành viên CLB phải là nguồn chính; nhập người ngoài chỉ là chức năng phụ.

D. Thêm/bớt người có thể làm thay đổi các cặp đã ghép
Các hàm thêm và xóa người hiện gọi lại chunkPairs(...) để chia đôi toàn bộ danh sách.

Ví dụ: đã ghép xong các cặp, sau đó bỏ một người ở giữa danh sách, các cặp phía sau có thể bị ghép lại theo thứ tự mới.

Đây là hành vi rất khó chịu vì người dùng chỉ muốn thay đổi một người, không muốn hệ thống âm thầm thay đổi nhiều cặp.

Cần có:

Danh sách người chưa ghép.
Cặp đã ghép độc lập với thứ tự roster.
Khóa cặp.
Đổi người rõ ràng.
Ghép lại chỉ tác động đến các cặp chưa khóa.
E. Tạo giải có thể thành công một phần mà không báo đầy đủ
Luồng hiện gọi nhiều API nối tiếp: tạo giải, CLB chủ nhà, nội dung, giai đoạn, rồi từng cặp.

Nhiều bước có catch bỏ qua lỗi để tiếp tục.

Rủi ro: giải đã tồn tại nhưng thiếu giai đoạn hoặc thiếu cặp; người dùng vẫn được chuyển sang màn tiếp theo mà không biết bước nào thất bại.

Đây là vấn đề cần ưu tiên cao hơn chỉnh giao diện:

“Tạo thành công” phải có nghĩa là cấu hình và danh sách bắt buộc đã được lưu đầy đủ, không phải chỉ tạo được bản ghi giải.

F. Màn hình chuẩn bị đang báo trạng thái không đáng tin
Trong console:

Mục VĐV đang được đánh dấu hoàn thành bằng athletes: true.
Cấu hình được xem là xong chỉ vì đã có giai đoạn.
Màn mặc định là Trung tâm điều hành, dù chưa có lịch hoặc sân.
Điều này giải thích cảm giác: vừa tạo xong đã bị đưa vào một màn trống 0/0, nhưng thanh bên lại báo đã hoàn thành một số bước.

Với giải đa giai đoạn, cũng không nên yêu cầu mọi giai đoạn đều có trận mới coi bước chuẩn bị lịch hoàn thành: playoff có thể đang chờ kết quả vòng bảng.

G. Giao diện sáng/tối là hai hệ style chưa được thống nhất
Shell điều hành dùng bộ màu ops-* riêng, trong khi nhiều tab cũ vẫn dùng token giao diện chung. Vì vậy có nền tối, thẻ trắng và chữ nhạt đan xen như ảnh.

Đề xuất: toàn bộ phần quản trị giải kế thừa giao diện sáng của CLB. Nếu cần chế độ tối cho màn hình tại sân thì làm thành chế độ riêng, không tự chuyển màu khi đi từ “tạo giải” sang “quản lý giải”.

H. Có nguyên nhân trong code khiến thao tác chậm, nhưng chưa có số đo thực tế
Tôi thấy các điểm cần xử lý:

Lưu từng cặp tuần tự qua nhiều request.
Giải nội bộ vẫn tải danh sách CLB có thể mời.
Console tải danh sách các giải rồi mới tìm một giải đang mở.
Reload đặt lại trạng thái loading toàn trang.
Dữ liệu bảng sân được tải ở console và còn được tải tại màn điều hành.
Đây là các nguồn độ trễ có căn cứ từ code. Tuy nhiên, chưa đo Network trên phiên sử dụng thực tế nên chưa thể kết luận bao nhiêu thời gian nằm ở API, database hay render.

2. Quy trình tôi đề xuất cho giải nội bộ
Không nên giữ hai quy trình setup rời nhau: wizard 3 bước, rồi lại chuẩn bị thêm 4 bước trong console.

Nên có một luồng liên tục, dùng cùng dữ liệu nháp và cùng giao diện:

Bước 1 — Thông tin và người tham gia
Tên giải, ngày tổ chức.
CLB tổ chức lấy từ phiên đăng nhập.
Nút nổi bật: “Chọn toàn bộ thành viên đang hoạt động”.
Danh sách có checkbox, tìm kiếm, chọn/bỏ chọn hàng loạt.
Hiện rõ: Đã chọn X/Y thành viên.
Thành viên ngừng hoạt động có bộ lọc riêng.
Poster, mô tả và đường dẫn chia sẻ nằm trong phần tùy chọn.
Trong ảnh bạn gửi đang có 14 người được chọn và một người còn ở mục thêm nhanh. Vì vậy chưa nên coi đây là toàn bộ roster; cần lấy số thực từ dữ liệu CLB.

Bước 2 — Thể thức và ghép cặp
Sau khi biết số người thực tế mới đề xuất cấu hình phù hợp:

Đánh đơn / đôi / đội.
Ghép thủ công / ngẫu nhiên / cân bằng theo điểm khi đủ dữ liệu.
Khóa các cặp muốn giữ.
Hiện người chưa ghép, không gộp họ thành “cặp” hợp lệ.
Nếu chọn Vòng bảng → Loại trực tiếp, phải cấu hình được ngay:

Số bảng.
Số cặp từng bảng.
Suất đi tiếp mỗi bảng.
Cách ghép nhánh.
Có tranh hạng ba hay không.
Luật điểm và số ván mặc định; tùy chỉnh từng giai đoạn nếu cần.
Không để người dùng chọn một tên thể thức nhưng không biết giải thực tế sẽ chạy thế nào.

Bước 3 — Bốc thăm và xem trước lịch
Phân biệt rõ:

Ghép cặp: ai đánh cùng ai.
Bốc thăm: cặp nào vào bảng/vị trí nào.
Sinh lịch: những cặp nào gặp nhau.
Xếp sân/giờ: trận nào thi đấu ở đâu, lúc nào.
Giao diện vẫn nối tiếp nhau, nhưng không đánh đồng các thao tác này.

Màn này cần thể hiện:

Danh sách bảng và số cặp mỗi bảng.
Đổi chỗ bằng thao tác dễ hiểu.
Sơ đồ đi tiếp.
Tổng số trận.
Số sân và thời lượng dự kiến, nếu đã khai báo.
Cảnh báo thực sự có ích.
Bản xem trước và lịch chính thức phải dùng cùng cấu hình và kết quả bốc thăm, không dựng sơ đồ minh họa riêng rồi lưu một cấu trúc khác.

Bước 4 — Kiểm tra và chốt
Ví dụ với 14 người, 7 cặp, nếu chọn 2 bảng, lấy 2 cặp mỗi bảng:

14 VĐV · 7 cặp
Bảng A: 4 cặp · Bảng B: 3 cặp
Vòng bảng: 9 trận
Bán kết: Nhất A – Nhì B; Nhất B – Nhì A
Chung kết: 1 trận
Tổng: 12 trận, hoặc 13 nếu có tranh hạng ba.

Cần lưu ý bảng 4 cặp đánh nhiều trận hơn bảng 3 cặp; đây mới là thông tin BTC nên biết.

Hai nút có ý nghĩa rõ:

Lưu nháp: cho phép cấu hình chưa hoàn tất.
Chốt bốc thăm & tạo lịch: chỉ khi dữ liệu hợp lệ.
Sau đó chuyển sang Tổng quan chuẩn bị hoặc Lịch thi đấu, không đưa ngay vào màn LIVE trống.

3. Trường hợp “lấy toàn bộ thành viên” mà số người lẻ
Điểm này phải giải quyết minh bạch.

Nếu roster thực tế có 15 người, đánh đôi cố định không thể tạo các cặp đầy đủ cho cả 15 người cùng lúc.

Hệ thống cần đưa ra lựa chọn:

Bổ sung một người để đủ 16.
Một người dự bị theo quyết định của BTC.
Chọn thể thức luân phiên phù hợp, nếu đã được hỗ trợ.
Không tự bỏ người cuối, không tự tạo cặp một người, và không dùng BYE để che việc thiếu đồng đội. BYE xử lý suất/cặp nghỉ lượt, không giải quyết một cặp thiếu người.

4. Thứ tự triển khai nên làm
Ưu tiên	Công việc	Mục tiêu
P0 — Đúng nghiệp vụ	Thống nhất trường số bảng; tạo đủ vòng bảng và loại trực tiếp; thiết lập đi tiếp; sửa cảnh báo nội bộ	Chọn gì tạo đúng đó
P0 — Toàn vẹn dữ liệu	Bỏ nuốt lỗi; lưu cấu trúc bắt buộc bằng transaction hoặc cơ chế nháp phục hồi; chống tạo trùng khi retry	Không báo thành công khi lưu thiếu
P1 — Quy trình	Một luồng chuẩn bị liên tục; trạng thái hoàn thành lấy từ dữ liệu thật; điều hướng đúng bước còn thiếu	Không phải tự đoán bước tiếp theo
P1 — Thành viên/cặp	Chọn toàn bộ, chọn theo ID, tìm kiếm, khóa cặp, xử lý người lẻ	Làm nhanh mà không làm mất ghép cặp
P1 — Giao diện	Thống nhất theme, thành phần nhập liệu, nút chính và trạng thái trống	Không còn sáng/tối lẫn lộn
P2 — Hiệu năng	API lưu theo lô; tải đúng dữ liệu cần dùng; tránh tải trùng; cập nhật cục bộ	Giảm request và nhấp nháy toàn trang
Với giải đã tạo, cần kiểm tra dữ liệu trước khi sửa. Không tự sinh lại lịch hoặc đụng vào tỉ số đã có chỉ để đưa cấu hình về đúng.

5. Tiêu chí nghiệm thu
Không chỉ kiểm tra từng màn đẹp hơn; phải đi hết luồng:

Chọn toàn bộ roster, đối chiếu đủ ID, không mất người trùng tên.
Thử số người chẵn và lẻ.
Ghép/khóa cặp; thêm bớt một người không phá các cặp khác.
Với 7 cặp, cấu hình 2 bảng phải thật sự lưu và bốc ra 4–3.
Có đầy đủ giai đoạn loại trực tiếp và quy tắc đi tiếp.
Chốt lịch ra đúng các trận theo bản bốc thăm đã duyệt.
Hoàn tất vòng bảng → lấy đúng suất → ghép đúng bán kết.
Reload hoặc retry không tạo trùng, không mất nháp.
Giả lập lỗi lưu: báo rõ, không để người dùng tưởng đã hoàn tất.
Đo thời gian tải/tạo giải và kiểm tra cả mobile.

**Kế hoạch triển khai**
Tôi đề xuất sửa trên luồng v2 hiện có, không xây thêm một wizard độc lập. Trọng tâm là một bản nháp xuyên suốt từ chọn thành viên đến chốt lịch, với hai hành động riêng biệt:

Lưu bản nháp: được phép chưa đủ người/chưa ghép xong; không sinh trận.
Chốt bốc thăm & sinh lịch: chỉ thực hiện khi mọi điều kiện hợp lệ và ghi dữ liệu nguyên tử.
Chưa có thay đổi file hoặc database. git status --short không báo thay đổi. Trong lượt này tôi đã kiểm chứng thêm mã nguồn và hợp đồng cũ, chưa chạy lại test hoặc xác minh schema Supabase đang triển khai, nên không coi các kết quả test/migration trước đây là đã xác nhận.

Những điểm cần bổ sung vào audit
Đã có hàm tạo hai stage để tái sử dụng.
buildDivisionStagePayloads() trong c:\Users\ductu\ranking\lib\tournament\wizardModel.js đã có nhánh vòng bảng → knockout. Cần hợp nhất cách wizard gọi hàm này, không viết thêm một bộ chuyển đổi thể thức khác.

Sửa tên trường số bảng chưa đủ.
Engine round-robin hiện tự chia lại bảng theo seed; đoạn đọc được chưa sử dụng group_label đã chốt. Vì vậy phải đảm bảo engine tôn trọng kết quả bốc thăm, nếu không preview và lịch lưu vẫn có thể khác nhau.

Chốt draw hiện chưa nguyên tử trên toàn bộ thao tác.
Route đang lần lượt xóa stage entrants, insert lại, sinh lịch, rồi khóa draw. Lỗi giữa các bước có thể để lại trạng thái dở dang.

Có nền tảng atomic để tận dụng, nhưng chưa bao phủ toàn bộ setup.
Tạo entry và advance đã gọi RPC. Không nên đánh đồng việc từng entry được tạo nguyên tử với việc toàn bộ giải được tạo nguyên tử.

Đi tiếp cần scope theo division.
Route advance hiện tìm stage kế tiếp theo giải và stage_order + 1; cần thay bằng liên kết stage rõ ràng, có kiểm tra cùng tenant/giải/division.

Roster đã cung cấp danh tính cần thiết.
API hiện trả member_id, athlete_id, is_active; UI không cần dựa vào tên để nhận diện người chơi. Trường hợp chưa có athlete_id phải được xử lý rõ ràng.

1. P0 — Chốt hợp đồng setup, draw và progression
Công việc
Thiết lập một hợp đồng chung cho UI, API và engine:

Thành phần	Quyết định
Danh tính người chơi	Dùng member_id để chọn roster; ánh xạ sang athlete_id ở server. Tên chỉ là snapshot hiển thị.
Cặp đấu	Có ID ổn định, hai thành viên và trạng thái khóa; không suy ra lại từ thứ tự danh sách.
Cấu hình bảng	Chuẩn hóa về groupCount, phù hợp engine hiện tại; hỗ trợ đọc tên trường cũ tại một lớp chuyển đổi duy nhất.
Trường cấu hình mâu thuẫn	Báo lỗi rõ ràng khi chỉnh/chốt; không âm thầm chọn một giá trị.
Kết quả bốc thăm	Lưu slots, bảng, seed và revision; đây là nguồn dữ liệu sinh lịch.
Stage tiếp theo	Liên kết rõ stage nguồn–đích và suất như Nhất A, Nhì B.
Readiness	Tính từ dữ liệu và validator, không từ việc “đã có stage”.
Tách rõ bốn nghiệp vụ: ghép cặp → bốc thăm → sinh trận → phân sân/giờ.

File dự kiến
Sửa:

c:\Users\ductu\ranking\lib\tournament\wizardConfig.js
c:\Users\ductu\ranking\lib\tournament\wizardModel.js
c:\Users\ductu\ranking\lib\tournament\draw.js
c:\Users\ductu\ranking\lib\tournament\engines\roundRobin.js
c:\Users\ductu\ranking\lib\tournament\schedulePreview.js
c:\Users\ductu\ranking\lib\tournament\generateSchedule.js
c:\Users\ductu\ranking\lib\tournament\orchestrator.js
Thêm đề xuất:

c:\Users\ductu\ranking\lib\tournament\setupContract.js
c:\Users\ductu\ranking\lib\tournament\setupReadiness.js
c:\Users\ductu\ranking\_workspace\10_internal_setup_contract.md
Điều kiện nghiệm thu
Preview và persist dùng cùng cấu hình đã chuẩn hóa, cùng draw slots và seed.
Engine không chia lại bảng đã bốc.
Giải nội bộ không phát cảnh báo vô nghĩa vì các cặp cùng CLB; giải liên CLB vẫn giữ chính sách tương ứng.
Vòng bảng → knockout có đủ hai stage và tuyến đi tiếp hợp lệ.
Không sửa rộng các thể thức khác ngoài phần dùng chung và kiểm thử hồi quy.
2. P0 — Bản nháp bền vững và chốt lịch nguyên tử
Phương án chọn
Lưu nháp từng lần bằng transaction; chốt lịch bằng transaction riêng.

Không giữ một transaction kéo dài trong suốt quá trình người dùng thao tác. Không tiếp tục chuỗi request tạo từng thành phần rồi bỏ qua lỗi.

Bản nháp cần lưu được:

Người đã chọn, người chưa ghép.
Cặp hiện tại và cặp khóa.
Cấu hình stage, draw draft.
Revision và bước đang làm.
Hành vi API
Server xác định group_id từ session; không tin giá trị tenant do client gửi.
Mọi ID tham chiếu được kiểm tra đúng tenant/giải/division.
Ghi yêu cầu quyền quản trị đã được xác thực.
Save/finalize nhận expected_revision và idempotency_key.
Cùng key, cùng nội dung → trả lại kết quả cũ.
Cùng key, khác nội dung → báo xung đột.
Hai tab chỉnh đồng thời → trả 409, không ghi đè âm thầm.
Finalize kiểm tra lại dữ liệu trong transaction, không chỉ tin preview.
Ghi stage entrants, fixtures và trạng thái khóa draw thành một đơn vị nguyên tử.
Không dùng thao tác xóa rồi tạo lại làm hành vi mặc định khi mở hoặc lưu nháp.

File dự kiến
Thêm:

c:\Users\ductu\ranking\app\api\tournament-v2\setup\route.js
c:\Users\ductu\ranking\lib\tournament\setupPersistence.js
Sửa/tái sử dụng:

c:\Users\ductu\ranking\app\api\tournament-v2\draw\route.js
c:\Users\ductu\ranking\app\api\tournament-v2\advance\route.js
c:\Users\ductu\ranking\app\api\tournament-v2\athletes\route.js
c:\Users\ductu\ranking\lib\tournament\persistence.js
c:\Users\ductu\ranking\lib\tournamentV2Client.js
Migration và tương thích
Trước khi viết migration, đối chiếu schema/RPC thực tế với migration ledger. Không suy ra trạng thái database chỉ từ file SQL.

Dự kiến migration bổ sung metadata bản nháp, revision, liên kết progression và RPC cần thiết. Số migration chỉ chốt sau khi kiểm tra ledger; thư mục hiện đã có đến 054.

Nguyên tắc:

Chỉ bổ sung cấu trúc cần thiết; không reset hoặc xóa dữ liệu giải.
RPC ghi không được mở cho browser gọi trực tiếp; kiểm tra quyền thực thi và search_path.
Không backfill lịch hoặc tự thêm stage vào giải cũ.
Giải cũ đọc qua lớp tương thích; muốn chuyển sang setup mới phải là thao tác có chủ đích và qua preflight.
Giải đã có trận bắt đầu hoặc điểm số không được thay cấu trúc qua luồng setup.
Migration tương thích trước, code sau; nếu cần rollback ứng dụng thì giữ nguyên dữ liệu mới.
Gate: mô phỏng lỗi tại từng điểm ghi phải chứng minh không tồn tại trạng thái “draw đã khóa nhưng thiếu lịch”, hoặc “đã xóa entrants nhưng chưa tạo lại”.

3. P1 — Luồng setup thống nhất
Trải nghiệm đề xuất
Thành viên → Ghép cặp → Thể thức → Bốc thăm & xem trước → Chốt lịch

Thông tin cơ bản của giải được lưu cùng bản nháp. Phân sân/giờ nằm sau khi đã có fixtures và không làm thay đổi bốc thăm.

Chọn thành viên
Chọn tất cả thành viên đang hoạt động.
Tìm kiếm theo tên, nhưng chọn/bỏ chọn bằng ID.
Phân biệt được hai người trùng tên.
Giữ lựa chọn sau reload.
Ghép cặp
Thêm người chỉ đưa vào danh sách chưa ghép.
Xóa người chỉ ảnh hưởng cặp chứa người đó.
Cặp khác không đổi, kể cả chưa khóa.
Ghép tự động là hành động rõ ràng và tôn trọng cặp khóa.
Muốn ghép lại các cặp chưa khóa phải có thao tác riêng.
Số người lẻ phải thêm người, bỏ chọn hoặc để người đó ngoài danh sách thi đấu; BYE không thay thế người còn thiếu trong một cặp.
Điều hướng và readiness
Mở giải nháp tại bước đầu tiên chưa hoàn tất.
Chỉ đưa người dùng vào màn điều hành khi đã có lịch.
Hiển thị lý do chặn cụ thể: còn người chưa ghép, thiếu stage đích, draw lỗi hoặc preview đã cũ.
Sửa cấu hình/cặp khiến draw cũ không còn hợp lệ phải đánh dấu cần bốc lại, không âm thầm tái sinh.
Trạng thái “đã lưu” chỉ hiển thị khi server xác nhận.
File dự kiến
c:\Users\ductu\ranking\app\giai-dau\v2\TournamentWizard.js
c:\Users\ductu\ranking\app\giai-dau\v2\wizard\StepRegister.js
c:\Users\ductu\ranking\app\giai-dau\v2\console\TournamentConsoleV2.js
c:\Users\ductu\ranking\app\giai-dau\v2\console\ConsoleShell.js
c:\Users\ductu\ranking\app\giai-dau\v2\console\steps\DrawStep.js
c:\Users\ductu\ranking\app\giai-dau\v2\console\steps\ControlStep.js
Thêm đề xuất: c:\Users\ductu\ranking\lib\tournament\pairingDraft.js để quản lý cặp bằng logic thuần, kiểm thử độc lập với React.

4. P1 — Thống nhất giao diện
Dùng theme tokens hiện có, loại bỏ các khai báo ops-* xung đột theo từng component.
Ưu tiên màn hình khoảng 380px; không ép cả wizard vào một bảng rộng.
Nút chính phù hợp từng bước; tách rõ lưu nháp và chốt lịch.
Lỗi nằm cạnh phần cần sửa, không chỉ hiện thông báo thoáng qua.
Không biến đợt sửa này thành redesign toàn bộ màn điều hành.
File trọng tâm:

c:\Users\ductu\ranking\app\giai-dau\v2\console\console.css
c:\Users\ductu\ranking\app\giai-dau\v2\console\shell.css
5. P2 — Hiệu năng có đo lường
Đo baseline trước khi tối ưu:

Số request để mở nháp, lưu nháp, preview và chốt lịch.
Thời gian API và kích thước payload.
Các lần tải lại roster, sân, danh sách giải.
Thời gian phản hồi giao diện sau thêm/bỏ người.
Sau đó:

Batch writes thay cho một request mỗi cặp.
Chỉ fetch dữ liệu giải/division đang thao tác.
Loại bỏ tải sân trùng.
Cập nhật state cục bộ từ response, tránh reload toàn trang.
Chỉ chạy song song những request độc lập.
Không cam kết mức giảm latency khi chưa có baseline. Báo cáo trước/sau trên cùng bộ dữ liệu và điều kiện đo.

6. Kiểm thử và nghiệm thu
Ca xuyên suốt bắt buộc
14 người → 7 cặp → bảng 4/3 → 9 trận vòng bảng → 2 bán kết + chung kết = 12 trận.

Bảng A: 4 × 3 / 2 = 6 trận.
Bảng B: 3 × 2 / 2 = 3 trận.
Bán kết: Nhất A–Nhì B, Nhất B–Nhì A.
Nếu bật tranh hạng ba: tổng 13 trận, lấy hai đội thua bán kết.
Cần phân biệt khung lịch với đội đã xác định: khi chốt setup có thể tạo các trận knockout chờ suất đi tiếp; chỉ gán entry khi kết quả vòng trước được xác nhận. Preview, lưu database và màn bracket phải thống nhất cách biểu diễn này, không tạo VĐV/entry giả.

Ma trận bắt buộc
Nhóm	Ca cần qua
Danh tính	Trùng tên, đổi tên, chưa có athlete mapping, member ID ngoài tenant
Cặp	Thêm/bỏ người không xáo cặp khác, giữ khóa, chặn người xuất hiện hai cặp
Số lẻ	Lưu nháp được; chốt bị chặn khi còn cặp thiếu người
Cấu hình	Alias cũ, giá trị mâu thuẫn, số bảng/suất đi tiếp không hợp lệ
Draw	Không thiếu/trùng entry, giữ bảng đã chốt, preview/persist parity
Progression	Đúng chéo bảng, đúng division, không advance khi kết quả chưa đủ
Độ tin cậy	Reload, mất response sau commit, retry, hai tab, lỗi giữa transaction
Bảo mật	Member không được ghi; tham chiếu chéo tenant bị chặn
Bảo toàn	Giải có điểm không bị sửa lịch hoặc mất kết quả
UI	Mobile, lỗi dễ hiểu, loading cục bộ, theme sáng/tối
Test hiện có cần mở rộng
c:\Users\ductu\ranking\tests\phase3\wizard-config.test.js
c:\Users\ductu\ranking\tests\phase3\schedule-preview.test.js
c:\Users\ductu\ranking\tests\phase3\wizard-competition-contract.test.js
c:\Users\ductu\ranking\tests\tournament\draw.test.js
c:\Users\ductu\ranking\tests\tournament\mix-integration.test.js
Thêm test runtime cho pairing, setup readiness, idempotency và ca 14 người; không chỉ kiểm tra chuỗi trong source code. Kiểm thử tích hợp transaction trên dữ liệu test riêng, scope đúng CLB; không dùng giải đang hoạt động để thử lỗi.

Thứ tự thực hiện và các mốc dừng
Preflight: xác minh schema/RPC, baseline test, chốt hợp đồng.
Engine + QA: normalize config, giữ draw slots, tuyến progression, ca 14 người.
Persistence/API + QA: draft, revision, atomic finalize, retry và tenant isolation.
UI + QA: roster theo ID, cặp ổn định, resume draft, readiness và theme.
Hiệu năng + hồi quy: đo trước/sau, chạy bộ test liên quan, build và kiểm thử mobile.