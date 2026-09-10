# Kiểm tra Phase 3 — 2026-09-06

**Kết luận: CHƯA ĐẠT exit gate; chưa triển khai Phase 4.**

Kiểm tra working tree trên `main`, HEAD `10f7e0b`, đối chiếu spec Phase 3, kế hoạch triển khai và audit cũ. Không sửa ứng dụng, không ghi/xóa dữ liệu Supabase, không apply migration trong lần kiểm tra này.

## Kiểm chứng

- `npm run test:ci`: chuỗi regression (bao gồm 14 file Phase 3) qua; build trong sandbox bị `spawn EPERM`. Log: `phase-3-recheck-2026-09-06-ci.txt`. Không ghi toàn lệnh CI là PASS.
- `npm run build` ngoài sandbox: PASS, exit 0. Log: `phase-3-recheck-2026-09-06-build.txt`.
- `node _workspace/phase3-readiness-repro.cjs`: tái hiện 3 lỗi qua handler hiện tại với DB/session giả lập. Exit 0 nghĩa là tái hiện thành công, không phải nghiệm thu PASS. Log: `phase-3-recheck-2026-09-06-repro.txt`.
- Supabase MCP project `uhhlelemewilgsdijwja`, xác định từ URL trong `.env.local`: chỉ đọc schema, migration history và số liệu tổng hợp.

## Lỗi chặn hoàn thành

1. **Quyền quản trị cộng đồng chưa nối vào API.** `lib/tournament/accessRuntime.js` đã có lớp quyền, nhưng không route nào trong `app/api/tournament-v2` gọi `requireTournamentAccess`. `divisions/route.js:42` chỉ gọi group admin guard. Tái hiện POST từ phiên chỉ có platform bị 403 trước khi xét quyền cộng đồng. Các route stages, generate, entries, pairings, rules và score-tokens cũng chỉ nhận group guard.
2. **Member đọc được ghi chú riêng tư.** `registrations/route.js:19` có `selectFieldsForRole` nhưng GET không gọi, vẫn select và trả nguyên `SELECT_FIELDS`. Handler reproduction với role member nhận cả `private_note` và `captain_declaration`.
3. **Ghi entry/cặp chưa atomic.** `entries/route.js` ghi entry rồi ghi members bằng hai request. Tái hiện members lỗi: trả 500 sau khi entry đã được ghi, không rollback. `pairings/route.js` ghi lần lượt pair → pair members → entry → entry members trong vòng lặp, không RPC/transaction bao toàn bộ. Retry có thể nhân đôi phần đã ghi. Reproduction mô phỏng entries; pairing được kiểm tra bằng đọc luồng code.
4. **CLB khách chưa xác nhận độc lập với BTC.** `registrations/route.js` PATCH chỉ nhận admin tenant của giải và tự set `club_confirmation_status = 'confirmed'` khi BTC approve. Duyệt của BTC và xác nhận của CLB là hai bước riêng trong spec; trạng thái hiện tại chưa chứng minh CLB khách đã xác nhận.
5. **Chưa có evidence rehearsal ba CLB hoàn tất.** Báo cáo cũ vẫn để mở end-to-end, token trên thiết bị thật và kiểm ảnh/OG. Database hiện có 4 giải, tất cả draft, không có completed. Điều này không chứng minh chưa từng rehearsal ở môi trường khác, nhưng chưa cung cấp evidence đạt gate. Chưa tìm thấy retrospective được nghiệm thu trong tài liệu đã kiểm tra.

## Những mục cũ đã xử lý

- Test share và wizard đã được nối vào Phase 3 runner và regression.
- Migration `phase3_athlete_source_037` có trong lịch sử; `tournament_athletes.source` tồn tại.
- System group 8 đã cấu hình trong `.env.local` và tồn tại trong database.
- Build hiện tại thành công sau khi gỡ hạn chế spawn của sandbox.

Kết quả truy vấn tổng hợp, không chứa thông tin cá nhân:

```json
{"system_group_exists":true,"athlete_source_exists":true,"completed_tournaments":0,"entry_members_nullable_athlete":"YES"}
```

## Thứ tự khắc phục để mở Phase 4

1. Nối quyền organizer/platform và phạm vi CLB tham dự vào API; bảo vệ field riêng tư bằng test runtime.
2. Chuyển tạo entry/chốt cặp sang RPC atomic có idempotency, kiểm duplicate athlete và scope division/tenant.
3. Tách xác nhận CLB khỏi duyệt BTC; ghi actor thực và kiểm version khi cập nhật.
4. Chạy regression/build và rehearsal ba CLB: tạo giải → đăng ký → duyệt → lịch → điểm → BXH → archive; kiểm token, public/privacy và ảnh xuất.
5. Ghi evidence/retrospective đạt gate rồi mới triển khai Phase 4.

Phase 3 xây giải nội bộ/liên CLB/cộng đồng. Phase 4 mở rộng check-in, waitlist, thay người, sân/giờ, nhập điểm offline, correction/audit, thông báo và sổ tài chính giải.
