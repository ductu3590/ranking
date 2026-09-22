# Checklist test tay — PickHub tự sinh QR nhận quỹ và phát cho cả nhóm

- **Ngày soạn:** 2026-09-22 (đã qua 4 vòng sửa: phát QR tự động → vá timeout → 12 góp ý Reviewer → bớt nút/xoá mục `#set-qr` theo yêu cầu anh Tú)
- **Liên quan:** `.bangiao/ke-hoach.md`, `.bangiao/tra-loi.md` (mục "vòng 4"), `.bangiao/thay-doi.md` (mục "SỬA VÒNG 4")
- **Thiết bị:** điện thoại thật là chính; nếu dùng trình duyệt desktop thì bật chế độ responsive **~380px**.
- **Dữ liệu test:** dùng **một CLB test riêng** (không dùng CLB đang hoạt động thật). Đăng nhập bằng Mã CLB + mật khẩu **admin** của CLB test đó, trừ bài nào ghi rõ dùng phiên member.
- **Dọn dữ liệu sau khi test** (thao tác an toàn, không `DROP`/`TRUNCATE`):
  ```sql
  UPDATE groups SET fund_qr_url = NULL WHERE id = <group test>;
  UPDATE group_bank_accounts SET bank_code = NULL, bank_bin = NULL, account_holder = NULL WHERE group_id = <group test>;
  ```
- Quy ước đọc kết quả: ✅ đúng như kỳ vọng, ❌ sai, ⚠️ đúng nhưng khó dùng — ghi rõ ghi chú.

## CẬP NHẬT SAU VÒNG SỬA 4 (2026-09-22) — đọc trước khi test

Anh Tú đã xác nhận **PASS** cho luồng phát QR (vòng 3), sau đó yêu cầu 3 thay đổi. Ảnh hưởng tới thao tác tay:

1. **Bỏ hẳn nút "Chia sẻ lên Zalo / Messenger" và "Sao chép lời nhắn".** Chỉ còn đúng 2 nút: **"Tải ảnh QR"** (giờ là nút chính, màu nổi bật) và **"Sao chép ảnh"**.
2. **Thêm khối gợi ý** ngay dưới 2 nút, hướng dẫn sao chép ảnh rồi ghim vào nhóm Zalo CLB — **và đây là chỗ DUY NHẤT còn nhắc thành viên ghi HỌ TÊN trong nội dung chuyển khoản** (mất câu này thì `lib/transaction-parser.js` sẽ gán mọi giao dịch thành `Unknown`).
3. **Xoá hẳn mục "QR nhận quỹ thành viên" (`#set-qr`) trong `/admin`** — không điều kiện. Component QR giờ **chỉ còn một nơi duy nhất**: bên trong khối Auto Quỹ đã kết nối (`#set-sepay`). Không còn đường tải ảnh QR thủ công qua UI nữa.

**Hệ quả anh Tú đã được cảnh báo và vẫn chọn:** CLB nào **chưa kết nối SePay** sẽ không còn cách nào đặt ảnh QR cho `/quy` qua giao diện. Nếu gặp CLB thật đang ở tình trạng này trong lúc test, xác nhận lại với anh Tú trước khi coi đó là "lỗi".

**Không đổi / không mất dữ liệu:** cột `groups.fund_qr_url` không migration, không đụng dữ liệu — CLB đang có ảnh QR tải tay từ trước (qua migration 044, chưa từng dùng tính năng tự sinh) **vẫn phải hiển thị ảnh đó bình thường ở `/quy`**, chỉ là không còn sửa/xoá được qua UI nữa. Đây là bài test hồi quy quan trọng nhất của vòng này — xem **bài 8**.

**Các bài đã lỗi thời, KHÔNG còn áp dụng (đã gỡ khỏi checklist này):** "Chia sẻ QR lên Zalo/Messenger", "Sao chép lời nhắn" (cả hai bản gốc và bản "sau khi mở lại trang"), "Tải ảnh QR thủ công ở `#set-qr` vẫn hoạt động như cũ" — component đã xoá các nút/mục này theo đúng yêu cầu, không phải lỗi bỏ sót.

---

## Vì sao có bài số 1 đứng đầu

Máy (sandbox CI) gọi thử cả hai endpoint ảnh QR (`qr.sepay.vn/img` và `vietqr.app/img`) để kiểm chứng độc lập với báo cáo của Coder. Kết quả:

- `https://vietqr.app/img?...` → **200 OK**, trả đúng ảnh PNG thật (540×633, ~32KB, có logo SePay + napas247 + VietQR, hiển thị đúng số tài khoản che và đúng tên ngân hàng MB Bank ứng với BIN `970422`). Xác nhận **URL + BIN dựng đúng chuẩn VietQR**.
- `https://qr.sepay.vn/img?...` → **timeout hoàn toàn** (không có byte nào trả về sau 15–20s), lặp lại nhiều lần độc lập qua các vòng test, luôn cùng kết quả.

Vì route `app/api/club/fund-qr/generate` gọi hai endpoint này **từ phía server** (Vercel serverless function), không phải từ trình duyệt người dùng, nên khả năng cao `qr.sepay.vn` cũng không phản hồi khi gọi **từ chính môi trường production**.

**Ngân sách thời gian hiện tại** (giữ nguyên từ vòng 2, không đổi ở vòng 3/4):

| Hằng số | Giá trị | Ý nghĩa |
|---|---|---|
| `PRIMARY_PROVIDER_TIMEOUT_MS` | 2.500 ms | Ngân sách chờ SePay (provider ưu tiên) — hết hạn là bỏ qua ngay, không thử thêm `qronly` |
| `FALLBACK_PROVIDER_TIMEOUT_MS` | 4.000 ms | Ngân sách chờ VietQR (dự phòng) |
| `IMAGE_FETCH_BUDGET_MS` | 7.000 ms | Trần tổng cho toàn bộ phần tải ảnh — kiểm tra trước mỗi lần thử, hết là dừng hẳn |

Trường hợp xấu nhất (cả hai provider đều im lặng): **2.500 + 4.000 = 6.500 ms** phần mạng. Vòng 4 còn **bớt thêm một truy vấn Supabase** (`loadGroupName` đã bị xoá cùng nút "Sao chép lời nhắn") nên tổng thời gian lý thuyết còn **nhẹ hơn vòng 3**, margin trước ngưỡng cắt cứng 10 giây của Vercel Hobby càng rộng hơn.

**Bài số 1 dưới đây vẫn là phép thử duy nhất trả lời dứt điểm** liệu cấu hình này có thực sự tránh được treo/504 trên chính môi trường production hay không — máy (sandbox) không đo được điều này.

---

## 1. [ƯU TIÊN CAO] Đo thời gian và kết quả tạo QR trên production thật

**Chuẩn bị:** Đăng nhập admin CLB test đã kết nối SePay (đã có ít nhất một tài khoản quỹ đang hoạt động). Mở `/admin` → mục **Auto Quỹ** (`#set-sepay`) → khối "Phát mã QR cho cả nhóm". *(Lưu ý: không còn mục `#set-qr` riêng — đây là nơi DUY NHẤT còn chứa QR.)*

**Thao tác:**
1. Chọn ngân hàng của tài khoản quỹ (ví dụ MB Bank).
2. Bấm nút **"Tạo mã QR nhận quỹ"** và bấm giờ (đếm số giây) tới khi ảnh QR hiện ra hoặc báo lỗi.
3. Mở tab mạng của trình duyệt (DevTools → Network, lọc `generate`) hoặc hỏi người có quyền xem log Vercel, để đọc: request `POST /api/club/fund-qr/generate` mất bao nhiêu mili-giây, và trong response JSON trả về, trường `"provider"` là `"sepay"` hay `"vietqr"`.

**✅ PASS khi:**
- Ảnh QR hiện ra thành công trong **dưới khoảng 9 giây**. Nếu `provider` là `"sepay"`: nên rất nhanh (dưới 3 giây). Nếu `provider` là `"vietqr"`: dấu hiệu SePay đã timeout và hệ thống **fallback đúng như thiết kế** — thời gian tổng vẫn nằm trong khoảng **~6,5–9 giây** (không treo tới 16 giây như cấu hình cũ ở vòng 1), ảnh QR hiển thị đúng, quét được bình thường.
- Nếu cả hai provider đều thất bại: thấy thông báo lỗi tiếng Việt rõ ràng ("Không tải được ảnh QR lúc này, thử lại sau ít phút.") trong khoảng **~7–9 giây**, **không phải màn trắng/504**, và nếu CLB đã từng có QR trước đó thì ảnh QR cũ **vẫn còn nguyên** (không bị xoá).

**❌ FAIL / báo gấp cho Reviewer khi:** thời gian chờ vượt quá ~10 giây, hoặc ra lỗi trắng màn/504/timeout ở tầng platform.

**Kết quả:** ___

---

## 2. Quét ảnh QR vừa sinh bằng app ngân hàng thật

**Chuẩn bị:** Đã có ảnh QR từ bài số 1.

**Thao tác:**
1. Mở app ngân hàng bất kỳ trên điện thoại (app nào có chức năng quét QR chuyển khoản).
2. Quét ảnh QR đang hiển thị trên màn `/admin`.

**✅ PASS khi:** App ngân hàng nhận diện đúng **ngân hàng** và đúng **số tài khoản** đã khai với SePay. Ô **số tiền để trống** (không tự điền sẵn). Ô **nội dung chuyển khoản để trống** (không tự điền sẵn). Nếu app tự điền sẵn số tiền hoặc nội dung, đây là lỗi nghiêm trọng — mọi giao dịch sẽ bị gán `Unknown` trong sổ quỹ.

**Kết quả:** ___

---

## 3. Chuyển khoản thật, kiểm tra ghi sổ đúng tên (ca chứng minh "vẫn đi qua SePay")

**Chuẩn bị:** CLB test đã bật Auto Quỹ (webhook SePay đang hoạt động), có ít nhất một thành viên test trong danh sách roster.

**Thao tác:**
1. Dùng QR vừa quét ở bài số 2, chuyển khoản thật số tiền nhỏ (ví dụ 2.000đ).
2. Ở phần nội dung chuyển khoản, tự gõ tay **họ tên đầy đủ của một thành viên test** đã có trong roster CLB.
3. Chờ 1–3 phút, mở `/quy` (trang sổ quỹ) của CLB test, tìm giao dịch vừa chuyển.

**✅ PASS khi:** Giao dịch xuất hiện trong sổ `/quy` với đúng số tiền, và được gán **đúng tên thành viên** đã gõ trong nội dung — không rơi vào `Unknown`.

**Kết quả:** ___

---

## 4. [ĐỔI SAU VÒNG SỬA 4] Đúng 2 nút còn lại: "Tải ảnh QR" + "Sao chép ảnh"

**Vì sao đổi:** Anh Tú yêu cầu bỏ nút "Chia sẻ lên Zalo/Messenger" và "Sao chép lời nhắn" — thay bằng khối gợi ý tĩnh (xem bài 6). Bài này thay cho bài "Chia sẻ QR lên Zalo/Messenger" cũ.

**Chuẩn bị:** CLB test đã có QR, mở `/admin#set-sepay`.

**Thao tác:**
1. Quan sát hàng nút ngay dưới ảnh QR.
2. Bấm **"Tải ảnh QR"** → mở ứng dụng Ảnh/Thư viện trên máy, tìm ảnh vừa tải.
3. Bấm **"Sao chép ảnh"** → dán thử vào một khung chat/ứng dụng vẽ bất kỳ.

**✅ PASS khi:**
- Hàng nút chỉ có **đúng 2 nút**: "Tải ảnh QR" và "Sao chép ảnh". **Không còn** nút "Chia sẻ lên Zalo/Messenger" hay "Sao chép lời nhắn" ở bất kỳ đâu trên trang.
- "Tải ảnh QR": ảnh PNG lưu về máy đúng, mở lên nhìn rõ mã QR (thử cả Android + iOS Safari).
- "Sao chép ảnh": dán ra đúng là ảnh QR (không phải văn bản, không rỗng); nút đổi thành "Đã chép ✓" sau khi bấm thành công.

**Kết quả:** ___

---

## 5. [MỚI SAU VÒNG SỬA 4] Khối gợi ý hiện đúng, còn đủ câu nhắc ghi HỌ TÊN

**Vì sao có bài này:** Đây là bài **quan trọng nhất** của vòng sửa 4. Sau khi bỏ nút "Sao chép lời nhắn", khối gợi ý tĩnh này là **nơi duy nhất còn lại** nhắc thành viên ghi họ tên khi chuyển khoản — thiếu câu này thì `lib/transaction-parser.js` không gán được ai đã nộp tiền, giao dịch rơi vào `Unknown`.

**Chuẩn bị:** CLB test đã có QR, mở `/admin#set-sepay`.

**Thao tác:**
1. Cuộn tới khối QR, đọc kỹ đoạn chữ ngay dưới 2 nút "Tải ảnh QR" / "Sao chép ảnh" (khối có biểu tượng 📌).

**✅ PASS khi:** Khối gợi ý hiện đủ, đọc ra nghĩa rõ ràng, gồm **cả hai ý**:
- Hướng dẫn sao chép ảnh (hoặc tải về) rồi **dán/ghim vào nhóm Zalo của CLB**.
- Nhắc thành viên **ghi HỌ TÊN của mình** trong nội dung chuyển khoản, kèm giải thích ngắn lý do (thiếu tên thì hệ thống không gán được ai đã nộp) và nhắc chỉ tiền vào đúng tài khoản trong QR mới tự động lên sổ.

**❌ FAIL khi:** thiếu hẳn câu nhắc ghi họ tên, hoặc câu chữ mơ hồ tới mức người đọc bình thường không hiểu phải làm gì.

**Kết quả:** ___

---

## 6. [ĐỔI SAU VÒNG SỬA 4] Cảnh báo "Tài khoản quỹ đã đổi" — chỉ hiện đúng lúc

**Vì sao có bài này:** Logic cảnh báo này không đổi ở vòng 4 (chỉ có nơi hiển thị đổi, từ 2 chỗ còn 1 chỗ duy nhất). Vẫn cần test cả hai vế để chắc không báo sai.

**6.1 — CLB chỉ có MỘT tài khoản quỹ → KHÔNG BAO GIỜ được thấy cảnh báo**

**Chuẩn bị:** CLB test chỉ có đúng một tài khoản ngân hàng đang hoạt động. Tài khoản này **chưa từng** bấm "Tạo mã QR nhận quỹ" (nếu CLB có sẵn `fund_qr_url` do tải ảnh thủ công từ trước migration 044 thì càng đúng thực tế).

**Thao tác:** Mở `/admin#set-sepay`.

**✅ PASS khi:** **Không** thấy dòng cảnh báo vàng "Tài khoản quỹ đã đổi" dù `fund_qr_url` đã có sẵn và tài khoản chưa có `bank_code`.

**6.2 — CLB có HAI tài khoản quỹ, một cái đã cấu hình → cảnh báo phải hiện khi chọn cái CHƯA cấu hình**

**Chuẩn bị:** CLB test có **hai** tài khoản ngân hàng đang hoạt động. Đã bấm "Tạo mã QR nhận quỹ" cho **tài khoản A**.

**Thao tác:** Bấm "Tạo lại QR", ở ô chọn "Tài khoản quỹ" chuyển sang **tài khoản B** (chưa từng tạo QR).

**✅ PASS khi:** Thấy dòng cảnh báo vàng "Tài khoản quỹ đã đổi, hãy tạo lại QR để đúng số tài khoản mới" ngay khi chọn tài khoản B.

**⚠️ Lưu ý đã biết (không phải lỗi):** nếu xoá hẳn tài khoản A rồi thêm tài khoản C hoàn toàn mới (thay vì chuyển qua lại), cảnh báo sẽ không hiện — đánh đổi đã được Reviewer/Coder thống nhất chấp nhận.

**Kết quả:** ___

---

## 7. [ĐỔI SAU VÒNG SỬA 4] Thêm/xoá tài khoản ngân hàng thì khối QR tự tải lại

**Vì sao đổi:** Trước vòng 4, có 2 khối QR trên `/admin` cần đồng bộ với nhau. Giờ chỉ còn 1 khối duy nhất, nhưng nó vẫn cần tự đồng bộ khi mục **"Ngân hàng" (`#set-bank`)** ngay cạnh có thay đổi (thêm/xoá tài khoản), để không phải F5.

**Chuẩn bị:** CLB test đang ở `/admin`, đã kết nối SePay.

**Thao tác:**
1. Ở khối QR (`#set-sepay`), ghi nhớ trạng thái hiện tại (đang chọn tài khoản nào).
2. Cuộn tới mục "Ngân hàng" (`#set-bank`), thêm một tài khoản ngân hàng mới.
3. **Không F5**, cuộn lại khối QR.

**✅ PASS khi:** Khối QR tự cập nhật danh sách tài khoản (thấy tài khoản mới trong ô chọn nếu đang ở màn chọn ngân hàng), không cần tải lại trang.

**Kết quả:** ___

---

## 8. [MỚI SAU VÒNG SỬA 4 — HỒI QUY QUAN TRỌNG NHẤT] CLB có ảnh QR tải tay từ trước vẫn hiện đúng ở `/quy`

**Vì sao có bài này:** Đây là ràng buộc "không mất dữ liệu" mà anh Tú đặc biệt lưu ý khi chốt xoá hẳn mục `#set-qr`. Cột `groups.fund_qr_url` không hề bị đụng (không migration, không SQL), nhưng UI để sửa/xoá nó qua trang admin đã biến mất — phải xác nhận **dữ liệu cũ vẫn hiển thị đúng cho thành viên**, dù admin không còn sửa được qua UI nữa.

**Chuẩn bị:** Tìm (hoặc tạo test) một CLB **đang có sẵn `groups.fund_qr_url`** từ trước (ảnh QR tải tay qua tính năng cũ, migration 044) — CLB này **có thể chưa từng kết nối SePay**.

**Thao tác:**
1. Mở `/quy` bằng phiên **thành viên** của CLB này.
2. Tìm thẻ "QR nhận quỹ CLB".

**✅ PASS khi:** Ảnh QR cũ hiển thị đúng, rõ nét, y hệt như trước khi có vòng sửa 4 — thành viên hoàn toàn không bị ảnh hưởng, dù admin CLB này không còn thấy mục nào để sửa/xoá ảnh đó qua `/admin` nữa (đây là hệ quả đã được anh Tú chấp nhận, không phải lỗi).

**Kết quả:** ___

---

## 9. Thành viên mở `/quy` thấy QR mới ngay sau khi admin tạo

**Chuẩn bị:** Vừa tạo/tạo lại QR ở phiên admin (bài 1).

**Thao tác:**
1. Mở một trình duyệt khác (hoặc cửa sổ ẩn danh), đăng nhập bằng phiên **member** của CLB test.
2. Vào `/quy`, tìm thẻ "QR nhận quỹ CLB".

**✅ PASS khi:** Ảnh QR mới hiện đúng, không phải ảnh cũ, không cần thành viên F5 nhiều lần hay chờ lâu.

**Kết quả:** ___

---

## 10. [ĐỔI SAU VÒNG SỬA 4] Thứ tự checklist "Thiết lập CLB" trỏ đúng `#set-sepay`

**Vì sao đổi:** Bước "Phát QR nhận quỹ cho cả nhóm" trong thanh checklist trước đây trỏ tới `/admin#set-qr` (đã xoá) — giờ phải trỏ tới `/admin#set-sepay` (nơi QR thật sự nằm).

**Chuẩn bị:** CLB test ở trạng thái onboarding chưa hoàn tất bước "Phát QR".

**Thao tác:**
1. Mở `/admin`, xem thanh checklist "Thiết lập CLB", kiểm tra thứ tự các bước.
2. Bấm CTA của bước "Phát QR nhận quỹ cho cả nhóm" (khi chưa hoàn thành).
3. Tạo QR xong (bài 1) mà **không F5 trang**, quan sát checklist.

**✅ PASS khi:** Thứ tự đúng: **identity → roster → sepay → fund_qr → tournament**. Bấm CTA của bước "Phát QR" phải **cuộn/điều hướng tới đúng khối Auto Quỹ (`#set-sepay`)**, không phải trang trắng hay mục đã xoá. Ngay sau khi tạo QR thành công, bước này tự chuyển thành ✓ mà không cần tải lại trang.

**Kết quả:** ___

---

## 11. Phiên member gọi thẳng API generate → phải bị chặn

**Chuẩn bị:** Đăng nhập phiên **member** (không phải admin) của CLB test.

**Thao tác:**
1. Dùng công cụ gọi API bất kỳ (Postman, DevTools `fetch`, hoặc app kiểm thử API) gửi `POST /api/club/fund-qr/generate` kèm cookie phiên member, body `{ "bankCode": "MBBank" }`.

**✅ PASS khi:** Server trả về lỗi **403** (Forbidden), không tạo/không ghi đè ảnh QR nào.

**Kết quả:** ___

---

## 12. [ĐỔI SAU VÒNG SỬA 4] CLB chưa khai tài khoản quỹ → không có nút tạo QR, và không còn mục `#set-qr` nào để lách qua

**Vì sao đổi:** Trước đây có 2 nơi cần kiểm ("không có nút" ở cả `#set-sepay` lẫn `#set-qr`). Giờ `#set-qr` đã xoá hẳn nên chỉ còn 1 nơi, nhưng cần xác nhận thêm: không có cách nào khác đặt QR qua UI.

**Chuẩn bị:** Dùng một CLB test khác **chưa** kết nối Auto Quỹ, chưa có tài khoản ngân hàng nào đang hoạt động.

**Thao tác:**
1. Đăng nhập admin CLB này, mở `/admin`, cuộn qua toàn bộ trang.

**✅ PASS khi:**
- Ở mục Auto Quỹ, hiện thông báo "Chưa có tài khoản quỹ" / cần kết nối Auto Quỹ trước, có nút dẫn tới bước kết nối SePay. **Không** có nút "Tạo mã QR nhận quỹ" nào hiện ra.
- **Không còn mục "QR nhận quỹ" nào khác** trên toàn trang `/admin` — kiểm tra thanh điều hướng bên trái (`ClubSettingsNav`) cũng không còn mục này. Nếu cần, mở DevTools kiểm tra DOM không còn phần tử nào có `id="set-qr"`.
- CLB này **không có cách nào** qua UI để đặt ảnh QR hiển thị ở `/quy` — đây là hệ quả đã được anh Tú xác nhận chấp nhận, không báo là lỗi.

**Kết quả:** ___

---

## Ghi chú cuối buổi test

- Phiên bản/nhánh đã test: ___
- Thiết bị và trình duyệt: ___
- Các lỗi ❌ và ⚠️ tổng hợp: ___
- Việc cần làm lại: ___
- **Đặc biệt lưu ý bài số 1** (độ trễ production) và **bài số 8** (ảnh QR tải tay cũ không bị mất) — đây là hai bài quan trọng nhất của toàn bộ 4 vòng sửa, cần xác nhận trước khi coi tính năng đã sẵn sàng phục vụ CLB thật.
