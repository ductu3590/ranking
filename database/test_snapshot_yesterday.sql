-- ============================================================
-- INSERT SNAPSHOT DATA FOR YESTERDAY (2026-01-19)
-- ============================================================
-- Mục đích: Tạo dữ liệu snapshot của ngày hôm qua để test tính năng rank change
-- Hướng dẫn: Chỉnh sửa rank_position và total_amount theo thứ hạng thực tế của ngày hôm qua
--            rồi copy vào Supabase SQL Editor và chạy
-- ============================================================

INSERT INTO ranking_snapshots (nguoi_nop, rank_position, total_amount, snapshot_date)
VALUES 
  -- ⚠️ CHỈNH SỬA CỘT rank_position THEO VỊ TRÍ THỰC TẾ CỦA NGÀY HÔM QUA
  -- Rank 1: Người đứng đầu ngày hôm qua
  ('ĐẶNG TIẾN ANH', 4, 80000, '2026-01-19'),
  
  -- Rank 2: Người thứ 2 ngày hôm qua
  ('VŨ NGỌC HƯNG', 5, 40000, '2026-01-19'),
  
  -- Rank 3: Người thứ 3 ngày hôm qua
  ('ĐỒNG MẠNH LINH', 1, 100000, '2026-01-19'),
  
  -- Rank 4: Người thứ 4 ngày hôm qua
  ('NGUYỄN VĂN THÀNH', 2, 100000, '2026-01-19'),
  
  -- Rank 5: Người thứ 5 ngày hôm qua
  ('ĐỖ ĐỨC TÚ', 3, 100000, '2026-01-19'),
  
  -- Rank 6: Người thứ 6 ngày hôm qua
  ('TRẦN TẤT HẢO', 6, 20000, '2026-01-19'),
  
  -- Rank 7: Người thứ 7 ngày hôm qua
  ('HOÀNG NGỌC THẠCH', 8, 0, '2026-01-19'),
  
  -- Rank 8: Người thứ 8 ngày hôm qua  
  ('NGUYỄN CHƯƠNG LONG', 7, 20000, '2026-01-19'),
  
  -- Rank 9: Người thứ 9 ngày hôm qua
  ('TRẦN TUẤN TÚ', 9, 0, '2026-01-19'),
  
  -- Rank 10: Người thứ 10 ngày hôm qua
  ('NGUYỄN NHẬT QUANG', 10, 0, '2026-01-19')

-- Tránh duplicate nếu chạy lại
ON CONFLICT (nguoi_nop, snapshot_date) 
DO UPDATE SET 
  rank_position = EXCLUDED.rank_position,
  total_amount = EXCLUDED.total_amount;

-- ============================================================
-- SAU KHI CHẠY SQL NÀY
-- ============================================================
-- 1. Reload trang http://localhost:3000
-- 2. Bạn sẽ thấy icon thay đổi rank:
--    - ↑ (xanh lá) nếu rank hôm nay tốt hơn hôm qua
--    - ↓ (đỏ) nếu rank hôm nay kém hơn hôm qua  
--    - = (xám) nếu giữ nguyên
-- ============================================================

-- VÍ DỤ THAY ĐỔI:
-- Nếu VŨ NGỌC HƯNG hôm qua là rank 3, hôm nay là rank 2
-- → Sẽ hiển thị: Rank 2, Prev: 3, Icon: ↑ +1 (tăng hạng)
--
-- Nếu ĐẶNG TIẾN ANH hôm qua là rank 1, hôm nay là rank 1  
-- → Sẽ hiển thị: Rank 1, Prev: 1, Icon: = (giữ nguyên)
