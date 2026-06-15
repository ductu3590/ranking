# MLP Team Match (Major League Pickleball format)

Hai **đội** đối đầu, mỗi đội nhiều VĐV (thường 4: 2 nam 2 nữ). Một "trận" giữa 2 đội gồm nhiều **ván con (sub-match)** ở các nội dung khác nhau; điểm cộng dồn.

## Cấu trúc một trận MLP (chuẩn 4 ván con + tie-breaker)
Thứ tự ván con điển hình:
1. Đôi nữ (Women's doubles)
2. Đôi nam (Men's doubles)
3. Đôi nam nữ 1 (Mixed doubles 1)
4. Đôi nam nữ 2 (Mixed doubles 2)
- Mỗi ván con thắng = 1 điểm đội. Sau 4 ván nếu hòa 2–2 → **Dreambreaker** (ván quyết định, thường singles luân phiên đến điểm mốc) phân thắng bại.

Cấu hình linh hoạt qua `format_config`: `subMatches` (danh sách nội dung + giới tính), `pointsToWin` mỗi ván, `tiebreaker` (dreambreaker on/off, luật).

## Entrant & lineup
- Entrant = đội (gồm danh sách VĐV + giới tính). Trước mỗi trận, admin xếp **lineup**: ai đánh ván con nào.
- Engine MLP cần biết roster để gợi ý/validate lineup, nhưng tính điểm chỉ dựa trên kết quả ván con.

## Tính kết quả
- Điểm đội = số ván con thắng (+ dreambreaker). Đội nhiều điểm hơn thắng trận.
- Có thể giữ thêm **rally point total** (tổng điểm rally các ván) làm tie-break khi xếp nhiều đội (vd MLP trong vòng tròn).

## Khi MLP nằm trong stage nhiều đội
- MLP có thể là format của một stage round-robin (nhiều đội đấu vòng tròn theo thể thức MLP) hoặc knockout. Lúc đó "match" cấp stage = một trận MLP đầy đủ; standings tính theo trận thắng + rally diff.
- Vì vậy engine MLP nên tách: (a) tính một trận MLP từ các ván con; (b) cắm vào scheduler round-robin/knockout chung như mọi match.

## Lưu trữ
- `match` cấp đội + bảng con `match_submatches (match_id, slot, kind, score_a, score_b, winner)`. Hoặc gói ván con vào `match.detail jsonb` nếu muốn gọn — architect quyết theo nhu cầu query.
