# Loại trực tiếp (Knockout / Single elimination)

Thua một trận là bị loại. Còn lại một nhà vô địch.

## Kích thước bracket & bye
- Gọi N = số entrant. Bracket size B = lũy thừa 2 nhỏ nhất ≥ N (vd N=6 → B=8).
- Số bye = B - N. **Bye trao cho hạt giống cao nhất** (seed tốt được miễn vòng 1).
- Số vòng = log2(B). Vòng cuối = chung kết.

## Seeding (gieo hạt) chuẩn
Dùng thứ tự seed chuẩn để hạt giống mạnh không gặp nhau sớm. Với B=8, vị trí slot theo seed:
`[1, 8, 5, 4, 3, 6, 7, 2]` — tức seed 1 và 2 ở hai nửa đối diện, chỉ gặp nhau ở chung kết.
Công thức tổng quát: dựng mảng vị trí đệ quy — bắt đầu `[1,2]`, mỗi bước nhân đôi: với mảng `s` kích thước k (cho bracket 2k), thay mỗi phần tử `x` bằng cặp `x` và `(2k+1 - x)` đan xen.
Slot vượt quá N (không có entrant) = đối thủ của bye.

## Sinh lịch
- Vòng 1: ghép theo các slot đã seed; slot gặp bye thì entrant tự động vào vòng 2.
- Các vòng sau: người thắng match `2i-1` gặp người thắng match `2i`. Thường sinh dần theo kết quả (chỉ biết cặp đấu vòng sau khi vòng trước xong), nhưng cấu trúc cây (parent match) nên dựng sẵn để UI vẽ bracket.

Match có field: `{ stageId, round, slotA, slotB, entrantA, entrantB, winnerId, parentMatchId }`.

## Kết quả / tie-break
- Knockout không cho hòa: mỗi match phải có winner (chơi đến khi phân thắng bại theo luật ván).
- Tùy chọn `thirdPlace`: trận tranh hạng 3 giữa 2 đội thua bán kết.

## Biến thể
- **Double elimination** (thua 2 lần mới loại) — nhánh thua (losers bracket). Để `format_config.elimination = 'single' | 'double'`; mặc định single cho phong trào.

## advance()
Knockout thường là stage cuối → `advance` trả nhà vô địch + thứ hạng (vô địch, á quân, hạng 3...). Nếu là stage trung gian thì hiếm; mặc định kết thúc giải.
