-- Insert manual expense transaction
-- Chi tiền: Trả tiền nước ngày 16/01/2026

INSERT INTO quy_pickleball (
  ma_giao_dich,
  so_tien,
  noi_dung_goc,
  nguoi_nop,
  loai_giao_dich,
  huong_giao_dich,
  is_manually_categorized,
  admin_note,
  confidence_score,
  parsing_method,
  created_at
) VALUES (
  'MANUAL_' || NOW()::text,  -- Mã giao dịch tự động
  -48000,                     -- Số tiền âm (tiền ra)
  'Tra tien nuoc',            -- Nội dung
  'ADMIN',                    -- Người thực hiện (admin)
  'khac',                     -- Loại: khác (không phải nộp phạt/quỹ)
  'out',                      -- Hướng: tiền ra
  true,                       -- Đã categorize thủ công
  'Chi tien tra tien nuoc',   -- Ghi chú
  100,                        -- Confidence 100% vì manual
  'manual',                   -- Method: manual
  '2026-01-16 00:00:00+07'    -- Ngày 16/01/2026
);
