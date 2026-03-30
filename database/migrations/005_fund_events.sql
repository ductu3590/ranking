-- Migration 005: Fund Events System
-- Tạo bảng quản lý sự kiện đóng quỹ CLB

-- Bảng sự kiện đóng quỹ
CREATE TABLE IF NOT EXISTS fund_events (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title text NOT NULL,                          -- Tên sự kiện (VD: Quỹ tháng 3, Tiền đi ăn 30/3)
    description text,                             -- Mô tả chi tiết
    amount_per_person numeric DEFAULT 0,          -- Số tiền mỗi người cần đóng
    event_date date,                              -- Ngày sự kiện
    is_active boolean DEFAULT true,               -- Còn hiệu lực không
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Bảng thành viên tham gia sự kiện (ai phải đóng tiền)
CREATE TABLE IF NOT EXISTS fund_event_participants (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id bigint REFERENCES fund_events(id) ON DELETE CASCADE,
    member_id bigint REFERENCES club_members(id) ON DELETE CASCADE,
    has_paid boolean DEFAULT false,               -- Đã đóng chưa
    paid_at timestamptz,                          -- Thời điểm đánh dấu đã đóng
    notes text,                                   -- Ghi chú
    created_at timestamptz DEFAULT now(),
    UNIQUE(event_id, member_id)
);

-- Index cho query nhanh hơn
CREATE INDEX IF NOT EXISTS idx_fund_event_participants_event_id ON fund_event_participants(event_id);
CREATE INDEX IF NOT EXISTS idx_fund_event_participants_member_id ON fund_event_participants(member_id);
CREATE INDEX IF NOT EXISTS idx_fund_events_active ON fund_events(is_active, created_at DESC);

-- RLS Policies
ALTER TABLE fund_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE fund_event_participants ENABLE ROW LEVEL SECURITY;

-- Mọi người đều đọc được
CREATE POLICY "Public read fund_events" ON fund_events
    FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Public read fund_event_participants" ON fund_event_participants
    FOR SELECT TO anon, authenticated USING (true);

-- Chỉ authenticated (admin) mới được write
CREATE POLICY "Authenticated manage fund_events" ON fund_events
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated manage fund_event_participants" ON fund_event_participants
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Function tự cập nhật updated_at
CREATE OR REPLACE FUNCTION update_fund_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_fund_events_updated_at
    BEFORE UPDATE ON fund_events
    FOR EACH ROW
    EXECUTE FUNCTION update_fund_events_updated_at();
