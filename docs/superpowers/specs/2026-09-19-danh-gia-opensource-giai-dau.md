# Đánh giá khả năng áp dụng 3 opensource vào module giải đấu PickHub

**Ngày:** 19/9/2026 (số liệu đo trên `main` tại commit `943e539`)
**Phạm vi:** `evroon/bracket`, `bbtheo/bracketeer`, `skrodahl/NewTon`
**Câu hỏi:** Hệ thống giải đấu PickHub đang phức tạp — có thể thay/bổ sung bằng opensource không?

---

## 1. Kết luận

**Không dự án nào thay thế được engine giải đấu của PickHub.** Cả ba đều hoặc vướng
giấy phép, hoặc sai stack, hoặc yếu hơn PickHub về nghiệp vụ.

Điều đáng chú ý: **PickHub đang đi trước cả ba về logic nghiệp vụ.**

| | PickHub | bracket | bracketeer | NewTon |
|---|---|---|---|---|
| LOC logic thể thức | **6.179** (`lib/tournament`, 50 file) | 1.447 (Python) | ~65 file R | 25.310 (vanilla JS, dính DOM) |
| Vòng tròn + chia bảng | ✅ | ✅ | ✅ | ❌ |
| Loại trực tiếp | ✅ | ✅ | ✅ | ✅ |
| Loại kép (double elim) | ✅ | ❌ | ✅ | ✅ |
| **MLP (team match nhiều ván)** | ✅ | ❌ | ❌ | ❌ |
| Swiss | ❌ | ✅ | ✅ | ❌ |
| Tie-break tính lại trong nhóm hòa | ✅ (5 preset) | ❌ | một phần | ❌ |
| Multi-tenant `group_id` + RLS | ✅ | ❌ | ❌ | ❌ |

Cái làm hệ thống "phức tạp" **không phải engine thể thức** — engine chỉ chiếm
6.179 dòng. Phức tạp nằm ở **18.313 dòng** trải trên **34 API route, 37 file UI,
93 migration và 112 file test**. Không opensource nào giải quyết được phần đó,
vì phần đó chính là nghiệp vụ riêng của PickHub.

**Khuyến nghị: giữ engine hiện tại, học có chọn lọc 3 ý tưởng cụ thể (mục 5).**

---

## 2. evroon/bracket — ứng viên mạnh nhất, nhưng vướng giấy phép

Python/FastAPI + React(Vite/Mantine) + PostgreSQL + Docker. 1.7k sao, ~1.468
commit, có demo chạy thật. Là **ứng dụng self-hosted hoàn chỉnh, không phải thư viện.**

### Bốn rào cản

**a) Giấy phép AGPL-3.0 — rào cản cứng.**
Điều 13 AGPL: nếu sửa chương trình và cho người dùng truy cập **qua mạng**, phải
chào mời mã nguồn tương ứng cho chính những người dùng đó. PickHub là dịch vụ
web cho các CLB — nhúng code bracket đồng nghĩa **phải mở toàn bộ mã nguồn
PickHub cho mọi CLB đang dùng.** Trừ khi anh chủ động muốn open-source PickHub,
đây là điểm dừng.

*Lưu ý pháp lý quan trọng:* AGPL bảo hộ **mã nguồn**, không bảo hộ **ý tưởng hay
thuật toán**. Đọc để hiểu cách họ làm rồi tự viết lại bằng JS là hợp pháp;
copy-paste hoặc dịch máy từng dòng thì không.

**b) Sai stack.** PickHub chạy Next.js trên Vercel + Supabase. bracket cần một
service Python FastAPI riêng + PostgreSQL riêng. Dựng thêm backend thứ hai làm
đội chi phí hạ tầng và vận hành, đổi lấy phần logic mà PickHub đã có.

**c) Sai data model.** bracket: `tournament → stage → stage_item → round → match`,
không có khái niệm tenant. PickHub: `tournaments → tournament_stages →
tournament_matches → tournament_games`, **`group_id NOT NULL` ở mọi bảng** kèm
RLS, auth bằng cookie `group_session`. Ánh xạ hai mô hình này tốn nhiều công
hơn là viết mới.

**d) Thiếu MLP.** bracket chỉ có single elimination, round robin, swiss. Không
có MLP, không có double elim, không có trận nhiều ván với điểm từng ván —
đúng những thứ CLB phong trào Việt Nam cần nhất và PickHub đã làm xong.

### Cái đáng học (ý tưởng, tự viết lại)

**Ghép cặp Swiss** (`logic/scheduling/ladder_teams.py`) — đây là khoảng trống
thể thức duy nhất của PickHub. Cách làm gọn:
- Băm cặp đấu (`match_hash`) để **không bao giờ lặp lại cặp đã đấu**.
- Cân bằng theo `times_played_sum` — ưu tiên cặp mà cả hai đều đấu ít nhất.
- Trong nhóm cân bằng, sắp theo `elo_diff` tăng dần → hai đội trình gần nhau gặp nhau.
- Khi N lớn thì lấy mẫu ngẫu nhiên thay vì duyệt hết tổ hợp (`N*N > iterations`).
- Trả **danh sách gợi ý có cờ `is_recommended`**, để trọng tài chọn, không ép máy quyết.
  Điểm này rất hợp CLB phong trào — anh vẫn giữ quyền can thiệp thủ công.

**Điểm Elo cho Swiss** (`logic/ranking/calculation.py`): K=32, D=400,
`expected = 1/(1+10^(rating_diff/400))`. Chuẩn Elo kinh điển, ~10 dòng JS.

**Phát hiện xung đột lịch** (`logic/planning/conflicts.py`): đánh dấu khi **một
đội bị xếp hai trận có thời gian chồng nhau**. `lib/tournament/courtBoard.js`
(58 dòng) hiện chỉ chiếu hàng đợi lên sân trống, chưa cảnh báo xung đột này.

> ⚠️ Nếu tham khảo, **đừng bắt chước hàm `matches_overlap` của họ** — công thức
> `not ((m1.end < m2.end and m1.start < m2.start) or (m1.start > m2.start or m1.end > m2.end))`
> không phải phép kiểm tra chồng lấn đúng. Công thức đúng là
> `m1.start < m2.end && m2.start < m1.end`.

---

## 3. bbtheo/bracketeer — không dùng được

**Gói ngôn ngữ R, giấy phép MIT.** Mới **11 commit**, khởi tạo 6/2/2026, commit
cuối 20/2/2026 ("final updates to CRAN push"). 65 file R + tài liệu Rd.

MIT thì thoải mái về pháp lý, nhưng **R không chạy được trong Next.js**. Muốn
dùng phải dựng thêm service R (Plumber) — vô lý khi logic đó PickHub đã có.
Thêm nữa, 11 commit trong 2 tuần rồi dừng là mức trưởng thành quá thấp để
phụ thuộc vào.

Giá trị duy nhất: **thiết kế API kiểu pipe** — mỗi thể thức là một "động từ"
nối chuỗi thành cấu trúc giải (`round_robin |> single_elim |> ...`). Ý tưởng này
xác nhận mô hình stage-chain mà PickHub đã dùng (`tournament_stages` + `advance()`)
là hướng đúng. Không có gì thêm để lấy.

---

## 4. skrodahl/NewTon — sai môn, nhưng giấy phép sạch

**Phi tiêu (darts x01)**, vanilla HTML/CSS/JS, không framework, lưu bằng
LocalStorage. BSD 3-Clause. Đang hoạt động tốt (v5.1.8, commit 13/9/2026),
~1.227 commit.

BSD-3 là giấy phép dễ chịu — **được phép tái sử dụng code** chỉ cần giữ thông
báo bản quyền. Nhưng:

- **Sai môn:** luật phi tiêu (best-of-legs, x01), không có khái niệm ván/điểm pickleball.
- **Sai tầng lưu trữ:** LocalStorage thuần client, ngược hoàn toàn với
  Supabase multi-tenant của PickHub.
- **Sai tầng view:** 4.693 dòng `bracket-rendering.js` + 1.882 dòng
  `bracket-lines.js` là DOM thao tác trực tiếp, không phải React. Port sang
  component React = viết lại, không phải copy.
- Chỉ có loại trực tiếp đơn/kép 4–32 người. Không vòng tròn, không chia bảng, không MLP.

> ⚠️ **Cảnh báo giấy phép:** thư mục `licensed/` **bị loại trừ khỏi BSD-3**.
> File `licensed/LICENSE.md` ghi rõ: *"The contents of this directory are not
> open source"*, bản quyền Håvard Skrödahl, hiện là "free preview" và tác giả
> để ngỏ khả năng thu phí sau này. Nếu có tham khảo NewTon, **tuyệt đối tránh
> `licensed/`** (chứa `network-tm.js`, `network-chalker.js`, `api/`).

Giá trị: **tham khảo cách vẽ nhánh loại kép** — cách họ tính toạ độ và nối
đường giữa winner/loser bracket cho 4–32 người là bài toán UI thật sự khó, và
họ đã giải cho nhiều kích thước bracket. Chỉ tham khảo hình học, không port code.

---

## 5. Đề xuất hành động

### Nên làm — ba hạng mục nhỏ, độc lập

1. **Thêm thể thức Swiss** → `lib/tournament/engines/swiss.js`, đăng ký vào
   `SCHEDULE` trong `engines/index.js`. Tự viết theo ý tưởng mục 2: hash cặp đã
   đấu + cân bằng `times_played` + xếp theo chênh lệch trình. Đây là khoảng
   trống thể thức duy nhất so với cả ba dự án.
2. **Cảnh báo xung đột lịch** → mở rộng `courtBoard.js`: cờ đỏ khi một VĐV/đội
   bị xếp hai trận chồng giờ. Dùng công thức chồng lấn đúng, không theo bracket.

   > Lưu ý phân biệt: commit `943e539` trên `main` có phần "chống xung đột",
   > nhưng đó là **xung đột nghiệp vụ ở tầng database** (CAS/khoá, ERRCODE
   > PH409, `080_seed_guard_nowait_conflict.sql`) — hai request ghi đè nhau.
   > Hoàn toàn khác với **xung đột lịch thi đấu** nói ở đây: một VĐV bị xếp
   > hai trận trùng giờ trên hai sân. Đã kiểm tra trên `main` hiện tại: chưa
   > có phần này.
3. **Cải thiện sơ đồ loại kép trên mobile** → tham khảo hình học nối nhánh của
   NewTon, viết lại bằng React/SVG.

### Không nên làm

- Không nhúng code bracket (AGPL sẽ kéo theo toàn bộ PickHub).
- Không dựng thêm backend Python hay R bên cạnh Vercel + Supabase.
- Không thay engine hiện tại — 112 file test đang phủ nó, thay đi là mất hết
  phần tie-break và MLP mà không dự án nào có.

### Về cảm giác "hệ thống phức tạp"

Nếu điều thực sự làm anh mệt là **độ phức tạp vận hành** chứ không phải thiếu
thể thức, thì hướng xử lý nằm ở kiến trúc PickHub chứ không ở opensource:
34 API route, 37 file UI và 93 migration cho một module là rất nhiều. Gom nhóm route, rút gọn
luồng wizard, hoặc tách bớt tính năng ít dùng sẽ hiệu quả hơn nhiều so với
thay engine. Nếu anh muốn, em có thể rà soát riêng phần này và đề xuất phương
án gom gọn.
