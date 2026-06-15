# Vòng tròn tính điểm (Round-robin)

Mọi entrant gặp tất cả entrant còn lại đúng một lần (single) hoặc hai lần (double). Xếp hạng theo điểm tích lũy.

## Sinh lịch — Circle method
N entrant. Nếu N lẻ → thêm một "BYE" ảo (entrant nghỉ ở vòng đó). Tổng số vòng = N-1 (N chẵn) hoặc N (đã thêm bye).

Thuật toán:
1. Cố định entrant đầu (index 0), các entrant còn lại xoay vòng.
2. Mỗi vòng ghép `arr[i]` với `arr[N-1-i]`.
3. Sau mỗi vòng, giữ index 0, xoay phần còn lại 1 bước.
4. Match có một bên là BYE → entrant kia được nghỉ (không tính trận).

Số trận thực = C(N,2) = N·(N-1)/2 (single). Deterministic; nếu cần thứ tự ngẫu nhiên thì shuffle danh sách entrant bằng `seed` TRƯỚC khi chạy circle method.

## Tính điểm
Mặc định cấu hình qua `format_config`:
- `winPoints` (mặc định 2 hoặc 1), `lossPoints` (0), có thể có `drawPoints`.
- Hoặc tính theo số game thắng nếu mỗi trận nhiều ván.

Standings row: `{ entrantId, played, won, lost, pointsFor, pointsAgainst, diff, score }`.

## Tie-break (mặc định, cấu hình được)
1. Tổng điểm xếp hạng (score) cao hơn.
2. Hiệu số điểm trận (`pointsFor - pointsAgainst`).
3. Đối đầu trực tiếp (head-to-head) giữa các entrant bằng điểm.
4. Tổng điểm ghi được.
5. Bốc thăm theo `seed`.

## Chia bảng (group round-robin)
Nếu nhiều entrant: chia M bảng, round-robin trong từng bảng. Phân bảng theo kiểu rắn (snake) dựa trên seed để cân sức: seed 1→bảng A, 2→B, ... rồi cuộn ngược. Đây là tiền đề cho thể thức mix (`mixed-stage.md`).

## advance()
Lấy top-K mỗi bảng làm seeding cho stage knockout kế tiếp (xem mixed-stage).
