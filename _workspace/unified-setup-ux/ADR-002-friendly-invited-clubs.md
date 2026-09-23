# ADR-002: CLB được mời cho giải giao hữu

- Ngày: 2026-09-20
- Trạng thái: Đã chấp nhận
- Task: T2.E

## Bối cảnh

`SetupDraftV2.tournament.organizerMode` đã phân biệt giải nội bộ và giao hữu, nhưng chưa giữ danh sách CLB được mời. Việc thay wizard cũ bằng workspace đã làm mất đường tạo giải giao hữu.

## Quyết định

Bổ sung trường cấp cao vào `SetupDraftV2`:

```js
invitedClubs: [{ clubId, name, source: 'system' | 'external', status }]
```

`status` phản ánh kết quả lời mời: `pending`, `invited`, hoặc `existing`. Giá trị `existing` là lời mời nhận HTTP 409: CLB đã có trong giải, được xem là đã được mời và hiển thị rõ cho BTC.

Khi `tournament.organizerMode === 'friendly'` mà `invitedClubs` trống, readiness bổ sung blocker `NO_CLUB_INVITED`. Luồng finalize giao hữu dùng checkpoint `CHECKPOINT.CLUB_INVITES` sau khi đã có tournament id.

## Hệ quả

Phần còn lại của contract đóng băng không đổi: shape của tournament, participants, format, pairs, draw, readiness và thứ tự bốn bước không thay đổi. `invitedClubs` chỉ là phần mở rộng cho nhánh giao hữu; giải nội bộ mặc định mảng rỗng và không thêm checkpoint mời CLB.
