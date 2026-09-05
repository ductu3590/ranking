# TEST_PHASE_3 — Runbook kiểm thử Phase 3

Phase 3 xây nền giải nội bộ, giao hữu liên CLB và giải cộng đồng: danh tính cấp nền tảng, mô hình `giải → nội dung → entry → vòng → trận → ván`, ghép cặp, luật điểm số và tie-break có version, token nhập điểm, trang công khai an toàn, và chia sẻ qua nhóm Zalo.

Tài liệu này chia rõ phần máy chạy được và phần bắt buộc người thật ngồi kiểm.

## 1. Yêu cầu trước khi chạy

- Node 18 trở lên, đã `npm install`.
- File `.env.local` có `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`.
- Đăng nhập bằng Mã CLB và mật khẩu admin của một CLB test. Không dùng CLB đang hoạt động thật để thử luồng phá dữ liệu.
- Muốn thử giải cộng đồng thì cần thêm `PLATFORM_SESSION_SECRET` và một tài khoản nền tảng (mục 5).

## 2. Lệnh chạy nhanh

Bộ Phase 3, chạy trong vài giây, không cần mạng:

```bash
npm run test:phase3-interclub
```

Kỳ vọng 14 dòng `ok` hoặc `PASS`, thoát mã 0:

```
phase3 migration contract ok
phase3 interclub domain ok
phase3 interclub competition ok
phase3 interclub public ok
phase3 interclub ui contract ok
Phase 3 Task 1 preflight contract: PASS
Phase 3 Task 2 platform auth contract: PASS
Phase 3 Task 3 migration contract: PASS
Phase 3 Task 3 division-entry convergence integration contract: PASS
phase3 scoring rules ok
phase3 tiebreak policy ok
phase3 scorekeeper token ok
phase3 share ok
phase3 wizard competition contract ok
```

## 3. Hồi quy bắt buộc trước khi merge

```bash
npm run test:t-engines
```

Bảo vệ thứ tự bảng xếp hạng của giải cũ. Preset `legacy_v2` phải tái lập đúng kết quả trước Phase 3. **Nếu phải sửa file trong `tests/tournament/` để lệnh này xanh thì đó là dấu hiệu đã làm đổi kết quả giải cũ, phải dừng lại điều tra.**

```bash
npm run test:t-api
npm run test:t-ui
npm run build
```

```bash
npm run test:ci
```

Chạy toàn bộ hồi quy rồi build. Đây là cửa cuối.

## 4. Migration

Migration 030 đến 036 đã apply trên project Supabase đang vận hành. **Không sửa file migration đã apply.** Thay đổi schema mới phải là file `037_` trở đi, additive, forward-only, có preflight và câu truy vấn xác minh.

| File | Nội dung |
|---|---|
| 030 | Nội dung thi đấu, CLB tham dự, đăng ký, entry, nhân sự giải |
| 031 | Preflight dữ liệu cũ, chỉ đọc, kết thúc bằng ROLLBACK |
| 032 | Tài khoản và phiên cấp nền tảng, nới ràng buộc organizer |
| 033 | Hội tụ nội dung, entry, vòng, trận |
| 034 | Hàm xếp lịch theo entry |
| 035 | Thuộc tính nội dung, CLB ngoài hệ thống, VĐV, cặp, lịch sử trình độ |
| 036 | Token nhập điểm |

Kiểm tra danh sách migration mà hệ thống theo dõi nhận diện được:

```bash
npm run migration:ledger
```

Tên file phải theo mẫu ba chữ số rồi gạch dưới. Tên kiểu `033b_` sẽ bị bỏ qua hoàn toàn và migration đó không bao giờ được ghi nhận.

## 5. Tạo tài khoản quản trị cộng đồng

Không có đường đăng ký công khai. Chạy script với biến môi trường:

```bash
PICKHUB_PLATFORM_ADMIN_EMAIL=... PICKHUB_PLATFORM_ADMIN_PASSWORD=... node scripts/seed-platform-account.js
```

Đăng nhập qua `POST /api/platform/session`, đăng xuất qua `POST /api/platform/session/logout`.

**Nợ kỹ thuật đã biết:** bộ đếm chặn dò mật khẩu nằm trong bộ nhớ tiến trình. Trên môi trường serverless mỗi lượt gọi có thể là tiến trình mới nên bộ đếm gần như không có tác dụng. Phải chuyển sang bộ đếm dùng chung trước khi mở đăng nhập cấp nền tảng cho người thật.

## 6. Người thật phải ngồi kiểm

Máy không thay được phần này. Dùng viewport dọc điện thoại, khoảng 380px.

### 6.1 Tạo giải và nội dung thi đấu

- Tạo giải ở cả ba chế độ: nội bộ, giao hữu, cộng đồng.
- Tạo ít nhất hai nội dung khác `play_type` trong cùng một giải.
- Nội dung đánh đơn phải khóa ghép cặp về "không áp dụng".
- Nội dung giới hạn trình độ mà bỏ trống mức giới hạn thì phải báo lỗi.
- Hai nội dung phải cho ra lịch và bảng xếp hạng riêng, không cộng dồn vào nhau.

### 6.2 CLB và vận động viên

- Mời một CLB có trên PickHub và một CLB ngoài hệ thống.
- Thêm vận động viên từ danh sách CLB và thêm vận động viên khách.
- BTC nhập hộ đội hình: thiếu lý do thì form phải chặn; nhập xong phải ở trạng thái chờ CLB xác nhận và có ghi actor.

### 6.3 Ghép cặp

- Xem trước ghép tự động và ghép thủ công.
- Đưa cùng một người vào hai cặp phải báo trùng.
- Cảnh báo trình độ (thiếu, chờ, vượt giới hạn) phải hiện ra nhưng **nút chốt cặp vẫn bấm được**. Cảnh báo không bao giờ được chặn đăng ký hay chặn BTC duyệt.

### 6.4 Luật điểm số và tie-break

- Chọn preset cho giải, override cho một nội dung, xem bảng luật hiệu lực của từng vòng.
- Sau khi sinh lịch thì luật của vòng đó phải khóa lại.
- Nhập tỉ số sai luật, ví dụ 11-10 khi yêu cầu cách 2, phải bị từ chối.

### 6.5 Nhập điểm bằng token

- Cấp token cho một trận, mở bằng trình duyệt khác hoặc cửa sổ ẩn danh, không đăng nhập.
- **Lưu nhiều lần trong cùng một trận**: sau ván 1, sau ván 2, rồi sửa một tỉ số gõ nhầm. Cả ba lần đều phải thành công. Token hết hạn sau một lần dùng là lỗi.
- Thu hồi token rồi thử lưu tiếp, phải bị từ chối.
- Dùng token của trận này để nhập cho trận khác, phải bị từ chối.

### 6.6 Trang công khai và chia sẻ

- Mở link công khai bằng trình duyệt sạch, không có cookie CLB. Trang phải hiện được.
- Trang **không được** hiển thị số điện thoại, email, ghi chú nội bộ, trạng thái xét duyệt, định danh nhóm nội bộ, hay trình độ khi BTC chưa bật công khai.
- Dán link vào nhóm Zalo, phải hiện card có ảnh thay vì link trần.
- Xuất ảnh bảng xếp hạng và lịch, mở ảnh ra soi kỹ xem có lọt dữ liệu riêng tư không.
- Bấm sao chép thông báo, dán thử vào Zalo.
- Giải ở chế độ riêng tư phải không xuất được ảnh và không mở được link.

## 7. Những chỗ dễ sai, kiểm kỹ

Đây là các lỗi đã thực sự xảy ra trong quá trình xây Phase 3, ghi lại để lần sau không lặp.

- **Test xanh nhưng thực tế hỏng.** Đã xảy ra ba lần vì bài test tự dựng dữ liệu theo định dạng tưởng tượng thay vì lấy từ hàm thật. Test mới phải lấy đầu vào từ `computeStandings`, `buildPublicSnapshot` hoặc hàm tương ứng.
- **Truy vấn cột không tồn tại.** Bảng entry không có cột trình độ; trình độ công khai là tổng đã chụp từ bảng thành viên entry. Select sai cột từng làm toàn bộ trang công khai trả lỗi 500.
- **Tiêu chí tie-break không có dữ liệu.** Nếu thêm tiêu chí mới vào preset, phải chắc bảng xếp hạng thật có sinh ra trường đó, nếu không tiêu chí bị bỏ qua trong im lặng và xếp sai thứ hạng.
- **Token nhập điểm dùng một lần.** Chống ghi trùng là việc của khóa thao tác, không phải của token.
- **Mã nguồn và database lệch nhau.** Sau mỗi migration phải chạy truy vấn xác minh trên database thật, đừng tin báo cáo.

## 8. Bằng chứng

Kết quả chạy thật ghi vào `evidence/phase-3-test-report.md`, kèm output nguyên văn của lệnh chứ không mô tả lại.
