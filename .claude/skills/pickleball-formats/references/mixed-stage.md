# Mix đa giai đoạn (Multi-stage / Vòng bảng → Playoff)

Thể thức phổ biến nhất cho giải lớn: **vòng bảng round-robin → playoff knockout**. Đây không phải engine riêng mà là cách **ghép nhiều stage**, mỗi stage dùng engine của nó.

## Mô hình
- Giải có `stages[]` tuần tự, mỗi stage `{ order, format, config }`.
- Stage 1 (group): round-robin, có thể chia M bảng. Sinh lịch + standings bằng engine round-robin.
- Stage 2 (playoff): knockout. **Entrant của stage 2 = output `advance()` của stage 1.**

## Chuyển tiếp (seeding bắc cầu) — phần dễ sai nhất
`advance(stage1)` lấy top-K mỗi bảng:
- Lấy `K` đội đầu mỗi bảng (vd top 2). Tổng entrant vào knockout = M·K.
- **Seeding chéo bảng** để nhất bảng A không gặp nhì bảng A sớm: thông thường nhất bảng gặp nhì bảng khác. Quy ước: xếp seed knockout theo (thứ hạng trong bảng, rồi thành tích) và đặt vào bracket sao cho cùng bảng nằm khác nửa.
- Truyền danh sách entrant đã seed sang engine knockout (`knockout.md`).

## Orchestrator engine (ghép stage)
- Một engine cấp giải điều phối: chỉ cho mở stage kế khi stage trước `completed` (mọi match có kết quả).
- Giữ ánh xạ entrant xuyên stage: entrant trong knockout tham chiếu entrant gốc (cùng đội/cặp) để hiển thị nhất quán.

## Biến thể cấu hình (`format_config` cấp stage)
- Số bảng `groupCount`, số suất đi tiếp mỗi bảng `advancePerGroup`.
- Có/không tranh hạng 3, có/không vòng bảng kép.
- Stage có thể dùng BẤT KỲ format nào (kể cả MLP cho vòng bảng) — orchestrator không giả định format cụ thể, chỉ gọi interface chung `generateSchedule/computeStandings/advance`.

## Lưu ý UI
- Hiển thị theo từng stage (tab/bước): bảng xếp hạng các bảng ở stage 1, sơ đồ cây ở stage 2. Nêu rõ đội nào đã đi tiếp.
